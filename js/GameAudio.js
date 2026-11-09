// GameAudio.js — звук игры «Prision Espace Parkour Master»: эффекты по событиям ядра и музыка по уровням.
// Тонкая надстройка над Sound.js (движок): все файлы — из assets/sounds/ (Sound Pack: Kenney CC0, Juhani Junkala CC0,
// TomMusic Free Fantasy SFX, Environment/Human); синтеза в коде нет — Playgama 3.3.2 принимает только записанные звуки в OGG/MP3.
//
// API (ядро зовёт, DESIGN §7):
//   GameAudio.init()                        предзагрузка эффектов (безопасно звать повторно)
//   GameAudio.play(name, d)                 событие; d = { x, y, h, speed, kind, cause, surface, g } — всё необязательно;
//                                           строка вместо d считается kind (play('ui', 'click'), play('switch', 'lever'))
//   GameAudio.loop(name, on, d)             циклы 'jetpack' 'alarm' 'chase' 'conveyor' 'electric'; d: { volume, speed }
//   GameAudio.music(key)                    'menu' | 'level-a'…'level-d' | 'chase' (поверх уровня; снять — loop('chase', false))
//   GameAudio.duck(level, sec)              приглушить музыку (сундук, победа делают это сами)
//   GameAudio.stopAll()                     выключить циклы и погоню (выход в меню / смена уровня)
// Позиция события (x, y, h) пока не влияет на громкость: слушателя в API нет, герой — единственный источник звуков.
//
// Сведение: музыка 0.4–0.45 (× MUSIC_VOLUME), эффекты 0.1–0.9 (× SOUND_VOLUME): частые (шаги, прыжки) тихие,
// монеты 0.5 с «комбо» по высоте тона, тревога/погоня мягкие. Громкость по скорости — land, step, ragdoll.

/** @satisfies {Record<string, any>} */
const GameAudio = {
    /** @type {boolean} */
    _inited: false,
    /** @type {Set<string>} */
    _synth: new Set(),                // имена собранных синтез-буферов
    /** @type {Record<string, any>} */
    _loops: {},                       // имя -> handle Sound.loop
    /** @type {Record<string, number>} */
    _last: {},                        // имя -> время последнего звука (мс), для ограничения частоты
    _combo: 0,                        // номер монеты в серии
    _comboAt: 0,                      // время последней монеты (мс)
    _base: 'menu',                    // музыка меню или уровня
    _chase: false,                    // идёт погоня: играет трек 'chase'
    _track: '',                       // что сейчас просим у Sound.music

    // ----------------------------------------------------------------------------------------------------------
    init() {
        if (this._inited || typeof Sound === 'undefined') return;
        this._inited = true;
        // Эффекты декодируются в фоне, чтобы первый звук не запаздывал (OfflineAudioContext, до жеста игрока).
        setTimeout(() => { try { Sound.preload(AUDIO_PRELOAD); } catch (e) { /* без предзагрузки тоже работает */ } }, 400);
    },

    // ---- События -----------------------------------------------------------------------------------------------
    /**
     * @param {string} name
     * @param {any} [d]
     */
    play(name, d) {
        if (typeof Sound === 'undefined') return;
        if (!this._inited) this.init();
        const o = (typeof d === 'string') ? { kind: d } : (d || {});
        const fn = AUDIO_EVENTS[name];
        if (fn) fn.call(this, o);
    },

    /**
     * @param {string} name
     * @param {boolean} on
     * @param {any} [d]
     */
    loop(name, on, d) {
        if (typeof Sound === 'undefined') return;
        if (!this._inited) this.init();
        const o = d || {};
        if (name === 'chase') { this._chase = !!on; this._syncMusic(); return; }
        const def = AUDIO_LOOPS[name];
        if (!def) return;
        const cur = this._loops[name];
        if (!on) {
            if (cur) { cur.fade(def.fadeOut); delete this._loops[name]; }
            return;
        }
        const vol = def.volume * (o.volume == null ? 1 : o.volume);
        const rate = def.rate * (o.speed != null && def.speedRate ? 1 + Math.min(1, Math.abs(o.speed) / 20) * def.speedRate : 1);
        if (cur) { cur.set(vol, rate); return; }
        if (!this._has(def.url)) return;
        this._loops[name] = Sound.loop(def.url, { volume: vol, rate });
    },

    /** Музыка уровня или меню. 'chase' — включить погоню поверх (как loop('chase', true)). */
    music(key) {
        if (typeof Sound === 'undefined') return;
        if (!this._inited) this.init();
        if (key === 'chase') { this._chase = true; this._syncMusic(); return; }
        const k = key == null ? '' : String(key);
        if (k === 'menu') this._chase = false;
        this._base = AUDIO_MUSIC[k] ? k : (k ? 'level-a' : 'menu');
        this._syncMusic();
    },

    /** Приглушить музыку до level (0..1) на sec секунд (эффекты не трогает). */
    duck(level, sec) {
        if (typeof Sound === 'undefined') return;
        Sound.duck(level == null ? 0.3 : level, 0.15, sec == null ? 2 : sec, 0.9);
    },

    /** Всё замолкает: циклы затухают, погоня снимается; музыка остаётся (её меняет music). */
    stopAll() {
        for (const n of Object.keys(this._loops)) this.loop(n, false);
        if (this._chase) { this._chase = false; this._syncMusic(); }
    },

    // ---- Внутреннее --------------------------------------------------------------------------------------------
    _syncMusic() {
        const key = this._chase ? 'chase' : this._base;
        const m = AUDIO_MUSIC[key];
        if (!m || m.url === this._track) return;
        this._track = m.url;
        Sound.music(m.url, { volume: m.volume, fade: this._chase ? 0.6 : 1.6 });
    },

    /** @param {string} synthUrl */
    _has(synthUrl) {
        return !/^synth:/.test(synthUrl) || this._synth.has(synthUrl.slice(6));
    },

    /** Не чаще, чем раз в ms миллисекунд на имя; true — можно играть. */
    _gate(name, ms) {
        const now = performance.now();
        if (now - (this._last[name] || -1e9) < ms) return false;
        this._last[name] = now;
        return true;
    },

    /**
     * Разовый звук: список вариантов (массив литералов) или путь, 'synth:имя'.
     * @param {string | string[]} url
     * @param {{ volume?: number, rate?: number, detune?: number, volumeJitter?: number }} [opts]
     */
    _sfx(url, opts) {
        if (typeof url === 'string' && !this._has(url)) return null;
        return Sound.play(url, opts);
    },

    /** Звук через ms миллисекунд. */
    _later(ms, fn) {
        setTimeout(() => { try { fn.call(this); } catch (e) { /* звук не должен ломать игру */ } }, ms);
    },
};

// ==============================================================================================================
//  Файлы (литералы: сборщик видит каждый путь)
// ==============================================================================================================
const AUDIO_SND_COIN = 'assets/sounds/coin.ogg';
const AUDIO_SND_COINS10 = 'assets/sounds/coins10.ogg';
const AUDIO_SND_COINS10_UP = 'assets/sounds/coins10-up.ogg';
const AUDIO_SND_JUMP = ['assets/sounds/jump-1.ogg', 'assets/sounds/jump-2.ogg', 'assets/sounds/jump-3.ogg'];
const AUDIO_SND_LAND_SOFT = ['assets/sounds/land-soft-1.ogg', 'assets/sounds/land-soft-2.ogg', 'assets/sounds/land-soft-3.ogg'];
const AUDIO_SND_LAND_HARD = ['assets/sounds/land-hard-1.ogg', 'assets/sounds/land-hard-2.ogg'];
const AUDIO_SND_THUD = ['assets/sounds/thud-1.ogg', 'assets/sounds/thud-2.ogg', 'assets/sounds/thud-3.ogg'];
const AUDIO_SND_RAGDOLL = ['assets/sounds/ragdoll-1.ogg', 'assets/sounds/ragdoll-2.ogg'];
const AUDIO_SND_HURT = ['assets/sounds/hurt-a.ogg', 'assets/sounds/hurt-b.ogg', 'assets/sounds/hurt-c.ogg', 'assets/sounds/hurt-d.ogg'];
const AUDIO_SND_ZAP = ['assets/sounds/zap-1.ogg', 'assets/sounds/zap-2.ogg', 'assets/sounds/zap-3.ogg'];
const AUDIO_SND_METAL_HIT = ['assets/sounds/metal-hit-1.ogg', 'assets/sounds/metal-hit-2.ogg', 'assets/sounds/metal-hit-3.ogg'];
const AUDIO_SND_FALL_WHOOSH = 'assets/sounds/fall-whoosh.ogg';
const AUDIO_SND_RESPAWN = 'assets/sounds/respawn.ogg';
const AUDIO_SND_CHECKPOINT = 'assets/sounds/checkpoint.ogg';
const AUDIO_SND_MECH = ['assets/sounds/mech-1.ogg', 'assets/sounds/mech-2.ogg', 'assets/sounds/mech-3.ogg'];
const AUDIO_SND_CHEST_OPEN = 'assets/sounds/chest-open.ogg';
const AUDIO_SND_CHEST_LID = 'assets/sounds/chest-lid.ogg';
const AUDIO_SND_BUY_COINS = 'assets/sounds/buy-coins.ogg';
const AUDIO_SND_BUY_OK = 'assets/sounds/buy-ok.ogg';
const AUDIO_SND_EQUIP = ['assets/sounds/equip-1.ogg', 'assets/sounds/equip-2.ogg'];
const AUDIO_SND_UNIFORM = ['assets/sounds/uniform-1.ogg', 'assets/sounds/uniform-2.ogg', 'assets/sounds/uniform-3.ogg'];
const AUDIO_SND_DISGUISE_LOST = 'assets/sounds/disguise-lost.ogg';
const AUDIO_SND_SUPERJUMP = 'assets/sounds/superjump.ogg';
const AUDIO_SND_SUPERJUMP_UP = 'assets/sounds/superjump-up.ogg';
const AUDIO_SND_BOUNCE = 'assets/sounds/bounce.ogg';
const AUDIO_SND_BOOST = 'assets/sounds/boost.ogg';
const AUDIO_SND_TRAP_SNAP = 'assets/sounds/trap-snap.ogg';
const AUDIO_SND_SAW = ['assets/sounds/saw-1.ogg', 'assets/sounds/saw-2.ogg', 'assets/sounds/saw-3.ogg'];
const AUDIO_SND_CRUSHER_BOOM = 'assets/sounds/crusher-boom.ogg';
const AUDIO_SND_CRUSHER_HIT = 'assets/sounds/crusher-hit.ogg';
const AUDIO_SND_LASER = ['assets/sounds/laser-1.ogg', 'assets/sounds/laser-2.ogg', 'assets/sounds/laser-3.ogg'];
const AUDIO_SND_CAUGHT_BELL = 'assets/sounds/caught-bell.ogg';
const AUDIO_SND_CHASE_END = 'assets/sounds/chase-end.ogg';
const AUDIO_SND_FINISH = 'assets/sounds/finish.ogg';
const AUDIO_SND_JET_ON = 'assets/sounds/jet-on.ogg';
const AUDIO_SND_JET_OFF = 'assets/sounds/jet-off.ogg';
const AUDIO_SND_ALARM = 'assets/sounds/alarm-loop.ogg';
const AUDIO_SND_WET_STEP = ['assets/sounds/wet-step-1.ogg', 'assets/sounds/wet-step-2.ogg', 'assets/sounds/wet-step-3.ogg'];
const AUDIO_SND_SIZZLE = 'assets/sounds/sizzle.ogg';
const AUDIO_SND_SPLASH = 'assets/sounds/splash.ogg';
const AUDIO_SND_WHISTLE = 'assets/sounds/whistle-short.ogg';
const AUDIO_SND_WHISTLE_LONG = 'assets/sounds/whistle-long.ogg';
const AUDIO_SND_CELL_SLAM = 'assets/sounds/cell-slam.ogg';
const AUDIO_SND_LEVEL_START = 'assets/sounds/level-start.ogg';
const AUDIO_SND_KEY = 'assets/sounds/key.ogg';
const AUDIO_SND_FUSE = 'assets/sounds/fuse.ogg';              // и «щелчок» ключа
const AUDIO_SND_LEVER = 'assets/sounds/lever.ogg';
const AUDIO_SND_BUTTON = 'assets/sounds/button.ogg';
const AUDIO_SND_VALVE = 'assets/sounds/valve.ogg';
const AUDIO_SND_PC = ['assets/sounds/pc-1.ogg', 'assets/sounds/pc-2.ogg'];
const AUDIO_SND_UI_CLICK = 'assets/sounds/ui-click.ogg';
const AUDIO_SND_UI_OPEN = 'assets/sounds/ui-open.ogg';
const AUDIO_SND_UI_CLOSE = 'assets/sounds/ui-close.ogg';
const AUDIO_SND_UI_TAB = 'assets/sounds/ui-tab.ogg';
const AUDIO_SND_UI_ERROR = 'assets/sounds/ui-error.ogg';

// Шаги: поверхность -> варианты, скорость файла (rate), громкость. Бетон/камень/плитка/вода делят наборы с разной высотой тона.
const AUDIO_STEP_PLATE = ['assets/sounds/step-plate-1.ogg', 'assets/sounds/step-plate-2.ogg', 'assets/sounds/step-plate-3.ogg'];
const AUDIO_STEP_DUCT = ['assets/sounds/step-duct-1.ogg', 'assets/sounds/step-duct-2.ogg', 'assets/sounds/step-duct-3.ogg'];
const AUDIO_STEP_GRATE = ['assets/sounds/step-grate-1.ogg', 'assets/sounds/step-grate-2.ogg', 'assets/sounds/step-grate-3.ogg'];
const AUDIO_STEP_PIPE = ['assets/sounds/step-pipe-1.ogg', 'assets/sounds/step-pipe-2.ogg', 'assets/sounds/step-pipe-3.ogg'];
const AUDIO_STEP_TILE = ['assets/sounds/step-tile-1.ogg', 'assets/sounds/step-tile-2.ogg', 'assets/sounds/step-tile-3.ogg'];
const AUDIO_STEP_CONCRETE = ['assets/sounds/step-concrete-1.ogg', 'assets/sounds/step-concrete-2.ogg', 'assets/sounds/step-concrete-3.ogg', 'assets/sounds/step-concrete-4.ogg'];
const AUDIO_STEP_WOOD = ['assets/sounds/step-wood-1.ogg', 'assets/sounds/step-wood-2.ogg', 'assets/sounds/step-wood-3.ogg', 'assets/sounds/step-wood-4.ogg'];
const AUDIO_STEP_CLOTH = ['assets/sounds/step-cloth-1.ogg', 'assets/sounds/step-cloth-2.ogg', 'assets/sounds/step-cloth-3.ogg'];

/** @type {Record<string, { files: string[] | null, rate: number, volume: number }>} files null — синтез 'plop' (вода) */
const AUDIO_STEPS = {
    plate:    { files: AUDIO_STEP_PLATE,    rate: 1.0,  volume: 0.55 },
    duct:     { files: AUDIO_STEP_DUCT,     rate: 1.0,  volume: 0.5 },
    grate:    { files: AUDIO_STEP_GRATE,    rate: 1.25, volume: 0.45 },
    pipe:     { files: AUDIO_STEP_PIPE,     rate: 0.8,  volume: 0.55 },
    concrete: { files: AUDIO_STEP_CONCRETE, rate: 1.0,  volume: 0.7 },
    stone:    { files: AUDIO_STEP_CONCRETE, rate: 0.78, volume: 0.7 },
    tile:     { files: AUDIO_STEP_TILE,     rate: 1.15, volume: 0.5 },
    wood:     { files: AUDIO_STEP_WOOD,     rate: 1.0,  volume: 0.7 },
    cloth:    { files: AUDIO_STEP_CLOTH,    rate: 1.0,  volume: 0.6 },
    water:    { files: null,          rate: 1.0,  volume: 0.45 },
};
/** Названия поверхностей игры -> ключ AUDIO_STEPS. */
const AUDIO_SURFACE_ALIAS = {
    metal: 'plate', steel: 'plate', iron: 'plate', floorplate: 'plate', vent: 'duct', grid: 'grate', bars: 'grate', mesh: 'grate',
    tube: 'pipe', floor: 'concrete', ground: 'concrete', asphalt: 'concrete', default: 'concrete', dirt: 'concrete',
    tiles: 'tile', ceramic: 'tile', plank: 'wood', planks: 'wood', box: 'wood', crate: 'wood', rock: 'stone', brick: 'stone',
    puddle: 'water', carpet: 'cloth', mattress: 'cloth', rubber: 'cloth',
};

// Музыка: ключ -> трек. Громкость — доля MUSIC_VOLUME; музыка тише эффектов.
/** @type {Record<string, { url: string, volume: number }>} */
const AUDIO_MUSIC = {
    'menu':    { url: 'assets/sounds/music-menu.ogg', volume: 0.4 },
    'level-a': { url: 'assets/sounds/music-level-a.ogg', volume: 0.4 },     // холодный промышленный
    'level-b': { url: 'assets/sounds/music-level-b.ogg', volume: 0.4 },     // тёплый, шпионский
    'level-c': { url: 'assets/sounds/music-level-c.ogg', volume: 0.42 },    // жар, котельная
    'level-d': { url: 'assets/sounds/music-level-d.ogg', volume: 0.45 },    // ночь, крыши
    'chase':   { url: 'assets/sounds/music-chase.ogg', volume: 0.45 },      // погоня
};

// Циклы: файлы из Sound Pack (OGG).
/** @type {Record<string, { url: string, volume: number, rate: number, speedRate: number, fadeOut: number }>} */
const AUDIO_LOOPS = {
    jetpack:  { url: 'assets/sounds/jetpack-loop.ogg',  volume: 0.45, rate: 1, speedRate: 0.25, fadeOut: 0.25 },
    alarm:    { url: 'assets/sounds/alarm-loop.ogg',  volume: 0.3,  rate: 1, speedRate: 0,    fadeOut: 0.5 },
    conveyor: { url: 'assets/sounds/conveyor-loop.ogg', volume: 0.35, rate: 1, speedRate: 0,    fadeOut: 0.6 },
    electric: { url: 'assets/sounds/electric-loop.ogg', volume: 0.3,  rate: 1, speedRate: 0,    fadeOut: 0.5 },
};

// Все файлы для фоновой предзагрузки (музыку Sound грузит сам при music()).
const AUDIO_PRELOAD = [].concat(
    AUDIO_SND_JUMP, AUDIO_SND_LAND_SOFT, AUDIO_SND_LAND_HARD, AUDIO_SND_THUD, AUDIO_SND_RAGDOLL, AUDIO_SND_HURT, AUDIO_SND_ZAP, AUDIO_SND_METAL_HIT, AUDIO_SND_MECH, AUDIO_SND_EQUIP,
    AUDIO_SND_UNIFORM, AUDIO_SND_SAW, AUDIO_SND_LASER, AUDIO_SND_PC,
    AUDIO_SND_WET_STEP, AUDIO_STEP_PLATE, AUDIO_STEP_DUCT, AUDIO_STEP_GRATE, AUDIO_STEP_PIPE, AUDIO_STEP_TILE, AUDIO_STEP_CONCRETE, AUDIO_STEP_WOOD, AUDIO_STEP_CLOTH,
    [AUDIO_SND_COIN, AUDIO_SND_COINS10, AUDIO_SND_COINS10_UP, AUDIO_SND_FALL_WHOOSH, AUDIO_SND_RESPAWN, AUDIO_SND_CHECKPOINT, AUDIO_SND_CHEST_OPEN, AUDIO_SND_CHEST_LID,
        AUDIO_SND_BUY_COINS, AUDIO_SND_BUY_OK, AUDIO_SND_DISGUISE_LOST, AUDIO_SND_SUPERJUMP, AUDIO_SND_SUPERJUMP_UP, AUDIO_SND_BOUNCE, AUDIO_SND_BOOST, AUDIO_SND_TRAP_SNAP,
        AUDIO_SND_CRUSHER_BOOM, AUDIO_SND_CRUSHER_HIT, AUDIO_SND_CAUGHT_BELL, AUDIO_SND_CHASE_END, AUDIO_SND_FINISH, AUDIO_SND_LEVEL_START, AUDIO_SND_KEY, AUDIO_SND_FUSE,
        AUDIO_SND_LEVER, AUDIO_SND_BUTTON, AUDIO_SND_VALVE, AUDIO_SND_UI_CLICK, AUDIO_SND_UI_OPEN, AUDIO_SND_UI_CLOSE, AUDIO_SND_UI_TAB, AUDIO_SND_UI_ERROR,
        AUDIO_SND_JET_ON, AUDIO_SND_JET_OFF, AUDIO_SND_ALARM, AUDIO_SND_SIZZLE, AUDIO_SND_SPLASH, AUDIO_SND_WHISTLE, AUDIO_SND_WHISTLE_LONG, AUDIO_SND_CELL_SLAM]
);

const audClamp01 = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));
/** Доля 0..1 от lo до hi. */
const audSpan = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => audClamp01((v - lo) / (hi - lo));

// Монеты подряд: ступени мажорной гаммы вверх (в полутонах), потом держится на октаве; пауза 1.5 с сбрасывает.
const AUDIO_COIN_SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
const AUDIO_COIN_COMBO_MS = 1500;

// ==============================================================================================================
//  События. this = GameAudio. Громкости подобраны «на глаз» (на слух не проверялись).
// ==============================================================================================================
/** @type {Record<string, (this: any, d: any) => void>} */
const AUDIO_EVENTS = {
    coin() {
        const now = performance.now();
        this._combo = (now - this._comboAt > AUDIO_COIN_COMBO_MS) ? 0 : this._combo + 1;
        this._comboAt = now;
        const semi = AUDIO_COIN_SCALE[Math.min(this._combo, AUDIO_COIN_SCALE.length - 1)];
        this._sfx(AUDIO_SND_COIN, { volume: 0.5, rate: Math.pow(2, semi / 12), detune: 0.004 });
    },
    coins10() {
        this._sfx(AUDIO_SND_COINS10, { volume: 0.5 });
        this._later(120, () => this._sfx(AUDIO_SND_COINS10_UP, { volume: 0.4 }));
    },
    jump() { this._sfx(AUDIO_SND_JUMP, { volume: 0.4, detune: 0.06 }); },
    land(d) {
        const s = Math.abs(d.speed || 0), k = audSpan(s, 3, 22);
        if (s < 2 || !this._gate('land', 90)) return;
        this._sfx(s > 14 ? AUDIO_SND_LAND_HARD : AUDIO_SND_LAND_SOFT, { volume: 0.2 + 0.7 * k, rate: 1.1 - 0.3 * k });
    },
    step(d) {
        const s = Math.abs(d.speed == null ? 6 : d.speed);
        if (s < 0.5 || !this._gate('step', 70)) return;
        const raw = String(d.surface || 'concrete').toLowerCase();
        const def = AUDIO_STEPS[raw] || AUDIO_STEPS[AUDIO_SURFACE_ALIAS[raw]] || AUDIO_STEPS.concrete;
        const k = audSpan(s, 1, 10);
        const vol = def.volume * (0.55 + 0.45 * k) * 0.45;
        const rate = def.rate * (0.94 + 0.12 * k);
        if (def.files) this._sfx(def.files, { volume: vol, rate, detune: 0.05 });
        else this._sfx(AUDIO_SND_WET_STEP, { volume: vol * 1.1, rate: 0.9 + Math.random() * 0.2 });
    },
    death(d) {
        const cause = String(d.cause || d.kind || '').toLowerCase();
        if (cause === 'lava' || cause === 'fire' || cause === 'burn') {
            this._sfx(AUDIO_SND_SIZZLE, { volume: 0.6 });
            this._sfx(AUDIO_SND_HURT, { volume: 0.35, rate: 0.9 });
        } else if (cause === 'zap' || cause === 'electric' || cause === 'shock') {
            this._sfx(AUDIO_SND_ZAP, { volume: 0.55 });
            this._later(60, () => this._sfx(AUDIO_SND_HURT, { volume: 0.4, rate: 1.05 }));
        } else if (cause === 'spikes' || cause === 'spike' || cause === 'saw' || cause === 'blade') {
            this._sfx(AUDIO_SND_METAL_HIT, { volume: 0.55 });
            this._sfx(AUDIO_SND_HURT, { volume: 0.45 });
        } else if (cause === 'water') {
            this._sfx(AUDIO_SND_SPLASH, { volume: 0.7 });
        } else if (cause === 'fall' || cause === 'void') {
            this._sfx(AUDIO_SND_HURT, { volume: 0.5, rate: 0.95 });
            this._later(260, () => this._sfx(AUDIO_SND_LAND_HARD, { volume: 0.7, rate: 0.9 }));
        } else {
            this._sfx(AUDIO_SND_HURT, { volume: 0.5 });
            this._sfx(AUDIO_SND_THUD, { volume: 0.4 });
        }
    },
    respawn() { this._sfx(AUDIO_SND_RESPAWN, { volume: 0.4 }); },
    checkpoint() { this._sfx(AUDIO_SND_CHECKPOINT, { volume: 0.5 }); },
    switch(d) {
        switch (String(d.kind || 'lever').toLowerCase()) {
            case 'fuse': this._sfx(AUDIO_SND_FUSE, { volume: 0.6 }); this._sfx(AUDIO_SND_BUTTON, { volume: 0.35, rate: 1.4 }); break;
            case 'vent': this._sfx(AUDIO_SND_METAL_HIT, { volume: 0.4, rate: 1.2 }); this._sfx(AUDIO_SND_MECH, { volume: 0.3, rate: 1.3 }); break;
            case 'button': this._sfx(AUDIO_SND_BUTTON, { volume: 0.6 }); break;
            case 'valve': this._sfx(AUDIO_SND_VALVE, { volume: 0.55 }); break;
            case 'pc': this._sfx(AUDIO_SND_PC, { volume: 0.5 }); break;
            default: this._sfx(AUDIO_SND_LEVER, { volume: 0.65 }); this._later(90, () => this._sfx(AUDIO_SND_METAL_HIT, { volume: 0.25, rate: 1.3 }));
        }
    },
    mech() {
        this._sfx(AUDIO_SND_MECH, { volume: 0.55, rate: 0.9 });
        this._later(40, () => this._sfx(AUDIO_SND_METAL_HIT, { volume: 0.4, rate: 0.7 }));
    },
    chest() {
        this._sfx(AUDIO_SND_CHEST_OPEN, { volume: 0.6 });
        this._later(160, () => this._sfx(AUDIO_SND_CHEST_LID, { volume: 0.35, rate: 0.9 }));
        this._later(420, () => this._sfx(AUDIO_SND_COINS10, { volume: 0.6 }));
        this._later(560, () => this._sfx(AUDIO_SND_COINS10_UP, { volume: 0.45 }));
        this.duck(0.35, 2.4);
    },
    buy() {
        this._sfx(AUDIO_SND_BUY_COINS, { volume: 0.55 });
        this._later(110, () => this._sfx(AUDIO_SND_BUY_OK, { volume: 0.5 }));
    },
    equip() { this._sfx(AUDIO_SND_EQUIP, { volume: 0.5 }); },
    uniform() { this._sfx(AUDIO_SND_UNIFORM, { volume: 0.55 }); },
    disguiseLost() { this._sfx(AUDIO_SND_DISGUISE_LOST, { volume: 0.5 }); this._sfx(AUDIO_SND_UNIFORM, { volume: 0.3, rate: 1.2 }); },
    jetpackOn() { this._sfx(AUDIO_SND_JET_ON, { volume: 0.45, rate: 1.15 }); },
    jetpackOff() { this._sfx(AUDIO_SND_JET_OFF, { volume: 0.4, rate: 0.75 }); },
    superjump() { this._sfx(AUDIO_SND_SUPERJUMP, { volume: 0.55 }); this._sfx(AUDIO_SND_SUPERJUMP_UP, { volume: 0.3, rate: 0.9 }); },
    bounce() { this._sfx(AUDIO_SND_BOUNCE, { volume: 0.5, detune: 0.08 }); },
    boost() { this._sfx(AUDIO_SND_BOOST, { volume: 0.5 }); },
    trapSnap() {
        this._sfx(AUDIO_SND_TRAP_SNAP, { volume: 0.7 });
        this._later(50, () => this._sfx(AUDIO_SND_METAL_HIT, { volume: 0.45, rate: 1.25 }));
    },
    saw() { if (this._gate('saw', 220)) this._sfx(AUDIO_SND_SAW, { volume: 0.4 }); },
    crusher() {
        this._sfx(AUDIO_SND_CRUSHER_BOOM, { volume: 0.6 });
        this._sfx(AUDIO_SND_CRUSHER_HIT, { volume: 0.55, rate: 0.85 });
    },
    laser() { if (this._gate('laser', 150)) this._sfx(AUDIO_SND_LASER, { volume: 0.35 }); },
    spotted() { this._sfx(AUDIO_SND_WHISTLE, { volume: 0.5 }); },
    caught() {
        this._sfx(AUDIO_SND_CELL_SLAM, { volume: 0.6, rate: 0.85 });
        this._sfx(AUDIO_SND_CAUGHT_BELL, { volume: 0.4, rate: 0.7 });
        this.duck(0.35, 2);
    },
    chaseStart() { this._sfx(AUDIO_SND_WHISTLE_LONG, { volume: 0.5 }); },
    chaseEnd() { this._sfx(AUDIO_SND_CHASE_END, { volume: 0.4, rate: 0.9 }); },
    alarm() { this._sfx(AUDIO_SND_ALARM, { volume: 0.35 }); },
    finish() {
        this.duck(0.3, 3.8);
        this._sfx(AUDIO_SND_FINISH, { volume: 0.75 });
        this._later(500, () => this._sfx(AUDIO_SND_COINS10_UP, { volume: 0.3, rate: 1.2 }));
    },
    levelStart() { this._sfx(AUDIO_SND_LEVEL_START, { volume: 0.35 }); },
    fall() { if (this._gate('fall', 600)) this._sfx(AUDIO_SND_FALL_WHOOSH, { volume: 0.35 }); },
    ragdoll(d) {
        const k = audSpan(Math.abs(d.speed || 0), 2, 20);
        if (!this._gate('ragdoll', 120)) return;
        this._sfx(AUDIO_SND_RAGDOLL, { volume: 0.3 + 0.55 * k, rate: 1.05 - 0.2 * k });
    },
    thud() { if (this._gate('thud', 100)) this._sfx(AUDIO_SND_THUD, { volume: 0.5 }); },
    key() { this._sfx(AUDIO_SND_KEY, { volume: 0.55 }); this._later(80, () => this._sfx(AUDIO_SND_FUSE, { volume: 0.3, rate: 1.4 })); },
    unlock() {
        this._sfx(AUDIO_SND_FUSE, { volume: 0.6, rate: 0.85 });
        this._later(140, () => { this._sfx(AUDIO_SND_LEVER, { volume: 0.5, rate: 0.9 }); this._sfx(AUDIO_SND_MECH, { volume: 0.35 }); });
    },
    ui(d) {
        switch (String(d.kind || 'click').toLowerCase()) {
            case 'open': this._sfx(AUDIO_SND_UI_OPEN, { volume: 0.4 }); break;
            case 'close': this._sfx(AUDIO_SND_UI_CLOSE, { volume: 0.4 }); break;
            case 'tab': this._sfx(AUDIO_SND_UI_TAB, { volume: 0.4 }); break;
            case 'error': this._sfx(AUDIO_SND_UI_ERROR, { volume: 0.45 }); break;
            default: this._sfx(AUDIO_SND_UI_CLICK, { volume: 0.5 });
        }
    },
};


