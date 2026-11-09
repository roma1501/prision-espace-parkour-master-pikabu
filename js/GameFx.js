// GameFx.js — эффекты «Prision Espace Parkour Master»: частицы по событиям, атмосфера уровней, свечение и постобработка.
// Контракт (docs/DESIGN.md §7, §8) — ядро Game.js зовёт:
//   GameFx.init(app)                  один раз после создания app (app.fx — ParticleFX);
//   GameFx.level(app, L)              в prepare каждого уровня (после ObbyCourse/GameMech.build): всё прошлое убирается;
//   GameFx.decor(m)                   GameMech.addDecor: маркеры декора spark / light / alarm / fx <вид> / heli;
//   GameFx.event(name, d)             события {x, y (карта), h (высота), …};
//   GameFx.update(dt)                 каждый кадр (на паузе не зовётся — всё, что здесь течёт по времени, на паузе стоит);
//   GameFx.jet(on, nozzles, dir)      каждый кадр: пламя джетпака, nozzles — [{x, y, z}] в мире Babylon.
//
// КООРДИНАТЫ: карта (x, y) + высота h → мир Babylon (x, h, y). 1 м = 100 px; скорости частиц — px/с, гравитация — px/с².
//
// СПРАЙТЫ assets/fx/*.webp рисует художник позже. Пока файла нет — процедурная замена на холсте (мягкий круг, искра-штрих,
// звезда…). Наличие проверяется при init (Image.onload), текстуры создаются сразу, «живой» заменой не подменяются:
// новые эффекты берут арт, как только файл найден.
//
// БЮДЖЕТ: счётчики частиц × GameFx.scale() (низкое/среднее/высокое = .5/.8/1; телефон ещё ×.75 поверх FX_MOBILE_SCALE ParticleFX,
// итого ≈ 40%); события дальше FAR px от героя не запускаются; постоянные эмиттеры уровня («зоны») живут только рядом с героем,
// одновременно не больше zoneCap() штук (системы ParticleFX общим лимитом FX_MAX_SYSTEMS). Пауза: ParticleFX стоит сам,
// update() на паузе не зовётся. Смена уровня: level() освобождает все системы, меши и таймеры уровня.

/** @satisfies {Record<string, any>} */
const GameFx = {
    /** @type {any} */ app: null,
    /** @type {any} */ scene: null,
    /** @type {any} */ fx: null,
    inited: false,
    time: 0,
    FAR: 2500,
    /** Файлы-спрайты (художник): имя → путь (литералы — их видит сканер ассетов). */
    ART: {
        smoke: 'assets/fx/smoke_puff.webp', steam: 'assets/fx/steam.webp', spark: 'assets/fx/spark.webp', star: 'assets/fx/star.webp',
        glint: 'assets/fx/glint.webp', ember: 'assets/fx/ember.webp', heart: 'assets/fx/heart.webp', splash: 'assets/fx/splash.webp',
        arc: 'assets/fx/electric_arc.webp', flame: 'assets/fx/flame_sheet.webp', confetti: 'assets/fx/confetti_sheet.webp',
        dustring: 'assets/fx/dust_ring.webp', beam: 'assets/fx/lightbeam.webp',
    },
    /** @type {Record<string, {w: number, h: number}>} найденные файлы */ found: {},
    /** @type {Record<string, any>} */ texs: {},
    /** @type {Record<string, any>} */ mats: {},
    /** Состояние текущего уровня. */
    /** @type {any[]} */ zones: [],
    /** @type {any[]} */ temps: [],
    /** @type {any[]} */ held: [],
    /** @type {any[]} */ pending: [],
    /** @type {any} */ pendingMap: null,
    /** @type {any} */ L: null,
    mood: null,
    zoneClock: 0,
    /** @type {Record<string, number>} */ gates: {},
    /** @type {any} */ J: { hs: null, noz: [] },
    /** @type {Map<string, any>} */ steams: new Map(),
    /** @type {any} */ glow: null,
    /** @type {any} */ pipe: null,
    /** @type {any} */ motes: null,

    // ---------------------------------------------------------------------------------------------
    // Настроение уровней (DESIGN §2): пыль, цветокоррекция (оттенок и плотность теней/света), контраст, виньетка, ночь.
    // ---------------------------------------------------------------------------------------------
    MOODS: {
        1: { dust: '#cfe6ee', lamp: '#d8ecff', sh: [196, 26], hi: [188, 8], contrast: 1.1, vig: 1.3, vigCol: [0.01, 0.04, 0.06], exp: 1.0 },
        2: { dust: '#f3dcb0', lamp: '#ffe0a8', sh: [34, 20], hi: [42, 10], contrast: 1.06, vig: 1.0, vigCol: [0.06, 0.04, 0.02], exp: 1.02, warm: true },
        3: { dust: '#d8f2d4', lamp: '#e6ffd8', sh: [150, 28], hi: [115, 6], contrast: 1.08, vig: 1.25, vigCol: [0.01, 0.05, 0.03], exp: 1.0 },
        4: { dust: '#ffc486', lamp: '#ffb870', sh: [14, 34], hi: [32, 18], contrast: 1.14, vig: 1.35, vigCol: [0.07, 0.01, 0], exp: 1.0, warm: true, hot: true },
        5: { dust: '#ffffff', lamp: '#fff0d8', sh: [290, 12], hi: [48, 6], contrast: 1.02, vig: 0.8, vigCol: [0.04, 0.03, 0.05], exp: 1.03 },
        6: { dust: '#a8c0ff', lamp: '#fff0c0', sh: [226, 34], hi: [205, 10], contrast: 1.16, vig: 1.6, vigCol: [0.0, 0.01, 0.05], exp: 0.98, night: true },
        7: { dust: '#b4b8ff', lamp: '#ffeeb8', sh: [256, 30], hi: [30, 12], contrast: 1.16, vig: 1.5, vigCol: [0.01, 0.0, 0.05], exp: 0.98, night: true },
    },

    // ---------------------------------------------------------------------------------------------
    // Инициализация, качество, свечение, постобработка
    // ---------------------------------------------------------------------------------------------
    init(app) {
        if (this.inited) return;
        this.app = app; this.fx = app.fx; this.scene = app.location && app.location.view ? app.location.view.scene : null;
        if (!this.scene) return;
        this.inited = true;
        for (const name of Object.keys(this.ART)) {
            const img = new Image();
            img.onload = () => { this.found[name] = { w: img.naturalWidth, h: img.naturalHeight }; delete this.texs[name]; };
            img.src = this.ART[name];
        }
        this.setupPost();
        if (typeof Quality !== 'undefined' && Quality.onChange) Quality.onChange(() => this.setupPost());
    },

    mobile() { return typeof IS_MOBILE !== 'undefined' && IS_MOBILE; },
    qlevel() { return typeof Quality !== 'undefined' ? Quality.level : 2; },
    /** Множитель числа частиц по качеству (ParticleFX на телефоне уже ×FX_MOBILE_SCALE). */
    scale() { return [0.5, 0.8, 1][this.qlevel()] * (this.mobile() ? 0.75 : 1); },
    /** Сколько постоянных эмиттеров-зон живёт одновременно. */
    zoneCap() { return this.mobile() ? 5 : [7, 11, 16][this.qlevel()]; },

    /** Свечение (GlowLayer) и постобработка по качеству: высокий (ПК) — bloom + FXAA + виньетка + цвет; средний — лёгкое свечение, виньетка и цвет без прохода; низкий и телефон — ничего тяжёлого. */
    setupPost() {
        const scene = this.scene; if (!scene) return;
        const lvl = this.qlevel(), mob = this.mobile();
        const full = lvl >= 2 && !mob, mid = lvl === 1 && !mob;
        // GlowLayer
        if ((full || mid) && !this.glow && BABYLON.GlowLayer) {
            try {
                const g = new BABYLON.GlowLayer('fxGlow', scene, { mainTextureRatio: full ? 0.5 : 0.35, blurKernelSize: full ? 32 : 20 });
                g.customEmissiveColorSelector = (mesh, sub, mat, result) => {
                    const md = mesh.metadata;
                    const e = mat && /** @type {any} */ (mat).emissiveColor;
                    if ((md && md.fxNoGlow) || !e || /sky|cloud|dome|-cone|search-/i.test(mesh.name)) { result.set(0, 0, 0, 0); return; }
                    const lum = Math.max(e.r, e.g, e.b);
                    if (lum < 0.12) { result.set(0, 0, 0, 0); return; }
                    // полупрозрачное светится слабее: иначе лучи и пятна становятся сплошными клиньями
                    const a = Math.max(0, Math.min(1, typeof mat.alpha === 'number' ? mat.alpha : 1));
                    result.set(e.r * a, e.g * a, e.b * a, 1);
                };
                this.glow = g;
            } catch (err) { console.warn('GameFx glow', err); }
        }
        if (this.glow) {
            if (!(full || mid)) { try { this.glow.dispose(); } catch (e) { /* уже */ } this.glow = null; }
            else this.glow.intensity = full ? 0.55 : 0.38;
        }
        // Цвет и виньетка: в сцене (материалы), bloom и FXAA — только на высоком.
        const ip = scene.imageProcessingConfiguration;
        ip.isEnabled = full || mid;
        if (full && !this.pipe && BABYLON.DefaultRenderingPipeline && app_camera(this)) {
            try {
                const p = new BABYLON.DefaultRenderingPipeline('fxPipe', false, scene, [app_camera(this)]);
                p.fxaaEnabled = true; p.bloomEnabled = true; p.bloomThreshold = 0.86; p.bloomWeight = 0.22; p.bloomKernel = 48; p.bloomScale = 0.5;
                p.imageProcessingEnabled = true;
                this.pipe = p;
            } catch (err) { console.warn('GameFx pipeline', err); }
        }
        if (this.pipe && !full) { try { this.pipe.dispose(); } catch (e) { /* уже */ } this.pipe = null; }
        this.grade();
    },

    /** Тон уровня в обработку изображения (контраст, виньетка, кривые цвета). */
    grade() {
        const scene = this.scene; if (!scene) return;
        const full = this.qlevel() >= 2 && !this.mobile(), mid = this.qlevel() === 1 && !this.mobile();
        const ip = scene.imageProcessingConfiguration, m = this.mood || this.MOODS[1];
        if (!(full || mid)) { ip.vignetteEnabled = false; ip.colorCurvesEnabled = false; ip.contrast = 1; ip.exposure = 1; return; }
        const k = full ? 1 : 0.7;
        ip.contrast = 1 + (m.contrast - 1) * k; ip.exposure = m.exposure != null ? m.exposure : (m.exp || 1);
        ip.vignetteEnabled = true; ip.vignetteWeight = m.vig * (full ? 1 : 0.8); ip.vignetteStretch = 0.5; ip.vignetteCameraFov = 0.6;
        ip.vignetteColor = new BABYLON.Color4(m.vigCol[0], m.vigCol[1], m.vigCol[2], 0);
        ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
        const c = new BABYLON.ColorCurves();
        c.shadowsHue = m.sh[0]; c.shadowsDensity = m.sh[1] * k; c.highlightsHue = m.hi[0]; c.highlightsDensity = m.hi[1] * k;
        c.globalSaturation = 6 * k;
        ip.colorCurves = c; ip.colorCurvesEnabled = true;
        if (this.pipe) { this.pipe.bloomWeight = m.hot ? 0.3 : m.night ? 0.26 : 0.2; }
    },

    // ---------------------------------------------------------------------------------------------
    // Текстуры: арт из assets/fx или процедурная замена
    // ---------------------------------------------------------------------------------------------
    /** @returns {any} BABYLON.Texture (invertY, alpha) */
    tex(name) {
        if (this.texs[name]) return this.texs[name];
        let t;
        if (this.found[name]) t = new BABYLON.Texture(this.ART[name], this.scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        else t = this.procedural(name);
        t.hasAlpha = true; t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this.texs[name] = t; return t;
    },

    /** Размер клетки флипбука (4×4) найденного файла или null. */
    cell(name) { const f = this.found[name]; return f ? { width: Math.floor(f.w / 4), height: Math.floor(f.h / 4) } : null; },

    /** Процедурный спрайт на холсте. */
    procedural(name) {
        const S = name === 'beamV' ? 64 : 128, W = name === 'beamV' ? 8 : S;
        const t = new BABYLON.DynamicTexture('gfx-' + name, { width: W, height: S }, this.scene, true);
        const c = /** @type {any} */ (t.getContext()); c.clearRect(0, 0, W, S);
        const R = (() => { let s = 7919; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
        const radial = (cx, cy, r, stops) => { const g = c.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [o, col] of stops) g.addColorStop(o, col); c.fillStyle = g; c.fillRect(0, 0, S, S); };
        switch (name) {
            case 'smoke': case 'steam': {
                for (let i = 0; i < 11; i++) { const a = R() * 6.28, d = R() * 26, r = 22 + R() * 20; c.globalAlpha = name === 'steam' ? 0.2 : 0.3; const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); }
                c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in'; radial(64, 64, 62, [[0, '#fff'], [0.6, 'rgba(255,255,255,.85)'], [1, 'rgba(255,255,255,0)']]); c.globalCompositeOperation = 'source-over'; break;
            }
            case 'ember': case 'spark': radial(64, 64, 62, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,.95)'], [0.45, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); break;
            case 'streak': {
                c.save(); c.translate(64, 64); c.scale(1, 0.2); c.translate(-64, -64);
                radial(64, 64, 62, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]); c.restore(); break;
            }
            case 'star': case 'glint': {
                radial(64, 64, 22, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
                const L = name === 'glint' ? 62 : 52, th = name === 'glint' ? 3.5 : 7;
                for (const rot of name === 'glint' ? [0, 90, 45, 135] : [0, 90]) {
                    c.save(); c.translate(64, 64); c.rotate(rot * Math.PI / 180); const len = rot % 90 ? L * 0.55 : L, tt = rot % 90 ? th * 0.6 : th;
                    const g = c.createLinearGradient(-len, 0, len, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
                    c.fillStyle = g; c.beginPath(); c.moveTo(-len, 0); c.quadraticCurveTo(0, -tt, len, 0); c.quadraticCurveTo(0, tt, -len, 0); c.fill(); c.restore();
                }
                break;
            }
            case 'ring': case 'dustring': radial(64, 64, 62, [[0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,.95)'], [0.92, 'rgba(255,255,255,.3)'], [1, 'rgba(255,255,255,0)']]); break;
            case 'drop': case 'splash': radial(64, 64, 60, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,.95)'], [0.82, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]); break;
            case 'arc': {
                c.lineJoin = 'round'; c.lineCap = 'round'; c.shadowColor = 'rgba(150,200,255,1)';
                const pts = [[4, 64]]; for (let x = 18; x < 124; x += 12 + R() * 8) pts.push([x, 64 + (R() - 0.5) * 56]); pts.push([124, 64 + (R() - 0.5) * 20]);
                for (const [w, a, sb] of [[9, 0.35, 16], [4.5, 0.8, 10], [2, 1, 4]]) { c.shadowBlur = sb; c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); }
                break;
            }
            case 'confetti': { const g = c.createLinearGradient(0, 30, 0, 98); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,.7)'); c.fillStyle = g; c.fillRect(46, 28, 36, 72); break; }
            case 'heart': {
                const g = c.createRadialGradient(64, 52, 4, 64, 60, 60); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,.85)');
                c.fillStyle = g; c.shadowColor = 'rgba(255,255,255,.9)'; c.shadowBlur = 12; c.beginPath(); c.moveTo(64, 108);
                c.bezierCurveTo(8, 70, 14, 22, 64, 44); c.bezierCurveTo(114, 22, 120, 70, 64, 108); c.fill(); break;
            }
            case 'excl': {
                radial(64, 64, 62, [[0, 'rgba(255,60,40,.9)'], [0.7, 'rgba(255,40,30,.8)'], [1, 'rgba(255,40,30,0)']]);
                c.fillStyle = '#d3231c'; c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 44, 0, 6.283); c.fill(); c.stroke();
                c.fillStyle = '#fff'; c.beginPath(); c.moveTo(56, 34); c.lineTo(72, 34); c.lineTo(68, 72); c.lineTo(60, 72); c.fill(); c.beginPath(); c.arc(64, 87, 6.5, 0, 6.283); c.fill(); break;
            }
            case 'beamV': { const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.15, 'rgba(255,255,255,.55)'); g.addColorStop(0.6, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, W, S); break; }
            case 'beamH': {
                const g = c.createLinearGradient(0, 0, S, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S);
                c.globalCompositeOperation = 'destination-in'; const v = c.createLinearGradient(0, 0, 0, S); v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.5, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = v; c.fillRect(0, 0, S, S); c.globalCompositeOperation = 'source-over'; break;
            }
            default: radial(64, 64, 62, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]);
        }
        t.update(true);
        return t;
    },

    // ---------------------------------------------------------------------------------------------
    // Частицы: один слой, пачки по делу
    // ---------------------------------------------------------------------------------------------
    /** Слой частиц: o — как у ParticleFX.create + tex (имя спрайта), stretch (вытянутая искра), radial (горизонтальное кольцо). Счётчики × scale(). */
    mk(o) {
        const fx = this.fx; if (!fx || !this.inited) return null;
        const q = this.scale(), cell = o.sheet && this.cell(o.tex);
        const opts = Object.assign({}, o);
        if (o.sheet && !cell) { delete opts.sheet; }
        else if (o.sheet) opts.sheet = Object.assign({}, o.sheet, cell);
        const life = opts.life || [0.3, 1];
        if (opts.burst != null) { opts.burst = Math.max(1, Math.round(opts.burst * q)); opts.capacity = opts.burst + 2; }
        else if (opts.rate != null) { opts.rate = opts.rate * q; opts.capacity = Math.ceil(opts.rate * life[1] * 1.3) + 6; }
        opts.name = opts.name || 'gfx';
        if (o.stretch && opts.size) opts.size = [opts.size[0] * 0.5, opts.size[1] * 0.5];   // вытянутая искра: длину задаёт скорость
        delete opts.tex;
        const h = fx.create(opts); if (!h) return null;
        const ps = h.system;
        ps.particleTexture = this.tex(o.tex || 'soft');
        ps.applyFog = false;
        if (o.stretch) { ps.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED; }
        if (o.scaleXY) { ps.minScaleX = ps.maxScaleX = o.scaleXY[0]; ps.minScaleY = ps.maxScaleY = o.scaleXY[1]; }
        if (o.radial) {
            const up = o.radial.up == null ? 0.1 : o.radial.up;
            ps.startDirectionFunction = (wm, dir) => { const a = Math.random() * 6.2832; dir.copyFromFloats(Math.cos(a), up * (0.4 + Math.random()), Math.sin(a)); };
        }
        if (o.ring) {   // сфера (салют, взрыв): равномерно по направлениям
            ps.startDirectionFunction = (wm, dir) => { const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u); dir.copyFromFloats(Math.cos(a) * r, u, Math.sin(a) * r); };
        }
        return h;
    },

    // ---- готовые типы слоёв ----
    sparks(P, o = {}) {
        const c = o.color || '#ffd070', c2 = o.color2 || '#ff7a10';
        return this.mk({ tex: 'streak', stretch: true, scaleXY: o.scaleXY || [1, 1], burst: o.n || 20, life: o.life || [0.3, 0.65], size: o.size || [10, 16], speed: o.speed || [180, 430], delay: o.delay,
            direction: o.dir || [[-1, 0.2, -1], [1, 1.2, 1]], gravity: [0, o.g == null ? -600 : o.g, 0], position: P, ring: o.ring,
            color: c, color2: c2, colorGradient: [[0, '#ffffff', 1], [0.25, c, 1], [1, c2, 0]] });
    },
    puffs(P, o = {}) {
        const c = o.color || '#d8d0c4';
        return this.mk({ tex: o.tex || 'smoke', blend: 'standard', burst: o.n || 8, life: o.life || [0.5, 0.9], size: o.size || [16, 30], speed: o.speed || [40, 95], delay: o.delay, position: P,
            direction: o.dir || [[-1, 0.2, -1], [1, 0.9, 1]], gravity: [0, o.g || 0, 0], spin: o.spin || [-1.2, 1.2], radial: o.radial, box: o.box,
            color: c, color2: o.color2 || c, alpha: o.alpha == null ? 0.55 : o.alpha, sizeGradient: o.grow || [[0, 0.55], [1, 1.8]],
            colorGradient: [[0, c, o.alpha == null ? 0.55 : o.alpha], [0.6, o.color2 || c, (o.alpha == null ? 0.55 : o.alpha) * 0.55], [1, o.color2 || c, 0]] });
    },
    flash(P, o = {}) {   // вспышка-свечение
        const c = o.color || '#ffe9a0';
        return this.mk({ tex: 'soft', burst: o.n || 1, life: o.life || [0.18, 0.28], size: o.size || [90, 110], speed: [0, 0], delay: o.delay, position: P, color: c, alpha: o.alpha || 0.8,
            sizeGradient: [[0, 0.4], [0.25, 1], [1, 0.6]], colorGradient: [[0, c, o.alpha || 0.8], [1, c, 0]] });
    },
    stars(P, o = {}) {
        const c = o.color || '#fff2a8';
        return this.mk({ tex: o.tex || 'star', burst: o.n || 5, life: o.life || [0.4, 0.8], size: o.size || [18, 30], speed: o.speed || [40, 120], delay: o.delay, position: P, box: o.box,
            direction: o.dir || [[-1, 0.4, -1], [1, 1.2, 1]], gravity: [0, o.g == null ? -60 : o.g, 0], spin: [-3, 3], color: c, color2: o.color2 || '#ffffff',
            sizeGradient: [[0, 0.2], [0.25, 1], [1, 0]], colorGradient: [[0, '#ffffff', 1], [0.3, c, 1], [1, o.color2 || c, 0]], ring: o.ring });
    },
    /** Круг-блик, расходящийся в стороны (на экране): ring-текстура. */
    pulse(P, o = {}) {
        const c = o.color || '#ffd24a';
        return this.mk({ tex: 'ring', burst: 1, life: o.life || [0.35, 0.35], size: o.size || [90, 90], speed: o.up ? [o.up, o.up] : [0, 0], direction: [[0, 1, 0], [0, 1, 0]], delay: o.delay, position: P,
            color: c, alpha: 0.9, sizeGradient: [[0, 0.12], [1, 1]], colorGradient: [[0, '#ffffff', 0.95], [0.2, c, 0.8], [1, c, 0]] });
    },

    // ---- временные меши ----
    /** Материал-«свет»: аддитивный, без освещения и тумана. */
    mat(texName, color) {
        const key = texName + color;
        if (this.mats[key]) return this.mats[key];
        const m = new BABYLON.StandardMaterial('gfx-' + key, this.scene), t = this.tex(texName);
        m.disableLighting = true; m.emissiveColor = BABYLON.Color3.FromHexString(color); m.emissiveTexture = t; m.opacityTexture = t;
        m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
        m.alphaMode = BABYLON.Engine.ALPHA_ADD; m.backFaceCulling = false; m.fogEnabled = false; m.zOffset = -3; m.disableDepthWrite = true;
        this.mats[key] = m; return m;
    },
    /** Подготовить мешу эффекта: слой OVERLAY, без выбора и свечения. */
    prep(mesh) {
        mesh.isPickable = false; mesh.doNotSyncBoundingInfo = true; mesh.alwaysSelectAsActiveMesh = true; mesh.metadata = { fxNoGlow: true };
        if (typeof World3D !== 'undefined' && World3D.LAYER) mesh.renderingGroupId = World3D.LAYER.OVERLAY;
        return mesh;
    },
    /** Временный меш: fn(k 0..1, mesh) каждый кадр; по окончании удаляется. */
    temp(mesh, life, fn) { this.temps.push({ mesh, t: 0, life, fn }); return mesh; },
    /** Кольцо на полу: расширяется и гаснет. */
    ringFloor(P, o = {}) {
        if (!this.inited) return null;
        const m = this.prep(BABYLON.MeshBuilder.CreatePlane('gfx-ring', { size: 1 }, this.scene));
        m.rotation.x = Math.PI / 2; m.position.set(P[0], P[1] + 2, P[2]); m.material = this.mat(o.tex || 'ring', o.color || '#ffffff');
        const r0 = o.r0 || 20, r1 = o.r1 || 200, a = o.alpha == null ? 0.9 : o.alpha;
        m.scaling.set(r0 * 2, r0 * 2, 1); m.visibility = a;
        return this.temp(m, o.life || 0.5, (k) => { const e = 1 - (1 - k) * (1 - k); const r = r0 + (r1 - r0) * e; m.scaling.set(r * 2, r * 2, 1); m.visibility = a * (1 - k) * (1 - k * 0.3); });
    },
    /** Столб света (респавн): цилиндр, растёт и гаснет. */
    column(P, o = {}) {
        if (!this.inited) return null;
        const hgt = o.h || 320, w = o.w || 90;
        const m = this.prep(BABYLON.MeshBuilder.CreateCylinder('gfx-col', { height: 1, diameter: 1, tessellation: 20, cap: BABYLON.Mesh.NO_CAP }, this.scene));
        m.position.set(P[0], P[1] + hgt / 2, P[2]); m.material = this.mat('beamV', o.color || '#bfe8ff');
        m.scaling.set(w, hgt, w);
        return this.temp(m, o.life || 0.9, (k) => { const grow = Math.min(1, k * 5), s = (1 - k) * (0.8 + 0.2 * grow); m.scaling.set(w * (0.5 + 0.9 * (1 - s)) * (1 - k * 0.6), hgt * (0.4 + 0.6 * grow), w * (0.5 + 0.9 * (1 - s)) * (1 - k * 0.6)); m.position.y = P[1] + m.scaling.y / 2; m.visibility = Math.min(1, k * 8) * (1 - k) * 1.2; });
    },

    // ---------------------------------------------------------------------------------------------
    // Вспомогательное
    // ---------------------------------------------------------------------------------------------
    hero() { return typeof GameHero !== 'undefined' && GameHero.ch ? GameHero : null; },
    /** Мировая точка события (x карты, h, y карты); без координат — под героем. */
    at(d, dy = 0) { const H = this.hero(); const x = d && d.x != null ? d.x : H ? H.x : 0, y = d && d.y != null ? d.y : H ? H.y : 0, h = d && d.h != null ? d.h : H ? H.h : 0; return [x, h + dy, y]; },
    near(d, r) { const H = this.hero(); if (!H || !d || d.x == null) return true; return Math.hypot(d.x - H.x, d.y - H.y) < (r || this.FAR); },
    gate(key, ms) { const n = performance.now(); if (this.gates[key] && n - this.gates[key] < ms) return false; this.gates[key] = n; return true; },
    shake(ms, k) { try { if (this.app && this.app.camera && this.app.camera.shake) this.app.camera.shake(ms, k); } catch (e) { /* камера без тряски */ } },
    heroFollow(dy) { return () => { const H = this.hero(); return H ? [H.x, H.h + dy, H.y] : [0, 0, 0]; }; },
    /** Оттенок пыли под поверхность. */
    dustColor(surface) {
        const s = String(surface || '');
        if (/water/i.test(s)) return null;
        if (/grass|green|mint/i.test(s)) return '#a9c590'; if (/sand|dirt|yellow|orange/i.test(s)) return '#cdb48a'; if (/ice|white/i.test(s)) return '#e8f4ff';
        if (/wood|plank/i.test(s)) return '#b8987a'; if (/tile|steel|plate|grate|metal/i.test(s)) return '#c4c9ce';
        return '#cfc8bc';
    },
    rnd(a, b) { return a + Math.random() * (b - a); },

    // ---------------------------------------------------------------------------------------------
    // События
    // ---------------------------------------------------------------------------------------------
    /** Событие игры. Каждый обработчик — свой характер: направление, ритм, затухание. */
    event(name, d) {
        if (!this.inited) return;
        d = d || {};
        const H = this.EV[name]; if (!H) return;
        if (d.x != null && !this.near(d)) return;
        H.call(this, d);
    },

    EV: {
        // --- монеты: золотые искры с блеском, блик-кольцо уходит вверх ---
        coin(d) {
            if (!this.gate('coin', 50)) return;
            const P = this.at(d, 0);
            this.sparks(P, { n: 12, color: '#ffd24a', color2: '#ff9a1a', speed: [90, 230], life: [0.35, 0.7], size: [9, 14], dir: [[-1, 0.2, -1], [1, 1.4, 1]], g: -260 });
            this.mk({ tex: 'glint', burst: 2, life: [0.28, 0.4], size: [34, 50], speed: [0, 8], position: P, spin: [-2, 2], color: '#fff4c0', sizeGradient: [[0, 0.2], [0.3, 1], [1, 0]], colorGradient: [[0, '#ffffff', 1], [0.4, '#ffe27a', 0.9], [1, '#ffb030', 0]] });
            this.pulse(P, { color: '#ffd24a', size: [80, 80], up: 90, life: [0.38, 0.38] });
            this.stars([P[0], P[1] + 20, P[2]], { n: 3, color: '#ffe68a', size: [12, 20], speed: [30, 70], dir: [[-0.4, 1, -0.4], [0.4, 1.4, 0.4]], g: 20, life: [0.5, 0.8] });
        },
        coins10(d) {
            this.EV.coin.call(this, d);
            const P = this.at(d, 0);
            this.sparks(P, { n: 22, color: '#ffe27a', color2: '#ff8f10', speed: [140, 330], life: [0.45, 0.9], size: [10, 16], dir: [[-1, 0.3, -1], [1, 1.5, 1]], g: -300 });
            this.pulse(P, { color: '#ffe27a', size: [140, 140], up: 60, life: [0.5, 0.5], delay: 0.08 });
            this.flash(P, { color: '#ffd24a', size: [120, 140], life: [0.25, 0.35], alpha: 0.6 });
            this.stars([P[0], P[1] + 30, P[2]], { n: 5, size: [18, 30], speed: [60, 130], delay: 0.05, life: [0.6, 1] });
        },
        // --- прыжок и приземление: пыль из-под ног ---
        jump(d) {
            const P = this.at(d, 4), H = this.hero();
            const col = this.dustColor(H ? H.surface : '');
            if (!col) { this.splash(P, 0.4); return; }
            this.puffs(P, { n: 5, color: col, size: [14, 24], speed: [40, 85], life: [0.35, 0.65], alpha: 0.5, radial: { up: 0.18 }, grow: [[0, 0.5], [1, 1.9]] });
        },
        land(d) {
            const s = d.speed || 0; if (s < 3.5) return;
            const k = Math.min(1, (s - 3.5) / 13), P = this.at(d, 4), H = this.hero();
            const col = this.dustColor(d.surface || (H && H.surface));
            if (!col) { this.splash(P, 0.5 + k); return; }
            this.puffs(P, { n: 6 + Math.round(k * 12), color: col, size: [18, 34 + k * 26], speed: [70 + k * 70, 140 + k * 200], life: [0.45, 0.9 + k * 0.4], alpha: 0.55, radial: { up: 0.14 }, grow: [[0, 0.5], [1, 2.1]] });
            if (k > 0.25) this.ringFloor(P, { color: '#e9e2d4', r0: 30, r1: 90 + k * 160, life: 0.45, alpha: 0.35 + k * 0.3 });
            if (k > 0.55) this.sparks(P, { n: 6, color: '#fff2c0', color2: '#c8a060', speed: [120, 260], size: [6, 10], dir: [[-1, 0.6, -1], [1, 1.2, 1]], life: [0.25, 0.45] });
            if (s > 13) this.shake(160, 0.006 + k * 0.008);
        },
        step(d) {
            const s = d.speed || 0; if (s < 2.5 || Math.random() < 0.45 || !this.gate('step', 90)) return;
            const P = this.at(d, 3), col = this.dustColor(d.surface);
            if (!col) { this.mk({ tex: 'drop', burst: 3, life: [0.25, 0.45], size: [5, 8], speed: [60, 130], position: P, direction: [[-0.5, 1, -0.5], [0.5, 1.6, 0.5]], gravity: [0, -520, 0], color: '#bfe8ff', alpha: 0.85, colorGradient: [[0, '#ffffff', 0.9], [1, '#7fc8ff', 0]] }); return; }
            this.puffs(P, { n: 2, color: col, size: [9, 15], speed: [20, 45], life: [0.3, 0.5], alpha: 0.32, radial: { up: 0.25 }, grow: [[0, 0.6], [1, 1.6]] });
        },
        thud(d) {
            const s = d.speed || 0, P = this.at(d, 6);
            this.puffs(P, { n: 8, color: '#cfc8bc', size: [20, 40], speed: [60, 150], life: [0.5, 0.9], radial: { up: 0.2 } });
            if (s > 5) this.stars([P[0], P[1] + 150, P[2]], { n: 4, color: '#ffe46a', size: [14, 22], speed: [10, 30], dir: [[-1, 0.2, -1], [1, 0.4, 1]], g: 0, life: [0.7, 1.1] });
            this.shake(130, 0.007);
        },
        // --- смерть по причинам ---
        death(d) {
            const P = this.at(d, 70), c = d.cause || '', base = this.at(d, 10);
            const ex = this.DEATH[c] || this.DEATH.default;
            ex.call(this, P, base);
            if (c !== 'void' && c !== 'caught') this.shake(200, 0.012);
        },
        respawn(d) {
            const P = this.at(d, 0);
            this.column(P, { color: '#bfe8ff', h: 340, w: 110, life: 0.95 });
            this.ringFloor(P, { color: '#9fe0ff', r0: 20, r1: 190, life: 0.6, alpha: 0.9 });
            this.ringFloor(P, { color: '#ffffff', r0: 10, r1: 130, life: 0.45, alpha: 0.7, tex: 'ring' });
            this.mk({ tex: 'spark', burst: 28, life: [0.6, 1.1], size: [5, 9], speed: [60, 190], position: [P[0], P[1] + 4, P[2]], direction: [[-0.5, 1, -0.5], [0.5, 2.2, 0.5]], gravity: [0, 30, 0], box: [[-40, 0, -40], [40, 20, 40]],
                color: '#bfe8ff', colorGradient: [[0, '#ffffff', 1], [0.4, '#9fe0ff', 0.9], [1, '#4aa8ff', 0]] });
            this.stars([P[0], P[1] + 60, P[2]], { n: 4, color: '#dff4ff', size: [16, 26], speed: [30, 80], dir: [[-0.5, 1, -0.5], [0.5, 1.6, 0.5]], g: 40, delay: 0.1, life: [0.6, 1] });
        },
        checkpoint(d) {
            const P = this.at(d, 4);
            this.sparks(P, { n: 38, color: '#6dff8a', color2: '#1fb04a', speed: [260, 470], life: [0.6, 1.1], size: [10, 16], dir: [[-0.35, 1, -0.35], [0.35, 1.5, 0.35]], g: -520, box: null });
            this.ringFloor(P, { color: '#7dff9a', r0: 30, r1: 220, life: 0.65, alpha: 0.9 });
            this.pulse([P[0], P[1] + 30, P[2]], { color: '#7dff9a', size: [150, 150], up: 120, life: [0.5, 0.5] });
            this.mk({ tex: 'glint', burst: 3, life: [0.4, 0.6], size: [40, 60], speed: [0, 30], position: [P[0], P[1] + 90, P[2]], direction: [[-1, 1, -1], [1, 1, 1]], spin: [-1.5, 1.5], color: '#cfffd8', sizeGradient: [[0, 0.2], [0.3, 1], [1, 0]], colorGradient: [[0, '#ffffff', 1], [1, '#4aff7a', 0]] });
            this.stars([P[0], P[1] + 20, P[2]], { n: 6, color: '#b8ffc8', size: [14, 22], speed: [40, 100], dir: [[-0.6, 1, -0.6], [0.6, 1.8, 0.6]], g: -20, life: [0.7, 1.2] });
        },
        // --- рубильники и механизмы ---
        switch(d) {
            const P = this.at(d, 70), fuse = d.kind === 'fuse';
            this.sparks(P, { n: fuse ? 22 : 9, color: fuse ? '#9fd8ff' : '#ffe9a0', color2: fuse ? '#3a7aff' : '#ffa030', speed: [120, 320], life: [0.2, 0.45], size: [8, 12], g: -400 });
            this.mk({ tex: 'glint', burst: 1, life: [0.2, 0.3], size: [fuse ? 110 : 70, fuse ? 130 : 80], speed: [0, 0], position: P, color: fuse ? '#bfe4ff' : '#fff0c0', sizeGradient: [[0, 0.3], [0.3, 1], [1, 0.4]], colorGradient: [[0, '#ffffff', 1], [1, fuse ? '#4a8aff' : '#ffb030', 0]] });
            if (fuse) {
                this.mk({ tex: 'arc', burst: 4, life: [0.1, 0.22], size: [60, 100], speed: [0, 10], position: P, spin: [-6, 6], color: '#cfe8ff', colorGradient: [[0, '#ffffff', 1], [1, '#5a9cff', 0]] });
                this.puffs([P[0], P[1] + 10, P[2]], { n: 5, color: '#4a4c52', size: [18, 30], speed: [15, 40], life: [0.9, 1.5], alpha: 0.5, dir: [[-0.4, 0.8, -0.4], [0.4, 1.4, 0.4]], g: 12, delay: 0.1, grow: [[0, 0.5], [1, 2.2]] });
            }
        },
        mech(d) {
            if (!this.gate('mech' + (d.g || ''), 220)) return;
            const P = this.at(d, 20);
            this.puffs(P, { n: 5, color: '#bdb6aa', size: [18, 32], speed: [25, 70], life: [0.5, 0.9], alpha: 0.4, radial: { up: 0.2 } });
            if (d.on !== false) this.sparks(P, { n: 5, speed: [80, 200], size: [6, 9], life: [0.2, 0.4], dir: [[-1, 0.2, -1], [1, 0.9, 1]], g: -500 });
        },
        // --- награды и косметика ---
        chest(d) {
            const P = this.at(d, 50);
            this.sparks(P, { n: 30, color: '#ffd24a', color2: '#ff9a1a', speed: [220, 520], life: [0.7, 1.3], size: [10, 16], dir: [[-0.8, 0.9, -0.8], [0.8, 1.6, 0.8]], g: -520 });
            this.stars(P, { n: 12, color: '#fff2a0', size: [20, 38], speed: [120, 300], dir: [[-1, 0.6, -1], [1, 1.6, 1]], g: -260, life: [0.8, 1.4] });
            this.mk({ tex: 'confetti', burst: 14, life: [0.9, 1.5], size: [10, 16], speed: [140, 320], position: P, direction: [[-1, 0.7, -1], [1, 1.6, 1]], gravity: [0, -380, 0], spin: [-5, 5],
                color: '#ffd24a', color2: '#ffffff', sheet: { width: 128, height: 128, start: 0, end: 15, speed: 0.3, loop: true, randomStart: true }, colorGradient: [[0, '#ffe27a', 1], [0.8, '#ffc030', 1], [1, '#ffc030', 0]] });
            this.flash(P, { color: '#ffe27a', size: [220, 260], life: [0.3, 0.45], alpha: 0.7 });
            this.pulse(P, { color: '#ffe27a', size: [220, 220], life: [0.55, 0.55] });
            this.shake(120, 0.005);
        },
        buy(d) { this.heroSparkle('#ffd24a', '#ffffff', true); },
        equip(d) { this.heroSparkle('#9fe8ff', '#ffffff', false); },
        uniform(d) {
            const H = this.hero(); if (!H) return; const P = [H.x, H.h + 85, H.y];
            this.puffs(P, { n: 16, color: '#e9eef5', color2: '#c8d4e4', size: [34, 56], speed: [50, 130], life: [0.6, 1.1], alpha: 0.7, box: [[-30, -60, -30], [30, 60, 30]], dir: [[-1, -0.1, -1], [1, 0.7, 1]], grow: [[0, 0.5], [1, 1.9]] });
            this.stars(P, { n: 6, color: '#bfe0ff', size: [16, 26], speed: [60, 130], dir: [[-1, 0.2, -1], [1, 1, 1]], g: -30, delay: 0.05 });
        },
        disguiseLost(d) {
            const H = this.hero(); if (!H) return; const P = [H.x, H.h + 85, H.y];
            this.puffs(P, { n: 14, color: '#9aa0aa', color2: '#6d727c', size: [30, 50], speed: [50, 120], life: [0.6, 1], alpha: 0.65, box: [[-30, -60, -30], [30, 60, 30]], grow: [[0, 0.5], [1, 1.9]] });
            this.mk({ tex: 'excl', burst: 1, life: [0.9, 0.9], size: [46, 46], speed: [40, 40], position: [P[0], P[1] + 70, P[2]], direction: [[0, 1, 0], [0, 1, 0]], color: '#ffffff', sizeGradient: [[0, 0.3], [0.2, 1.1], [0.35, 1], [1, 1]], colorGradient: [[0, '#ffffff', 1], [0.7, '#ffffff', 1], [1, '#ffffff', 0]] });
        },
        jetpackPick(d) { this.heroSparkle('#ff9a3a', '#fff2c0', true); const H = this.hero(); if (H) this.ringFloor([H.x, H.h + 6, H.y], { color: '#ffa040', r0: 30, r1: 170, life: 0.6 }); },
        superjump(d) {
            const H = this.hero(); if (!H) return; const self = this, t0 = this.time;
            for (const off of [0, Math.PI]) {
                this.mk({ tex: 'spark', rate: 70, life: [0.5, 0.8], size: [8, 13], speed: [0, 6], direction: [[0, 0.4, 0], [0, 1, 0]], gravity: [0, 40, 0], duration: 0.9, position: [H.x, H.h, H.y],
                    follow: () => { const h = self.hero(), a = (self.time - t0) * 11 + off, k = Math.min(1, (self.time - t0) / 0.9); return h ? [h.x + Math.cos(a) * 44, h.h + 10 + k * 190, h.y + Math.sin(a) * 44] : [0, 0, 0]; },
                    color: '#7dff9a', colorGradient: [[0, '#ffffff', 1], [0.4, '#7dff9a', 0.9], [1, '#22c04a', 0]] });
            }
            this.ringFloor([H.x, H.h + 4, H.y], { color: '#7dff9a', r0: 20, r1: 150, life: 0.5 });
            this.stars([H.x, H.h + 90, H.y], { n: 4, color: '#b8ffc8', size: [16, 26], speed: [40, 90], delay: 0.15 });
        },
        bounce(d) {
            const P = this.at(d, 6);
            this.ringFloor(P, { color: '#ffd0ff', r0: 30, r1: 140, life: 0.4, alpha: 0.8 });
            this.pulse([P[0], P[1] + 20, P[2]], { color: '#ffb8ff', size: [110, 110], up: 160, life: [0.4, 0.4] });
            this.puffs(P, { n: 6, color: '#e8e0f0', size: [16, 28], speed: [50, 110], life: [0.35, 0.6], alpha: 0.5, radial: { up: 0.15 } });
            this.stars([P[0], P[1] + 10, P[2]], { n: 4, color: '#ffe0ff', size: [14, 22], speed: [80, 170], dir: [[-0.5, 1, -0.5], [0.5, 1.6, 0.5]], g: -200 });
        },
        boost(d) {
            const H = this.hero(), P = this.at(d, 10), a = H ? H.heading : 0;
            const bx = -Math.cos(a), bz = -Math.sin(a);
            this.sparks(P, { n: 12, color: '#ffc050', color2: '#ff6a10', speed: [160, 340], life: [0.3, 0.55], size: [10, 16], dir: [[bx * 0.9 - 0.2, 0.1, bz * 0.9 - 0.2], [bx * 0.9 + 0.2, 0.6, bz * 0.9 + 0.2]], g: -200 });
        },
        trapSnap(d) {
            const P = this.at(d, 14);
            this.sparks(P, { n: 18, color: '#fff0c0', color2: '#c9d0d6', speed: [200, 460], life: [0.25, 0.5], size: [8, 13], dir: [[-1, 0.3, -1], [1, 1.2, 1]], g: -700 });
            this.puffs(P, { n: 5, color: '#b6afa4', size: [16, 28], speed: [40, 90], life: [0.4, 0.7], radial: { up: 0.25 } });
            this.mk({ tex: 'glint', burst: 1, life: [0.15, 0.22], size: [70, 80], speed: [0, 0], position: P, color: '#ffffff', sizeGradient: [[0, 0.3], [0.3, 1], [1, 0.3]], colorGradient: [[0, '#ffffff', 1], [1, '#ffd070', 0]] });
        },
        saw(d) {
            if (!this.gate('saw', 70)) return;
            const P = this.at(d, 30);
            this.sparks(P, { n: 20, color: '#fff2c0', color2: '#ff8a20', speed: [260, 560], life: [0.25, 0.55], size: [8, 13], dir: [[-1, 0.5, -1], [1, 1.6, 1]], g: -900 });
        },
        crusher(d) {
            const P = this.at(d, 8);
            this.puffs(P, { n: 18, color: '#b9b1a4', color2: '#8c867c', size: [26, 50], speed: [120, 300], life: [0.6, 1.2], alpha: 0.7, radial: { up: 0.16 }, grow: [[0, 0.5], [1, 2.3]] });
            this.ringFloor(P, { color: '#e9e2d4', r0: 40, r1: 300, life: 0.55, alpha: 0.6 });
            this.mk({ tex: 'drop', burst: 14, life: [0.5, 0.9], size: [5, 11], speed: [150, 420], position: P, direction: [[-1, 0.6, -1], [1, 1.5, 1]], gravity: [0, -900, 0], spin: [-6, 6],
                color: '#6a6e74', color2: '#9aa0a6', blend: 'standard', colorGradient: [[0, '#8a8f95', 1], [0.8, '#5c6066', 1], [1, '#5c6066', 0]] });
            this.sparks(P, { n: 8, speed: [150, 380], size: [8, 12], life: [0.2, 0.4], g: -700 });
        },
        laser(d) {
            const P = this.at(d, 60);
            this.sparks(P, { n: 10, color: '#ff8a80', color2: '#d01818', speed: [100, 260], life: [0.2, 0.4], size: [8, 12], g: -300 });
            this.flash(P, { color: '#ff4a3a', size: [90, 110], alpha: 0.6 });
        },
        spotted(d) {
            const P = this.at(d, 200);
            this.mk({ tex: 'excl', burst: 1, life: [1.0, 1.0], size: [58, 58], speed: [50, 50], position: P, direction: [[0, 1, 0], [0, 1, 0]], color: '#ffffff',
                sizeGradient: [[0, 0.2], [0.15, 1.25], [0.3, 1], [1, 1]], colorGradient: [[0, '#ffffff', 1], [0.75, '#ffffff', 1], [1, '#ffffff', 0]] });
            this.flash(P, { color: '#ff3a2a', size: [150, 170], life: [0.4, 0.6], alpha: 0.55 });
            this.pulse(P, { color: '#ff4a3a', size: [160, 160], life: [0.45, 0.45] });
        },
        caught(d) {
            const H = this.hero(), P = this.at(d, 100);
            this.stars(P, { n: 8, color: '#ffe46a', size: [20, 30], speed: [60, 110], dir: [[-1, 0.2, -1], [1, 0.6, 1]], g: 0, life: [0.8, 1.2] });
            this.flash(P, { color: '#ff3a2a', size: [200, 240], life: [0.3, 0.5], alpha: 0.4 });
            if (H) this.shake(160, 0.009);
        },
        finish(d) {
            const H = this.hero(); const P = this.at(d.x != null ? d : (H ? { x: H.x, y: H.y, h: H.h } : {}), 0);
            const pals = [['#ff4a6a', '#ffd24a'], ['#4ae0ff', '#7dff9a'], ['#b46aff', '#ff9ad5'], ['#ffd24a', '#ffffff']];
            pals.forEach((p, i) => this.mk({ tex: 'confetti', burst: 22, life: [1.8, 3.2], size: [9, 15], speed: [30, 160], position: [P[0], P[1] + 380, P[2]], box: [[-260, 0, -260], [260, 60, 260]],
                direction: [[-0.6, -0.1, -0.6], [0.6, 0.8, 0.6]], gravity: [0, -150, 0], spin: [-5, 5], delay: i * 0.12, color: p[0], color2: p[1],
                sheet: { width: 128, height: 128, start: 0, end: 15, speed: 0.4, loop: true, randomStart: true }, colorGradient: [[0, p[0], 1], [0.5, p[1], 1], [0.9, p[0], 0.9], [1, p[0], 0]] }));
            const cols = [['#ff5a7a', '#ffd0d8'], ['#5ae8ff', '#d0f8ff'], ['#ffd24a', '#fff2c0'], ['#8aff8a', '#d8ffd8'], ['#c07aff', '#ecd8ff']];
            for (let i = 0; i < 5; i++) {
                const c = cols[i % cols.length], ang = this.rnd(0, 6.28), r = this.rnd(120, 340);
                const sp = [P[0] + Math.cos(ang) * r, P[1] + this.rnd(330, 520), P[2] + Math.sin(ang) * r], dl = 0.15 + i * 0.4;
                this.mk({ tex: 'spark', burst: 46, life: [0.9, 1.5], size: [8, 13], speed: [150, 260], position: sp, ring: true, gravity: [0, -150, 0], delay: dl, color: c[0], color2: c[1],
                    colorGradient: [[0, '#ffffff', 1], [0.25, c[1], 1], [0.6, c[0], 0.9], [1, c[0], 0]] });
                this.flash(sp, { color: c[0], size: [200, 240], life: [0.2, 0.3], alpha: 0.6, delay: dl });
            }
            this.ringFloor([P[0], P[1] + 4, P[2]], { color: '#ffe27a', r0: 40, r1: 360, life: 0.9, alpha: 0.8 });
        },
        levelStart(d) {
            const H = this.hero(); if (!H) return; const P = [H.x, H.h + 4, H.y];
            this.ringFloor(P, { color: '#bfe8ff', r0: 20, r1: 150, life: 0.7, alpha: 0.6 });
            this.mk({ tex: 'spark', burst: 14, life: [0.8, 1.4], size: [5, 8], speed: [20, 70], position: P, box: [[-60, 0, -60], [60, 60, 60]], direction: [[-0.3, 1, -0.3], [0.3, 1.6, 0.3]], color: '#dff4ff', colorGradient: [[0, '#ffffff', 0.9], [1, '#9fd0ff', 0]] });
        },
        key(d) {
            const P = this.at(d, 40);
            this.sparks(P, { n: 12, color: '#7ac4ff', color2: '#2a6aff', speed: [100, 260], life: [0.4, 0.7], size: [8, 12], g: -200, dir: [[-1, 0.2, -1], [1, 1.2, 1]] });
            this.mk({ tex: 'glint', burst: 2, life: [0.3, 0.45], size: [50, 70], speed: [0, 8], position: P, spin: [-2, 2], color: '#cfe8ff', sizeGradient: [[0, 0.2], [0.3, 1], [1, 0]], colorGradient: [[0, '#ffffff', 1], [1, '#4a9aff', 0]] });
        },
        unlock(d) {
            const P = this.at(d, 80);
            this.sparks(P, { n: 20, color: '#8aff9a', color2: '#ffd24a', speed: [140, 360], life: [0.5, 0.9], size: [10, 15], g: -300, dir: [[-1, 0.2, -1], [1, 1.3, 1]] });
            this.pulse(P, { color: '#ffe27a', size: [170, 170], life: [0.5, 0.5] });
            this.puffs([P[0], P[1] - 40, P[2]], { n: 6, color: '#d8d0c4', size: [24, 40], speed: [30, 70], life: [0.5, 0.9], alpha: 0.4, radial: { up: 0.2 } });
        },
        ragdoll(d) {
            const H = this.hero(); if (!H) return;
            this.puffs([H.x, H.h + 10, H.y], { n: 5, color: '#cfc8bc', size: [18, 30], speed: [40, 100], life: [0.4, 0.7], radial: { up: 0.2 }, alpha: 0.45 });
        },
        // --- пар: труба включилась / выключилась ---
        steam(d) {
            const key = Math.round(d.x) + ':' + Math.round(d.y);
            const cur = this.steams.get(key);
            if (!d.on) { if (cur) { for (const h of cur) h.stop(); this.steams.delete(key); } return; }
            if (cur || !this.near(d, 2200)) return;
            const P = this.at(d, 0), hs = [];
            const yaw = d.yaw || 0;
            // пар бьёт вверх с лёгким наклоном по курсу трубы
            const lx = Math.cos(yaw) * 0.0, lz = Math.sin(yaw) * 0.0;
            hs.push(this.mk({ tex: 'steam', blend: 'standard', rate: 34, life: [0.9, 1.6], size: [26, 46], speed: [150, 290], position: P, direction: [[-0.18 + lx, 1, -0.18 + lz], [0.18 + lx, 1, 0.18 + lz]], gravity: [0, 12, 0], spin: [-1, 1],
                color: '#f4f8ff', alpha: 0.55, sizeGradient: [[0, 0.5], [0.5, 1.4], [1, 2.6]], colorGradient: [[0, '#ffffff', 0.55], [0.5, '#e8f0f8', 0.38], [1, '#dce6ee', 0]] }));
            hs.push(this.mk({ tex: 'soft', rate: 14, life: [0.12, 0.25], size: [50, 70], speed: [0, 20], position: P, color: '#dff0ff', alpha: 0.25, colorGradient: [[0, '#ffffff', 0.3], [1, '#aad4ff', 0]] }));
            this.steams.set(key, hs.filter(Boolean));
        },
    },

    /** Блики на герое (покупка / экипировка). */
    heroSparkle(c1, c2, coins) {
        const H = this.hero(); if (!H) return;
        const P = [H.x, H.h + 10, H.y];
        this.mk({ tex: 'star', burst: coins ? 18 : 14, life: [0.6, 1.1], size: [16, 28], speed: [20, 70], position: P, box: [[-36, 0, -36], [36, 170, 36]], direction: [[-0.3, 0.6, -0.3], [0.3, 1.3, 0.3]], gravity: [0, 20, 0], spin: [-3, 3],
            color: c1, sizeGradient: [[0, 0.1], [0.3, 1], [1, 0]], colorGradient: [[0, '#ffffff', 1], [0.35, c1, 1], [1, c2, 0]] });
        this.mk({ tex: 'glint', burst: 4, life: [0.35, 0.55], size: [40, 62], speed: [0, 8], position: P, box: [[-30, 20, -30], [30, 160, 30]], spin: [-2, 2], color: c2, sizeGradient: [[0, 0.2], [0.3, 1], [1, 0]], colorGradient: [[0, '#ffffff', 1], [1, c1, 0]], delay: 0.05 });
        if (coins) this.sparks(P, { n: 10, color: c1, color2: '#ff9a1a', speed: [80, 200], life: [0.4, 0.8], g: -200, size: [8, 12] });
        this.ringFloor([P[0], P[1] - 4, P[2]], { color: c1, r0: 25, r1: 120, life: 0.5, alpha: 0.7 });
    },

    /** Брызги на воде (посадка, смерть в воде). */
    splash(P, k) {
        this.mk({ tex: 'splash', burst: Math.round(14 + 14 * k), life: [0.45, 0.85], size: [9, 18], speed: [100, 260 + 100 * k], position: P, direction: [[-0.5, 1, -0.5], [0.5, 1.8, 0.5]], gravity: [0, -700, 0],
            color: '#cfeaff', alpha: 0.95, colorGradient: [[0, '#ffffff', 0.95], [0.7, '#9fd0ff', 0.8], [1, '#7ab8ff', 0]] });
        this.puffs(P, { n: 5, tex: 'smoke', color: '#e8f4ff', size: [20, 36], speed: [40, 90], life: [0.4, 0.7], alpha: 0.5, radial: { up: 0.3 } });
        this.ringFloor(P, { color: '#cfeaff', r0: 20, r1: 110 + 80 * k, life: 0.6, alpha: 0.7 });
    },

    /** Смерть по причине: P — центр тела, B — под ногами. */
    DEATH: {
        lava(P, B) {
            this.mk({ tex: 'ember', burst: 40, life: [0.8, 1.6], size: [6, 12], speed: [120, 420], position: B, direction: [[-0.6, 1, -0.6], [0.6, 2, 0.6]], gravity: [0, -180, 0],
                color: '#ff9a2a', colorGradient: [[0, '#ffffff', 1], [0.2, '#ffd060', 1], [0.6, '#ff6a10', 0.9], [1, '#a01800', 0]] });
            this.mk({ tex: 'flame', sheet: { width: 128, height: 128, start: 0, end: 15, speed: 0.6, loop: false }, burst: 6, life: [0.5, 0.8], size: [60, 100], speed: [20, 80], position: B, direction: [[-0.3, 1, -0.3], [0.3, 1.6, 0.3]],
                color: '#ffb040', colorGradient: [[0, '#ffe8a0', 1], [0.5, '#ff7a20', 0.8], [1, '#802000', 0]], sizeGradient: [[0, 0.6], [0.5, 1.2], [1, 0.8]] });
            this.flash(B, { color: '#ff7a20', size: [220, 280], life: [0.4, 0.6], alpha: 0.8 });
            this.puffs(B, { n: 12, color: '#2a2624', color2: '#4a4440', size: [30, 56], speed: [30, 90], life: [1.2, 2.2], alpha: 0.7, dir: [[-0.4, 0.8, -0.4], [0.4, 1.6, 0.4]], g: 18, delay: 0.1, grow: [[0, 0.5], [1, 2.6]] });
        },
        zap(P) {
            this.mk({ tex: 'arc', burst: 7, life: [0.12, 0.28], size: [70, 130], speed: [0, 20], position: P, box: [[-40, -60, -40], [40, 60, 40]], spin: [-8, 8], color: '#cfe8ff',
                colorGradient: [[0, '#ffffff', 1], [0.6, '#8ac4ff', 0.9], [1, '#3a7aff', 0]] });
            this.sparks(P, { n: 30, color: '#a8dcff', color2: '#2a6aff', speed: [180, 480], life: [0.25, 0.6], size: [8, 14], g: -300, dir: [[-1, -0.4, -1], [1, 1.2, 1]] });
            this.flash(P, { color: '#7ab8ff', size: [240, 300], life: [0.18, 0.3], alpha: 0.9 });
            this.mk({ tex: 'arc', burst: 4, life: [0.1, 0.2], size: [90, 150], speed: [0, 10], position: P, delay: 0.12, spin: [-8, 8], color: '#ffffff', colorGradient: [[0, '#ffffff', 1], [1, '#5a9cff', 0]] });
        },
        spikes(P) { this.DEATH.metal.call(this, P, 1); },
        saw(P) { this.DEATH.metal.call(this, P, 1.3); },
        trap(P) { this.DEATH.metal.call(this, P, 0.9); },
        metal(P, k) {
            this.sparks(P, { n: Math.round(24 * k), color: '#fff2c0', color2: '#ff8a20', speed: [200, 560], life: [0.25, 0.6], size: [9, 15], g: -800, dir: [[-1, -0.2, -1], [1, 1.5, 1]] });
            this.flash(P, { color: '#ffd070', size: [120, 150], life: [0.15, 0.25], alpha: 0.7 });
            this.puffs(P, { n: 5, color: '#a9a39a', size: [18, 30], speed: [30, 80], life: [0.5, 0.9], alpha: 0.4, radial: { up: 0.3 } });
        },
        laser(P) {
            this.sparks(P, { n: 24, color: '#ff9a8a', color2: '#d01010', speed: [160, 420], life: [0.3, 0.6], size: [9, 14], g: -300, dir: [[-1, -0.3, -1], [1, 1.3, 1]] });
            this.flash(P, { color: '#ff3a2a', size: [200, 240], life: [0.2, 0.35], alpha: 0.8 });
            this.puffs(P, { n: 5, color: '#3a2a28', size: [20, 34], speed: [20, 60], life: [0.8, 1.4], alpha: 0.5, g: 12, delay: 0.1 });
        },
        crusher(P, B) {
            this.puffs(B, { n: 18, color: '#b9b1a4', color2: '#8c867c', size: [26, 50], speed: [120, 300], life: [0.6, 1.2], alpha: 0.7, radial: { up: 0.16 } });
            this.DEATH.metal.call(this, P, 0.7);
            this.ringFloor(B, { color: '#e9e2d4', r0: 40, r1: 280, life: 0.55, alpha: 0.6 });
        },
        steam(P, B) {
            this.puffs(P, { tex: 'steam', n: 18, color: '#f4f8ff', color2: '#dce6ee', size: [40, 70], speed: [40, 130], life: [0.8, 1.5], alpha: 0.7, dir: [[-0.8, 0.2, -0.8], [0.8, 1.2, 0.8]], g: 20, box: [[-30, -50, -30], [30, 50, 30]], grow: [[0, 0.5], [1, 2.2]] });
            this.mk({ tex: 'drop', burst: 8, life: [0.4, 0.7], size: [5, 8], speed: [60, 160], position: P, direction: [[-0.6, 0.6, -0.6], [0.6, 1.3, 0.6]], gravity: [0, -500, 0], color: '#ffd8c0', colorGradient: [[0, '#ffffff', 0.9], [1, '#ffa070', 0]] });
        },
        water(P, B) { this.splash([B[0], B[1], B[2]], 1.2); },
        caught(P) {
            this.stars(P, { n: 8, color: '#ffe46a', size: [20, 30], speed: [60, 110], dir: [[-1, 0.2, -1], [1, 0.6, 1]], g: 0, life: [0.8, 1.2] });
        },
        void() { /* падение в бездну — без вспышек, экран сам темнеет */ },
        default(P) {
            this.puffs(P, { n: 10, color: '#e6e0d6', size: [26, 44], speed: [60, 150], life: [0.5, 0.9], alpha: 0.7, box: [[-20, -40, -20], [20, 40, 20]], grow: [[0, 0.5], [1, 2]] });
            this.stars(P, { n: 6, color: '#ffe46a', size: [18, 28], speed: [60, 140], dir: [[-1, 0.2, -1], [1, 1.2, 1]], g: -80 });
        },
    },

    // ---------------------------------------------------------------------------------------------
    // Джетпак: пламя сопел, следует за ними каждый кадр, плавно гаснет
    // ---------------------------------------------------------------------------------------------
    jet(on, nozzles, dir) {
        if (!this.inited) return;
        const J = this.J;
        if (on && nozzles && nozzles.length) {
            J.noz = nozzles; J.dir = dir || [0, -1, 0];
            if (J.hs) return;
            J.hs = [];
            const dn = J.dir, spread = 0.12;
            const D = [[dn[0] - spread, dn[1], dn[2] - spread], [dn[0] + spread, dn[1], dn[2] + spread]];
            const mid = () => { const n = J.noz; if (!n.length) return [0, 0, 0]; let x = 0, y = 0, z = 0; for (const p of n) { x += p.x; y += p.y; z += p.z; } return [x / n.length, y / n.length, z / n.length]; };
            const sheet = this.cell('flame');
            for (let i = 0; i < Math.min(2, nozzles.length); i++) {
                const f = () => J.noz[i] || J.noz[0];
                if (sheet) J.hs.push(this.mk({ tex: 'flame', sheet: { width: 128, height: 128, start: 0, end: 15, speed: 1.2, loop: true, randomStart: true }, rate: 48, life: [0.1, 0.18], size: [30, 40], speed: [320, 420], follow: f, direction: D, color: '#ffffff', sizeGradient: [[0, 0.7], [1, 1.1]], colorGradient: [[0, '#ffffff', 1], [0.6, '#ffb060', 0.8], [1, '#ff4010', 0]] }));
                else {
                    J.hs.push(this.mk({ tex: 'ember', rate: 95, life: [0.1, 0.18], size: [26, 34], speed: [320, 420], follow: f, direction: D, color: '#ff8a30', sizeGradient: [[0, 1], [0.5, 0.75], [1, 0.2]], colorGradient: [[0, '#ffe6b0', 0.95], [0.4, '#ff9a30', 0.85], [1, '#d02a00', 0]] }));
                    J.hs.push(this.mk({ tex: 'ember', rate: 90, life: [0.05, 0.1], size: [14, 20], speed: [340, 440], follow: f, direction: D, color: '#ffffff', sizeGradient: [[0, 1], [1, 0.3]], colorGradient: [[0, '#ffffff', 1], [0.5, '#fff0b8', 0.9], [1, '#ffb040', 0]] }));
                }
            }
            J.hs.push(this.mk({ tex: 'smoke', blend: 'standard', rate: 26, life: [0.6, 1.1], size: [10, 18], speed: [60, 130], follow: mid, direction: [[-0.3, -1, -0.3], [0.3, -0.6, 0.3]], gravity: [0, 25, 0], spin: [-1, 1], color: '#c8c8cc', alpha: 0.4,
                sizeGradient: [[0, 0.6], [1, 2.8]], colorGradient: [[0, '#d8d8dc', 0.4], [0.5, '#9a9aa0', 0.25], [1, '#6a6a70', 0]] }));
            J.hs.push(this.mk({ tex: 'streak', stretch: true, rate: 16, life: [0.25, 0.5], size: [7, 11], speed: [140, 260], follow: mid, direction: [[-0.6, -1, -0.6], [0.6, -0.4, 0.6]], gravity: [0, -300, 0], color: '#ffcf70',
                colorGradient: [[0, '#ffffff', 1], [0.4, '#ffc050', 1], [1, '#ff6a10', 0]] }));
            J.hs = J.hs.filter(Boolean);
        } else if (J.hs) {
            for (const h of J.hs) h.stop();   // дожигает хвост и гаснет сам
            J.hs = null;
        }
    },

    // ---------------------------------------------------------------------------------------------
    // Уровень: очистка и атмосфера
    // ---------------------------------------------------------------------------------------------
    /** Убрать всё прошлое: зоны, временные меши, системы-ссылки. */
    clearLevel() {
        for (const z of this.zones) { try { z.off && z.active && z.off(); if (z.dispose) z.dispose(); } catch (e) { /* уже */ } }
        this.zones = [];
        for (const t of this.temps) { try { t.mesh.dispose(); } catch (e) { /* уже */ } }
        this.temps = [];
        for (const h of this.held) { try { h.dispose(); } catch (e) { /* уже */ } }
        this.held = [];
        for (const hs of this.steams.values()) for (const h of hs) { try { h.dispose(); } catch (e) { /* уже */ } }
        this.steams.clear();
        if (this.J.hs) { for (const h of this.J.hs) { try { h.dispose(); } catch (e) { /* уже */ } } this.J.hs = null; }
        this.motes = null;
    },

    moodOf(L) {
        const env = (L && L.env) || {};
        let n = Number(L && (L.order || (/(\d+)$/.exec(String(L.id || '')) || [])[1])) || 0;
        if (!this.MOODS[n]) n = 1;
        const m = Object.assign({}, this.MOODS[n]);
        if (env.night != null) m.night = !!env.night;
        return m;
    },

    /** Ядро зовёт в prepare нового уровня (после постройки трассы и механик). */
    level(app, L) {
        if (!this.inited) this.init(app);
        if (!this.inited) return;
        this.clearLevel();
        this.L = L || {}; this.mood = this.moodOf(L);
        this.pendingMap = app.location ? app.location.map : null;
        this.zoneClock = 0; this.time = 0;
        this.grade();
        // пылинки в воздухе вокруг героя
        this.addMotes();
        // кусок уровня по трассе: лава, ток, вода
        this.scanPieces();
        // лампы: маркеры light и модели ламп из карты
        const decor = this.pending; this.pending = [];
        this.useDecor(decor);
        this.scanLamps(decor);
        if (this.mood.night) this.addNight();
        this.pendingReady = true;
        this.refreshZones(true);
    },

    /** Декор-маркер от GameMech.addDecor (до или после level()). */
    decor(m) {
        if (!this.inited || !m) return;
        const map = this.app && this.app.location ? this.app.location.map : null;
        if (map !== this.pendingMap) { this.pending = []; this.pendingMap = map; this.pendingReady = false; }
        if (this.pendingReady) { this.useDecor([m]); this.refreshZones(true); }
        else this.pending.push(m);
    },

    // ---- зоны: постоянные эмиттеры, живут только рядом с героем ----
    /** @param {any} z */
    addZone(z) { z.active = false; z.r = z.r || 2200; z.w = z.w == null ? 1 : z.w; this.zones.push(z); return z; },

    refreshZones(force) {
        const H = this.hero(); if (!H) return;
        const cand = [];
        for (const z of this.zones) {
            const dd = z.dist ? z.dist(H.x, H.y) : Math.hypot(z.x - H.x, z.z - H.y);
            z._d = dd;
            if (dd <= z.r) cand.push(z);
        }
        cand.sort((a, b) => a._d - b._d);
        let budget = this.zoneCap();
        const live = new Set();
        for (const z of cand) { if (z.w <= 0 || budget >= z.w) { live.add(z); budget -= z.w; } }
        for (const z of this.zones) {
            const want = live.has(z);
            if (want && !z.active) { z.active = true; try { z.on(); } catch (e) { z.active = false; console.warn('GameFx zone', e); } }
            else if (!want && z.active) { z.active = false; try { z.off(); } catch (e) { /* уже */ } }
        }
    },

    addMotes() {
        const m = this.mood, night = m.night;
        const h = this.mk({ tex: 'soft', rate: night ? 5 : 8, life: [4, 7], size: [1.5, 3.2], speed: [2, 9], box: [[-420, 10, -420], [420, 320, 420]], direction: [[-0.4, -0.15, -0.4], [0.4, 0.3, 0.4]],
            follow: this.heroFollow(0), position: [0, 0, 0], color: m.dust, alpha: 0.5, colorGradient: [[0, m.dust, 0], [0.2, m.dust, night ? 0.35 : 0.55], [0.8, m.dust, night ? 0.35 : 0.55], [1, m.dust, 0]] });
        if (h) { this.held.push(h); this.motes = h; }
        if (m.hot) { // жар: тёплые искорки носит по воздуху
            const e = this.mk({ tex: 'ember', rate: 4, life: [3, 5], size: [2, 3.5], speed: [10, 25], box: [[-450, 0, -450], [450, 260, 450]], direction: [[-0.3, 0.4, -0.3], [0.3, 1, 0.3]], follow: this.heroFollow(0), position: [0, 0, 0],
                color: '#ffa040', colorGradient: [[0, '#ffa040', 0], [0.2, '#ffc060', 0.8], [0.8, '#ff6a20', 0.6], [1, '#ff3010', 0]] });
            if (e) this.held.push(e);
        }
    },

    /** Ночь: светлячки около героя и далёкие звёзды (одна система на ночь, через follow). */
    addNight() {
        const ff = this.mk({ tex: 'soft', rate: 2.6, life: [5, 8], size: [4, 7], speed: [3, 10], box: [[-380, 20, -380], [380, 190, 380]], direction: [[-0.5, -0.1, -0.5], [0.5, 0.25, 0.5]], follow: this.heroFollow(0), position: [0, 0, 0],
            color: '#e8ff9a', colorGradient: [[0, '#e8ff9a', 0], [0.15, '#f4ffb0', 0.9], [0.35, '#e0ff80', 0.2], [0.55, '#f4ffb0', 0.85], [0.8, '#e0ff80', 0.2], [1, '#e8ff9a', 0]] });
        if (ff) this.held.push(ff);
        const st = this.mk({ tex: 'star', rate: 7, life: [6, 10], size: [26, 46], speed: [0, 0.5], box: [[-3200, 2100, -3200], [3200, 3200, 3200]], follow: this.heroFollow(0), position: [0, 0, 0], color: '#dfe8ff',
            colorGradient: [[0, '#ffffff', 0], [0.25, '#dfe8ff', 0.8], [0.55, '#ffffff', 0.25], [0.8, '#dfe8ff', 0.7], [1, '#ffffff', 0]] });
        if (st) this.held.push(st);
    },

    // ---- детали трассы: лава, ток, вода ----
    scanPieces() {
        if (typeof ObbyCourse === 'undefined') return;
        for (const p of ObbyCourse.pieces) {
            const kind = p.type === 'lava' || (p.type === 'kill' && !p.color) ? 'lava' : p.type === 'kill' && p.color === 'zap' ? 'zap' : p.type === 'water' ? 'water' : null;
            if (!kind) continue;
            this.pieceZone(p, kind);
        }
    },

    pieceZone(p, kind) {
        const sx = p.sx, sz = p.sz, O = p.O, ax = p.ax, az = p.az, self = this;
        // Точка поверхности по локальным (u, v) в долях −½..½; ближайшая к точке (x, z) — для длинных лавовых озёр.
        const local = (x, z) => { const dx = x - O[0], dz = z - O[2]; return [Math.max(-sx / 2, Math.min(sx / 2, dx * ax[0] + dz * ax[2])), Math.max(-sz / 2, Math.min(sz / 2, dx * az[0] + dz * az[2]))]; };
        const world = (u, v) => [O[0] + ax[0] * u + az[0] * v, O[1], O[2] + ax[2] * u + az[2] * v];
        const z = { x: O[0], z: O[2], r: 1900, w: kind === 'lava' ? 3 : 1.5, hs: [], cx: O[0], cz: O[2], t: 0, rp: [O[0], O[1], O[2]],
            dist(hx, hy) { const l = local(hx, hy), w = world(l[0], l[1]); return Math.hypot(w[0] - hx, w[2] - hy); },
            tick(dt) {
                const H = self.hero(); if (!H) return;
                const l = local(H.x, H.y); const w = world(l[0], l[1]); this.cx = w[0]; this.cz = w[2];
                if (kind === 'zap') { this.t -= dt; if (this.t <= 0) { this.t = self.rnd(0.07, 0.2); const w2 = world(self.rnd(-sx / 2, sx / 2), self.rnd(-sz / 2, sz / 2)); this.rp = [w2[0], O[1] + self.rnd(4, 40), w2[2]]; } }
            },
            on() {
                const w = world(...local(self.hero().x, self.hero().y)); this.cx = w[0]; this.cz = w[2];
                const box = [[-Math.min(sx / 2, 420), 0, -Math.min(sz / 2, 420)], [Math.min(sx / 2, 420), 6, Math.min(sz / 2, 420)]];
                const fp = () => [z.cx, O[1] + 2, z.cz];
                if (kind === 'lava') {
                    z.hs.push(self.mk({ tex: 'ember', rate: 22, life: [1.4, 2.8], size: [3, 6], speed: [25, 90], follow: fp, box, direction: [[-0.4, 1, -0.4], [0.4, 1.8, 0.4]], gravity: [0, 8, 0],
                        color: '#ff9a2a', colorGradient: [[0, '#ffe080', 0], [0.12, '#ffd060', 1], [0.6, '#ff6a10', 0.8], [1, '#a01800', 0]] }));
                    // марево и дым над лавой убраны: на тёмных камнях читались как белые пятна
                } else if (kind === 'zap') {
                    z.hs.push(self.mk({ tex: 'arc', rate: 7, life: [0.08, 0.2], size: [60, 120], speed: [0, 8], follow: () => z.rp, spin: [-8, 8], color: '#cfe8ff',
                        colorGradient: [[0, '#ffffff', 1], [0.6, '#8ac4ff', 0.9], [1, '#3a7aff', 0]] }));
                    z.hs.push(self.mk({ tex: 'streak', stretch: true, rate: 9, life: [0.2, 0.45], size: [7, 11], speed: [90, 230], follow: () => z.rp, direction: [[-1, 0.6, -1], [1, 1.6, 1]], gravity: [0, -400, 0],
                        color: '#a8dcff', colorGradient: [[0, '#ffffff', 1], [0.4, '#7ac0ff', 1], [1, '#2a6aff', 0]] }));
                } else {
                    z.hs.push(self.mk({ tex: 'glint', rate: 3, life: [0.7, 1.4], size: [14, 26], speed: [0, 2], follow: () => [z.cx, O[1] + 3, z.cz], box, spin: [-0.6, 0.6], color: '#dff4ff',
                        sizeGradient: [[0, 0.2], [0.4, 1], [1, 0]], colorGradient: [[0, '#ffffff', 0], [0.35, '#ffffff', 0.9], [1, '#9fd8ff', 0]] }));
                }
                z.hs = z.hs.filter(Boolean);
            },
            off() { for (const h of z.hs) h.dispose(); z.hs = []; },
        };
        this.addZone(z);
        return z;
    },

    // ---- лампы: пятно на полу + конус-луч + пылинки в нём ----
    scanLamps(decor) {
        const map = this.app && this.app.location ? this.app.location.map : null; if (!map || !map.objects) return;
        const lampRe = /lamp|lantern|light/i, skipRe = /searchlight|spotlight|cctv|exit_sign|lightbeam|alarm/i;
        const marks = decor.filter(m => m.role === 'light');
        for (const o of map.objects) {
            if (o.kind === 'marker' || !o.model || !lampRe.test(o.model) || skipRe.test(o.model)) continue;
            if (marks.some(m => Math.hypot(m.x - o.x, m.y - o.y) < 140)) continue;   // уже есть маркер light
            const floorLamp = /floor|street/i.test(o.model);
            const s1 = Array.isArray(o.scale) ? o.scale[1] : (o.scale || 1);
            const hh = floorLamp ? Math.max(90, Math.min(450, 86 * (s1 > 20 ? s1 / 100 : s1))) : 6;
            const top = o.h + hh;
            let floor = null;
            if (typeof ObbyCourse !== 'undefined') { const r = ObbyCourse.rayDown(o.x, top - 2, o.y, 1500, 0.45, true); if (r) floor = r.y; }
            if (floor == null) { if (floorLamp) floor = o.h; else continue; }
            if (top - floor < 60) continue;
            this.lampZone({ x: o.x, y: o.y, top, floor, night: floorLamp });
        }
    },

    /** Применить декор-маркеры уровня. */
    useDecor(list) {
        const map = this.app && this.app.location ? this.app.location.map : null;
        const lamps = map && map.objects ? map.objects.filter(o => o.kind !== 'marker' && o.model && /lamp|lantern/i.test(o.model) && !/searchlight|floor|street/i.test(o.model)) : [];
        for (const m of list) {
            const w = m.words || [];
            switch (m.role) {
                case 'light': {
                    let top = null, best = 140;
                    for (const o of lamps) { const dd = Math.hypot(o.x - m.x, o.y - m.y); if (dd < best && o.h > m.h + 30) { best = dd; top = o.h + 6; } }
                    if (top == null) top = m.h + (m.tall > 80 ? m.tall : 260);
                    this.lampZone({ x: m.x, y: m.y, top, floor: m.h, night: false });
                    break;
                }
                case 'spark': this.sparkZone(m); break;
                case 'alarm': this.alarmZone(m); break;
                case 'heli': this.heliZone(m); break;
                case 'fx': this.fxZone(m, w[0] || 'smoke'); break;
                default: break;
            }
        }
    },

    lampZone(o) {
        const self = this, mood = this.mood || this.MOODS[1], drop = o.top - o.floor, R = Math.max(70, Math.min(200, drop * 0.36));
        const col = mood.lamp || '#ffe0a8';
        const z = { x: o.x, z: o.y, r: 2200, w: 1.2, meshes: [], hs: [], tt: Math.random() * 6,
            on() {
                const sc = self.scene, base = new BABYLON.Vector3(o.x, 0, o.y);
                // световое пятно на полу
                const spot = self.prep(BABYLON.MeshBuilder.CreatePlane('gfx-spot', { size: 1 }, sc));
                spot.rotation.x = Math.PI / 2; spot.position.set(o.x, o.floor + 3, o.y); spot.scaling.set(R * 2.6, R * 2.6, 1); spot.material = self.mat('soft', col); spot.visibility = 0.24; spot.renderingGroupId = 0;
                // конус-луч: открытый, с затуханием к полу и к краям (френель)
                // объёмный конус убран: аддитивный луч под bloom выглядел сплошным белым клином; свет — пятном и пылью
                z.meshes.push(spot);
                // пыль в луче
                const hh = self.mk({ tex: 'soft', rate: 6, life: [3, 5.5], size: [1.8, 3.6], speed: [1, 6], position: [o.x, o.floor + drop * 0.5, o.y], box: [[-R * 0.5, -drop * 0.5, -R * 0.5], [R * 0.5, drop * 0.5, R * 0.5]],
                    direction: [[-0.3, -0.4, -0.3], [0.3, 0.3, 0.3]], color: col, colorGradient: [[0, col, 0], [0.25, col, 0.7], [0.75, col, 0.7], [1, col, 0]] });
                if (hh) z.hs.push(hh);
            },
            off() { for (const m of z.meshes) m.dispose(); z.meshes = []; for (const h of z.hs) h.dispose(); z.hs = []; },
            tick(dt) { z.tt += dt; const f = 0.92 + Math.sin(z.tt * 2.3 + o.x) * 0.04 + Math.sin(z.tt * 7.1) * 0.02; if (z.meshes[0]) z.meshes[0].visibility = 0.24 * f; },
        };
        this.addZone(z); return z;
    },

    coneMat(col) {
        const key = 'cone' + col;
        if (this.mats[key]) return this.mats[key];
        const m = new BABYLON.StandardMaterial('gfx-cone', this.scene);
        m.disableLighting = true; m.emissiveColor = BABYLON.Color3.FromHexString(col); m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
        m.alpha = 0.055; m.alphaMode = BABYLON.Engine.ALPHA_ADD; m.backFaceCulling = false; m.fogEnabled = false; m.zOffset = -2; m.disableDepthWrite = true;
        const t = this.tex('beamV'); m.opacityTexture = t;
        m.opacityFresnelParameters = new BABYLON.FresnelParameters({ bias: 0.02, power: 1.6, leftColor: BABYLON.Color3.White(), rightColor: BABYLON.Color3.Black() });
        this.mats[key] = m; return m;
    },

    // ---- искры с кабеля ----
    sparkZone(m) {
        const self = this, P = [m.x, m.h, m.y];
        const z = { x: m.x, z: m.y, r: 2000, w: 0, tt: Math.random() * 2,
            on() {}, off() {},
            tick(dt) {
                z.tt -= dt; if (z.tt > 0) return;
                z.tt = self.rnd(1.1, 3.4);
                const n = Math.random() < 0.3 ? 2 : 1;
                for (let i = 0; i < n; i++) self.sparks(P, { n: 12, delay: i * 0.12, color: '#ffe9a0', color2: '#ff8a20', speed: [90, 300], life: [0.3, 0.7], size: [8, 12], dir: [[-0.6, -0.7, -0.6], [0.6, 0.5, 0.6]], g: -520 });
                self.mk({ tex: 'glint', burst: 1, life: [0.12, 0.2], size: [50, 70], speed: [0, 0], position: P, color: '#fff2c8', sizeGradient: [[0, 0.3], [0.3, 1], [1, 0.4]], colorGradient: [[0, '#ffffff', 1], [1, '#ffa030', 0]] });
            } };
        this.addZone(z); return z;
    },

    // ---- аварийная мигалка: вращающийся красный луч ----
    alarmZone(m) {
        const self = this;
        const z = { x: m.x, z: m.y, r: 2600, w: 0.4, meshes: [], a: Math.random() * 6.28, g: null,
            on() {
                const sc = self.scene, y = m.h + 14;
                z.meshes = [];
                for (const k of [0, Math.PI]) {
                    const b = self.prep(BABYLON.MeshBuilder.CreatePlane('gfx-alarm', { width: 1, height: 1 }, sc)); b.rotation.x = Math.PI / 2;
                    b.position.set(m.x, y, m.y); b.scaling.set(520, 130, 1); b.material = self.mat('beamH', '#ff2a1a'); b.metadata.k = k; b.setPivotPoint(new BABYLON.Vector3(-0.5, 0, 0));
                    z.meshes.push(b);
                }
                const g = self.prep(BABYLON.MeshBuilder.CreatePlane('gfx-alarm-g', { size: 1 }, sc)); g.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                g.position.set(m.x, y, m.y); g.scaling.set(120, 120, 1); g.material = self.mat('soft', '#ff3020'); z.meshes.push(g); z.g = g;
            },
            off() { for (const b of z.meshes) b.dispose(); z.meshes = []; z.g = null; },
            tick(dt) {
                z.a += dt * 4.2;
                for (const b of z.meshes) {
                    if (b === z.g) { b.visibility = 0.35 + 0.45 * Math.abs(Math.sin(z.a)); continue; }
                    b.rotation.y = -(z.a + b.metadata.k); b.visibility = 0.55 + 0.25 * Math.sin(z.a * 2);
                }
            } };
        this.addZone(z); return z;
    },

    // ---- вертолёт: ветер от винта ----
    heliZone(m) {
        const self = this, P = [m.x, m.h + 6, m.y];
        const z = { x: m.x, z: m.y, r: 2600, w: 1.5, hs: [],
            on() {
                z.hs.push(self.mk({ tex: 'smoke', blend: 'standard', rate: 20, life: [0.8, 1.4], size: [22, 40], speed: [160, 280], position: P, radial: { up: 0.05 }, spin: [-2, 2], color: '#cfc8bc', alpha: 0.28,
                    box: [[-60, 0, -60], [60, 6, 60]], sizeGradient: [[0, 0.6], [1, 2.2]], colorGradient: [[0, '#d8d2c8', 0.28], [1, '#d8d2c8', 0]] }));
                z.hs.push(self.mk({ tex: 'soft', rate: 6, life: [0.6, 1.2], size: [3, 6], speed: [60, 200], position: [m.x, m.h + 120, m.y], radial: { up: 0.1 }, color: '#fff2c0', alpha: 0.6 }));
                z.hs = z.hs.filter(Boolean);
            },
            off() { for (const h of z.hs) h.dispose(); z.hs = []; } };
        this.addZone(z); return z;
    },

    // ---- fx <вид>: постоянные пресеты на маркере ----
    fxZone(m, kind) {
        const self = this, P = [m.x, m.h, m.y], hh = m.h, w = Math.max(10, Math.min(300, m.hx || 30));
        const presets = {
            smoke: () => [self.mk({ tex: 'smoke', blend: 'standard', rate: 5, life: [2.2, 3.6], size: [30, 52], speed: [20, 55], position: P, box: [[-w * 0.4, 0, -w * 0.4], [w * 0.4, 0, w * 0.4]], direction: [[-0.15, 1, -0.15], [0.15, 1.2, 0.15]], spin: [-0.5, 0.5],
                color: '#6a6660', alpha: 0.5, sizeGradient: [[0, 0.5], [1, 2.8]], colorGradient: [[0, '#8a867e', 0.5], [0.6, '#5a5650', 0.3], [1, '#46423c', 0]] })],
            steam: () => [self.mk({ tex: 'steam', blend: 'standard', rate: 12, life: [1.1, 1.9], size: [26, 44], speed: [60, 130], position: P, direction: [[-0.15, 1, -0.15], [0.15, 1, 0.15]], gravity: [0, 10, 0], spin: [-1, 1],
                color: '#f4f8ff', alpha: 0.5, sizeGradient: [[0, 0.5], [1, 2.6]], colorGradient: [[0, '#ffffff', 0.5], [0.5, '#e8f0f8', 0.35], [1, '#dce6ee', 0]] })],
            fire: () => [
                self.mk({ tex: 'flame', sheet: { width: 128, height: 128, start: 0, end: 15, speed: 0.8, loop: true, randomStart: true }, rate: 12, life: [0.5, 0.9], size: [48, 70], speed: [20, 50], position: P, box: [[-w * 0.3, 0, -w * 0.3], [w * 0.3, 0, w * 0.3]], direction: [[-0.1, 1, -0.1], [0.1, 1.2, 0.1]],
                    color: '#ffb040', sizeGradient: [[0, 0.8], [1, 0.4]], colorGradient: [[0, '#ffe8a0', 0.9], [0.5, '#ff7a20', 0.7], [1, '#802000', 0]] }),
                self.mk({ tex: 'ember', rate: 7, life: [1, 2], size: [3, 6], speed: [40, 110], position: P, direction: [[-0.4, 1, -0.4], [0.4, 2, 0.4]], gravity: [0, 10, 0], color: '#ff9a2a', colorGradient: [[0, '#ffe080', 1], [0.6, '#ff6a10', 0.8], [1, '#a01800', 0]] }),
                self.mk({ tex: 'soft', rate: 3, life: [0.8, 1.4], size: [100, 140], speed: [0, 6], position: [m.x, m.h + 30, m.y], color: '#ff7a20', alpha: 0.12, colorGradient: [[0, '#ff7a20', 0.12], [1, '#ff4a10', 0]] })],
            embers: () => [self.mk({ tex: 'ember', rate: 10, life: [1.4, 2.6], size: [3, 6], speed: [30, 90], position: P, box: [[-w, 0, -w], [w, 0, w]], direction: [[-0.4, 1, -0.4], [0.4, 1.8, 0.4]], gravity: [0, 8, 0],
                color: '#ff9a2a', colorGradient: [[0, '#ffe080', 1], [0.6, '#ff6a10', 0.8], [1, '#a01800', 0]] })],
            dust: () => [self.mk({ tex: 'soft', rate: 9, life: [3, 6], size: [2, 4], speed: [2, 8], position: P, box: [[-w * 1.5, 0, -w * 1.5], [w * 1.5, 160, w * 1.5]], direction: [[-0.3, -0.1, -0.3], [0.3, 0.3, 0.3]], color: (self.mood || self.MOODS[1]).dust,
                colorGradient: [[0, '#ffffff', 0], [0.2, '#ffffff', 0.5], [0.8, '#ffffff', 0.5], [1, '#ffffff', 0]] })],
            sparks: () => [self.mk({ tex: 'streak', stretch: true, rate: 3, life: [0.3, 0.7], size: [8, 12], speed: [100, 300], position: P, direction: [[-0.6, -0.5, -0.6], [0.6, 0.8, 0.6]], gravity: [0, -520, 0], color: '#ffe9a0', colorGradient: [[0, '#ffffff', 1], [0.4, '#ffc050', 1], [1, '#ff6a10', 0]] })],
            drip: () => [self.mk({ tex: 'drop', rate: 1.3, life: [0.6, 0.9], size: [4, 6], speed: [0, 4], position: [m.x, m.h, m.y], direction: [[0, -1, 0], [0, -1, 0]], gravity: [0, -700, 0], color: '#bfe8ff', alpha: 0.8, colorGradient: [[0, '#dff4ff', 0.9], [1, '#9fd0ff', 0]] })],
            bubbles: () => [self.mk({ tex: 'ring', rate: 4, life: [1.2, 2.2], size: [6, 14], speed: [20, 50], position: P, box: [[-w * 0.5, 0, -w * 0.5], [w * 0.5, 0, w * 0.5]], direction: [[-0.1, 1, -0.1], [0.1, 1, 0.1]], color: '#dff4ff', alpha: 0.7, colorGradient: [[0, '#ffffff', 0.7], [1, '#9fd0ff', 0]] })],
            fireflies: () => [self.mk({ tex: 'soft', rate: 2, life: [4, 7], size: [4, 7], speed: [3, 10], position: [m.x, m.h + 80, m.y], box: [[-w * 3, 0, -w * 3], [w * 3, 100, w * 3]], direction: [[-0.5, -0.1, -0.5], [0.5, 0.25, 0.5]], color: '#e8ff9a',
                colorGradient: [[0, '#e8ff9a', 0], [0.2, '#f4ffb0', 0.9], [0.45, '#e0ff80', 0.2], [0.7, '#f4ffb0', 0.85], [1, '#e8ff9a', 0]] })],
            glow: () => [self.mk({ tex: 'soft', rate: 1.5, life: [1.5, 2.5], size: [120, 160], speed: [0, 2], position: [m.x, m.h + 20, m.y], color: '#ffd9a0', alpha: 0.14, colorGradient: [[0, '#ffd9a0', 0], [0.4, '#ffd9a0', 0.14], [1, '#ffd9a0', 0]] })],
        };
        const alias = { flame: 'fire', torch: 'fire', ember: 'embers', spark: 'sparks', water: 'drip', bubble: 'bubbles', firefly: 'fireflies', pipe: 'steam', heat: 'embers', fog: 'smoke' };
        const make = presets[kind] || presets[alias[kind]] || presets.smoke;
        const z = { x: m.x, z: m.y, r: 2200, w: 1.2, hs: [], on() { z.hs = make().filter(Boolean); }, off() { for (const h of z.hs) h.dispose(); z.hs = []; } };
        void hh; this.addZone(z); return z;
    },

    // ---------------------------------------------------------------------------------------------
    // Кадр
    // ---------------------------------------------------------------------------------------------
    update(dt) {
        if (!this.inited) return;
        dt = Math.min(dt, 0.1); this.time += dt;
        // временные меши
        for (let i = this.temps.length - 1; i >= 0; i--) {
            const t = this.temps[i]; t.t += dt;
            const k = Math.min(1, t.t / t.life);
            try { t.fn(k, t.mesh); } catch (e) { t.t = t.life; }
            if (t.t >= t.life) { t.mesh.dispose(); this.temps.splice(i, 1); }
        }
        // зоны: раз в 0.35 с — кто живёт; активные тикают каждый кадр
        this.zoneClock -= dt;
        if (this.zoneClock <= 0) { this.zoneClock = 0.35; this.refreshZones(); }
        for (const z of this.zones) if (z.active && z.tick) z.tick(dt);
    },

    dispose() {
        this.clearLevel();
        for (const t of Object.values(this.texs)) { try { t.dispose(); } catch (e) { /* уже */ } } this.texs = {};
        for (const m of Object.values(this.mats)) { try { m.dispose(); } catch (e) { /* уже */ } } this.mats = {};
        if (this.glow) { this.glow.dispose(); this.glow = null; }
        if (this.pipe) { this.pipe.dispose(); this.pipe = null; }
        this.inited = false;
    },
};

/** Камера Babylon основной сцены (для постобработки). */
function app_camera(fx) { const v = fx.app && fx.app.location && fx.app.location.view; return v ? v.camera : null; }
