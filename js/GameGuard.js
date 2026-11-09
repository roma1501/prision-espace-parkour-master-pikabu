// GameGuard.js — охрана Prision Espace Parkour Master: преследователи (маркер guard g=N: начальник Гримм и охранники),
// патрули с конусом обзора (patrol), камеры (cctv), прожекторы (searchlight), декоративные заключённые (npc).
// Преследователь — тот же физический человечек (HumanoidCharacter) на мире трассы, бежит ПО СЛЕДУ игрока (хлебные
// крошки: путь гарантированно проходим), прыгает там, где прыгал игрок; застрял — «срезает» к следующей крошке.
// Поймал (ближе ~90 px) — Game возвращает героя на чекпоинт. Видимость — лучом по ObbyCourse (не по Babylon).
//
//   await GameGuard.build(app, hooks)   // prepare: hooks.caught(cause), spotted, chaseStart(g), chaseEnd(g)
//   GameGuard.update(dt)                // кадр (после героя)
//   GameGuard.group(g, on)              // группа N включена: её преследователи бегут
//   GameGuard.calm(g) / respawn()       // конец погони / возврат героя на чекпоинт

Object.assign(LANG_STRINGS.ru, {
    'guard.spotted': 'Тебя заметили!', 'guard.camera': 'Камера тебя видит!', 'guard.light': 'Попал в прожектор!',
    'guard.caught': 'Пойман!', 'guard.lost': 'Гримм потерял тебя!', 'guard.run': 'Беги от Гримма!',
});
Object.assign(LANG_STRINGS.en, {
    'guard.spotted': 'You were spotted!', 'guard.camera': 'The camera sees you!', 'guard.light': 'Caught in the searchlight!',
    'guard.caught': 'Caught!', 'guard.lost': 'Grimm lost you!', 'guard.run': 'Run from Grimm!',
});

/** @satisfies {Record<string, any>} */
const GameGuard = {
    /** @type {LoryApp | null} */ app: null,
    /** @type {any} */ hooks: {},
    /** @type {any[]} */ chasers: [],
    /** @type {any[]} */ patrols: [],
    /** @type {any[]} */ eyes: [],
    /** @type {any[]} */ npcs: [],
    /** @type {any[]} */ nodes: [],
    /** @type {{ x: number, y: number, h: number, air: boolean }[]} */ trail: [],
    chasing: 0,
    time: 0,
    spotT: 0,
    _mats: {},

    WARDEN: { skin: [222, 170, 132], top: [38, 56, 98], bottom: [30, 34, 50] },
    GUARD: { skin: [214, 168, 128], top: [52, 92, 160], bottom: [34, 38, 56] },
    INMATE: [{ skin: [196, 140, 100], top: [240, 125, 30], bottom: [232, 116, 24] }, { skin: [240, 200, 170], top: [230, 110, 30], bottom: [225, 105, 25] },
        { skin: [140, 96, 64], top: [245, 135, 40], bottom: [236, 120, 30] }],

    // ---------------------------------------------------------------------------------------------

    async build(app, hooks) {
        this.clear();
        this.app = app;
        this.hooks = hooks || {};
        const list = GameMech.markers;
        const jobs = [];
        for (const m of list) {
            if (m.role === 'guard') jobs.push(this.addChaser(m));
            else if (m.role === 'patrol') jobs.push(this.addPatrol(m));
            else if (m.role === 'cctv' || m.role === 'searchlight') jobs.push(this.addEye(m));
            else if (m.role === 'npc') jobs.push(this.npc(m));   // декоративные заключённые — здесь, после clear()
        }
        await Promise.all(jobs.map(p => p.catch(e => console.warn('GameGuard:', e))));
        return this;
    },

    clear() {
        const view = this.app && this.app.location && this.app.location.view;
        for (const c of this.chasers.concat(this.patrols, this.npcs)) { try { c.ch.dispose(); } catch (e) { /* уже */ } }
        for (const n of this.nodes) { try { if (view) World3D.removeObject(view, n); n.dispose(false, false); } catch (e) { /* уже */ } }
        this.chasers = []; this.patrols = []; this.eyes = []; this.npcs = []; this.nodes = []; this.trail = [];
        this.chasing = 0; this.time = 0; this.spotT = 0; this._mats = {};
    },

    call(name, d) { const f = this.hooks[name]; if (typeof f === 'function') { try { f(d); } catch (e) { console.warn('GameGuard.' + name, e); } } },

    mat(name, hex, alpha) {
        if (this._mats[name]) return this._mats[name];
        const scene = /** @type {LoryApp} */ (this.app).location.view.scene;
        const m = new BABYLON.StandardMaterial('guard-' + name, scene);
        m.diffuseColor = BABYLON.Color3.FromHexString(hex);
        m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(0.85);
        m.alpha = alpha; m.backFaceCulling = false; m.disableLighting = true;
        m.metadata = { toon: false };
        this._mats[name] = m;
        return m;
    },

    /** Лицо охранника: брови, глаза, усы (рисунок на холсте лица Humanoid; w×h ≈ 256×144). */
    faceWarden(boss) {
        return (ctx, w, h) => {
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#1b1d22';
            // очки-авиаторы у начальника, строгие глаза у охранников
            if (boss) {
                for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(w / 2 + s * w * 0.18, h * 0.38, w * 0.14, h * 0.17, 0, 0, Math.PI * 2); ctx.fill(); }
                ctx.fillRect(w * 0.4, h * 0.3, w * 0.2, h * 0.05);
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                for (const s of [-1, 1]) ctx.fillRect(w / 2 + s * w * 0.18 - w * 0.07, h * 0.3, w * 0.05, h * 0.06);
            } else {
                for (const s of [-1, 1]) { ctx.fillRect(w / 2 + s * w * 0.18 - w * 0.06, h * 0.36, w * 0.12, h * 0.12); }
                ctx.fillRect(w * 0.22, h * 0.2, w * 0.2, h * 0.06); ctx.fillRect(w * 0.58, h * 0.2, w * 0.2, h * 0.06);
            }
            // усы и рот
            ctx.fillStyle = '#3a2416';
            ctx.beginPath(); ctx.moveTo(w * 0.28, h * 0.72); ctx.quadraticCurveTo(w * 0.5, h * 0.55, w * 0.72, h * 0.72); ctx.quadraticCurveTo(w * 0.5, h * 0.66, w * 0.28, h * 0.72); ctx.fill();
            ctx.fillStyle = '#5a1f1f'; ctx.fillRect(w * 0.4, h * 0.8, w * 0.2, h * 0.05);
        };
    },

    /** Аксессуары: фуражка, очки, дубинка (модели Blender; нет — простые меши). */
    async dress(model, boss) {
        const view = /** @type {LoryApp} */ (this.app).location.view, scene = view.scene;
        const head = model.part('Head'), hand = model.part('HandR');
        const attach = async (url, parent, pos, rot, fallback) => {
            if (!parent) return;
            let root = null;
            try { const m = await Model3D.load(url); root = Model3D.build(m, scene, { name: 'acc' }); } catch (e) { root = fallback ? fallback() : null; }
            if (!root) return;
            root.parent = parent; root.position.set(pos[0], pos[1], pos[2]);
            if (rot) root.rotation.set(rot[0], rot[1], rot[2]);
            World3D.addObject(view, root, 'actor', { outline: false });
            this.nodes.push(root);
        };
        await attach('assets/models/prison/warden_cap.glb', head, [0, 22, 0], null, () => {
            const cap = BABYLON.MeshBuilder.CreateCylinder('cap', { diameter: 58, height: 16, tessellation: 18 }, scene);
            cap.material = this.mat('cap', '#1d2b4f', 1); cap.position.y = 8; return cap;
        });
        if (boss) await attach('assets/models/prison/warden_glasses.glb', head, [22, 4, 0], null, null);
        await attach('assets/models/prison/baton.glb', hand, [0, -6, 0], [0, 0, Math.PI / 2], null);
    },

    /** Физический охранник на точке маркера. */
    makeGuard(m, opts) {
        const view = /** @type {LoryApp} */ (this.app).location.view;
        const o = opts || {};
        const ch = HumanoidCharacter.create(view, {
            world: GameHero.world, x: m.x, y: m.y, h: m.h, heading: m.yaw, height: o.height || 200, width: o.width || 1.15,
            colors: o.colors || this.GUARD, face: o.face, name: o.name || 'guard', kind: 'actor',
        });
        return ch;
    },

    async addChaser(m) {
        const boss = m.words.includes('boss') || m.words.includes('warden') || m.words.includes('grimm');
        const ch = this.makeGuard(m, { height: boss ? 222 : 205, width: boss ? 1.3 : 1.18, colors: boss ? this.WARDEN : this.GUARD, face: this.faceWarden(boss), name: boss ? 'warden' : 'guard' });
        const c = { m, ch, boss, g: m.prm.g, state: 'idle', ti: 0, react: 0, stuckT: 0, bestD: 1e9, speed: (m.prm.speed || 1) * (boss ? 1.04 : 1), jumpHold: 0 };
        ch.ch.c.run = 300 * c.speed; ch.ch.c.sprint = Math.min(465, 435 * c.speed);   // не быстрее базы движений (470) — иначе ноги не успевают
        await this.dress(ch.model, true);
        this.chasers.push(c);
    },

    async addPatrol(m) {
        const ch = this.makeGuard(m, { colors: this.GUARD, face: this.faceWarden(false), name: 'patrol' });
        const P = m.prm;
        const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
        const ox = (P.x || 0) * c - (P.z || 0) * s, oy = (P.x || 0) * s + (P.z || 0) * c;
        const p = { m, ch, a: { x: m.x, y: m.y }, b: { x: m.x + ox, y: m.y + oy }, toB: true, wait: 0, r: P.r || 700, ang: (P.a || 45) * Math.PI / 180, state: 'patrol', ti: 0, react: 0, stuckT: 0, bestD: 1e9, speed: 1, cone: null };
        ch.ch.c.sprint = 420; ch.ch.c.walk = 140;
        await this.dress(ch.model, false);
        // конус обзора на полу
        const scene = /** @type {LoryApp} */ (this.app).location.view.scene;
        const cone = BABYLON.MeshBuilder.CreateDisc('patrol-cone', { radius: p.r, arc: p.ang * 2 / (Math.PI * 2), tessellation: 32, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        cone.rotation.x = Math.PI / 2;
        cone.bakeCurrentTransformIntoVertices();
        cone.material = this.mat('cone', '#ffd84a', 0.16);
        cone.isPickable = false;
        World3D.addObject(/** @type {LoryApp} */ (this.app).location.view, cone, 'prop', { outline: false, castShadow: false });
        this.nodes.push(cone);
        p.cone = cone;
        this.patrols.push(p);
    },

    async addEye(m) {
        const view = /** @type {LoryApp} */ (this.app).location.view, scene = view.scene;
        const cam = m.role === 'cctv';
        const P = m.prm;
        const e = { m, cam, r: P.r || (cam ? 800 : 1000), ang: (P.a || (cam ? 30 : 14)) * Math.PI / 180, sw: (P.sw != null ? P.sw : (cam ? 60 : 70)) * Math.PI / 180,
            T: P.t || (cam ? 5 : 6), ph: P.ph || 0, root: null, head: null, cone: null, pool: null, yawNow: m.yaw, px: m.x, py: m.y };
        try {
            const mdl = await Model3D.load(cam ? 'assets/models/prison/cctv.glb' : 'assets/models/prison/searchlight.glb');
            e.root = Model3D.build(mdl, scene, { name: m.role });
            World3D.addObject(view, e.root, 'prop', { outline: false });
            GameHero.glowParts(e.root);
            this.nodes.push(e.root);
            e.root.position.set(m.x, m.h, m.y);
            e.root.rotation.y = -m.yaw;
            e.head = GameMech.part(e.root, 'Head');
            if (e.head && e.head.metadata && e.head.metadata.pivot) e.head.setPivotPoint(BABYLON.Vector3.FromArray(e.head.metadata.pivot));
        } catch (err) { e.root = null; }
        if (cam) {
            // конус света камеры (вершина у камеры, ось по курсу взгляда)
            const len = e.r, rad = Math.tan(e.ang) * len;
            const cone = BABYLON.MeshBuilder.CreateCylinder('cctv-cone', { diameterTop: 0, diameterBottom: rad * 2, height: len, tessellation: 24, cap: BABYLON.Mesh.NO_CAP }, scene);
            cone.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, -len / 2, 0).multiply(BABYLON.Matrix.RotationZ(Math.PI / 2)));
            cone.material = this.mat('cctv', '#ff5040', 0.12);
            cone.isPickable = false;
            World3D.addObject(view, cone, 'prop', { outline: false, castShadow: false });
            this.nodes.push(cone);
            e.cone = cone;
        } else {
            const pool = BABYLON.MeshBuilder.CreateDisc('search-pool', { radius: Math.tan(e.ang) * e.r, tessellation: 36 }, scene);
            pool.rotation.x = Math.PI / 2; pool.bakeCurrentTransformIntoVertices();
            pool.material = this.mat('pool', '#fff3c0', 0.32);
            pool.isPickable = false;
            World3D.addObject(view, pool, 'prop', { outline: false, castShadow: false });
            this.nodes.push(pool);
            e.pool = pool;
            const beam = BABYLON.MeshBuilder.CreateCylinder('search-beam', { diameterTop: 30, diameterBottom: Math.tan(e.ang) * e.r * 2, height: 1, tessellation: 20, cap: BABYLON.Mesh.NO_CAP }, scene);
            beam.material = this.mat('beam', '#fff6d0', 0.08);
            beam.isPickable = false;
            World3D.addObject(view, beam, 'prop', { outline: false, castShadow: false });
            this.nodes.push(beam);
            e.beam = beam;
        }
        this.eyes.push(e);
    },

    /** Декоративный заключённый (маркер npc): стоит, оглядывается. */
    async npc(m) {
        const view = /** @type {LoryApp} */ (this.app).location.view;
        const colors = this.INMATE[this.npcs.length % this.INMATE.length];
        const ch = HumanoidCharacter.create(view, { world: GameHero.world, x: m.x, y: m.y, h: m.h, heading: m.yaw, colors, name: 'npc', kind: 'prop', height: 176 + (this.npcs.length % 3) * 8 });
        this.npcs.push({ m, ch, t: Math.random() * 5 });
    },

    // ---------------------------------------------------------------------------------------------
    // Кадр
    // ---------------------------------------------------------------------------------------------

    update(dt) {
        if (!this.app) return;
        this.time += dt;
        const H = GameHero, alive = !!H.ch && !H.dead;
        // след героя (только с опоры или в прыжке — точки, где он был)
        if (alive) {
            const last = this.trail[this.trail.length - 1];
            if (!last || Math.hypot(H.x - last.x, H.y - last.y) > 70 || Math.abs(H.h - last.h) > 60) {
                this.trail.push({ x: H.x, y: H.y, h: H.h, air: !H.grounded });
                if (this.trail.length > 700) { this.trail.shift(); for (const c of this.chasers.concat(this.patrols)) c.ti = Math.max(0, c.ti - 1); }
            }
        }
        for (const c of this.chasers) this.stepChaser(c, dt, alive);
        for (const p of this.patrols) this.stepPatrol(p, dt, alive);
        for (const e of this.eyes) this.stepEye(e, dt, alive);
        for (const n of this.npcs) {
            n.t += dt;
            if (Math.hypot(n.m.x - H.x, n.m.y - H.y) > 3500) continue;
            n.ch.control({ move: { x: 0, y: 0 }, camYaw: n.m.yaw + Math.sin(n.t * 0.4) * 0.8 });
            n.ch.update(dt);
        }
    },

    /** Ход преследователя (и патрульного в погоне) по следу. */
    pursue(c, dt, alive) {
        const H = GameHero, ch = c.ch;
        if (c.react > 0) { c.react -= dt; ch.control({ move: { x: 0, y: 0 }, camYaw: Math.atan2(H.y - ch.y, H.x - ch.x) }); ch.update(dt); return; }
        // прямо к герою, если близко и почти на одном уровне
        const dx = H.x - ch.x, dy = H.y - ch.y, dist = Math.hypot(dx, dy), dh = H.h - ch.h;
        let tx, ty, th, air = false;
        if (dist < 380 && Math.abs(dh) < 90) { tx = H.x; ty = H.y; th = H.h; }
        else {
            const tr = this.trail;
            while (c.ti < tr.length - 1) {
                const q = tr[c.ti];
                if (Math.hypot(q.x - ch.x, q.y - ch.y) < 75 && Math.abs(q.h - ch.h) < 110) c.ti++;
                else break;
            }
            const q = tr[Math.min(c.ti, tr.length - 1)] || { x: H.x, y: H.y, h: H.h, air: false };
            tx = q.x; ty = q.y; th = q.h; air = q.air;
        }
        const ddx = tx - ch.x, ddy = ty - ch.y, dd = Math.hypot(ddx, ddy);
        const yaw = Math.atan2(ddy, ddx);
        const wantJump = ch.ch.grounded && (air || th > ch.h + 35) && dd < 260;
        if (wantJump) c.jumpHold = 0.35;
        c.jumpHold = Math.max(0, c.jumpHold - dt);
        ch.control({ move: { x: 0, y: dd > 8 ? 1 : 0 }, sprint: true, jump: wantJump, jumpHeld: c.jumpHold > 0, camYaw: yaw });
        ch.update(dt);
        // застрял — срезать к цели
        const dTarget = Math.hypot(tx - ch.x, ty - ch.y) + Math.abs(th - ch.h) * 0.5;
        if (dTarget < c.bestD - 30) { c.bestD = dTarget; c.stuckT = 0; }
        else c.stuckT += dt;
        const fell = ch.h < Math.min(th, H.h) - 500 || ch.ragdolled;
        if (c.stuckT > 1.8 || fell) {
            // срезать к следующей крошке следа — только вдали от игрока (рядом — честно догоняет или прыгает)
            const q = this.trail[Math.min(c.ti + 1, this.trail.length - 1)];
            if (q && (Math.hypot(q.x - H.x, q.y - H.y) > 520 || fell)) {
                ch.place(q.x, q.y, Math.atan2(H.y - q.y, H.x - q.x), q.h);
                c.ti = Math.min(c.ti + 1, Math.max(0, this.trail.length - 1));
            } else c.jumpHold = 0.35;
            c.stuckT = 0; c.bestD = 1e9;
        }
        // поймал
        if (alive && Math.hypot(H.x - ch.x, H.y - ch.y) < 92 && Math.abs(H.h - ch.h) < 130) {
            this.call('caught', { cause: 'guard', x: H.x, y: H.y, h: H.h, boss: c.boss });
        }
        // отстал слишком сильно — потерял
        if (this.trail.length - c.ti > 55 && !c.boss) this.loseChase(c);
    },

    stepChaser(c, dt, alive) {
        const ch = c.ch;
        if (c.state === 'chase') { this.pursue(c, dt, alive); return; }
        // ждёт: смотрит на героя, если он рядом
        const H = GameHero;
        const near = Math.hypot(H.x - c.m.x, H.y - c.m.y) < 2200;
        ch.control({ move: { x: 0, y: 0 }, camYaw: near ? Math.atan2(H.y - ch.y, H.x - ch.x) : c.m.yaw });
        ch.update(dt);
        // без группы — бежит, когда герой подошёл и виден
        if (c.g == null && alive && Math.hypot(H.x - ch.x, H.y - ch.y) < 900 && Math.abs(H.h - ch.h) < 200 && this.visible(ch.x, ch.h + 160, ch.y, H)) this.startChase(c);
    },

    startChase(c) {
        if (c.state === 'chase') return;
        c.state = 'chase'; c.react = 0.55; c.stuckT = 0; c.bestD = 1e9;
        // ближайшая к охраннику крошка следа
        let best = Math.max(0, this.trail.length - 1), bd = 1e18;
        for (let i = 0; i < this.trail.length; i++) {
            const q = this.trail[i], d = (q.x - c.ch.x) ** 2 + (q.y - c.ch.y) ** 2 + ((q.h - c.ch.h) * 2) ** 2;
            if (d < bd) { bd = d; best = i; }
        }
        c.ti = best;
        this.chasing++;
        if (this.chasing === 1) this.call('chaseStart', { g: c.g, boss: c.boss });
    },

    loseChase(c) {
        if (c.state !== 'chase') return;
        c.state = c.patrol ? 'patrol' : 'lost';
        this.chasing = Math.max(0, this.chasing - 1);
        if (this.chasing === 0) this.call('chaseEnd', { g: c.g, lost: true });
    },

    stepPatrol(p, dt, alive) {
        const H = GameHero, ch = p.ch;
        if (p.state === 'chase') { this.pursue(p, dt, alive); this.placeCone(p); return; }
        const tgt = p.toB ? p.b : p.a;
        const dx = tgt.x - ch.x, dy = tgt.y - ch.y, d = Math.hypot(dx, dy);
        if (p.wait > 0) { p.wait -= dt; ch.control({ move: { x: 0, y: 0 }, camYaw: ch.heading + Math.sin(this.time * 1.5) * 0.6 }); }
        else if (d < 40) { p.toB = !p.toB; p.wait = 1.2; ch.control({ move: { x: 0, y: 0 }, camYaw: ch.heading }); }
        else ch.control({ move: { x: 0, y: 0.55 }, walk: true, camYaw: Math.atan2(dy, dx) });
        ch.update(dt);
        this.placeCone(p);
        // видит?
        if (!alive || GameHero.disguise) return;
        const ex = ch.x, ey = ch.y, hx = H.x - ex, hy = H.y - ey, dist = Math.hypot(hx, hy);
        if (dist > p.r || Math.abs(H.h - ch.h) > 260) return;
        let da = Math.atan2(hy, hx) - ch.heading;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > p.ang) return;
        if (!this.visible(ex, ch.h + 165, ey, H)) return;
        p.patrol = true;
        this.call('spotted', { cause: 'patrol', x: ex, y: ey, h: ch.h });
        this.startChase(p);
    },

    placeCone(p) {
        if (!p.cone) return;
        const ch = p.ch;
        p.cone.position.set(ch.x, ch.h + 6, ch.y);
        p.cone.rotation.y = -ch.heading + p.ang;
        p.cone.setEnabled(p.state !== 'chase' && !GameHero.disguise);
    },

    stepEye(e, dt, alive) {
        const H = GameHero, m = e.m;
        const yaw = m.yaw + e.sw * Math.sin(2 * Math.PI * (this.time / e.T + e.ph));
        e.yawNow = yaw;
        if (e.head) e.head.rotation.y = -(yaw - m.yaw);
        const sx = m.x, sy = m.y, sh = m.h;
        if (e.cam) {
            // камера смотрит вниз-вперёд на пол: дальняя точка на расстоянии r·0.8
            const reach = e.r * 0.8;
            const fx = sx + Math.cos(yaw) * reach, fy = sy + Math.sin(yaw) * reach, fh = H.grounded ? H.h : sh - 300;
            if (e.cone) {
                e.cone.position.set(sx, sh, sy);
                const dir = new BABYLON.Vector3(fx - sx, (fh - sh), fy - sy).normalize();
                e.cone.rotationQuaternion = BABYLON.Quaternion.FromUnitVectorsToRef(new BABYLON.Vector3(1, 0, 0), dir, e.cone.rotationQuaternion || new BABYLON.Quaternion());
            }
            if (!alive || GameHero.disguise) return;
            const hx = H.x - sx, hy = H.y - sy, dist = Math.hypot(hx, hy);
            if (dist > e.r || H.h > sh + 50) return;
            let da = Math.atan2(hy, hx) - yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) > e.ang * 1.15) return;
            if (!this.visible(sx, sh - 20, sy, H)) return;
            this.spot('camera');
        } else {
            // прожектор: пятно на земле ходит по дуге и «восьмёркой» по дальности
            const dd = e.r * (0.55 + 0.25 * Math.sin(4 * Math.PI * (this.time / e.T + e.ph)));
            const px = sx + Math.cos(yaw) * dd, py = sy + Math.sin(yaw) * dd;
            const g = ObbyCourse.groundAt(px, py, sh, 4000) ;
            const gh = g != null ? g : 0;
            const rad = Math.tan(e.ang) * e.r;
            if (e.pool) e.pool.position.set(px, gh + 4, py);
            if (e.beam) {
                const top = new BABYLON.Vector3(sx, sh, sy), bot = new BABYLON.Vector3(px, gh, py);
                const len = BABYLON.Vector3.Distance(top, bot);
                e.beam.scaling.y = len;
                e.beam.position = BABYLON.Vector3.Lerp(top, bot, 0.5);
                const dir = bot.subtract(top).normalize();
                e.beam.rotationQuaternion = BABYLON.Quaternion.FromUnitVectorsToRef(new BABYLON.Vector3(0, -1, 0), dir, e.beam.rotationQuaternion || new BABYLON.Quaternion());
            }
            if (e.head) e.head.rotation.z = -Math.atan2(sh - gh, dd) * 0.5;
            if (!alive || GameHero.disguise) return;
            if (Math.hypot(H.x - px, H.y - py) > rad || H.h > gh + 220) return;
            if (!this.visible(sx, sh, sy, H)) return;
            this.spot('light');
        }
    },

    /** Замечен камерой/прожектором: короткая пауза «!» и поимка. */
    spot(kind) {
        if (this.spotT > 0) return;
        this.spotT = 1;
        this.call('spotted', { cause: kind, x: GameHero.x, y: GameHero.y, h: GameHero.h });
        setTimeout(() => { this.spotT = 0; if (!GameHero.dead) this.call('caught', { cause: kind, x: GameHero.x, y: GameHero.y, h: GameHero.h }); }, 650);
    },

    /** Луч от глаз (x, h, y карты) до груди героя свободен от твёрдых деталей. */
    visible(x, h, y, H) {
        const tx = H.x, ty = H.h + 120, tz = H.y;
        const dx = tx - x, dy = ty - h, dz = tz - y, len = Math.hypot(dx, dy, dz);
        if (len < 1) return true;
        const hit = ObbyCourse.ray(x, h, y, dx / len, dy / len, dz / len, len - 30);
        return !hit;
    },

    // ---------------------------------------------------------------------------------------------
    // Группы и возврат
    // ---------------------------------------------------------------------------------------------

    group(g, on) {
        for (const c of this.chasers) if (c.g != null && String(c.g) === String(g) && on) this.startChase(c);
    },

    calm(g) {
        for (const c of this.chasers.concat(this.patrols)) if (c.state === 'chase' && (g == null || c.g == null || String(c.g) === String(g))) this.loseChase(c);
    },

    /** Группы преследователей, которые надо перевзвести при возврате героя (триггеры погони). */
    chaseGroups() { return this.chasers.filter(c => c.g != null).map(c => c.g); },

    /** Герой вернулся на чекпоинт: охрана — на свои места, погоня закончена. */
    respawn() {
        const was = this.chasing;
        for (const c of this.chasers) { c.state = 'idle'; c.ti = 0; c.ch.place(c.m.x, c.m.y, c.m.yaw, c.m.h); }
        for (const p of this.patrols) { p.state = 'patrol'; p.toB = true; p.wait = 0; p.ch.place(p.m.x, p.m.y, p.m.yaw, p.m.h); }
        this.chasing = 0;
        this.trail = [];
        this.spotT = 0;
        if (was) this.call('chaseEnd', { g: null, lost: false });
    },
};
