// GameSurfaces.js — поверхности тюрьмы для деталей трассы (ObbyCourseView): бетон, плитка, рифлёный металл, кирпич,
// доски, решётки с прозрачностью, вода под током, шипы, лазер. Текстуры рисуются кодом на холсте (бесшовные плитки
// размера OBBY_TILE·2 px мира), поэтому их не нужно качать и они одинаковы в редакторе превью и в игре по цвету детали.
//
// Деталь box_<поверхность>.glb (или cyl_, ramp_, arch_) берёт верх 'top:<поверхность>' и бока 'side:<поверхность>'.
// Опасности: kill_spikes / kill_zap / kill_laser / kill_acid — свой материал вместо лавы.
// Список имён — GameSurfaces.LIST (его же читает tools/prison-kit.mjs для превью редактора и docs/DESIGN.md).

/** @satisfies {Record<string, any>} */
const GameSurfaces = {
    /** Имя -> [светлый, тёмный] тон (как ObbyCourse.COLORS) — превью редактора берут светлый. */
    LIST: {
        concrete: [0x9ea3a8, 0x83888f], floor: [0x5d6876, 0x4a5462], wall: [0xc9d3d9, 0xb2bdc5], tile: [0xe9eef0, 0xcfd8dc],
        tilegreen: [0x9ccbb4, 0x7fb39b], plate: [0x8f979f, 0x737b84], duct: [0xaebcc3, 0x92a1a9], brick: [0xa4654b, 0x7f4a36],
        plank: [0xc99a62, 0xa77a45], rust: [0x8c5b3c, 0x6b4129], hazard: [0xf2c230, 0x2a2a2a], steel: [0x6e7984, 0x56606a],
        grate: [0x59626c, 0x3f474f], bars: [0x5a636d, 0x444c55], vent: [0x8a949c, 0x6c757d], ceiling: [0x454b54, 0x363b42],
        rock: [0x7d5e4b, 0x5e4536], dirt: [0x6e5538, 0x56412a], asphalt: [0x3d4046, 0x2f3237], grass: [0x5d8f3c, 0x497530],
        roof: [0x5b646e, 0x48515a], glass: [0x9fd8ef, 0x7cc2df], police: [0x2f62ad, 0x244e8c], carpet: [0x7d2f37, 0x5e2229],
        stairs: [0xa3a8ae, 0x80858b], crate: [0xb98a52, 0x8f6534], exit: [0x3fdc78, 0x22b85a], lavarock: [0x3b2e2b, 0x241b19],
        sand: [0xd9c08a, 0xc2a671], prison: [0xf07d1e, 0xd2620d], cell: [0xd9dfe3, 0xc4ccd2], wood: [0x8a5a35, 0x6a4325],
        mattress: [0xd8d2c0, 0xbdb6a0], pipe: [0x8d9aa5, 0x6f7b85],
        ghost: [0xff66ff, 0xcc33cc],   // невидимый коллайдер под моделью-декором (в редакторе — розовый брус)
    },
    /** Накладные поверхности: тонкие полосы, разметка, ковры, решётки — сдвиг глубины к камере (zOffset), чтобы не мерцали. */
    DECALS: ['prison', 'orange', 'hazard', 'exit', 'carpet', 'mattress', 'grate', 'vent', 'bars', 'police', 'red', 'yellow', 'green', 'blue', 'white', 'glass'],
    /** Опасные варианты kill_<имя>. */
    HAZARDS: ['spikes', 'zap', 'laser', 'acid'],

    /** Цвета деталей: дописать в ObbyCourse.COLORS (до ObbyCourse.build). */
    register() {
        if (typeof ObbyCourse === 'undefined') return;
        for (const k of Object.keys(this.LIST)) ObbyCourse.COLORS[k] = this.LIST[k];
    },

    // ---------------------------------------------------------------------------------------------
    // Материалы (зовёт ObbyCourseView._makeMaterials в конце)
    // ---------------------------------------------------------------------------------------------

    make(view, scene, kit) {
        const { tex, std } = kit;
        const N = typeof IS_MOBILE !== 'undefined' && IS_MOBILE ? 256 : 512;
        const W = new BABYLON.Color3(1, 1, 1);
        const put = (key, painter, opts) => {
            const o = opts || {};
            const m = view.mats[key] || std(key, null);
            m.diffuseColor = W.clone();
            const t = tex(key.replace(':', '-'), o.size || N, painter);
            if (t) {
                m.diffuseTexture = t;
                if (o.alpha) {
                    t.hasAlpha = true;
                    m.useAlphaFromDiffuseTexture = true;
                    m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
                    m.alphaCutOff = 0.45;
                }
            }
            if (o.emissive) m.emissiveColor = BABYLON.Color3.FromHexString(o.emissive);
            if (o.spec != null) { m.specularColor = new BABYLON.Color3(o.spec, o.spec, o.spec); m.specularPower = o.power || 32; }
            if (o.blend != null) { m.alpha = o.blend; m.metadata = Object.assign({}, m.metadata, { toon: false }); }
            if (o.noToon) m.metadata = Object.assign({}, m.metadata, { toon: false });
            if (o.decal) m.zOffset = -2;   // накладка поверх стены/пола: без мерцания с поверхностью под ней
            view.mats[key] = m;
            return m;
        };
        const P = this.painters;
        for (const name of Object.keys(this.LIST)) {
            const p = P[name] || P.concrete;
            const side = P[name + 'Side'] || p;
            const o = Object.assign({}, this.OPTS[name] || {}, this.DECALS.includes(name) ? { decal: true } : {});
            put('top:' + name, (ctx, n) => p(ctx, n, this.LIST[name], this.rng(name.length * 131 + 7)), o);
            put('side:' + name, (ctx, n) => side(ctx, n, this.LIST[name], this.rng(name.length * 977 + 3)), o);
        }
        put('kill:spikes', (ctx, n) => P.spikes(ctx, n, [0x9aa3ab, 0x3c4249], this.rng(5)), { spec: 0.5, power: 48 });
        put('kill:zap', (ctx, n) => P.zap(ctx, n, [0x2a8fe0, 0x0f3d6e], this.rng(9)), { emissive: '#1d4f8f', blend: 0.82 });
        put('kill:laser', (ctx, n) => P.laser(ctx, n, [0xff2a3a, 0xff8a8a], this.rng(11)), { emissive: '#ff2030', blend: 0.7 });
        put('kill:acid', (ctx, n) => P.acid(ctx, n, [0x7dff3a, 0x2f8f10], this.rng(13)), { emissive: '#3c8f12', blend: 0.88 });
        view.mats.side = view.mats['side:concrete'] || view.mats.side;
        // конвейер (деталь boost): резиновая лента с рёбрами и жёлто-чёрными кромками; ObbyCourseView двигает uOffset
        const belt = put('boost', (ctx, n) => P.conveyor(ctx, n, [0x2b2e33, 0x1b1d21], this.rng(17)), { spec: 0.15, power: 20 });
        belt.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.02);
        // батут (деталь jump): пружинная платформа — стальной диск с резиновой накладкой
        const pad = put('jump', (ctx, n) => P.springpad(ctx, n, [0x3fdc78, 0x1f8f4a], this.rng(19)), { spec: 0.3, power: 30 });
        pad.emissiveColor = new BABYLON.Color3(0.05, 0.12, 0.06);
    },

    /** Особые настройки материала по поверхности. */
    OPTS: {
        grate: { alpha: true, spec: 0.3 }, bars: { alpha: true, spec: 0.4 }, vent: { alpha: true, spec: 0.3 },
        glass: { blend: 0.35, spec: 0.9, power: 64 }, exit: { emissive: '#1f7a3e' }, lavarock: { emissive: '#3a1206' },
        plate: { spec: 0.35, power: 40 }, duct: { spec: 0.3, power: 30 }, steel: { spec: 0.35, power: 40 }, pipe: { spec: 0.4, power: 40 },
        tile: { spec: 0.25, power: 50 }, tilegreen: { spec: 0.25, power: 50 },
    },

    /** Детерминированный ГСЧ (одна и та же текстура при каждой загрузке). */
    rng(seed) {
        let s = (seed * 16807) % 2147483647 || 1;
        return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    },

    // ---------------------------------------------------------------------------------------------
    // Кисти (ctx, n — размер холста, [светлый, тёмный], rnd)
    // ---------------------------------------------------------------------------------------------

    hex(h, a) { return 'rgba(' + ((h >> 16) & 255) + ',' + ((h >> 8) & 255) + ',' + (h & 255) + ',' + (a == null ? 1 : a) + ')'; },
    mix(h1, h2, k) {
        const r = Math.round(((h1 >> 16) & 255) * (1 - k) + ((h2 >> 16) & 255) * k);
        const g = Math.round(((h1 >> 8) & 255) * (1 - k) + ((h2 >> 8) & 255) * k);
        const b = Math.round((h1 & 255) * (1 - k) + (h2 & 255) * k);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    },
    /** Зерно: мелкие светлые и тёмные точки. */
    grain(ctx, n, rnd, count, a) {
        for (let i = 0; i < count; i++) {
            const x = rnd() * n, y = rnd() * n, r = 0.7 + rnd() * 1.8;
            ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a * 0.8 + ')';
            ctx.fillRect(x, y, r, r);
        }
    },
    /** Пятна: мягкие круги (грязь, потёки), бесшовно (с переносом через край). */
    blots(ctx, n, rnd, count, color, rmin, rmax) {
        for (let i = 0; i < count; i++) {
            const x = rnd() * n, y = rnd() * n, r = rmin + rnd() * (rmax - rmin);
            for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
                const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
                g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
            }
        }
    },
    /** Трещина ломаной линией. */
    crack(ctx, rnd, x, y, len, color) {
        ctx.strokeStyle = color; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, y);
        let a = rnd() * Math.PI * 2;
        for (let i = 0; i < 8; i++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * len / 8; y += Math.sin(a) * len / 8; ctx.lineTo(x, y); }
        ctx.stroke();
    },
    /** Сетка плиток nx×ny со швами. */
    tiles(ctx, n, c, rnd, nx, ny, grout, gw, vary) {
        const S = GameSurfaces;
        const w = n / nx, h = n / ny;
        ctx.fillStyle = grout; ctx.fillRect(0, 0, n, n);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            ctx.fillStyle = S.mix(c[0], c[1], rnd() * vary);
            ctx.fillRect(i * w + gw / 2, j * h + gw / 2, w - gw, h - gw);
            // блик сверху-слева и тень снизу-справа: плитка «выпуклая»
            ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(i * w + gw / 2, j * h + gw / 2, w - gw, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(i * w + gw / 2, (j + 1) * h - gw / 2 - 2, w - gw, 2);
        }
    },

    painters: {
        concrete(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.blots(ctx, n, rnd, 26, S.hex(c[1], 0.35), n * 0.05, n * 0.22);
            S.blots(ctx, n, rnd, 10, 'rgba(255,255,255,0.10)', n * 0.04, n * 0.14);
            S.grain(ctx, n, rnd, n * 6, 0.07);
            for (let i = 0; i < 4; i++) S.crack(ctx, rnd, rnd() * n, rnd() * n, n * (0.1 + rnd() * 0.18), 'rgba(40,40,45,0.35)');
            // швы плит бетона
            ctx.fillStyle = 'rgba(30,32,36,0.28)'; ctx.fillRect(0, 0, n, 2); ctx.fillRect(0, 0, 2, n);
        },
        floor(ctx, n, c, rnd) {
            const S = GameSurfaces;
            S.tiles(ctx, n, c, rnd, 2, 2, S.mix(c[1], 0x101418, 0.5), 5, 0.6);
            S.blots(ctx, n, rnd, 14, 'rgba(10,12,16,0.18)', n * 0.05, n * 0.18);
            S.grain(ctx, n, rnd, n * 5, 0.06);
        },
        wall(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.blots(ctx, n, rnd, 18, S.hex(c[1], 0.25), n * 0.08, n * 0.3);
            S.grain(ctx, n, rnd, n * 4, 0.05);
            // крупные панели окраски
            ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, 0, 3, n); ctx.fillRect(n / 2, 0, 2, n);
        },
        cell(ctx, n, c, rnd) { GameSurfaces.painters.wall(ctx, n, c, rnd); },
        tile(ctx, n, c, rnd) {
            const S = GameSurfaces;
            S.tiles(ctx, n, c, rnd, 8, 8, 'rgb(150,160,165)', 3, 0.35);
            S.blots(ctx, n, rnd, 8, 'rgba(120,110,80,0.12)', n * 0.04, n * 0.12);
        },
        tilegreen(ctx, n, c, rnd) { GameSurfaces.painters.tile(ctx, n, c, rnd); },
        plate(ctx, n, c, rnd) {
            const S = GameSurfaces;
            const g = ctx.createLinearGradient(0, 0, n, n);
            g.addColorStop(0, S.hex(c[0])); g.addColorStop(0.5, S.mix(c[0], c[1], 0.5)); g.addColorStop(1, S.hex(c[0]));
            ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
            // рифление «ромб»: косые черточки в шахматном порядке
            const k = n / 16;
            for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
                const x = i * k + k / 2, y = j * k + k / 2, d = (i + j) % 2 ? 1 : -1;
                ctx.save(); ctx.translate(x, y); ctx.rotate(d * Math.PI / 4);
                ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(-k * 0.34, -k * 0.07 + 1, k * 0.68, k * 0.14);
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-k * 0.34, -k * 0.07, k * 0.68, k * 0.12);
                ctx.restore();
            }
            S.blots(ctx, n, rnd, 8, 'rgba(30,25,20,0.18)', n * 0.05, n * 0.2);
        },
        duct(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            // оцинковка: пятна-«звёзды»
            for (let i = 0; i < 60; i++) {
                const x = rnd() * n, y = rnd() * n, r = 6 + rnd() * 22;
                ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
                ctx.beginPath();
                for (let a = 0; a < 6; a++) { const t = a / 6 * Math.PI * 2 + rnd() * 0.5; ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r * (0.6 + rnd() * 0.6)); }
                ctx.fill();
            }
            // швы и заклёпки
            for (const y of [0, n / 2]) {
                ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, y, n, 4);
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, y + 4, n, 2);
                for (let x = 8; x < n; x += n / 12) { ctx.fillStyle = 'rgba(40,45,50,0.55)'; ctx.beginPath(); ctx.arc(x, y + 11, 3, 0, Math.PI * 2); ctx.fill(); }
            }
            // косые рёбра жёсткости («конверт»)
            ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(n, n / 2 - 2); ctx.moveTo(n, 6); ctx.lineTo(0, n / 2 - 2); ctx.stroke();
        },
        pipe(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.grain(ctx, n, rnd, n * 3, 0.06);
            for (let y = 0; y < n; y += n / 2) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, n, 10); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, y + 10, n, 3); }
        },
        brick(ctx, n, c, rnd) {
            const S = GameSurfaces;
            const rows = 8, cols = 4, h = n / rows, w = n / cols;
            ctx.fillStyle = 'rgb(176,168,156)'; ctx.fillRect(0, 0, n, n);
            for (let j = 0; j < rows; j++) for (let i = -1; i < cols; i++) {
                const off = j % 2 ? w / 2 : 0, x = i * w + off;
                ctx.fillStyle = S.mix(c[0], c[1], rnd() * 0.9);
                ctx.fillRect(x + 3, j * h + 3, w - 6, h - 6);
                ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 3, j * h + 3, w - 6, 3);
            }
            S.grain(ctx, n, rnd, n * 5, 0.08);
            S.blots(ctx, n, rnd, 10, 'rgba(30,20,15,0.18)', n * 0.05, n * 0.2);
        },
        plank(ctx, n, c, rnd) {
            const S = GameSurfaces;
            const rows = 6, h = n / rows;
            for (let j = 0; j < rows; j++) {
                ctx.fillStyle = S.mix(c[0], c[1], rnd() * 0.8); ctx.fillRect(0, j * h, n, h);
                // волокна
                for (let k = 0; k < 14; k++) {
                    ctx.strokeStyle = 'rgba(70,40,15,' + (0.08 + rnd() * 0.12) + ')'; ctx.lineWidth = 1 + rnd() * 1.5;
                    const y = j * h + rnd() * h; ctx.beginPath(); ctx.moveTo(0, y);
                    for (let x = 0; x <= n; x += n / 8) ctx.lineTo(x, y + Math.sin(x * 0.03 + k) * 2);
                    ctx.stroke();
                }
                ctx.fillStyle = 'rgba(40,22,8,0.55)'; ctx.fillRect(0, j * h, n, 3);
                const cut = rnd() * n; ctx.fillRect(cut, j * h, 3, h);
                ctx.fillStyle = 'rgba(60,60,60,0.7)';
                for (const x of [cut - 10, cut + 13]) { ctx.beginPath(); ctx.arc(x, j * h + h * 0.3, 2.5, 0, 7); ctx.arc(x, j * h + h * 0.7, 2.5, 0, 7); ctx.fill(); }
            }
        },
        wood(ctx, n, c, rnd) { GameSurfaces.painters.plank(ctx, n, c, rnd); },
        crate(ctx, n, c, rnd) {
            const S = GameSurfaces;
            S.painters.plank(ctx, n, c, rnd);
            ctx.strokeStyle = S.mix(c[1], 0x2a1808, 0.4); ctx.lineWidth = n * 0.07;
            ctx.strokeRect(n * 0.035, n * 0.035, n * 0.93, n * 0.93);
            ctx.beginPath(); ctx.moveTo(n * 0.07, n * 0.07); ctx.lineTo(n * 0.93, n * 0.93); ctx.stroke();
        },
        rust(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.blots(ctx, n, rnd, 40, 'rgba(160,80,30,0.35)', n * 0.03, n * 0.16);
            S.blots(ctx, n, rnd, 30, 'rgba(50,30,20,0.35)', n * 0.03, n * 0.12);
            S.grain(ctx, n, rnd, n * 8, 0.1);
        },
        hazard(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            ctx.fillStyle = S.hex(c[1]);
            const w = n / 4;
            for (let i = -4; i < 8; i++) {
                ctx.beginPath(); ctx.moveTo(i * w, 0); ctx.lineTo(i * w + w / 2, 0); ctx.lineTo(i * w + w / 2 + n, n); ctx.lineTo(i * w + n, n); ctx.closePath(); ctx.fill();
            }
            S.grain(ctx, n, rnd, n * 4, 0.08);
            S.blots(ctx, n, rnd, 8, 'rgba(40,30,20,0.2)', n * 0.05, n * 0.15);
        },
        steel(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            for (let i = 0; i < n; i += 2) { ctx.fillStyle = 'rgba(255,255,255,' + (rnd() * 0.06) + ')'; ctx.fillRect(0, i, n, 1); }
            S.blots(ctx, n, rnd, 6, 'rgba(0,0,0,0.15)', n * 0.06, n * 0.2);
            for (let x = 10; x < n; x += n / 6) for (const y of [10, n - 10]) { ctx.fillStyle = 'rgba(30,34,38,0.6)'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); }
        },
        grate(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.clearRect(0, 0, n, n);
            const k = n / 10;
            ctx.fillStyle = S.hex(c[0]);
            for (let i = 0; i < 10; i++) { ctx.fillRect(i * k, 0, k * 0.22, n); ctx.fillRect(0, i * k, n, k * 0.22); }
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            for (let i = 0; i < 10; i++) ctx.fillRect(i * k, 0, 2, n);
        },
        bars(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.clearRect(0, 0, n, n);
            const k = n / 5;
            for (let i = 0; i < 5; i++) {
                const g = ctx.createLinearGradient(i * k, 0, i * k + k * 0.22, 0);
                g.addColorStop(0, S.hex(c[1])); g.addColorStop(0.45, S.mix(c[0], 0xffffff, 0.35)); g.addColorStop(1, S.hex(c[1]));
                ctx.fillStyle = g; ctx.fillRect(i * k + k * 0.4, 0, k * 0.22, n);
            }
            // поперечина
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, n * 0.46, n, n * 0.05);
            ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, n * 0.46, n, 2);
        },
        vent(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.clearRect(0, 0, n, n);
            const rows = 10, h = n / rows;
            for (let j = 0; j < rows; j++) {
                const g = ctx.createLinearGradient(0, j * h, 0, j * h + h * 0.55);
                g.addColorStop(0, S.mix(c[0], 0xffffff, 0.3)); g.addColorStop(1, S.hex(c[1]));
                ctx.fillStyle = g; ctx.fillRect(0, j * h, n, h * 0.55);
            }
            ctx.fillStyle = S.hex(c[1]); ctx.fillRect(0, 0, n * 0.04, n); ctx.fillRect(n * 0.96, 0, n * 0.04, n);
        },
        ceiling(ctx, n, c, rnd) {
            const S = GameSurfaces;
            S.tiles(ctx, n, c, rnd, 4, 4, 'rgb(40,44,50)', 4, 0.4);
            S.grain(ctx, n, rnd, n * 3, 0.06);
            S.blots(ctx, n, rnd, 6, 'rgba(20,18,15,0.25)', n * 0.05, n * 0.15);
        },
        rock(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            // гранёные пятна: многоугольники разных тонов
            for (let i = 0; i < 90; i++) {
                const x = rnd() * n, y = rnd() * n, r = n * (0.03 + rnd() * 0.09);
                ctx.fillStyle = S.mix(c[0], c[1], rnd());
                ctx.beginPath();
                for (let a = 0; a < 5; a++) { const t = a / 5 * Math.PI * 2 + rnd(); ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); }
                ctx.fill();
            }
            S.grain(ctx, n, rnd, n * 6, 0.1);
        },
        lavarock(ctx, n, c, rnd) {
            const S = GameSurfaces;
            S.painters.rock(ctx, n, c, rnd);
            // светящиеся трещины
            for (let i = 0; i < 9; i++) {
                ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 8;
                S.crack(ctx, rnd, rnd() * n, rnd() * n, n * (0.15 + rnd() * 0.25), 'rgba(255,140,40,0.85)');
            }
            ctx.shadowBlur = 0;
        },
        dirt(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.blots(ctx, n, rnd, 30, S.hex(c[1], 0.4), n * 0.03, n * 0.14);
            for (let i = 0; i < 160; i++) { ctx.fillStyle = S.mix(c[0], 0x9a8a70, rnd()); const r = 1 + rnd() * 3; ctx.fillRect(rnd() * n, rnd() * n, r, r); }
            S.grain(ctx, n, rnd, n * 6, 0.1);
        },
        sand(ctx, n, c, rnd) { GameSurfaces.painters.dirt(ctx, n, c, rnd); },
        asphalt(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.grain(ctx, n, rnd, n * 12, 0.12);
            S.blots(ctx, n, rnd, 10, 'rgba(0,0,0,0.2)', n * 0.05, n * 0.2);
            for (let i = 0; i < 3; i++) S.crack(ctx, rnd, rnd() * n, rnd() * n, n * 0.3, 'rgba(15,15,18,0.5)');
        },
        grass(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.blots(ctx, n, rnd, 20, S.hex(c[1], 0.45), n * 0.05, n * 0.2);
            for (let i = 0; i < n * 3; i++) {
                const x = rnd() * n, y = rnd() * n;
                ctx.strokeStyle = rnd() < 0.5 ? 'rgba(140,200,90,0.35)' : 'rgba(40,80,25,0.3)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6); ctx.stroke();
            }
        },
        roof(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            for (let i = 0; i < n * 9; i++) { ctx.fillStyle = S.mix(c[0], rnd() < 0.5 ? 0x2a3038 : 0x9aa4ae, rnd() * 0.6); const r = 1.5 + rnd() * 2.5; ctx.fillRect(rnd() * n, rnd() * n, r, r); }
        },
        glass(ctx, n, c, rnd) {
            const S = GameSurfaces;
            const g = ctx.createLinearGradient(0, 0, n, n);
            g.addColorStop(0, S.hex(c[0])); g.addColorStop(1, S.hex(c[1]));
            ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath(); ctx.moveTo(n * 0.1, 0); ctx.lineTo(n * 0.3, 0); ctx.lineTo(0, n * 0.3); ctx.lineTo(0, n * 0.1); ctx.fill();
            ctx.fillStyle = 'rgba(40,50,60,0.8)'; ctx.fillRect(0, 0, n, 4); ctx.fillRect(0, 0, 4, n);
        },
        police(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.grain(ctx, n, rnd, n * 3, 0.06);
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(0, n * 0.44, n, n * 0.04);
        },
        prison(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.grain(ctx, n, rnd, n * 3, 0.06);
            S.blots(ctx, n, rnd, 8, S.hex(c[1], 0.3), n * 0.05, n * 0.2);
        },
        carpet(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            S.grain(ctx, n, rnd, n * 10, 0.08);
            ctx.strokeStyle = 'rgba(230,180,70,0.6)'; ctx.lineWidth = 6; ctx.strokeRect(n * 0.06, n * 0.06, n * 0.88, n * 0.88);
        },
        mattress(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            for (let y = 0; y < n; y += n / 8) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, y, n, 3); }
            S.blots(ctx, n, rnd, 6, 'rgba(150,130,80,0.25)', n * 0.05, n * 0.15);
        },
        stairs(ctx, n, c, rnd) {
            const S = GameSurfaces;
            S.painters.concrete(ctx, n, c, rnd);
            // ступени поперёк пандуса (u — вдоль подъёма): тёмная тень + светлая кромка
            const k = n / 12;
            for (let i = 0; i < 12; i++) {
                ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(i * k, 0, k * 0.28, n);
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(i * k + k * 0.28, 0, 3, n);
                ctx.fillStyle = 'rgba(240,180,40,0.55)'; ctx.fillRect(i * k + k * 0.28 + 3, 0, 4, n);
            }
        },
        exit(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.7);
            g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,80,30,0.3)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
        },
        conveyor(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[0]); ctx.fillRect(0, 0, n, n);
            // поперечные рёбра ленты (u — вдоль хода): тёмная канавка + светлая кромка
            const k = n / 8;
            for (let i = 0; i < 8; i++) {
                ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(i * k, 0, k * 0.22, n);
                ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(i * k + k * 0.22, 0, 3, n);
            }
            S.grain(ctx, n, rnd, n * 5, 0.08);
            S.blots(ctx, n, rnd, 6, 'rgba(120,100,70,0.12)', n * 0.05, n * 0.15);
            // кромки: жёлто-чёрная разметка по краям ленты (v — поперёк)
            for (const y0 of [0, n * 0.88]) {
                ctx.save(); ctx.beginPath(); ctx.rect(0, y0, n, n * 0.12); ctx.clip();
                ctx.fillStyle = '#f2c230'; ctx.fillRect(0, y0, n, n * 0.12);
                ctx.fillStyle = '#1d1d1f';
                for (let i = -2; i < 12; i++) { ctx.beginPath(); ctx.moveTo(i * n / 8, y0); ctx.lineTo(i * n / 8 + n / 16, y0); ctx.lineTo(i * n / 8 + n / 16 + n * 0.12, y0 + n * 0.12); ctx.lineTo(i * n / 8 + n * 0.12, y0 + n * 0.12); ctx.fill(); }
                ctx.restore();
            }
            // стрелки хода — едва заметные, белой краской
            ctx.strokeStyle = 'rgba(240,240,230,0.28)'; ctx.lineWidth = n * 0.03;
            for (const x of [n * 0.3, n * 0.8]) { ctx.beginPath(); ctx.moveTo(x - n * 0.08, n * 0.32); ctx.lineTo(x, n * 0.5); ctx.lineTo(x - n * 0.08, n * 0.68); ctx.stroke(); }
        },
        springpad(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = '#5a636d'; ctx.fillRect(0, 0, n, n);
            const g = ctx.createRadialGradient(n / 2, n / 2, n * 0.05, n / 2, n / 2, n * 0.48);
            g.addColorStop(0, S.mix(c[0], 0xffffff, 0.25)); g.addColorStop(0.8, S.hex(c[0])); g.addColorStop(1, S.hex(c[1]));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n / 2, n / 2, n * 0.44, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(20,40,25,0.55)'; ctx.lineWidth = n * 0.02;
            for (const r of [0.16, 0.27, 0.38]) { ctx.beginPath(); ctx.arc(n / 2, n / 2, n * r, 0, Math.PI * 2); ctx.stroke(); }
            ctx.fillStyle = '#f2c230';
            ctx.beginPath(); ctx.moveTo(n * 0.5, n * 0.3); ctx.lineTo(n * 0.62, n * 0.46); ctx.lineTo(n * 0.38, n * 0.46); ctx.fill();
            ctx.fillRect(n * 0.46, n * 0.46, n * 0.08, n * 0.2);
            S.grain(ctx, n, rnd, n * 3, 0.06);
        },
        // ---- опасности ----
        spikes(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[1]); ctx.fillRect(0, 0, n, n);
            const k = n / 6;
            for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
                const x = i * k + k / 2, y = j * k + k / 2;
                const g = ctx.createRadialGradient(x - k * 0.1, y - k * 0.1, 0, x, y, k * 0.45);
                g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, S.hex(c[0])); g.addColorStop(1, S.hex(c[1]));
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.moveTo(x, y - k * 0.42); ctx.lineTo(x + k * 0.42, y); ctx.lineTo(x, y + k * 0.42); ctx.lineTo(x - k * 0.42, y); ctx.fill();
            }
        },
        zap(ctx, n, c, rnd) {
            const S = GameSurfaces;
            const g = ctx.createLinearGradient(0, 0, n, n);
            g.addColorStop(0, S.hex(c[0])); g.addColorStop(1, S.hex(c[1]));
            ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
            S.blots(ctx, n, rnd, 14, 'rgba(160,220,255,0.18)', n * 0.05, n * 0.2);
            ctx.strokeStyle = 'rgba(200,240,255,0.95)'; ctx.lineWidth = 2.5; ctx.shadowColor = '#7fd8ff'; ctx.shadowBlur = 10;
            for (let i = 0; i < 7; i++) {
                let x = rnd() * n, y = rnd() * n;
                ctx.beginPath(); ctx.moveTo(x, y);
                for (let s = 0; s < 7; s++) { x += (rnd() - 0.3) * n * 0.08; y += (rnd() - 0.5) * n * 0.08; ctx.lineTo(x, y); }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        },
        laser(ctx, n, c, rnd) {
            const g = ctx.createLinearGradient(0, 0, 0, n);
            g.addColorStop(0, '#ff2a3a'); g.addColorStop(0.5, '#ffd0d0'); g.addColorStop(1, '#ff2a3a');
            ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
        },
        acid(ctx, n, c, rnd) {
            const S = GameSurfaces;
            ctx.fillStyle = S.hex(c[1]); ctx.fillRect(0, 0, n, n);
            S.blots(ctx, n, rnd, 30, 'rgba(160,255,80,0.4)', n * 0.03, n * 0.15);
            for (let i = 0; i < 40; i++) { ctx.strokeStyle = 'rgba(220,255,160,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, 3 + rnd() * 9, 0, 7); ctx.stroke(); }
        },
    },
};

GameSurfaces.register();
