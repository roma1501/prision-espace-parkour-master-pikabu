// GameMech.js — маркеры уровня Prision Espace Parkour Master (контракт — docs/DESIGN.md §4–§5): монеты, взаимодействия
// (рубильники, сундук, витрины, форма охраны, джетпак), группы механизмов (ObbyCourse.setGroup), ключи и замки, зоны
// (задания, лестницы, мягкое приземление, поток, детектор, триггеры), ловушки (капкан, пила, пресс, лазер, пар),
// декор-эффекты и модели к маркерам. Решения — по числам маркеров и времени уровня (не по Babylon).
//
//   await GameMech.build(app, hooks)     // в prepare под загрузкой; hooks — колбэки Game (coin, kill, task, …)
//   GameMech.update(dt)                   // кадр игры (после героя)
//   GameMech.respawn()                    // герой вернулся на чекпоинт: таймеры, триггеры погони
//   GameMech.reset()                      // новый заход уровня

Object.assign(LANG_STRINGS.ru, {
    'act.switch': 'Включить', 'act.lever': 'Дёрнуть рубильник', 'act.vent': 'Открыть вентиляцию', 'act.fuse': 'Выключить ток',
    'act.button': 'Нажать кнопку', 'act.valve': 'Повернуть вентиль', 'act.pc': 'Взломать терминал', 'act.chest': 'Открыть сундук',
    'act.stand': 'Витрина', 'act.uniform': 'Надеть форму', 'act.jetpack': 'Взять джетпак', 'act.door': 'Открыть дверь',
    'mech.needKey': 'Нужна ключ-карта!', 'mech.key': 'Ключ-карта у тебя!', 'mech.unlock': 'Открыто!', 'mech.timer': 'Быстрее! {n}',
    'mech.disguiseOn': 'Ты в форме охраны — тебя не замечают', 'mech.disguiseLost': 'Металлодетектор! Маскировка пропала',
    'mech.jetpack': 'Ура! Теперь можно взлететь! Держи прыжок', 'mech.jetpackTouch': 'Ура! Теперь можно взлететь! Держи кнопку прыжка',
    'mech.superjump': 'Супер-прыжок!', 'mech.fuel': 'Топливо заправлено', 'mech.done': 'Готово!',
    'mech.gate': 'Решётка закрывается! {n}', 'mech.gateLost': 'Не успел — решётка закрылась!',
});
Object.assign(LANG_STRINGS.en, {
    'act.switch': 'Switch on', 'act.lever': 'Pull the lever', 'act.vent': 'Open the vent', 'act.fuse': 'Cut the power',
    'act.button': 'Press the button', 'act.valve': 'Turn the valve', 'act.pc': 'Hack the terminal', 'act.chest': 'Open the chest',
    'act.stand': 'Showcase', 'act.uniform': 'Put on the uniform', 'act.jetpack': 'Take the jetpack', 'act.door': 'Open the door',
    'mech.needKey': 'You need a keycard!', 'mech.key': 'Got the keycard!', 'mech.unlock': 'Unlocked!', 'mech.timer': 'Hurry! {n}',
    'mech.disguiseOn': 'Guard uniform on — nobody notices you', 'mech.disguiseLost': 'Metal detector! Disguise lost',
    'mech.jetpack': 'Hooray! Now you can take off! Hold jump', 'mech.jetpackTouch': 'Hooray! Now you can take off! Hold the jump button',
    'mech.superjump': 'Super jump!', 'mech.fuel': 'Fuel refilled', 'mech.done': 'Done!',
    'mech.gate': 'The gate is closing! {n}', 'mech.gateLost': 'Too slow — the gate closed!',
});

/** @satisfies {Record<string, any>} */
const GameMech = {
    /** @type {LoryApp | null} */ app: null,
    /** @type {any} */ hooks: {},
    /** @type {any[]} */ markers: [],
    /** @type {any[]} */ coins: [],
    /** @type {any[]} */ acts: [],
    /** @type {any[]} */ zones: [],
    /** @type {any[]} */ traps: [],
    /** @type {any[]} */ pickups: [],
    /** @type {any[]} */ nodes: [],
    /** @type {any} */ coinMesh: null,
    /** @type {Float32Array | null} */ coinBuf: null,
    /** @type {Set<number>} */ keys: new Set(),
    /** @type {Record<string, number>} */ timers: {},
    time: 0,
    task: '',
    collected: 0,
    total: 0,
    chestOpened: false,
    _ctx: '',
    _needKeyT: 0,
    _mat: {},

    // ---------------------------------------------------------------------------------------------
    // Разбор
    // ---------------------------------------------------------------------------------------------

    /** Маркер карты → { role, words, prm, x, y, h, yaw, sx, sy, sz, hx, hy, tall, def }. */
    parse(def) {
        const name = String(def.name || '').trim();
        const words = name.split(/\s+/).filter(Boolean);
        const role = (words[0] || '').replace(/-\d+$/, '').toLowerCase();
        const prm = ObbyCourse.params(name);
        const rest = words.slice(1).filter(w => !/=/.test(w)).map(w => w.toLowerCase());
        const rot = Array.isArray(def.rot) ? def.rot : [0, Number(def.rot) || 0, 0];
        const sc = Array.isArray(def.scale) ? def.scale : [1, 1, 1];
        const sx = Number(sc[0]) || 1, sy = Number(sc[1]) || 1, sz = Number(sc[2]) || 1;
        return { role, words: rest, prm, x: Number(def.x) || 0, y: Number(def.y) || 0, h: Number(def.h) || 0,
            yaw: (Number(rot[1]) || 0) * Math.PI / 180, sx, sy, sz, hx: sx * 100, hy: sz * 100, tall: sy * 100, def, name };
    },

    /** Точка внутри зоны маркера (прямоугольник по курсу или круг; по высоте от h−40 до h+tall). */
    inZone(z, x, y, h) {
        if (h < z.h - 40 || h > z.h + Math.max(60, z.tall)) return false;
        const dx = x - z.x, dy = y - z.y;
        if (Math.abs(z.hx - z.hy) < 1) return dx * dx + dy * dy <= z.hx * z.hx;
        const c = Math.cos(z.yaw), s = Math.sin(z.yaw);
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        return Math.abs(lx) <= z.hx && Math.abs(ly) <= z.hy;
    },

    // ---------------------------------------------------------------------------------------------
    // Постройка (prepare)
    // ---------------------------------------------------------------------------------------------

    async build(app, hooks) {
        this.clear();
        this.app = app;
        this.hooks = hooks || {};
        const objs = (app.location.map && app.location.map.objects) || [];
        this.markers = objs.filter(o => o.kind === 'marker').map(d => this.parse(d));
        const jobs = [];
        for (const m of this.markers) {
            const r = m.role;
            if (r === 'coin') this.coins.push({ x: m.x, y: m.y, h: m.h + 70, v: m.prm.v || 1, got: false, id: this.coins.length });
            else if (r === 'coins') {
                const n = Math.max(1, Math.min(40, m.prm.n || 5)), s = m.prm.s || 90;
                for (let i = 0; i < n; i++) this.coins.push({ x: m.x + Math.cos(m.yaw) * s * i, y: m.y + Math.sin(m.yaw) * s * i, h: m.h + 70, v: 1, got: false, id: this.coins.length });
            } else if (['switch', 'chest', 'stand', 'uniform', 'jetpack'].includes(r)) jobs.push(this.addAct(m));
            else if (['key', 'fuel', 'superjump'].includes(r)) jobs.push(this.addPickup(m));
            else if (['task', 'trigger', 'plate', 'lock', 'detector', 'ladder', 'soft', 'fan', 'calm'].includes(r)) {
                this.zones.push(Object.assign(m, { inside: false, fired: false, on: false }));
                if (r === 'fan') jobs.push(this.model('assets/models/prison/fan.glb', 'fan').then((root) => { if (!root) return; this.put(root, m.x, m.y, m.h - 40, m.yaw); m.blades = this.part(root, 'Blades'); if (m.blades && m.blades.metadata && m.blades.metadata.pivot) m.blades.setPivotPoint(BABYLON.Vector3.FromArray(m.blades.metadata.pivot)); }));
            }
            else if (['beartrap', 'saw', 'crusher', 'laser', 'steam'].includes(r)) jobs.push(this.addTrap(m));
            else if (['spark', 'light', 'alarm', 'fx', 'npc', 'heli', 'sign'].includes(r)) jobs.push(this.addDecor(m));
        }
        this.total = this.coins.reduce((a, c) => a + c.v, 0);
        jobs.push(this.buildCoins());
        jobs.push(this.buildSpikes());
        await Promise.all(jobs.map(p => p.catch(e => console.warn('GameMech:', e))));
        return this;
    },

    clear() {
        const view = this.app && this.app.location && this.app.location.view;
        for (const n of this.nodes) { try { if (view) World3D.removeObject(view, n); n.dispose(false, false); } catch (e) { /* уже */ } }
        this.nodes = []; this.markers = []; this.coins = []; this.acts = []; this.zones = []; this.traps = []; this.pickups = [];
        this.coinMesh = null; this.coinBuf = null;
        this.keys = new Set(); this.timers = {}; this.time = 0; this.task = ''; this.collected = 0; this.total = 0; this.chestOpened = false;
        this._ctx = ''; this._mat = {}; this.near = null; this._tap = false;
    },

    /** Модель по пути: корень с частями; нет файла — null. */
    async model(url, name) {
        const view = /** @type {LoryApp} */ (this.app).location.view;
        try {
            const m = await Model3D.load(url);
            const root = Model3D.build(m, view.scene, { name: name || 'mech' });
            World3D.addObject(view, root, 'prop', { outline: false });
            GameHero.glowParts(root);
            this.nodes.push(root);
            return root;
        } catch (e) { return null; }
    },

    /** Часть модели по имени (Lid, Lever, Blade…). */
    part(root, name) {
        if (!root) return null;
        for (const m of root.getChildMeshes(false)) if (m.metadata && String(m.metadata.part).toLowerCase() === name.toLowerCase()) return m;
        return null;
    },

    /** Поставить корень модели на маркер: x, y карты, h, курс. */
    put(root, x, y, h, yaw) {
        if (!root) return;
        root.position.set(x, h, y);
        root.rotation.y = -(yaw || 0);
    },

    mat(name, hex, emissive, alpha) {
        if (this._mat[name]) return this._mat[name];
        const scene = /** @type {LoryApp} */ (this.app).location.view.scene;
        const m = new BABYLON.StandardMaterial('mech-' + name, scene);
        m.diffuseColor = BABYLON.Color3.FromHexString(hex);
        if (emissive) { m.emissiveColor = BABYLON.Color3.FromHexString(emissive); m.metadata = { toon: false }; }
        if (alpha != null) { m.alpha = alpha; m.metadata = { toon: false }; }
        this._mat[name] = m;
        return m;
    },

    // ---- монеты: одна сетка, thin instances ----
    async buildCoins() {
        if (!this.coins.length) return;
        const view = /** @type {LoryApp} */ (this.app).location.view, scene = view.scene;
        let mesh = null;
        try {
            const m = await Model3D.load('assets/models/prison/coin.glb');
            const root = Model3D.build(m, scene, { name: 'coin-proto' });
            const kids = root.getChildMeshes(false).filter(k => k.getTotalVertices() > 0);
            for (const k of kids) { k.setParent(null); }
            mesh = kids.length > 1 ? BABYLON.Mesh.MergeMeshes(/** @type {any} */ (kids), true, true, undefined, false, true) : kids[0];
            root.dispose();
        } catch (e) { mesh = null; }
        if (!mesh) {
            mesh = BABYLON.MeshBuilder.CreateCylinder('coin-proto', { diameter: 56, height: 9, tessellation: 24 }, scene);
            mesh.rotation.x = Math.PI / 2;
            mesh.bakeCurrentTransformIntoVertices();
            mesh.material = this.mat('coin', '#ffc928', '#5a3a00');
        }
        if (mesh.material) {
            const mats = /** @type {any} */ (mesh.material).subMaterials || [mesh.material];
            for (const s of mats) if (s && s.diffuseColor) { s.emissiveColor = s.diffuseColor.scale(0.35); s.specularColor = new BABYLON.Color3(0.9, 0.8, 0.4); s.specularPower = 40; }
        }
        mesh.name = 'coins';
        mesh.isPickable = false;
        this.coinBuf = new Float32Array(this.coins.length * 16);
        mesh.thinInstanceSetBuffer('matrix', this.coinBuf, 16, false);
        World3D.addObject(view, mesh, 'prop', { outline: false });
        mesh.alwaysSelectAsActiveMesh = true;
        this.coinMesh = mesh;
        this.nodes.push(mesh);
        this.updateCoins(0);
    },

    updateCoins(t) {
        if (!this.coinMesh || !this.coinBuf) return;
        const b = this.coinBuf;
        const a = t * 2.6;
        const M = BABYLON.Matrix, tmp = this._cm || (this._cm = new M()), rot = this._cr || (this._cr = new M());
        for (const c of this.coins) {
            const o = c.id * 16;
            if (c.got && !(c.pop > 0)) { for (let k = 0; k < 16; k++) b[o + k] = 0; continue; }
            const s = c.pop > 0 ? 1 + (0.35 - c.pop) * 2.2 : (c.v > 1 ? 1.6 : 1);
            M.RotationYToRef(a + c.id * 0.37, rot);
            M.ScalingToRef(s, s, s, tmp);
            tmp.multiplyToRef(rot, tmp);
            tmp.setTranslationFromFloats(c.x, c.h + Math.sin(a * 0.8 + c.id) * 8 + (c.pop > 0 ? (0.35 - c.pop) * 160 : 0), c.y);
            tmp.copyToArray(b, o);
        }
        this.coinMesh.thinInstanceBufferUpdated('matrix');
    },

    // ---- шипы на деталях kill_spikes: пирамидки thin instances ----
    async buildSpikes() {
        const pieces = ObbyCourse.pieces.filter(p => p.type === 'kill' && p.color === 'spikes');
        if (!pieces.length) return;
        const scene = /** @type {LoryApp} */ (this.app).location.view.scene;
        const cone = BABYLON.MeshBuilder.CreateCylinder('spike', { diameterTop: 0, diameterBottom: 30, height: 46, tessellation: 4 }, scene);
        cone.material = this.mat('spike', '#c9d0d6');
        /** @type {any} */ (cone.material).specularColor = new BABYLON.Color3(0.9, 0.9, 0.9);
        const mats = [];
        const M = BABYLON.Matrix;
        for (const p of pieces) {
            const nx = Math.max(1, Math.round(p.sx / 40)), nz = Math.max(1, Math.round(p.sz / 40));
            for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
                const lx = -p.sx / 2 + (i + 0.5) * p.sx / nx, lz = -p.sz / 2 + (k + 0.5) * p.sz / nz;
                const wx = p.O[0] + lx * p.ax[0] + lz * p.az[0], wy = p.O[1] + lx * p.ax[1] + lz * p.az[1] + 23, wz = p.O[2] + lx * p.ax[2] + lz * p.az[2];
                mats.push(M.Translation(wx, wy, wz));
            }
        }
        const buf = new Float32Array(mats.length * 16);
        mats.forEach((m, i) => m.copyToArray(buf, i * 16));
        cone.thinInstanceSetBuffer('matrix', buf, 16, true);
        World3D.addObject(/** @type {LoryApp} */ (this.app).location.view, cone, 'prop', { outline: false });
        this.nodes.push(cone);
    },

    // ---- взаимодействия ----
    async addAct(m) {
        const r = m.role, kind = m.words[0] || '';
        const a = Object.assign(m, { kind, done: false, timer: 0, root: null, anim: 0, part: null });
        let url = '';
        if (r === 'switch') {
            a.label = 'act.' + (['vent', 'lever', 'fuse', 'button', 'valve', 'pc', 'door'].includes(kind) ? kind : 'lever');
            a.icon = kind === 'vent' ? '▦' : kind === 'fuse' ? '⚡' : '✋';
            const map = { vent: 'switch_vent', fuse: 'switch_fuse', button: 'switch_button', valve: 'valve', pc: 'switch_button' };
            const file = map[kind] || 'switch_lever';
            url = file === 'switch_vent' ? 'assets/models/prison/switch_vent.glb' : file === 'switch_fuse' ? 'assets/models/prison/switch_fuse.glb'
                : file === 'switch_button' ? 'assets/models/prison/switch_button.glb' : file === 'valve' ? 'assets/models/prison/valve.glb'
                : 'assets/models/prison/switch_lever.glb';
        } else if (r === 'chest') { a.label = 'act.chest'; a.icon = '★'; url = 'assets/models/prison/chest.glb'; }
        else if (r === 'stand') { a.label = 'act.stand'; a.icon = '👕'; url = 'assets/models/prison/stand.glb'; }
        else if (r === 'uniform') { a.label = 'act.uniform'; a.icon = '🧢'; url = 'assets/models/prison/uniform_rack.glb'; }
        else if (r === 'jetpack') { a.label = 'act.jetpack'; a.icon = '🚀'; url = 'assets/models/prison/jetpack.glb'; }
        this.acts.push(a);
        if (url) {
            a.root = await this.model(url, r);
            if (!a.root) a.root = this.fallbackBox(r, a);
            if (r === 'switch') this.mountSwitch(a);
            else this.put(a.root, a.x, a.y, a.h, a.yaw);
            a.part = this.part(a.root, r === 'chest' ? 'Lid' : kind === 'valve' ? 'Wheel' : 'Lever');
            if (a.part && a.part.metadata && a.part.metadata.pivot) a.part.setPivotPoint(BABYLON.Vector3.FromArray(a.part.metadata.pivot));
            if (r === 'jetpack') { a.root.position.y += 40; }
        }
        if (r === 'stand' && typeof GameMech.hooks.standModel === 'function') {
            try { await this.hooks.standModel(a); } catch (e) { console.warn('stand', e); }
        }
        return a;
    },

    /**
     * Настенный рубильник/щиток/вентиль: маркер обычно стоит на полу перед стеной. Модель поднимается на высоту руки
     * (центр ≈ пол + 115) и прижимается к стене позади (луч назад по курсу, до 260 px); стены нет — встаёт на стальную стойку.
     * Решётка вентиляции (vent) висит там, где поставлена: это рамка вокруг детали-решётки.
     */
    mountSwitch(a) {
        const view = /** @type {LoryApp} */ (this.app).location.view;
        if (a.kind === 'vent') { this.put(a.root, a.x, a.y, a.h, a.yaw); return; }
        const fx = Math.cos(a.yaw), fy = Math.sin(a.yaw);
        const floor = ObbyCourse.groundAt(a.x, a.y, a.h + 60, 400);
        const onFloor = floor != null && Math.abs(a.h - floor) < 45;
        const cy = onFloor ? floor + 115 : a.h;
        // стена позади: луч от точки на высоте руки в сторону −курса
        const hit = ObbyCourse.ray(a.x, cy, a.y, -fx, 0, -fy, 260);
        if (hit && !(hit.col && (hit.col.kill || hit.col.hazard))) {
            this.put(a.root, a.x - fx * (hit.t - 2), a.y - fy * (hit.t - 2), cy, a.yaw);
            return;
        }
        this.put(a.root, a.x, a.y, cy, a.yaw);
        if (!onFloor) return;
        // стойка: труба от пола до щитка и плита-основание
        const scene = view.scene;
        const post = BABYLON.MeshBuilder.CreateCylinder('switch-post', { diameter: 14, height: cy - floor, tessellation: 10 }, scene);
        post.material = this.mat('post', '#5d6670');
        post.position.set(a.x - fx * 8, floor + (cy - floor) / 2, a.y - fy * 8);
        const base = BABYLON.MeshBuilder.CreateCylinder('switch-base', { diameter: 46, height: 6, tessellation: 16 }, scene);
        base.material = this.mat('post-base', '#f2c230');
        base.position.set(a.x - fx * 8, floor + 3, a.y - fy * 8);
        for (const m of [post, base]) { World3D.addObject(view, m, 'prop', { outline: false }); this.nodes.push(m); }
    },

    /** Запасной вид предмета без модели: цветная коробка (видна, что тут есть взаимодействие). */
    fallbackBox(role, a) {
        const scene = /** @type {LoryApp} */ (this.app).location.view.scene;
        const size = role === 'chest' ? [90, 60, 70] : role === 'stand' ? [90, 70, 90] : role === 'jetpack' ? [40, 60, 60] : [20, 60, 40];
        const b = BABYLON.MeshBuilder.CreateBox(role, { width: size[0], height: size[1], depth: size[2] }, scene);
        b.setPivotPoint(new BABYLON.Vector3(0, -size[1] / 2, 0));
        b.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, size[1] / 2, 0));
        b.material = this.mat('fb-' + role, role === 'chest' ? '#c8742a' : role === 'switch' ? '#d9d9d9' : '#f07d1e');
        World3D.addObject(/** @type {LoryApp} */ (this.app).location.view, b, 'prop', { outline: false });
        this.nodes.push(b);
        return b;
    },

    // ---- подбираемое ----
    async addPickup(m) {
        const p = Object.assign(m, { got: false, back: 0, root: null });
        const url = m.role === 'key' ? 'assets/models/prison/keycard.glb' : m.role === 'fuel' ? 'assets/models/prison/fuel_can.glb' : 'assets/models/prison/superjump_orb.glb';
        p.root = await this.model(url, m.role);
        const scene = /** @type {LoryApp} */ (this.app).location.view.scene;
        if (!p.root) {
            const s = BABYLON.MeshBuilder.CreateSphere(m.role, { diameter: m.role === 'superjump' ? 90 : 40, segments: 12 }, scene);
            s.material = m.role === 'superjump' ? this.mat('orb', '#5dff7a', '#1d8f30', 0.55) : this.mat('pk-' + m.role, m.role === 'key' ? '#3fa0ff' : '#ff4a3a', '#222222');
            World3D.addObject(/** @type {LoryApp} */ (this.app).location.view, s, 'prop', { outline: false });
            this.nodes.push(s);
            p.root = s;
        }
        if (m.role === 'key') {
            // часть Card (белая) — в цвет группы: свой клон материала у этой карты
            const col = ['#3fa0ff', '#ff4a4a', '#3fdc78', '#f2c230'][((m.prm.g || 1) - 1) % 4];
            const card = this.part(p.root, 'Card');
            if (card && card.material) {
                const mm = /** @type {any} */ (card.material).clone('keycard-' + (m.prm.g || 1));
                for (const s of (mm.subMaterials || [mm])) if (s && s.diffuseColor) { s.diffuseColor = BABYLON.Color3.FromHexString(col); s.emissiveColor = s.diffuseColor.scale(0.3); }
                card.material = mm;
            }
            p.color = col;
        }
        this.put(p.root, p.x, p.y, p.h + 80, p.yaw);
        this.pickups.push(p);
        return p;
    },

    // ---- ловушки ----
    async addTrap(m) {
        const t = Object.assign(m, { root: null, part: null, snapped: false, off: 0 });
        const urls = { beartrap: 'assets/models/prison/beartrap.glb', saw: 'assets/models/prison/saw_blade.glb', crusher: 'assets/models/prison/crusher.glb', laser: 'assets/models/prison/laser_emitter.glb' };
        const scene = /** @type {LoryApp} */ (this.app).location.view.scene, view = /** @type {LoryApp} */ (this.app).location.view;
        if (m.role === 'beartrap') t.root = await this.model('assets/models/prison/beartrap.glb', 'beartrap');
        else if (m.role === 'saw') t.root = await this.model('assets/models/prison/saw_blade.glb', 'saw');
        else if (m.role === 'crusher') t.root = await this.model('assets/models/prison/crusher.glb', 'crusher');
        else if (m.role === 'laser') {
            t.len = Math.max(100, m.hx || 400);
            t.root = await this.model('assets/models/prison/laser_emitter.glb', 'laser');
            t.root2 = await this.model('assets/models/prison/laser_emitter.glb', 'laser');
            const beam = BABYLON.MeshBuilder.CreateCylinder('laser-beam', { diameter: 7, height: t.len, tessellation: 8 }, scene);
            beam.material = this.mat('laser', '#ff2a3a', '#ff2030', 0.85);
            beam.rotation.z = Math.PI / 2;
            beam.bakeCurrentTransformIntoVertices();
            beam.position.set(m.x + Math.cos(m.yaw) * t.len / 2, m.h, m.y + Math.sin(m.yaw) * t.len / 2);
            beam.rotation.y = -m.yaw;
            World3D.addObject(view, beam, 'prop', { outline: false, castShadow: false });
            this.nodes.push(beam);
            t.beam = beam;
            if (t.root2) { this.put(t.root2, m.x + Math.cos(m.yaw) * t.len, m.y + Math.sin(m.yaw) * t.len, m.h - 30, m.yaw + Math.PI); }
            if (t.root) this.put(t.root, m.x, m.y, m.h - 30, m.yaw);
        }
        if (!t.root && m.role !== 'laser' && m.role !== 'steam') {
            let mesh;
            if (m.role === 'saw') { mesh = BABYLON.MeshBuilder.CreateCylinder('saw', { diameter: 140, height: 8, tessellation: 24 }, scene); mesh.rotation.x = Math.PI / 2; mesh.bakeCurrentTransformIntoVertices(); mesh.material = this.mat('saw', '#c9d0d6'); }
            else if (m.role === 'crusher') { mesh = BABYLON.MeshBuilder.CreateBox('crusher', { width: 180, height: 108, depth: 180 }, scene); mesh.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, -54, 0)); mesh.material = this.mat('crusher', '#5a5f66'); }
            else { mesh = BABYLON.MeshBuilder.CreateTorus('beartrap', { diameter: 80, thickness: 10, tessellation: 18 }, scene); mesh.material = this.mat('beartrap', '#6b6f75'); }
            World3D.addObject(view, mesh, 'prop', { outline: false });
            this.nodes.push(mesh);
            t.root = mesh;
        }
        t.part = this.part(t.root, m.role === 'saw' ? 'Blade' : 'JawL');
        t.part2 = this.part(t.root, 'JawR');
        for (const p of [t.part, t.part2]) if (p && p.metadata && p.metadata.pivot) p.setPivotPoint(BABYLON.Vector3.FromArray(p.metadata.pivot));
        if (m.role !== 'laser' && t.root) this.put(t.root, m.x, m.y, m.h, m.yaw);
        void urls;
        this.traps.push(t);
        return t;
    },

    // ---- декор ----
    async addDecor(m) {
        if (m.role === 'heli') {
            const root = await this.model('assets/models/prison/helicopter.glb', 'heli');
            if (root) { this.put(root, m.x, m.y, m.h, m.yaw); m.root = root; m.rotor = this.part(root, 'Rotor'); m.tail = this.part(root, 'Tail'); for (const p of [m.rotor, m.tail]) if (p && p.metadata && p.metadata.pivot) p.setPivotPoint(BABYLON.Vector3.FromArray(p.metadata.pivot)); }
            this.traps.push(Object.assign(m, { role: 'heli' }));
        } else if (m.role === 'alarm') {
            const root = await this.model('assets/models/prison/alarm_light.glb', 'alarm');
            if (root) { this.put(root, m.x, m.y, m.h, m.yaw); m.root = root; m.lamp = this.part(root, 'Lamp'); }
            this.traps.push(m);
        } else if (m.role === 'sign') this.addSign(m);   // npc создаёт GameGuard.build
        if (typeof GameFx !== 'undefined' && GameFx.decor) { try { GameFx.decor(m); } catch (e) { console.warn('GameFx.decor', e); } }
    },

    /** Табличка с текстом Lang sign.<ключ> (плоскость с текстурой-холстом). */
    addSign(m) {
        const view = /** @type {LoryApp} */ (this.app).location.view, scene = view.scene;
        const text = Lang.t('sign.' + (m.words[0] || 'exit'));
        const w = Math.max(120, m.hx * 2 || 240), h = Math.max(50, m.tall * 0.4 || 80);
        const tex = new BABYLON.DynamicTexture('sign-tex', { width: 512, height: 512 * h / w }, scene, true);
        const ctx = /** @type {any} */ (tex.getContext());
        const H = 512 * h / w;
        ctx.fillStyle = m.words[1] === 'red' ? '#b8322c' : m.words[1] === 'yellow' ? '#f2c230' : '#1f8f4a';
        ctx.fillRect(0, 0, 512, H);
        ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, 496, H - 16);
        ctx.fillStyle = m.words[1] === 'yellow' ? '#23262b' : '#f4f1ea';
        ctx.font = '900 ' + Math.round(H * 0.5) + 'px Montserrat, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, H / 2 + 4, 470);
        tex.update(true);
        const plane = BABYLON.MeshBuilder.CreatePlane('sign', { width: w, height: h, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        const mat = new BABYLON.StandardMaterial('sign-mat', scene);
        mat.diffuseTexture = tex; mat.emissiveColor = new BABYLON.Color3(0.45, 0.45, 0.45); mat.metadata = { toon: false };
        plane.material = mat;
        plane.position.set(m.x, m.h + h / 2, m.y);
        plane.rotation.y = -m.yaw + Math.PI / 2;
        World3D.addObject(view, plane, 'prop', { outline: false, castShadow: false });
        this.nodes.push(plane);
    },

    // ---------------------------------------------------------------------------------------------
    // Кадр
    // ---------------------------------------------------------------------------------------------

    update(dt) {
        if (!this.app) return;
        this.time += dt;
        const t = this.time;
        const H = GameHero, alive = !!H.ch && !H.dead;
        const hx = H.x, hy = H.y, hh = H.h;
        // монеты
        for (const c of this.coins) {
            if (c.pop > 0) c.pop -= dt;
            if (c.got || !alive) continue;
            const dx = c.x - hx, dy = c.y - hy, dh = c.h - (hh + 85);
            if (dx * dx + dy * dy < 85 * 85 && Math.abs(dh) < 120) {
                c.got = true; c.pop = 0.35;
                this.collected += c.v;
                this.call('coin', c);
            }
        }
        this.updateCoins(t);
        // подбираемое
        for (const p of this.pickups) {
            if (p.root) { p.root.rotation.y = t * 1.8; p.root.position.y = p.h + 80 + Math.sin(t * 2.2 + p.x) * 10; }
            if (p.got) {
                if (p.back > 0 && (p.back -= dt) <= 0) { p.got = false; if (p.root) p.root.setEnabled(true); }
                continue;
            }
            if (!alive) continue;
            const dx = p.x - hx, dy = p.y - hy;
            if (dx * dx + dy * dy < 95 * 95 && Math.abs(p.h - hh) < 170) this.pickup(p);
        }
        // зоны
        GameHero.ladder = null; GameHero.soft = false; GameHero.windV = 0;
        for (const z of this.zones) {
            const inside = alive && this.inZone(z, hx, hy, hh);
            const enter = inside && !z.inside;
            z.inside = inside;
            this.zone(z, inside, enter, dt);
        }
        // закрывающиеся решётки: отсчёт секунд, по закрытии — игрок перед решёткой проиграл
        this.updateGates(dt, alive);
        // таймеры групп
        for (const g of Object.keys(this.timers)) {
            const prev = this.timers[g];
            const left = prev - dt;
            if (Math.ceil(left) !== Math.ceil(prev) && left > 0) this.call('tick', { g, left: Math.ceil(left) });
            if (left <= 0) {
                delete this.timers[g];
                ObbyCourse.setGroup(g, false);
                for (const a of this.acts) if (a.role === 'switch' && String(a.prm.g) === g) { a.done = false; }
                this.call('mech', { g, on: false });
            } else this.timers[g] = left;
        }
        // взаимодействия: ближайшее перед героем
        this.updateActs(dt, alive);
        // ловушки
        for (const tr of this.traps) this.trap(tr, dt, t, alive);
    },

    call(name, d) { const f = this.hooks[name]; if (typeof f === 'function') { try { f(d || {}); } catch (e) { console.warn('GameMech.' + name, e); } } },

    pickup(p) {
        p.got = true;
        if (p.root) p.root.setEnabled(false);
        if (p.role === 'key') {
            this.keys.add(p.prm.g || 1);
            this.call('key', { g: p.prm.g || 1, x: p.x, y: p.y, h: p.h });
            if (this.hooks.keys) this.hooks.keys(Array.from(this.keys));
        } else if (p.role === 'fuel') {
            GameHero.refuel(); p.back = 6;
            this.call('fuel', p);
        } else {
            GameHero.superJump(p.prm.t || 12); p.back = 6;
            this.call('superjump', { x: p.x, y: p.y, h: p.h, t: p.prm.t || 12 });
        }
    },

    zone(z, inside, enter, dt) {
        const r = z.role;
        if (r === 'ladder' && inside) GameHero.ladder = z;
        else if (r === 'soft' && inside) GameHero.soft = true;
        else if (r === 'fan' && inside) GameHero.windV = z.prm.v || 1400;
        if (r === 'fan' && z.blades) z.blades.rotation.y = this.time * 18;
        else if (r === 'task' && enter) { const key = z.words[0] || ''; if (key && key !== this.task) { this.task = key; this.call('task', { key }); } }
        else if (r === 'trigger' && enter && !z.fired) { z.fired = true; this.activate(z.prm.g, true, z); }
        else if (r === 'calm' && enter) this.call('calm', { g: z.prm.g });
        else if (r === 'detector' && enter) { if (GameHero.disguise) this.call('disguiseLost', z); }
        else if (r === 'lock' && inside) {
            const g = z.prm.g || 1;
            if (!ObbyCourse.groupOn(g)) {
                if (this.keys.has(g)) { this.activate(g, true, z); this.call('unlock', z); }
                else if (enter || (this._needKeyT -= dt) < 0) { this._needKeyT = 3; this.call('needKey', z); }
            }
        } else if (r === 'plate') {
            const g = z.prm.g || 1;
            const press = inside && GameHero.grounded;
            if (press && !z.on) { z.on = true; this.activate(g, true, z); }
            else if (!press && z.on && !z.prm.latch) { z.on = false; ObbyCourse.setGroup(g, false); this.call('mech', { g, on: false }); }
        }
    },

    /** Включить группу: механизмы едут, охранники группы бегут (Game.hooks.group). */
    /** Деталь — закрывающаяся решётка: начинает открытой (inv=1), при включении группы опускается и остаётся (не hide). */
    isGate(p) { return !!(p && p.role === 'mech' && p.prm.inv && !p.prm.hide); },

    updateGates(dt, alive) {
        const H = GameHero;
        for (const p of ObbyCourse.mechs) {
            if (!this.isGate(p)) continue;
            const on = ObbyCourse.groupOn(p.prm.g);
            if (!on) { p._gateDone = false; p._gateLeft = null; continue; }
            // отсчёт (только у медленных решёток, t ≥ 3 с)
            const T = p.prm.t != null ? p.prm.t : 1;
            if (T >= 3 && !p._gateDone) {
                const left = Math.ceil(T * (p.mk || 0));
                if (left !== p._gateLeft && left > 0) { p._gateLeft = left; if (Math.hypot(p.O[0] - H.x, p.O[2] - H.y) < 4000) this.call('gateTick', { left, g: p.prm.g }); }
            }
            if (p._gateDone || (p.mk || 0) > 0.001) continue;
            p._gateDone = true;
            if (!alive) continue;
            // игрок перед решёткой: до следующего этапа ему дальше, чем решётке
            const S = typeof this.hooks.nextStage === 'function' ? this.hooks.nextStage() : null;
            if (!S) continue;
            const dGate = Math.hypot(p.O[0] - S.x, p.O[2] - S.z), dHero = Math.hypot(H.x - S.x, H.y - S.z);
            if (dHero > dGate + 40 && Math.hypot(p.O[0] - H.x, p.O[2] - H.y) < 6000) this.call('kill', { cause: 'gate', x: H.x, y: H.y, h: H.h, push: [0, 200, 0] });
        }
    },

    activate(g, on, src) {
        if (g == null) return;
        const n = ObbyCourse.setGroup(g, on);
        this.call('mech', { g, on, n, x: src ? src.x : 0, y: src ? src.y : 0, h: src ? src.h : 0 });
        this.call('group', { g, on, src });
    },

    updateActs(dt, alive) {
        let best = null, bd = 1e9;
        const H = GameHero, hx = H.x, hy = H.y, hh = H.h;
        for (const a of this.acts) {
            // анимация частей
            if (a.part) {
                const k = a.anim = Math.max(0, Math.min(1, a.anim + (a.done ? dt : -dt) * 3));
                if (a.role === 'chest') a.part.rotation.z = k * 1.75;                 // крышка: +100° вокруг Z
                else if (a.kind === 'valve') a.part.rotation.x = k * Math.PI * 2;
                else a.part.rotation.z = -k * 2.02;                                    // рычаг: −116° вокруг Z
            }
            if (a.role === 'jetpack' && a.root && !a.done) { a.root.rotation.y = -a.yaw + this.time * 1.2; }
            if (!alive || a.done && a.role !== 'stand') continue;
            if (a.role === 'chest' && this.chestOpened) continue;
            const dx = a.x - hx, dy = a.y - hy, d = Math.hypot(dx, dy);
            if (d > 190 || Math.abs(a.h - hh) > 230) continue;
            if (d < bd) { bd = d; best = a; }
        }
        const id = best ? 'act-' + this.acts.indexOf(best) : '';
        if (id !== this._ctx) {
            this._ctx = id;
            this.near = best;
            this.call('near', best);          // Game: подсказка «[E] …» на ПК / кнопка действия на телефоне
        }
        const tap = this._tap; this._tap = false;
        if (best && (Input.pressed('interact') || tap)) this.act(best);
    },

    /** Нажата экранная кнопка действия (телефон). */
    tapInteract() { this._tap = true; },
    _tap: false,
    /** @type {any} */ near: null,

    /** Взаимодействие с предметом (E / контекстная кнопка). */
    act(a) {
        if (a.role === 'switch') {
            if (a.done) return;
            a.done = true;
            const g = a.prm.g || 1;
            this.activate(g, true, a);
            if (a.prm.timer) this.timers[String(g)] = a.prm.timer;
            this.call('switch', { kind: a.kind || 'lever', x: a.x, y: a.y, h: a.h, g, timer: a.prm.timer || 0 });
        } else if (a.role === 'chest') this.call('chest', a);
        else if (a.role === 'stand') this.call('stand', a);
        else if (a.role === 'uniform') { a.done = true; this.call('uniform', a); }
        else if (a.role === 'jetpack') {
            a.done = true;
            if (a.root) a.root.setEnabled(false);
            GameHero.giveJetpack(a.prm.f || 8);
            this.call('jetpack', a);
        }
        this._ctx = ''; this.near = null;
        this.call('near', null);
    },

    /** Сундук открыт за рекламу: крышка и больше не предлагать. */
    openChest(a) { this.chestOpened = true; if (a) a.done = true; },

    trap(tr, dt, t, alive) {
        const H = GameHero, hx = H.x, hy = H.y, hh = H.h;
        const r = tr.role, P = tr.prm;
        const T = Math.max(0.3, P.t || 3), ph = P.ph || 0;
        const u = ((t / T + ph) % 1 + 1) % 1;
        if (r === 'beartrap') {
            if (tr.snapped) { tr.snapT = (tr.snapT || 0) + dt; if (tr.snapT > 2.5) { tr.snapped = false; tr.snapT = 0; } }
            const k = tr.snapped ? Math.min(1, (tr.snapT || 0) * 12) : 0;
            if (tr.part) tr.part.rotation.x = k * 1.2;
            if (tr.part2) tr.part2.rotation.x = -k * 1.2;
            if (alive && !tr.snapped && Math.hypot(hx - tr.x, hy - tr.y) < 48 && Math.abs(hh - tr.h) < 40) {
                tr.snapped = true; tr.snapT = 0;
                this.call('trapSnap', tr);
                this.call('kill', { cause: 'trap', x: tr.x, y: tr.y, h: tr.h, push: [0, 300, 0] });
            }
        } else if (r === 'saw') {
            const amp = (P.x || 600) / 2, s = Math.sin(2 * Math.PI * u);
            const px = tr.x + Math.cos(tr.yaw) * amp * s, py = tr.y + Math.sin(tr.yaw) * amp * s;
            if (tr.root) { tr.root.position.x = px; tr.root.position.z = py; }
            if (tr.part) tr.part.rotation.z = -t * 14 * Math.sign(Math.cos(2 * Math.PI * u) || 1);
            else if (tr.root) tr.root.rotation.z = -t * 14;
            if (alive && Math.hypot(hx - px, hy - py) < 92 && hh < tr.h + 150 && hh > tr.h - 60) {
                this.call('saw', { x: px, y: py, h: tr.h });
                this.call('kill', { cause: 'saw', x: px, y: py, h: tr.h, push: [(hx - px) * 4, 600, (hy - py) * 4] });
            }
        } else if (r === 'crusher') {
            const d = P.d || 220;
            // 0..0.5 вверху, 0.5..0.6 падает, 0.6..0.78 внизу, 0.78..1 поднимается
            const off = u < 0.5 ? 0 : u < 0.6 ? d * ((u - 0.5) / 0.1) ** 2 : u < 0.78 ? d : d * (1 - (u - 0.78) / 0.22);
            if (tr.root) tr.root.position.y = tr.h - off + 108;   // начало модели — верх блока высотой 108 (h маркера — низ пресса)
            if (u >= 0.6 && tr.lastU < 0.6) this.call('crusher', { x: tr.x, y: tr.y, h: tr.h - d });
            tr.lastU = u;
            const half = Math.max(70, (tr.hx || 90) * 0.9);
            const bottom = tr.h - off;
            const c = Math.cos(tr.yaw), sn = Math.sin(tr.yaw), dx = hx - tr.x, dy = hy - tr.y;
            const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
            if (alive && off > d * 0.55 && Math.abs(lx) < half && Math.abs(ly) < half && hh + 170 > bottom && hh < bottom) {
                this.call('kill', { cause: 'crusher', x: hx, y: hy, h: hh, push: [0, -200, 0] });
            }
        } else if (r === 'laser') {
            const on = u < (P.on != null ? P.on : 0.5);
            if (tr.beam) tr.beam.setEnabled(on);
            if (on && !tr.wasOn) this.call('laser', tr);
            tr.wasOn = on;
            if (alive && on && hh < tr.h + 20 && hh + 180 > tr.h) {
                const c = Math.cos(tr.yaw), sn = Math.sin(tr.yaw), dx = hx - tr.x, dy = hy - tr.y;
                const along = dx * c + dy * sn, across = -dx * sn + dy * c;
                if (along > 0 && along < tr.len && Math.abs(across) < 28) this.call('kill', { cause: 'laser', x: hx, y: hy, h: hh });
            }
        } else if (r === 'steam') {
            const on = u < (P.on != null ? P.on : 0.4);
            if (on !== tr.wasOn) this.call('steam', { x: tr.x, y: tr.y, h: tr.h, on, yaw: tr.yaw });
            tr.wasOn = on;
            // урон пара — только в узком столбе над трубой (видимый клуб шире): радиус 35–55 px
            const steamR = Math.max(35, Math.min(55, (tr.hx || 60) * 0.4));
            if (alive && on && P.kill && u < (P.on != null ? P.on : 0.4) * 0.85 && Math.hypot(hx - tr.x, hy - tr.y) < steamR + 20 && hh > tr.h - 30 && hh < tr.h + Math.max(200, tr.tall)) {
                this.call('kill', { cause: 'steam', x: hx, y: hy, h: hh });
            }
        } else if (r === 'heli') {
            if (tr.rotor) tr.rotor.rotation.y = t * 22;
            if (tr.tail) tr.tail.rotation.x = t * 30;
        } else if (r === 'alarm') {
            if (tr.lamp) tr.lamp.rotation.y = t * 6;
        }
    },

    // ---------------------------------------------------------------------------------------------
    // Возврат на чекпоинт и новый заход
    // ---------------------------------------------------------------------------------------------

    /** Герой вернулся на чекпоинт: таймерные группы гаснут, триггеры погони перевзводятся (их зовёт Game). */
    respawn(rearmGroups) {
        for (const g of Object.keys(this.timers)) {
            delete this.timers[g];
            ObbyCourse.setGroup(g, false);
            for (const a of this.acts) if (a.role === 'switch' && String(a.prm.g) === g) a.done = false;
        }
        const re = new Set((rearmGroups || []).map(String));
        // закрывающиеся решётки снова открыты, их триггеры взведены (иначе после проигрыша путь закрыт навсегда)
        for (const p of ObbyCourse.mechs) if (this.isGate(p)) { re.add(String(p.prm.g)); }
        for (const p of ObbyCourse.mechs) if (re.has(String(p.prm.g)) && this.isGate(p)) { p.mt = p.mk = 1; p._gateDone = false; p._gateLeft = null; }
        for (const z of this.zones) {
            if (z.role === 'trigger' && re.has(String(z.prm.g))) { z.fired = false; ObbyCourse.setGroup(z.prm.g, false); }
            z.inside = false;
        }
    },

    /** Монеты, собранные в этом заходе (для экрана результата). */
    coinStats() { return { got: this.collected, total: this.total }; },
};
