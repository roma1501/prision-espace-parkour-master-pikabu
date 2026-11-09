// GameHero.js — герой Prision Espace Parkour Master: физический блочный человечек движка (HumanoidCharacter: Motion Matching,
// пружинная капсула, рэгдолл) на мире трассы ObbyCourse (GameWorld — адаптер CharacterWorld: опора, стены, потолок,
// движущиеся плиты и механизмы, конвейеры boost, батуты jump, лёд). Поверх — способности уровня: джетпак (топливо),
// лестницы, супер-прыжок, восходящий поток, мягкое приземление. Чистая логика решений — по ObbyCourse (инвариант 4).
//
//   GameHero.create(app, spawn)          // spawn = { x, y (карта), h, yaw }
//   GameHero.update(dt, { move, jump, jumpHeld, sprint, camYaw })
//   GameHero.place(x, y, h, yaw)         // респаун; GameHero.kill(cause) — рэгдолл и «держать»
//   GameHero.on('step' | 'jump' | 'land' | 'thud' | 'ragdoll' | 'bounce' | 'boost', fn)

/** CharacterWorld поверх ObbyCourse (мир Babylon: x, y вверх, z = карта y). */
const GameWorld = {
    /** @param {any} course ObbyCourse */
    make(course) {
        const C = course;
        const tmpQ = [0, 0, 0];
        const world = {
            gravity: undefined,
            /** Опора под точкой: самая высокая не выше yTop в пределах maxDist. Подвижные детали — со скоростью. */
            ground(x, z, yTop, maxDist, out) {
                const hit = C.rayDown(x, yTop, z, maxDist, 0.35, true);
                if (!hit) return null;
                const col = hit.col;
                out.y = hit.y; out.t = hit.t;
                const n = out.n || (out.n = [0, 1, 0]);
                n[0] = hit.n[0]; n[1] = hit.n[1]; n[2] = hit.n[2];
                out.body = col; out.kinematic = true; out.spin = 0;
                if (col.boost && !col.jump) {
                    // конвейер: опора «едет» вдоль оси детали со скоростью v
                    const a = col.ax, l = Math.hypot(a[0], a[2]) || 1, v = GameWorld.conveyor(col);
                    out.moving = true;
                    const vel = out.vel || (out.vel = [0, 0, 0]);
                    vel[0] = a[0] / l * v; vel[1] = 0; vel[2] = a[2] / l * v;
                } else if (col.dynamic) {
                    out.moving = true;
                    tmpQ[0] = x; tmpQ[1] = hit.y; tmpQ[2] = z;
                    const v = C.pointVel(col, tmpQ);
                    const vel = out.vel || (out.vel = [0, 0, 0]);
                    vel[0] = v[0]; vel[1] = v[1]; vel[2] = v[2];
                    out.spin = C.yawRate(col);
                } else { out.moving = false; out.vel = null; }
                return out;
            },
            /** Горизонтальный шаг кругом r со скольжением вдоль стен (капсула выше ступени). */
            move(x, z, dx, dz, r, y, out) {
                let px = x + dx, pz = z + dz;
                const lo = y + 34 + r, hi = y + 172 - r;
                for (let it = 0; it < 3; it++) {
                    let any = false;
                    C.capsule(px, lo, pz, px, hi, pz, r, (k) => {
                        const col = k.col;
                        if (col.kill || col.hazard || col.jump) return;
                        const nn = k.n;
                        if (nn[1] > 0.6 || nn[1] < -0.5) return;      // пол — опора, потолок — отдельно
                        const l = Math.hypot(nn[0], nn[2]) || 1;
                        px += nn[0] / l * k.depth; pz += nn[2] / l * k.depth;
                        any = true;
                    });
                    if (!any) break;
                }
                out.x = px; out.z = pz;
                return out;
            },
            /** Частица рэгдолла: вытолкнуть сферу из твёрдых деталей. */
            push(p, r, out) {
                let best = null;
                C.sphere(p[0], p[1], p[2], r, (k) => {
                    if (k.col.kill || k.col.hazard) return;
                    if (!best || k.depth > best.depth) best = { n: k.n, depth: k.depth };
                });
                if (!best) return null;
                p[0] += best.n[0] * best.depth; p[1] += best.n[1] * best.depth; p[2] += best.n[2] * best.depth;
                const n = out.n || (out.n = [0, 0, 0]);
                n[0] = best.n[0]; n[1] = best.n[1]; n[2] = best.n[2];
                out.body = null; out.depth = best.depth;
                return out;
            },
        };
        return world;
    },

    /** Скорость конвейера детали boost (v= в имени; по умолчанию медленнее ускорителя обби). */
    conveyor(col) {
        const p = col.piece;
        return p && p.prm && p.prm.v != null ? Number(p.prm.v) : 380;
    },
};

/** @satisfies {Record<string, any>} */
const GameHero = {
    /** @type {any} HumanoidCharacter */ ch: null,
    /** @type {LoryApp | null} */ app: null,
    /** @type {any} */ world: null,
    /** @type {Record<string, Function[]>} */ listeners: {},
    jet: { has: false, fuel: 0, max: 8, on: false, skin: '' },
    superT: 0,
    ladder: null,
    windV: 0,
    soft: false,
    disguise: false,
    dead: false,
    /** @type {any} */ jetMesh: null,
    baseTraction: 3200,
    baseJump: 150,
    surface: 'concrete',
    lastGroundY: 0,
    airPeak: 0,
    _look: null,

    // роба: штаны на тон темнее куртки — ноги читаются на бегу (косметика GameLook перекрашивает)
    COLORS: { skin: [236, 192, 156], top: [244, 128, 32], bottom: [196, 88, 18] },

    // ---------------------------------------------------------------------------------------------

    /** Герой на точке spawn { x, y, h, yaw } (карта). Зовётся в prepare под экраном загрузки. */
    create(app, spawn) {
        this.dispose();
        this.app = app;
        this.world = GameWorld.make(ObbyCourse);
        const sp = spawn || { x: 0, y: 0, h: 0, yaw: 0 };
        this.ch = HumanoidCharacter.create(app.location.view, {
            world: this.world, x: sp.x, y: sp.y, h: sp.h, heading: sp.yaw || 0,
            colors: this.COLORS, name: 'hero', kind: 'actor',
        });
        const c = this.ch.ch.c;
        this.baseTraction = c.traction; this.baseJump = c.jumpHeight;
        const fwd = (name) => (e) => this.emit(name, e);
        for (const n of ['step', 'jump', 'land', 'thud', 'ragdoll', 'getup']) this.ch.on(n, fwd(n));
        this.resetAbilities();
        return this.ch;
    },

    dispose() {
        if (this.jetMesh) { try { World3D.removeObject(this.app.location.view, this.jetMesh); this.jetMesh.dispose(); } catch (e) { /* уже */ } this.jetMesh = null; }
        if (this.ch) { try { this.ch.dispose(); } catch (e) { /* уже */ } }
        this.ch = null;
    },

    on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); },
    emit(name, e) { const l = this.listeners[name]; if (l) for (const fn of l) { try { fn(e || {}); } catch (err) { console.warn('GameHero.' + name, err); } } },

    get x() { return this.ch ? this.ch.x : 0; },
    get y() { return this.ch ? this.ch.y : 0; },
    get h() { return this.ch ? this.ch.h : 0; },
    get heading() { return this.ch ? this.ch.heading : 0; },
    get vel() { return this.ch ? this.ch.ch.vel : [0, 0, 0]; },
    get grounded() { return !!(this.ch && this.ch.ch.grounded); },
    get model() { return this.ch ? this.ch.model : null; },

    /** Способности уровня — в начальное состояние (новый уровень). */
    resetAbilities() {
        this.jet.has = false; this.jet.fuel = 0; this.jet.on = false;
        this.superT = 0; this.ladder = null; this.windV = 0; this.soft = false; this.disguise = false; this.dead = false;
        this.showJetpack(false);
        if (this.ch) { this.ch.ch.c.jumpHeight = this.baseJump; this.ch.ch.c.traction = this.baseTraction; this.ch.hold = false; this.ch.locked = false; }
    },

    /** Телепорт (старт, чекпоинт): ноги на (x, y карты, h). */
    place(x, y, h, yaw) {
        if (!this.ch) return;
        this.ch.hold = false;
        this.ch.locked = false;
        this.ch.place(x, y, yaw || 0, h);
        this.dead = false;
        this.jet.on = false;
        this.ladder = null;
        this.lastGroundY = h; this.airPeak = h;
    },

    /** Смерть: рэгдолл (или без него — void), держать до респауна. */
    kill(cause, push) {
        if (!this.ch || this.dead) return;
        this.dead = true;
        this.jet.on = false;
        const v = this.ch.ch.vel;
        const p = push || [v[0] * 0.4, cause === 'void' ? v[1] : 520, v[2] * 0.4];
        this.ch.knock(p, cause || 'hit');
        this.ch.hold = true;
    },

    // ---------------------------------------------------------------------------------------------
    // Кадр
    // ---------------------------------------------------------------------------------------------

    /** inp: { move, jump, jumpHeld, sprint, camYaw, locked } */
    update(dt, inp) {
        const H = this.ch;
        if (!H) return;
        const i = inp || {};
        const P = H.ch;
        H.locked = !!i.locked || this.dead;
        // джетпак: удерживать прыжок в воздухе (или на земле — сначала прыжок)
        const wantJet = this.jet.has && !this.dead && !H.locked && i.jumpHeld && this.jet.fuel > 0 && !P.grounded && P.jumpT > 0.18;
        if (wantJet !== this.jet.on) { this.jet.on = wantJet; this.emit(wantJet ? 'jetOn' : 'jetOff', {}); }
        H.control({ move: i.move, sprint: i.sprint, jump: i.jump, jumpHeld: i.jumpHeld, camYaw: i.camYaw });
        // супер-прыжок
        if (this.superT > 0) { this.superT = Math.max(0, this.superT - dt); P.c.jumpHeight = this.superT > 0 ? this.baseJump * 2.1 : this.baseJump; }
        // лёд
        const col = P.grounded ? P.onBody : null;
        P.c.traction = col && col.ice ? 520 : this.baseTraction;
        // внешние силы до шага физики (меняют скорость капсулы)
        if (!this.dead && !H.ragdolled) this.forces(dt, i);
        H.update(dt);
        if (!this.dead && !H.ragdolled) this.afterStep(dt);
        // топливо
        // топливо конечное: тратится в полёте, само не восстанавливается (канистры fuel и чекпоинт заливают бак)
        if (this.jet.on) {
            this.jet.fuel = Math.max(0, this.jet.fuel - dt);
            if (this.jet.fuel <= 0) this.emit('jetEmpty', {});
        }
    },

    forces(dt, i) {
        const P = this.ch.ch, v = P.vel, g = P.gravity;
        // джетпак: тяга вверх с потолком скорости
        if (this.jet.on) {
            v[1] = Math.min(720, v[1] + (g + 2300) * dt);
            P.jumpT = 0.25;            // не «приземляться» на взлёте
        }
        // лестница: вверх по вводу вперёд/прыжку, вниз — назад; гравитация компенсируется
        if (this.ladder) {
            const up = (i.move && i.move.y > 0.3) || i.jumpHeld;
            const down = i.move && i.move.y < -0.3;
            const target = up ? 360 : down ? -320 : 0;
            v[1] = target + g * dt;
            if (up) { P.jumpT = 0; P.grounded = false; }
        }
        // восходящий поток
        // восходящий поток: стоящего на полу отрывает от земли (иначе пружина опоры съедает подъём), в воздухе — несёт вверх
        if (this.windV > 0) {
            if (P.grounded) { P.grounded = false; v[1] = Math.max(v[1], 420); }
            v[1] += (this.windV - v[1]) * Math.min(1, dt * 3) + g * dt * 0.8;
            if (v[1] > 0) P.jumpT = Math.min(P.jumpT, 0.1);   // «взлёт»: опора не ловит, пока несёт вверх
        }
        // мягкое приземление: скорость падения не больше 900
        if (this.soft && v[1] < -900) v[1] = -900;
    },

    /** После шага: потолок, батуты, касание падающих плит, поверхность. */
    afterStep(dt) {
        const P = this.ch.ch, p = P.pos, v = P.vel;
        // потолок: голова не проходит сквозь деталь
        if (v[1] > 0) {
            const hit = ObbyCourse.ray(p[0], p[1] + 90, p[2], 0, 1, 0, 100);
            if (hit && !(hit.col && (hit.col.kill || hit.col.jump))) {
                const top = p[1] + 90 + hit.t;
                if (p[1] + 186 > top) { p[1] = top - 186; v[1] = Math.min(0, v[1]); }
            }
        }
        if (P.grounded) {
            const col = P.onBody;
            if (col) {
                ObbyCourse.touch(col);
                if (col.jump) {
                    v[1] = col.jump; P.grounded = false; P.jumpT = 0; P.coyote = 9;
                    this.emit('bounce', { x: p[0], y: p[2], h: p[1] });
                }
                const piece = col.piece;
                this.surface = piece && piece.color ? piece.color : (piece ? piece.type : 'concrete');
                if (col.boost && !col.jump && !this._onBoost) this.emit('boost', { x: p[0], y: p[2], h: p[1] });
                this._onBoost = !!(col.boost && !col.jump);
            }
            this.lastGroundY = p[1]; this.airPeak = p[1];
        } else {
            this._onBoost = false;
            if (p[1] > this.airPeak) this.airPeak = p[1];
        }
    },

    // ---------------------------------------------------------------------------------------------
    // Способности
    // ---------------------------------------------------------------------------------------------

    giveJetpack(fuelSec) {
        this.jet.has = true;
        this.jet.max = Math.max(2, fuelSec || 8);
        this.jet.fuel = this.jet.max;
        this.showJetpack(true);
    },

    refuel() { if (this.jet.has) this.jet.fuel = this.jet.max; },

    superJump(sec) { this.superT = Math.max(this.superT, sec || 12); },

    /** Рюкзак-джетпак на спине (модель Blender; нет — коробка-заглушка). */
    showJetpack(on) {
        const model = this.model;
        if (!on) { if (this.jetMesh) this.jetMesh.setEnabled(false); return; }
        if (!model || !this.app) return;
        if (this.jetMesh) { this.jetMesh.setEnabled(true); return; }
        const view = this.app.location.view, torso = model.part('UpperTorso');
        if (!torso) return;
        const holder = new BABYLON.Mesh('hero-jet', view.scene);
        holder.parent = torso;
        holder.position.set(-17, 0, 0);
        this.jetMesh = holder;
        Model3D.load('assets/models/prison/jetpack.glb').then((m) => {
            if (this.jetMesh !== holder) return;
            const root = Model3D.build(m, view.scene, { name: 'jetpack' });
            root.parent = holder;
            World3D.addObject(view, root, 'actor', { outline: false });
            GameHero.glowParts(root);
        }).catch(() => {
            // заглушка: два баллона и ранец
            const mat = new BABYLON.StandardMaterial('jet-fallback', view.scene);
            mat.diffuseColor = new BABYLON.Color3(0.75, 0.2, 0.18);
            const pack = BABYLON.MeshBuilder.CreateBox('jet-pack', { width: 26, height: 56, depth: 52 }, view.scene);
            pack.material = mat; pack.parent = holder; pack.position.set(-13, 4, 0);
            for (const s of [-1, 1]) {
                const t = BABYLON.MeshBuilder.CreateCylinder('jet-tank', { diameter: 22, height: 64 }, view.scene);
                t.material = mat; t.parent = holder; t.position.set(-20, 2, s * 30);
            }
            World3D.addObject(view, holder, 'actor', { outline: false });
        });
    },

    /** Точки сопел джетпака в мире (для пламени): [{x, y, z}] (мир Babylon). */
    nozzles() {
        const out = [];
        if (!this.jetMesh || !this.ch) return out;
        // модель Blender: части NozzleL / NozzleR, начало каждой — центр среза сопла
        const parts = this.jetMesh.getChildMeshes(false).filter(k => k.metadata && /^Nozzle[LR]$/i.test(String(k.metadata.part)));
        if (parts.length) {
            for (const k of parts) {
                const pv = k.metadata.pivot ? BABYLON.Vector3.FromArray(k.metadata.pivot) : BABYLON.Vector3.Zero();
                const v = BABYLON.Vector3.TransformCoordinates(pv, k.getWorldMatrix());
                out.push({ x: v.x, y: v.y, z: v.z });
            }
            return out;
        }
        const m = this.jetMesh.getWorldMatrix();
        for (const s of [-1, 1]) {
            const v = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(-22, -40, s * 28), m);
            out.push({ x: v.x, y: v.y, z: v.z });
        }
        return out;
    },

    /** Части модели с суффиксом _glow — излучающие (лампы, линзы). */
    glowParts(root) {
        for (const m of root.getChildMeshes(false)) {
            const part = m.metadata && m.metadata.part ? String(m.metadata.part) : '';
            if (!m.material) continue;
            const mat = /** @type {any} */ (m.material);
            const subs = mat.subMaterials || [mat];
            const partGlow = /_glow/i.test(part);
            for (const s of subs) if (s && s.diffuseColor && (partGlow || /_glow$/i.test(String(s.name)))) { s.emissiveColor = s.diffuseColor.clone(); if (s.metadata) s.metadata.toon = false; else s.metadata = { toon: false }; }
        }
    },
};
