// Game.js — ядро Prision Espace Parkour Master: 7 уровней-карт (js/Maps.js + js/GameLevelData.js), состояния игры,
// сохранение, камера от третьего лица, связка модулей. Контракт и устройство — docs/DESIGN.md.
//   GameHero (физический герой) · GameMech (маркеры: монеты, механизмы, ловушки) · GameGuard (погони, патрули, камеры)
//   GameHud (интерфейс) · GameAudio (звук) · GameFx (эффекты) · Shop + GameShopData + GameShopUI + GameLook (косметика)
//
// Состояния: 'menu' (живая сцена уровня за меню) → 'run' → 'dead' (падение/поимка → чекпоинт) → 'complete' (результат).
// Сохранение — один объект Platform.save: { v, level, unlocked, stage, levels: { id: { done, best, coins } }, shop, tutorialDone }.

// Детали трассы не строит Location3D: копия карты отдаёт их в map.obbyKit (ДО main.js).
ObbyCourse.hookMaps();

Object.assign(LANG_STRINGS.ru, {
    'g.checkpoint': 'Чекпоинт!', 'g.respawn': 'Обратно на чекпоинт', 'g.loading': 'Загрузка уровня…',
    'g.task.default': 'Найди выход!', 'g.chest.got': '+{n} монет!', 'g.stand.bought': 'Куплено!', 'g.stand.equipped': 'Надето!',
    'tut.use.t': 'Взаимодействие', 'tut.use.keyboard': 'Подойди к рубильнику или решётке и нажми E', 'tut.use.touch': 'Подойди к рубильнику и нажми оранжевую кнопку действия',
    'tut.coin.t': 'Монеты', 'tut.coin.h': 'Собирай монеты — за них покупается косметика',
    'g.act': 'Действие',
    'g.skip': 'Пропустить участок', 'g.skipAd': 'За рекламу', 'g.skipIn': 'Через {n} с', 'g.skipped': 'Участок пропущен!',
});
Object.assign(LANG_STRINGS.en, {
    'g.checkpoint': 'Checkpoint!', 'g.respawn': 'Back to checkpoint', 'g.loading': 'Loading level…',
    'g.task.default': 'Find the exit!', 'g.chest.got': '+{n} coins!', 'g.stand.bought': 'Bought!', 'g.stand.equipped': 'Equipped!',
    'tut.use.t': 'Interact', 'tut.use.keyboard': 'Walk up to a lever or a vent grate and press E', 'tut.use.touch': 'Walk up to a lever and tap the orange action button',
    'tut.coin.t': 'Coins', 'tut.coin.h': 'Collect coins — they buy cosmetics',
    'g.act': 'Action',
    'g.skip': 'Skip this section', 'g.skipAd': 'Watch ad', 'g.skipIn': 'In {n} s', 'g.skipped': 'Section skipped!',
});

/** Уровни по порядку: из GameLevelData (build.mjs) или, пока его нет, — все карты Maps.js. */
function gameLevels() {
    if (typeof GAME_LEVELS !== 'undefined' && Array.isArray(GAME_LEVELS) && GAME_LEVELS.length) {
        const ids = new Set(GAME_MAPS.map(m => m.id));
        const list = GAME_LEVELS.filter(l => ids.has(l.id)).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        if (list.length) return list;
    }
    return GAME_MAPS.map((m, i) => ({ id: m.id, order: i + 1, title: { ru: m.name, en: m.name }, env: {}, showGround: true, par: 120, intro: '' }));
}

/** @satisfies {Record<string, any>} */
const Game = {
    /** @type {LoryApp | null} */ app: null,
    /** @type {any} */ save: null,
    /** @type {'menu' | 'run' | 'dead' | 'complete'} */ state: 'menu',
    /** @type {any[]} */ levels: [],
    levelIdx: 0,
    stage: 0,
    runTime: 0,
    deaths: 0,
    levelCoins: 0,
    deadT: 0,
    lookT: 0,
    busy: false,
    /** Цель камеры: x, y — карта, h — высота (CameraController.follow). */
    cam: { x: 0, y: 0, h: 0, frameHeight: 560, frameWidth: 620 },
    /** @type {any[]} */ cpRings: [],
    /** @type {any[]} */ mannequins: [],
    /** @type {HTMLButtonElement | null} */ actBtn: null,
    _modalPause: false,

    // ---------------------------------------------------------------------------------------------
    // Запуск
    // ---------------------------------------------------------------------------------------------

    /** Сохранение и уровень, с которого начать (main.js зовёт до init). ?level=level-3 — открыть уровень (проверка карт). */
    async firstMap() {
        this.levels = gameLevels();
        let saved = null;
        try { saved = await Platform.load(); } catch (e) { saved = null; }
        this.save = Object.assign({ v: 1, level: 0, unlocked: 1, stage: 0, levels: {}, tutorialDone: false }, saved || {});
        let idx = Math.max(0, Math.min(this.levels.length - 1, this.save.level | 0));
        try {
            const q = new URLSearchParams(location.search).get('level');
            if (q) { const i = this.levels.findIndex(l => l.id === q || String(l.order) === q); if (i >= 0) { idx = i; this.save.stage = 0; this._forced = true; } }
        } catch (e) { /* без адреса */ }
        this.levelIdx = idx;
        return this.levels[idx] ? this.levels[idx].id : undefined;
    },

    async init(app) {
        this.app = app;
        if (!this.save) await this.firstMap();
        this.levels = gameLevels();
        const cur = this.levels.findIndex(l => l.id === (app.map && app.map.id));
        if (cur >= 0) this.levelIdx = cur;
        // магазин косметики
        if (typeof Shop !== 'undefined' && typeof SHOP_ITEMS !== 'undefined') {
            Shop.init({ tabs: SHOP_TABS, items: SHOP_ITEMS, state: this.save.shop, persist: () => this.persist() });
            this.save.shop = Shop.state;
            Shop.on((e) => { if (e.type === 'equip' || e.type === 'unequip' || e.type === 'preview' || e.type === 'grant') this.applyLook(); if (e.type === 'coins') GameHud.setCoins(this.coins()); });
        }
        if (typeof GameMetaUI !== 'undefined' && typeof Shop !== 'undefined' && Shop.state) {
            GameMetaUI.init({ state: { daily: this.save.daily, wheel: this.save.wheel }, persist: () => this.persist(),
                onLogin: async () => { try { location.reload(); } catch (e) { /* без перезагрузки */ } },
                onClose: () => {}, onCoins: () => GameHud.setCoins(this.coins()), onEvent: (name) => this.sfx('ui', name) });
            this.save.daily = DailyGift.state; this.save.wheel = Wheel.state;
        }
        HudLayout.init({ app });
        Input.init({ app, mouse: 'drag' });
        GameHud.init({
            onPlay: () => this.play(this.levelIdx), onLevel: (i) => this.play(i), onShop: () => this.openShop(), onHowTo: () => this.howTo(),
            onPause: () => this.setPause(true), onResume: () => this.setPause(false), onRestart: () => this.restartLevel(), onMenu: () => this.toMenu(true),
            onNext: () => this.nextLevel(), onSound: () => GameHud.setSound(!Sound.toggleMuted()), onRespawn: () => this.respawn(true),
            onQuality: (q) => { if (typeof Quality !== 'undefined') Quality.set(q); },
            onDaily: () => GameMetaUI.openDaily(), onWheel: () => GameMetaUI.openWheel(), onLeaders: () => GameMetaUI.openLeaders(),
        });
        GameHud.setSound(!Sound.muted);
        if (typeof GameAudio !== 'undefined') GameAudio.init();
        if (typeof GameFx !== 'undefined' && GameFx.init) GameFx.init(app);
        if (typeof GameShopUI !== 'undefined') GameShopUI.init({ onClose: () => this.closeShop(), onPreview: (look) => this.applyLook(look) });
        this.heroEvents();
        this.makeActButton();
        this.makeSkipButton();
        this.setupUiAds();
        this.setupCamera();
        app.onFrame((dt) => { if (this.shopOpen() && Pause.active) this.shopFrame(dt); });   // примерка на паузе забега
        await this.prepare(app);
        Tutorial.init({
            app, state: () => this.save, field: 'tutorialDone', persist: () => this.persist(), css: GameHud.tutorialCss ? GameHud.tutorialCss() : undefined,
            steps: [
                Tutorial.preset('move'), Tutorial.preset('look'), Tutorial.preset('jump'),
                { id: 'coin', title: 'tut.coin.t', hint: 'tut.coin.h', event: 'coin' },
                { id: 'use', title: 'tut.use.t', hint: { keyboard: 'tut.use.keyboard', mouse: 'tut.use.keyboard', touch: 'tut.use.touch', pad: 'tut.use.keyboard' }, event: 'use' },
            ],
        });
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyP' && (this.state === 'run' || Pause.has('manual')) && !this._modalPause && !(typeof GameShopUI !== 'undefined' && GameShopUI.isOpen)) this.setPause(!Pause.has('manual'));
        });
        window.addEventListener('lory-release-input', () => { /* Input сам отпускает клавиши */ });
        if (typeof Quality !== 'undefined' && Quality.choice && GameHud.setQuality) GameHud.setQuality(Quality.choice, true);
        if (this._forced) this.start(); else this.toMenu(false);
    },

    async ready() { Platform.gameplay(false); },

    persist() {
        try { if (typeof Shop !== 'undefined' && Shop.state) this.save.shop = Shop.state; Platform.save(this.save); } catch (e) { console.warn('Platform.save:', e); }
    },

    coins() { return typeof Shop !== 'undefined' && Shop.state ? Shop.coins : 0; },

    /** Очки побега для рекордов: 1000 за каждый пройденный уровень + лучшие монеты уровней. */
    score() {
        let s = 0;
        for (const k of Object.keys(this.save.levels || {})) { const r = this.save.levels[k] || {}; s += (r.done ? 1000 : 0) + (r.coins | 0); }
        return s;
    },

    /** В рекорды площадки — после каждого уровня и каждой смерти/поимки (не отсекая локальным рекордом). */
    submitScore() { try { Platform.submitScore(this.score()); } catch (e) { /* площадка без рекордов */ } },

    level() { return this.levels[this.levelIdx] || { id: '', title: { ru: '', en: '' }, env: {}, par: 120 }; },

    title(l) { const t = (l || this.level()).title; return t ? (t[Lang.code] || t.en || t.ru || '') : ''; },

    // ---------------------------------------------------------------------------------------------
    // Уровень: всё под экраном загрузки
    // ---------------------------------------------------------------------------------------------

    async prepare(app) {
        const loc = app.location, L = this.level();
        this.applyEnv(L.env || {});
        ObbyCourse.build(loc.map, { waterAt: (x, z) => loc.waterAt(x, z) });
        ObbyCourseView.build(app, ObbyCourse, { hideGround: !L.showGround, markers: false });
        const env = L.env || {};
        if (env.shadows !== 'all') for (const m of ObbyCourseView.meshes) { if (m.metadata && m.metadata.obbyStatic) loc.view.removeShadowCaster(m); }
        this.stage = Math.min(this.save.stage | 0, Math.max(0, ObbyCourse.stages.length - 2));
        if (this.save.level !== this.levelIdx) this.stage = 0;
        const r = ObbyCourse.respawn(this.stage);
        GameHero.create(app, { x: r.x, y: r.z, h: r.y, yaw: r.yaw });
        this.applyLook();
        await GameMech.build(app, this.mechHooks());
        await GameGuard.build(app, this.guardHooks());
        this.buildCheckpoints();
        // декор карты: светящиеся части моделей (лампы, вывески *_glow), таблички на стенах — без мерцания со стеной
        for (const rec of loc.objects || []) {
            if (!rec.mesh) continue;
            try { GameHero.glowParts(rec.mesh); } catch (e) { /* без свечения */ }
            if (/poster|sign|graffiti|decal|exit_sign/i.test(String(rec.def && rec.def.model))) for (const m of rec.mesh.getChildMeshes(false)) if (m.material) /** @type {any} */ (m.material).zOffset = -3;
        }
        if (typeof GameFx !== 'undefined' && GameFx.level) { try { GameFx.level(app, L); } catch (e) { console.warn('GameFx.level', e); } }
        this.runTime = 0; this.deaths = 0; this.levelCoins = 0;
        app.camera.azimuth = r.yaw;
        app.camera.pitch = 0.36;
        this.freeCamera(L);
        this.syncCam();
        try { app.camera.snap(); } catch (e) { /* старая камера */ }
        if (typeof GameAudio !== 'undefined') GameAudio.music(this.state === 'menu' ? 'menu' : (env.music || 'level-a'));
    },

    /**
     * Камера следует за героем везде: без рамки карты (части уровней выходят за её прямоугольник) и — на закрытых уровнях,
     * где земля спрятана, — без «пола» террейна (пещеры и колодцы ниже нулевой земли). Зовётся после каждой загрузки карты.
     */
    freeCamera(L) {
        const cam = /** @type {any} */ (/** @type {LoryApp} */ (this.app).camera);
        cam.bounds = null;
        if (L && !L.showGround) cam._groundH = () => -1e6;
        else delete cam._groundH;
    },

    /** Свет, небо и туман уровня (DESIGN §2). Неуказанное — константы Constants.js. */
    applyEnv(e) {
        const p = {
            sky: e.sky != null ? e.sky : (e.fog != null ? e.fog : null), fog: e.fogDensity != null ? e.fogDensity : null,
            sunIntensity: e.sun != null ? e.sun : null, sunColor: e.sunColor != null ? e.sunColor : null, sunAz: e.sunAz != null ? e.sunAz : null,
            sunEl: e.sunEl != null ? e.sunEl : null, skyIntensity: e.skyLight != null ? e.skyLight : null, skyLight: e.skyLightColor != null ? e.skyLightColor : null,
            groundLight: e.groundColor != null ? e.groundColor : null, shadowStrength: e.shadowStrength != null ? e.shadowStrength : null,
        };
        try { World3D.setLighting(p); } catch (err) { console.warn('applyEnv', err); }
    },

    /** Кольца чекпоинтов на полу (оранжевые — не взяты, зелёные — взяты) и финиша. */
    buildCheckpoints() {
        const view = /** @type {LoryApp} */ (this.app).location.view, scene = view.scene;
        for (const r of this.cpRings) { try { r.mesh.dispose(); } catch (e) { /* уже */ } }
        this.cpRings = [];
        const mk = (name, hex) => { const m = new BABYLON.StandardMaterial(name, scene); m.diffuseColor = BABYLON.Color3.FromHexString(hex); m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(0.8); m.alpha = 0.85; m.metadata = { toon: false }; return m; };
        this._cpOff = this._cpOff || mk('cp-off', '#f07d1e');
        this._cpOn = this._cpOn || mk('cp-on', '#3fdc78');
        const all = ObbyCourse.checkpoints.concat(ObbyCourse.finish ? [ObbyCourse.finish] : []);
        for (const c of all) {
            const rad = Math.min(130, Math.max(70, c.r * 0.7));
            const ring = BABYLON.MeshBuilder.CreateTorus('cp-ring', { diameter: rad * 2, thickness: 10, tessellation: 40 }, scene);
            ring.position.set(c.x, c.y + 6, c.z);
            ring.material = c === ObbyCourse.finish ? this._cpOn : (c.n <= this.stage ? this._cpOn : this._cpOff);
            ring.isPickable = false;
            World3D.addObject(view, ring, 'prop', { outline: false, castShadow: false });
            this.cpRings.push({ c, mesh: ring });
        }
    },

    refreshRings() { for (const r of this.cpRings) if (r.c !== ObbyCourse.finish) r.mesh.material = r.c.n <= this.stage ? this._cpOn : this._cpOff; },

    async loadLevel(idx) {
        const app = /** @type {LoryApp} */ (this.app);
        this.levelIdx = Math.max(0, Math.min(this.levels.length - 1, idx));
        const L = this.level();
        GameHud.hideAll();
        if (typeof GameAudio !== 'undefined') { GameAudio.stopAll && GameAudio.stopAll(); }
        await app.loadMap(L.id, { prepare: (a) => this.prepare(a), gameplay: false, label: this.title(L) });
    },

    // ---------------------------------------------------------------------------------------------
    // Состояния
    // ---------------------------------------------------------------------------------------------

    menuModel() {
        return {
            levels: this.levels.map((l, i) => {
                const s = this.save.levels[l.id] || {};
                return { id: l.id, title: this.title(l), unlocked: i < Math.max(1, this.save.unlocked | 0), done: !!s.done, coins: s.coins || 0, best: s.best || null };
            }),
            current: this.levelIdx, coins: this.coins(),
        };
    },

    toMenu(fromGame) {
        const go = () => {
            if (Pause.has('manual')) Pause.set('manual', false);
            this.state = 'menu';
            GameHud.pause(false);
            GameHud.chase(false);
            GameHud.task(null);
            GameHud.menu(true, this.menuModel());
            if (typeof GameMetaUI !== 'undefined' && GameMetaUI.maybeOfferDaily) { try { GameMetaUI.maybeOfferDaily(); } catch (e) { /* без подарка */ } }
            Input.configure({ controls: false });
            Input.clearContext();
            this.setActButton(null);
            Platform.gameplay(false);
            if (typeof GameAudio !== 'undefined') { GameAudio.loop('chase', false); GameAudio.loop('jetpack', false); GameAudio.music('menu'); }
        };
        if (fromGame && this.state !== 'menu') {
            // из паузы/результата в меню: уровень начнётся заново
            this.save.stage = 0; this.stage = 0; this.persist();
            this.respawnAll(true);
        }
        go();
    },

    async play(idx) {
        if (this.busy) return;
        const i = idx == null ? this.levelIdx : idx;
        if (i >= Math.max(1, this.save.unlocked | 0)) return;
        if (i !== this.levelIdx || this.state === 'complete') {
            this.busy = true;
            this.save.stage = i === this.levelIdx ? this.save.stage : 0;
            this.save.level = i;
            try { await this.loadLevel(i); } finally { this.busy = false; }
        }
        this.start();
    },

    start() {
        this.state = 'run';
        this.stageDeaths = 0; this.showSkip(false);
        GameHud.menu(false);
        GameHud.levelTitle(this.levelIdx + 1, this.title());
        GameHud.setCoins(this.coins());
        Input.configure({ controls: true });
        Input.setContext({ id: 'jump', icon: '⤒', action: 'jump' }, 1);
        Platform.gameplay(true);
        const L = this.level();
        const intro = L.intro ? Lang.t('task.' + L.intro) : Lang.t('g.task.default');
        GameHud.task(intro);
        if (typeof GameAudio !== 'undefined') { GameAudio.music((L.env && L.env.music) || 'level-a'); GameAudio.play('levelStart'); }
        this.fx('levelStart', { x: GameHero.x, y: GameHero.y, h: GameHero.h });
        if (typeof Telemetry !== 'undefined') Telemetry.progress('started', L.id, { step_index: this.levelIdx + 1 });
        if (!this.save.tutorialDone && this.levelIdx === 0) Tutorial.autoStart();
        this.lookT = 0;
    },

    howTo() {
        if (Pause.has('manual')) this.setPause(false);
        if (this.state === 'menu') this.start();
        Tutorial.start({ replay: true });
    },

    setPause(on) {
        if (this.state !== 'run' && on) return;
        Pause.set('manual', !!on);
        GameHud.pause(!!on);
        if (on) Input.clearContext(); else Input.setContext({ id: 'jump', icon: '⤒', action: 'jump' }, 1);
    },

    restartLevel() {
        if (Pause.has('manual')) Pause.set('manual', false);
        GameHud.pause(false);
        GameHud.hideAll();
        this.save.stage = 0; this.stage = 0;
        this.respawnAll(true);
        this.runTime = 0; this.deaths = 0; this.levelCoins = 0;
        this.start();
    },

    /** Новый заход уровня без перезагрузки карты: механизмы, монеты, охрана — в начало. */
    async respawnAll(full) {
        const app = /** @type {LoryApp} */ (this.app);
        ObbyCourse.reset();
        if (full) {
            await GameMech.build(app, this.mechHooks());
            await GameGuard.build(app, this.guardHooks());
            GameHero.resetAbilities();
            this.applyLook();
        }
        this.freeCamera(this.level());
        this.refreshRings();
        const r = ObbyCourse.respawn(this.stage);
        GameHero.place(r.x, r.z, r.y, r.yaw);
        app.camera.azimuth = r.yaw;
        this.syncCam();
        try { app.camera.snap(); } catch (e) { /* старая камера */ }
    },

    async nextLevel() {
        const n = this.levelIdx + 1;
        if (n >= this.levels.length) { this.toMenu(true); return; }
        this.save.level = n; this.save.stage = 0; this.persist();
        this.busy = true;
        try { await this.loadLevel(n); } finally { this.busy = false; }
        this.start();
    },

    // ---------------------------------------------------------------------------------------------
    // Кадр
    // ---------------------------------------------------------------------------------------------

    update(dt) {
        const app = /** @type {LoryApp} */ (this.app);
        if (!app || !GameHero.ch) return;
        ObbyCourse.update(dt);
        this.updateCamera(dt);
        if (this.state === 'run') this.stepRun(dt);
        else if (this.state === 'dead') this.stepDead(dt);
        else GameHero.update(dt, { move: { x: 0, y: 0 }, camYaw: GameHero.heading, locked: true });
        // модули по отдельности: ошибка одного (эффекты, охрана) не останавливает остальные
        this.safe('mech', () => GameMech.update(dt));
        this.safe('guard', () => GameGuard.update(dt));
        this.safe('view', () => ObbyCourseView.update(dt, { x: GameHero.x, z: GameHero.y }));
        if (typeof GameFx !== 'undefined' && GameFx.update) this.safe('fx', () => GameFx.update(dt));
        if (typeof GameLook !== 'undefined' && GameLook.trail && this.state === 'run') { try { GameLook.trail(GameHero, this.currentLook(), dt); } catch (e) { /* след необязателен */ } }
        this.updateJetFx(dt);
        if (this._dirty && (this._saveT = (this._saveT || 0) + dt) > 4) { this._dirty = false; this._saveT = 0; this.persist(); }
        this.syncCam();
        const t = ObbyCourse.time;
        for (const r of this.cpRings) { const s = 1 + Math.sin(t * 3 + r.c.x * 0.01) * 0.05; r.mesh.scaling.set(s, 1, s); }
        // манекены витрин поворачиваются лицом к игроку, когда он рядом
        if ((this._mqT = (this._mqT || 0) + dt) > 0.3) {
            this._mqT = 0;
            for (const ch of this.mannequins) {
                const s = ch.standAt; if (!s || !ch.model) continue;
                const d = Math.hypot(GameHero.x - s.x, GameHero.y - s.y);
                if (d > 1600) continue;
                const want = Math.atan2(GameHero.y - s.y, GameHero.x - s.x);
                let da = want - (ch.facingNow != null ? ch.facingNow : 99); da = Math.atan2(Math.sin(da), Math.cos(da));
                if (ch.facingNow != null && Math.abs(da) < 0.35) continue;
                ch.facingNow = want;
                ch.place(s.x, s.y, want, s.h); ch.update(1 / 60);
            }
        }
    },

    /** Вызов модуля с перехватом ошибки (в консоль — один раз на модуль). */
    safe(name, fn) {
        try { fn(); } catch (e) {
            const seen = this._errs || (this._errs = {});
            if (!seen[name]) { seen[name] = true; console.error('Game.' + name + ':', e); }
        }
    },

    stepRun(dt) {
        const app = /** @type {LoryApp} */ (this.app);
        this.runTime += dt;
        const m = Input.move();
        // полный ход (клавиши, стик до упора) — всегда быстрый бег базы движений (MOTION_SPRINT_SPEED); Shift — то же
        const sprint = Input.down('sprint') || Math.hypot(m.x, m.y) > 0.9;
        GameHero.update(dt, { move: m, jump: Input.pressed('jump'), jumpHeld: Input.down('jump'), sprint, camYaw: app.camera.azimuth });
        const H = GameHero;
        // смерть: опасные детали трассы и пустота
        const hz = ObbyCourse.hazardAt(H.x, H.h, H.y, 22, 168);
        if (hz) { this.die(hz.cause, hz.n ? [hz.n[0] * 500, 520, hz.n[2] * 500] : null); return; }
        // чекпоинты и финиш (по опоре или в зоне)
        const ns = ObbyCourse.reached(H.x, H.h, H.y, this.stage, false);   // выход засчитывается, даже если игрок обогнул чекпоинт
        if (ns > this.stage) this.reachStage(ns);
        if (this.state !== 'run') return;
        // HUD
        GameHud.jetFuel(H.jet.has ? H.jet.fuel / H.jet.max : null);
        GameHud.superJump(H.superT > 0 ? H.superT / 12 : null);
        if (((this._pT = (this._pT || 0) + dt) > 0.25)) { this._pT = 0; GameHud.progress(ObbyCourse.progress(this.stage, H.x, H.h, H.y)); }
    },

    die(cause, push) {
        if (this.state !== 'run') return;
        if (cause === 'gate') { GameHud.caught(Lang.t('mech.gateLost')); }
        this.state = 'dead';
        this.deadT = cause === 'void' ? 0.9 : 1.5;
        this.deaths++; this.stageDeaths = (this.stageDeaths || 0) + 1;
        GameHero.kill(cause, push);
        GameHud.flash(cause === 'lava' || cause === 'kill' ? 'lava' : cause === 'zap' ? 'zap' : 'death');
        /** @type {LoryApp} */ (this.app).camera.shake(260, 0.014);
        const d = { cause, x: GameHero.x, y: GameHero.y, h: GameHero.h };
        this.sfx('death', d); this.fx('death', d);
        this.submitScore();
        if (typeof GameAudio !== 'undefined') GameAudio.loop('jetpack', false);
    },

    caught(d) {
        if (this.state !== 'run') return;
        this.state = 'dead';
        this.deadT = 1.6;
        this.deaths++; this.stageDeaths = (this.stageDeaths || 0) + 1;
        GameHero.ch.locked = true;
        GameHero.kill('caught', [0, 260, 0]);
        GameHud.caught(Lang.t('guard.caught'));
        GameHud.flash('caught');
        this.sfx('caught', d); this.fx('caught', d);
        this.submitScore();
    },

    stepDead(dt) {
        this.deadT -= dt;
        GameHero.update(dt, { move: { x: 0, y: 0 }, camYaw: GameHero.heading, locked: true });
        if (this.deadT <= 0) this.respawn(false);
    },

    /** На последний чекпоинт (после смерти или по кнопке ⟲ / R). */
    respawn(manual) {
        if (this.state !== 'run' && this.state !== 'dead') return;
        GameMech.respawn(GameGuard.chaseGroups());
        GameGuard.respawn();
        const r = ObbyCourse.respawn(this.stage);
        GameHero.place(r.x, r.z, r.y, r.yaw);
        GameHero.ch.locked = false;
        GameHero.refuel();          // джетпак: на чекпоинте бак полный (топливо само не восстанавливается)
        const app = /** @type {LoryApp} */ (this.app);
        app.camera.azimuth = r.yaw;
        this.syncCam();
        try { app.camera.snap(); } catch (e) { /* старая камера */ }
        this.state = 'run';
        GameHud.chase(false);
        const d = { x: r.x, y: r.z, h: r.y };
        this.sfx('respawn', d); this.fx('respawn', d);
        if (manual) GameHud.toast(Lang.t('g.respawn'), 1200);
        this.offerSkip();
    },

    reachStage(ns) {
        this.stage = ns;
        this.stageDeaths = 0; this.showSkip(false);
        if (ObbyCourse.finish && ns >= ObbyCourse.stages.length - 1) { this.completeLevel(); return; }
        this.save.stage = ns; this.save.level = this.levelIdx;
        this.persist();
        this.refreshRings();
        GameHud.toast(Lang.t('g.checkpoint'), 1300, 'good');
        const c = ObbyCourse.stages[ns];
        const d = c ? { x: c.x, y: c.z, h: c.y } : { x: GameHero.x, y: GameHero.y, h: GameHero.h };
        this.sfx('checkpoint', d); this.fx('checkpoint', d);
        if (typeof Telemetry !== 'undefined') Telemetry.progress('checkpoint', this.level().id, { step_index: ns });
    },

    completeLevel() {
        this.state = 'complete';
        this.showSkip(false);
        const L = this.level();
        Input.clearContext();
        this.setActButton(null);
        Platform.gameplay(false);
        const rec = this.save.levels[L.id] || {};
        const best = rec.best ? Math.min(rec.best, this.runTime) : this.runTime;
        this.save.levels[L.id] = { done: true, best, coins: Math.max(rec.coins || 0, this.levelCoins) };
        const isLast = this.levelIdx >= this.levels.length - 1;
        this.save.unlocked = Math.max(this.save.unlocked | 0, Math.min(this.levels.length, this.levelIdx + 2));
        this.save.level = isLast ? this.levelIdx : this.levelIdx + 1;
        this.save.stage = 0;
        this.persist();
        if (Tutorial.roundCounts()) Platform.ads.roundEnded(true);
        if (typeof Telemetry !== 'undefined') Telemetry.progress('completed', L.id, { step_index: this.levelIdx + 1 });
        this.submitScore();
        GameHud.chase(false); GameHud.task(null);
        const d = { x: GameHero.x, y: GameHero.y, h: GameHero.h };
        this.sfx('finish', d); this.fx('finish', d);
        if (typeof GameAudio !== 'undefined') { GameAudio.loop('chase', false); GameAudio.loop('jetpack', false); }
        GameHud.complete({
            level: this.levelIdx + 1, title: this.title(), coins: this.levelCoins, time: this.runTime, deaths: this.deaths, best, isLast,
            onNext: () => Platform.ads.next(() => this.nextLevel()),
            onReplay: () => Platform.ads.next(() => this.replay()),
            onMenu: () => Platform.ads.next(() => { this.levelIdx = this.save.level; this.toMenuAfterComplete(); }),
        });
    },

    async replay() {
        GameHud.hideAll();
        this.stage = 0; this.save.stage = 0;
        await this.respawnAll(true);
        this.runTime = 0; this.deaths = 0; this.levelCoins = 0;
        this.start();
    },

    async toMenuAfterComplete() {
        GameHud.hideAll();
        const want = Math.max(0, Math.min(this.levels.length - 1, this.save.level | 0));
        if (want !== this.levels.findIndex(l => l.id === (/** @type {LoryApp} */ (this.app).map || {}).id)) {
            this.state = 'menu';
            this.busy = true;
            try { await this.loadLevel(want); } finally { this.busy = false; }
        } else { this.stage = 0; await this.respawnAll(true); }
        this.toMenu(false);
    },

    // ---------------------------------------------------------------------------------------------
    // Камера: от третьего лица, сама доворачивает за бегом; свайп/ПКМ — осмотр
    // ---------------------------------------------------------------------------------------------

    setupCamera() {
        const cam = /** @type {LoryApp} */ (this.app).camera;
        cam.follow(this.cam);
        cam.pitch = 0.36;
        // средняя кнопка мыши не двигает камеру (панорама отрывала камеру от героя): нажатие гасим целиком —
        // и автопрокрутку браузера тоже
        const prevIgnore = cam.ignorePointer;
        cam.ignorePointer = (e) => e.button === 1 || (typeof prevIgnore === 'function' ? prevIgnore(e) : false);
        const canvas = document.getElementById('world3d');
        const eatMiddle = (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } };
        if (canvas) for (const t of ['pointerdown', 'mousedown', 'auxclick']) canvas.addEventListener(t, eatMiddle, true);
        if (cam.sight) {
            cam.sight.query = (from, to) => {
                const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
                if (len < 1) return null;
                const hit = ObbyCourse.ray(from.x, from.y, from.z, dx / len, dy / len, dz / len, len);
                return hit ? hit.t : null;
            };
        }
    },

    updateCamera(dt) {
        const cam = /** @type {LoryApp} */ (this.app).camera;
        if (cam.followObj !== this.cam) cam.follow(this.cam);      // камера всегда за героем (ничто её не отрывает)
        if (this.shopOpen()) { Input.consumeLook(); return; }       // примерка: камера в shopFrame
        const look = Input.consumeLook();
        if (this.state === 'menu') {
            // витрина: герой лицом к игроку в правой части кадра (меню слева), лёгкое покачивание
            const t = performance.now() / 1000;
            const want = GameHero.heading + Math.PI + 0.42 + Math.sin(t * 0.35) * 0.08;
            let da = want - cam.azimuth; da = Math.atan2(Math.sin(da), Math.cos(da));
            cam.azimuth += da * Math.min(1, dt * 3);
            cam.pitch += (0.2 - cam.pitch) * Math.min(1, dt * 2);
            this.cam.frameHeight += (380 - this.cam.frameHeight) * Math.min(1, dt * 3);
            return;
        }
        this.cam.frameHeight += (560 - this.cam.frameHeight) * Math.min(1, dt * 3);
        if (look.dx || look.dy) { this.lookT = 1.6; cam.azimuth += look.dx * 0.0048; cam.pitch = Math.max(0.05, Math.min(1.15, cam.pitch + look.dy * 0.0036)); }
        this.lookT = Math.max(0, this.lookT - dt);
        // мягкий автодоворот за спину: только когда игрок бежит ВПЕРЁД (вбок и назад — камера стоит, иначе герой
        // бегает по кругу, а база движений подбирает позы разворота) и сам не крутит камеру
        const H = GameHero;
        const v = H.vel, sp = Math.hypot(v[0], v[2]);
        const m = Input.move();
        const fwd = m.y > 0.35 ? m.y * (1 - Math.min(1, Math.abs(m.x) * 1.4)) : 0;
        if (this.lookT <= 0 && fwd > 0 && sp > 160 && H.grounded && this.state === 'run' && !H.ladder) {
            let da = H.heading - cam.azimuth; da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) < 2.2) cam.azimuth += da * Math.min(1, dt * 1.1 * fwd) * Math.min(1, sp / 420);
            cam.pitch += (0.34 - cam.pitch) * Math.min(1, dt * 0.6);
        }
        // тесно (потолок/стены подтянули камеру к голове): камера опускается за спину и смотрит ниже — герой в кадре
        const reach = cam.sight && cam.sight.reach ? cam.sight.reach.value : 1;
        this._tight = (this._tight || 0) + ((reach < 0.75 ? 1 : 0) - (this._tight || 0)) * Math.min(1, dt * 3);
        if (this._tight > 0.05 && this.lookT <= 0) cam.pitch += (0.34 - 0.26 * this._tight - cam.pitch) * Math.min(1, dt * 3);
        cam.azimuth = Math.atan2(Math.sin(cam.azimuth), Math.cos(cam.azimuth));
    },

    syncCam() {
        const H = GameHero;
        if (!H.ch) return;
        const f = H.ch.focus(this._f || (this._f = [0, 0, 0]));
        const k = H.ch.ragdolled ? 0.25 : 1;
        this.cam.x += (f[0] - this.cam.x) * k; this.cam.y += (f[2] - this.cam.y) * k; this.cam.h = H.h + 115 - 40 * (this._tight || 0);
        if (k === 1) { this.cam.x = f[0]; this.cam.y = f[2]; }
        if (this.shopOpen()) this.shopFrame(1 / 60);
        else if (this.state === 'menu' && this.app) {
            // цель левее героя (вправо на экране — (−sin az, cos az)): герой встаёт в правую треть, меню его не закрывает
            const az = this.app.camera.azimuth, wide = innerWidth > innerHeight * 1.1;
            const off = wide ? 150 : 0;
            this.cam.x += Math.sin(az) * off; this.cam.y -= Math.cos(az) * off;
            this.cam.h = H.h + (wide ? 100 : 60);
        }
    },

    shopOpen() { return typeof GameShopUI !== 'undefined' && !!GameShopUI.isOpen; },

    /**
     * Примерка: камера спереди героя, герой — в свободной от панели магазина части кадра (панель справа — герой слева,
     * панель снизу — герой сверху), крупно. Зовётся и на паузе (app.onFrame): в забеге магазин ставит игру на паузу.
     */
    shopFrame(dt) {
        const app = this.app, H = GameHero;
        if (!app || !H.ch) return;
        const cam = app.camera;
        const lay = typeof GameShopUI.layout === 'function' ? GameShopUI.layout() : { side: 'right', size: 0.48 };
        const want = H.heading + Math.PI + 0.25;
        let da = want - cam.azimuth; da = Math.atan2(Math.sin(da), Math.cos(da));
        cam.azimuth += dt ? da * Math.min(1, dt * 6) : da;
        cam.pitch += (0.16 - cam.pitch) * (dt ? Math.min(1, dt * 6) : 1);
        this.cam.frameHeight = lay.side === 'bottom' ? 520 : 330;
        const f = H.ch.focus(this._f || (this._f = [0, 0, 0]));
        const az = cam.azimuth;
        // «вправо на экране» = (−sin az, cos az): цель сдвигаем ВПРАВО — герой уезжает влево от центра
        // size — px панели: доля экрана, которую она закрывает; цель сдвигаем на половину этой доли кадра
        const frac = lay.side === 'right' ? Math.min(0.6, (lay.size || 0) / Math.max(1, innerWidth)) : 0;
        const off = frac * this.cam.frameHeight * (innerWidth / Math.max(1, innerHeight)) * 0.5;
        this.cam.x = f[0] - Math.sin(az) * off; this.cam.y = f[2] + Math.cos(az) * off;
        this.cam.h = H.h + (lay.side === 'bottom' ? 20 : 95);
    },

    // ---------------------------------------------------------------------------------------------
    // Вид героя и косметика
    // ---------------------------------------------------------------------------------------------

    currentLook() { return typeof Shop !== 'undefined' && Shop.state ? Shop.look() : {}; },

    applyLook(look) {
        if (typeof GameLook === 'undefined' || !GameHero.model || !this.app) return;
        try { GameLook.apply(GameHero.model, look || this.currentLook(), this.app.location.view, { disguise: GameHero.disguise }); } catch (e) { console.warn('GameLook.apply', e); }
    },

    openShop() {
        if (typeof GameShopUI === 'undefined') return;
        this._shopFrom = this.state;
        if (this.state === 'run') { Pause.set('manual', true); }
        GameHud.menu(false, { hud: false });
        Input.configure({ controls: false });
        GameShopUI.open();
    },

    closeShop() {
        this.applyLook();
        if (this._shopFrom === 'run') { Pause.set('manual', false); GameHud.hud(true); Input.configure({ controls: true }); }
        else GameHud.menu(true, this.menuModel());
        this.persist();
    },

    /** Манекен на витрине: блочный человечек в предмете SHOP_STANDS[n]. */
    async standModel(a) {
        if (typeof SHOP_STANDS === 'undefined' || typeof Shop === 'undefined') return;
        const id = SHOP_STANDS[(a.prm.n || 0) % SHOP_STANDS.length];
        a.itemId = id;
        const view = /** @type {LoryApp} */ (this.app).location.view;
        const ch = HumanoidCharacter.create(view, { world: GameHero.world, x: a.x, y: a.y, h: a.h + 70, heading: a.yaw, colors: GameHero.COLORS, name: 'mannequin', kind: 'prop', height: 150 });
        ch.update(1 / 60); ch.update(1 / 60);
        /** @type {any} */ (ch).standAt = { x: a.x, y: a.y, h: a.h + 70, yaw: a.yaw };
        if (typeof GameLook !== 'undefined') {
            const item = Shop.item ? Shop.item(id) : null;
            const look = Object.assign({}, this.currentLook());
            if (item && item.slot) look[item.slot] = id; else if (item && item.tab) look[item.tab] = id;
            try { GameLook.apply(ch.model, look, view, {}); } catch (e) { console.warn('stand look', e); }
        }
        this.mannequins.push(ch);
    },

    // ---------------------------------------------------------------------------------------------
    // Кнопка действия на телефоне и подсказка «[E] …» на ПК
    // ---------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------
    // Пропуск участка за рекламу (после 3 смертей подряд на одном участке; не на последнем — до выхода)
    // ---------------------------------------------------------------------------------------------

    /**
     * Только сборка Playables (по просьбе пользователя): межстраничная реклама на каждый клик по кнопке интерфейса —
     * НЕ во время игрового процесса (забег, пауза забега, смерть) и НЕ во время/вместо rewarded (кнопки «За рекламу»,
     * идущий ролик). Частоту показа решает SDK площадки; локально — не чаще раза в 2 с.
     */
    setupUiAds() {
        const isPlayables = () => Platform.name === 'playables' || (typeof GAME_PLATFORM !== 'undefined' && String(GAME_PLATFORM) === 'playables');
        if (!isPlayables()) return;
        let last = 0;
        document.addEventListener('click', (e) => {
            const t = /** @type {HTMLElement} */ (e.target);
            const btn = t && t.closest ? /** @type {HTMLElement | null} */ (t.closest('button, [role="button"], .pe-btn')) : null;
            if (!btn || btn.closest('#world3d')) return;
            if (this.state === 'run' || this.state === 'dead') return;                 // игровой процесс — без рекламы
            if (Platform.adActive || Pause.has('ad') || Pause.has('adwait')) return;   // уже идёт реклама
            if (btn.id === 'pe-skip' || btn.id === 'pe-act') return;
            const txt = (btn.textContent || '') + ' ' + (btn.getAttribute('aria-label') || '');
            if (btn.querySelector('img[src*="icons/ad"]') || /реклам|watch ad|\bad\b/i.test(txt)) return;   // кнопка rewarded
            if (typeof Tutorial !== 'undefined' && Tutorial.active) return;
            const now = Date.now();
            if (now - last < 2000) return;
            last = now;
            try { Platform.interstitial(); } catch (err) { /* без рекламы */ }
        }, true);
    },

    makeSkipButton() {
        const b = /** @type {HTMLButtonElement} */ (document.createElement('button'));
        b.type = 'button';
        b.id = 'pe-skip';
        b.style.cssText = 'position:fixed;z-index:32;display:none;flex-direction:column;align-items:center;gap:2px;padding:9px 16px 8px;border:3px solid #14161a;border-radius:6px;' +
            'background:linear-gradient(#4a525c,#2c3036);color:#f4f1ea;font:900 15px var(--pe-font, Montserrat, system-ui);text-shadow:0 2px 0 #000;box-shadow:0 5px 0 #0b0c0e,0 10px 18px rgba(0,0,0,.4);' +
            'left:50%;transform:translateX(-50%) rotate(-1deg);bottom:calc(var(--hl-safe-bottom, 0px) + 110px);-webkit-tap-highlight-color:transparent;touch-action:manipulation;cursor:pointer;';
        b.innerHTML = '<span data-k="t"></span><span data-k="a" style="display:flex;align-items:center;gap:6px;font-size:13px;color:#f2c230"><img src="assets/ui/icons/ad.webp" alt="" style="width:22px;height:22px"><span data-k="l"></span></span>';
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.skipByAd(); });
        document.body.appendChild(b);
        this.skipBtn = b;
        if (typeof Platform !== 'undefined' && Platform.onRewardedCooldown) Platform.onRewardedCooldown(() => this.paintSkip());
    },

    /** Следующий этап — чекпоинт (не выход): только тогда пропуск уместен. */
    canSkip() {
        const next = this.stage + 1;
        return this.state === 'run' && next < ObbyCourse.stages.length - (ObbyCourse.finish ? 1 : 0) && (!Platform.rewardedSupported || Platform.rewardedSupported());
    },

    offerSkip() {
        if ((this.stageDeaths || 0) >= 3 && this.canSkip()) this.showSkip(true);
    },

    showSkip(on) {
        if (!this.skipBtn) return;
        this.skipBtn.style.display = on ? 'flex' : 'none';
        clearTimeout(this._skipTimer);
        if (on) { this.paintSkip(); this._skipTimer = setTimeout(() => this.showSkip(false), 12000); }
    },

    paintSkip() {
        const b = this.skipBtn;
        if (!b || b.style.display === 'none') return;
        const left = Platform.rewardedCooldownLeft ? Platform.rewardedCooldownLeft() : 0;
        /** @type {HTMLElement} */ (b.querySelector('[data-k="t"]')).textContent = Lang.t('g.skip');
        /** @type {HTMLElement} */ (b.querySelector('[data-k="l"]')).textContent = left > 0 ? Lang.t('g.skipIn', { n: left }) : Lang.t('g.skipAd');
        b.style.opacity = left > 0 ? '0.6' : '1';
    },

    /** Реклама за пропуск: на время ролика игра на паузе (требование площадки), награда — только по true. */
    async skipByAd() {
        if (this._skipBusy || !this.canSkip()) return;
        if (Platform.rewardedCooldownLeft && Platform.rewardedCooldownLeft() > 0) return;
        this._skipBusy = true;
        Pause.set('manual', true);
        let ok = false;
        try { ok = await Platform.rewarded('skip-section'); } catch (e) { ok = false; }
        Pause.set('manual', false);
        this._skipBusy = false;
        if (!ok || this.state !== 'run') { this.paintSkip(); return; }
        this.showSkip(false);
        const ns = this.stage + 1;
        this.stage = ns; this.stageDeaths = 0;
        this.save.stage = ns; this.save.level = this.levelIdx;
        this.persist();
        this.refreshRings();
        GameMech.respawn(GameGuard.chaseGroups());
        GameGuard.respawn();
        const r = ObbyCourse.respawn(ns);
        GameHero.place(r.x, r.z, r.y, r.yaw);
        GameHero.refuel();
        const app = /** @type {LoryApp} */ (this.app);
        app.camera.azimuth = r.yaw;
        this.syncCam();
        try { app.camera.snap(); } catch (e) { /* старая камера */ }
        GameHud.toast(Lang.t('g.skipped'), 1600, 'good');
        const d = { x: r.x, y: r.z, h: r.y };
        this.sfx('checkpoint', d); this.fx('respawn', d);
    },

    makeActButton() {
        const b = /** @type {HTMLButtonElement} */ (document.createElement('button'));
        b.type = 'button';
        b.id = 'pe-act';
        b.style.cssText = 'position:fixed;z-index:31;display:none;align-items:center;gap:8px;padding:10px 16px 10px 12px;border:3px solid #23262b;border-radius:14px;' +
            'background:#f07d1e;color:#fff;font:900 16px var(--pe-font, Montserrat, system-ui);text-shadow:0 2px 0 #23262b;box-shadow:0 5px 0 #23262b,0 8px 16px rgba(0,0,0,.35);' +
            'right:calc(var(--hl-safe-right, 0px) + 18px);bottom:calc(var(--hl-input-action-h, 104px) + var(--hl-safe-bottom, 0px) + 40px);-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); GameMech.tapInteract(); });
        document.body.appendChild(b);
        this.actBtn = b;
    },

    /** Рядом предмет для взаимодействия: на ПК — контекст Input (HUD пишет «[E] …»), на телефоне — своя кнопка над прыжком. */
    setActButton(a) {
        const touch = typeof Input !== 'undefined' && (Input.device === 'touch' || Input.mouseTouch);
        if (!a || this.state !== 'run') {
            Input.clearContext('act');
            if (this.actBtn) this.actBtn.style.display = 'none';
            return;
        }
        if (touch) {
            Input.clearContext('act');
            if (this.actBtn) { this.actBtn.textContent = '✋ ' + Lang.t(a.label); this.actBtn.style.display = 'flex'; }
        } else {
            if (this.actBtn) this.actBtn.style.display = 'none';
            Input.setContext({ id: 'act', label: a.label, icon: a.icon, action: 'interact' }, 3);
        }
    },

    // ---------------------------------------------------------------------------------------------
    // Колбэки модулей
    // ---------------------------------------------------------------------------------------------

    sfx(name, d) { if (typeof GameAudio !== 'undefined') { try { GameAudio.play(name, d); } catch (e) { /* без звука */ } } },
    fx(name, d) { if (typeof GameFx !== 'undefined' && GameFx.event) { try { GameFx.event(name, d || {}); } catch (e) { console.warn('GameFx', e); } } },

    heroEvents() {
        GameHero.on('step', (e) => { const d = { x: e.x, y: e.z, h: e.y, speed: (e.speed || 300) / 100, surface: GameHero.surface }; this.sfx('step', d); this.fx('step', d); });
        GameHero.on('jump', () => { const d = { x: GameHero.x, y: GameHero.y, h: GameHero.h }; this.sfx('jump', d); this.fx('jump', d); });
        GameHero.on('land', (e) => { const d = { x: GameHero.x, y: GameHero.y, h: GameHero.h, speed: (e.impact || 0) / 100, surface: GameHero.surface }; this.sfx('land', d); this.fx('land', d); });
        GameHero.on('thud', (e) => { const d = { x: GameHero.x, y: GameHero.y, h: GameHero.h, speed: (e.impact || 0) / 100 }; this.sfx('thud', d); this.fx('thud', d); });
        GameHero.on('ragdoll', (e) => { this.sfx('ragdoll', { speed: 8 }); });
        GameHero.on('bounce', (d) => { this.sfx('bounce', d); this.fx('bounce', d); });
        GameHero.on('boost', (d) => { this.sfx('boost', d); });
        GameHero.on('jetOn', () => { this.sfx('jetpackOn', {}); if (typeof GameAudio !== 'undefined') GameAudio.loop('jetpack', true); });
        GameHero.on('jetOff', () => { this.sfx('jetpackOff', {}); if (typeof GameAudio !== 'undefined') GameAudio.loop('jetpack', false); });
    },

    updateJetFx(dt) {
        if (typeof GameFx === 'undefined' || !GameFx.jet) return;
        const on = GameHero.jet.on && this.state === 'run';
        try { GameFx.jet(on, on ? GameHero.nozzles() : null, [0, -1, 0]); } catch (e) { /* эффект необязателен */ }
    },

    mechHooks() {
        const H = () => ({ x: GameHero.x, y: GameHero.y, h: GameHero.h });
        return {
            coin: (c) => {
                if (typeof Shop !== 'undefined' && Shop.state) Shop.addCoins(c.v, { save: false });
                this.levelCoins += c.v;
                this._dirty = true;          // сохранить вскоре (площадка: прогресс не теряется при перезагрузке)
                GameHud.setCoins(this.coins(), c.v);
                const d = { x: c.x, y: c.y, h: c.h, v: c.v };
                this.sfx(c.v >= 10 ? 'coins10' : 'coin', d); this.fx(c.v >= 10 ? 'coins10' : 'coin', d);
                Tutorial.complete('coin');
            },
            kill: (d) => this.die(d.cause, d.push),
            task: (d) => GameHud.task(Lang.t('task.' + d.key)),
            tick: (d) => { GameHud.toast(Lang.t('mech.timer', { n: d.left }), 800, 'warn'); this.sfx('ui', 'tick'); },
            mech: (d) => { this.sfx('mech', d); this.fx('mech', d); },
            group: (d) => GameGuard.group(d.g, d.on),
            switch: (d) => { this.sfx('switch', d); this.fx('switch', d); Tutorial.complete('use'); },
            near: (a) => this.setActButton(a),
            chest: (a) => this.chest(a),
            stand: (a) => this.stand(a),
            standModel: (a) => this.standModel(a),
            npc: (m) => GameGuard.npc(m),
            uniform: (a) => {
                GameHero.disguise = true; this.applyLook();
                GameHud.disguise(true); GameHud.toast(Lang.t('mech.disguiseOn'), 2200, 'good');
                this.sfx('uniform', a); this.fx('uniform', H()); Tutorial.complete('use');
            },
            disguiseLost: (z) => {
                GameHero.disguise = false; this.applyLook();
                GameHud.disguise(false); GameHud.toast(Lang.t('mech.disguiseLost'), 2400, 'bad');
                this.sfx('disguiseLost', z); this.fx('disguiseLost', H());
            },
            jetpack: (a) => {
                const touch = Input.device === 'touch' || Input.mouseTouch;
                GameHud.toast(Lang.t(touch ? 'mech.jetpackTouch' : 'mech.jetpack'), 3000, 'good');
                GameHud.jetFuel(1);
                this.sfx('key', a); this.fx('jetpackPick', H());
            },
            key: (d) => { GameHud.keys(Array.from(GameMech.keys)); GameHud.toast(Lang.t('mech.key'), 1600, 'good'); this.sfx('key', d); this.fx('key', d); },
            nextStage: () => ObbyCourse.stages[Math.min(this.stage + 1, ObbyCourse.stages.length - 1)],
            gateTick: (d) => { GameHud.toast(Lang.t('mech.gate', { n: d.left }), 900, 'warn'); this.sfx('ui', 'tick'); },
            needKey: () => { GameHud.toast(Lang.t('mech.needKey'), 1500, 'warn'); this.sfx('ui', 'error'); },
            unlock: (z) => { GameHud.toast(Lang.t('mech.unlock'), 1300, 'good'); this.sfx('unlock', z); this.fx('unlock', z); },
            superjump: (d) => { GameHud.toast(Lang.t('mech.superjump'), 1500, 'good'); this.sfx('superjump', d); this.fx('superjump', d); },
            fuel: (d) => { GameHud.toast(Lang.t('mech.fuel'), 1000); this.sfx('key', d); },
            calm: (d) => GameGuard.calm(d.g),
            trapSnap: (d) => { this.sfx('trapSnap', d); this.fx('trapSnap', d); },
            saw: (d) => { this.sfx('saw', d); this.fx('saw', d); },
            crusher: (d) => { this.sfx('crusher', d); this.fx('crusher', d); const dist = Math.hypot(d.x - GameHero.x, d.y - GameHero.y); if (dist < 900) /** @type {LoryApp} */ (this.app).camera.shake(120 * (1 - dist / 900), 0.01); },
            laser: (d) => { if (Math.hypot(d.x - GameHero.x, d.y - GameHero.y) < 1400) this.sfx('laser', d); },
            steam: (d) => this.fx('steam', d),
        };
    },

    guardHooks() {
        return {
            caught: (d) => this.caught(d),
            spotted: (d) => {
                const key = d.cause === 'camera' ? 'guard.camera' : d.cause === 'light' ? 'guard.light' : 'guard.spotted';
                GameHud.spotted(true); setTimeout(() => GameHud.spotted(false), 1300);
                GameHud.toast(Lang.t(key), 1500, 'bad');
                this.sfx('spotted', d); this.fx('spotted', d);
            },
            chaseStart: (d) => { GameHud.chase(true); GameHud.toast(Lang.t('guard.run'), 1800, 'bad'); this.sfx('chaseStart', d); if (typeof GameAudio !== 'undefined') GameAudio.loop('chase', true); },
            chaseEnd: (d) => { GameHud.chase(false); if (typeof GameAudio !== 'undefined') GameAudio.loop('chase', false); if (d && d.lost) { GameHud.toast(Lang.t('guard.lost'), 1800, 'good'); this.sfx('chaseEnd', d); } },
        };
    },

    // ---- сундук и витрина ----

    modal(on) {
        this._modalPause = on;
        Pause.set('manual', on);
        if (on) this.setActButton(null);
    },

    chest(a) {
        if (GameMech.chestOpened) return;
        this.modal(true);
        let busy = false;
        GameHud.chestOffer({
            coins: 100, adReady: !Platform.rewardedSupported || Platform.rewardedSupported(),
            onWatch: async () => {
                if (busy) return;
                busy = true;
                let ok = false;
                try { ok = await Platform.rewarded('chest-coins'); } catch (e) { ok = false; }
                busy = false;
                if (!ok) return;
                if (typeof Shop !== 'undefined' && Shop.state) Shop.addCoins(100);
                this.levelCoins += 100;
                GameMech.openChest(a);
                GameHud.closeWindows();
                this.modal(false);
                GameHud.setCoins(this.coins(), 100);
                GameHud.toast(Lang.t('g.chest.got', { n: 100 }), 1600, 'good');
                const d = { x: a.x, y: a.y, h: a.h };
                this.sfx('chest', d); this.fx('chest', d);
                this.persist();
            },
            onClose: () => this.modal(false),
        });
    },

    stand(a) {
        if (typeof Shop === 'undefined' || !a.itemId) return;
        this.modal(true);
        const card = () => Shop.card ? Shop.card(a.itemId) : { id: a.itemId };
        let busy = false;
        const after = (ok, key) => {
            if (!ok) return;
            GameHud.standRefresh(card());
            GameHud.setCoins(this.coins());
            if (key) GameHud.toast(Lang.t(key), 1300, 'good');
            this.applyLook();
            this.persist();
        };
        GameHud.standOffer({
            item: card(),
            onBuy: () => { const r = Shop.buy(a.itemId); after(r && r.ok !== false, 'g.stand.bought'); if (r && r.ok !== false) { this.sfx('buy', a); this.fx('buy', a); } },
            onWatch: async () => {
                if (busy) return; busy = true;
                let r = null;
                try { r = await Shop.watchAd(a.itemId); } catch (e) { r = null; }
                busy = false;
                after(!!r, null);
            },
            onEquip: () => { const r = Shop.equip(a.itemId); after(r && r.ok !== false, 'g.stand.equipped'); this.sfx('equip', a); },
            onClose: () => this.modal(false),
        });
    },
};
