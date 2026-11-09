// GameLook.js — вид косметики на персонаже-человечке (HumanoidModel), следы, скины джетпака и иконки карточек.
// Всё процедурное: меши Babylon строятся из примитивов (коробки, цилиндры, эллипсоиды, торы, призмы-многоугольники) с
// цветами в вершинах; рисунки (лица, принты роб, формы частиц, иконки) — одна «векторная» запись LookDraw, которая
// рисуется и на холсте (Canvas2D -> DynamicTexture), и в SVG (иконка карточки). Растровых картинок нет.
//
// API (ядро зовёт):
//   GameLook.apply(model, look, view, opts) — надеть look = Shop.look() ({ outfits, hats, faces, back, trails: id | null });
//        opts: { disguise: true — форма охраны (синяя рубашка, тёмные брюки, фуражка) поверх всего, снимается повторным
//        apply без disguise; hideBack: true — спрятать спинной предмет (когда в руках настоящий джетпак); fx — ParticleFX }.
//        Идемпотентно и по слотам: меняется только то, что изменилось; снятое освобождается (меши, текстуры, частицы).
//        Возвращает { jet } — скин джетпака (jetpackSkin) для надетого предмета спины.
//   GameLook.clear(model) — снять всё (при уничтожении модели вызывается само).
//   GameLook.trail(hero, look, dt) — след за героем (hero.x, hero.y — карта, hero.h — высота, hero.ch.vel, hero.ch.grounded):
//        одна непрерывная система частиц на слой, интенсивность по скорости; GameLook.trailStop() — убрать след.
//   GameLook.jetpackSkin(idOrLook) -> { color, color2, flame: { core, outer }, glow } — цвета джетпака (модель — у Blender-агента).
//   GameLook.icon(item|id) -> { id, svg, raster, color, glow, rarity } — иконка карточки; raster — путь assets/ui/items/<id>.webp,
//        если файл есть (проверяется лениво: GameLook.onRaster(fn) сообщает, когда он нашёлся); svg — запасной вид из тех же данных.
//   GameLook.uiIcon('coin' | 'ad') -> { svg, raster } — монета и «реклама» (assets/ui/icons/coin.webp, ad.webp, запас SVG).
//   GameLook.rarityColor(r), GameLook.DEFS (вид предметов по id), GameLook.GUARD (форма охраны).
//
// Эффекты редких предметов: rare — блики, epic — искры, legendary — свечение и искры, mythic — аура; частицы app.fx,
// бюджет телефона (IS_MOBILE) режет ParticleFX сам, плюс свои множители ниже. Видны и в игре, и в превью магазина.

// ============================================================================================================
// Векторные рисунки: [операция, ...]. Цвета — строки CSS; null — без заливки/обводки.
//   ['c', cx, cy, r, fill, stroke, lw]            круг
//   ['e', cx, cy, rx, ry, fill, stroke, lw, deg]  эллипс (deg — поворот)
//   ['r', x, y, w, h, fill, stroke, lw, radius]   прямоугольник
//   ['p', d, fill, stroke, lw]                    путь SVG (M L Q C A Z) — и в Path2D, и в <path>
//   ['t', text, x, y, size, fill, anchor]         надпись (жирный трафарет)
// ============================================================================================================

/** @satisfies {Record<string, any>} */
const LookDraw = {
    FONT: "Impact, 'Arial Black', 'Arial', sans-serif",

    /** Нарисовать записи на холсте (ctx уже масштабирован под размеры рисунка). tint — замена белого. */
    paint(ctx, ops, tint) {
        const fix = (c) => (tint && (c === '#fff' || c === '#ffffff') ? tint : c);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const o of ops) {
            const k = o[0];
            if (k === 'c') { ctx.beginPath(); ctx.arc(o[1], o[2], o[3], 0, Math.PI * 2); this._fs(ctx, fix(o[4]), o[5], o[6]); }
            else if (k === 'e') { ctx.beginPath(); ctx.ellipse(o[1], o[2], o[3], o[4], (o[8] || 0) * Math.PI / 180, 0, Math.PI * 2); this._fs(ctx, fix(o[5]), o[6], o[7]); }
            else if (k === 'r') {
                ctx.beginPath();
                const x = o[1], y = o[2], w = o[3], h = o[4], r = Math.min(o[8] || 0, w / 2, h / 2);
                if (r > 0) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
                else ctx.rect(x, y, w, h);
                this._fs(ctx, fix(o[5]), o[6], o[7]);
            } else if (k === 'p') {
                if (typeof Path2D === 'undefined') continue;
                const path = new Path2D(o[1]);
                if (o[2]) { ctx.fillStyle = fix(o[2]); ctx.fill(path); }
                if (o[3]) { ctx.strokeStyle = o[3]; ctx.lineWidth = o[4] || 1; ctx.stroke(path); }
            } else if (k === 't') {
                ctx.font = '900 ' + o[4] + 'px ' + this.FONT; ctx.textAlign = o[6] || 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = fix(o[5]); ctx.fillText(o[1], o[2], o[3]);
            }
        }
    },

    _fs(ctx, fill, stroke, lw) {
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    },

    _a(fill, stroke, lw) {
        return ' fill="' + (fill || 'none') + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + (lw || 1) + '"' : '');
    },

    /** Записи -> строка SVG-элементов (без <svg>). */
    svg(ops, tint) {
        const fix = (c) => (tint && (c === '#fff' || c === '#ffffff') ? tint : c);
        let s = '';
        for (const o of ops) {
            const k = o[0];
            if (k === 'c') s += '<circle cx="' + o[1] + '" cy="' + o[2] + '" r="' + o[3] + '"' + this._a(fix(o[4]), o[5], o[6]) + '/>';
            else if (k === 'e') s += '<ellipse cx="' + o[1] + '" cy="' + o[2] + '" rx="' + o[3] + '" ry="' + o[4] + '"' + (o[8] ? ' transform="rotate(' + o[8] + ' ' + o[1] + ' ' + o[2] + ')"' : '') + this._a(fix(o[5]), o[6], o[7]) + '/>';
            else if (k === 'r') s += '<rect x="' + o[1] + '" y="' + o[2] + '" width="' + o[3] + '" height="' + o[4] + '"' + (o[8] ? ' rx="' + o[8] + '"' : '') + this._a(fix(o[5]), o[6], o[7]) + '/>';
            else if (k === 'p') s += '<path d="' + o[1] + '"' + this._a(fix(o[2]), o[3], o[4]) + '/>';
            else if (k === 't') s += '<text x="' + o[2] + '" y="' + o[3] + '" font-size="' + o[4] + '" font-weight="900" font-family="' + this.FONT.replace(/'/g, '') + '" text-anchor="' + ({ left: 'start', right: 'end' }[o[6]] || 'middle') + '" dominant-baseline="central" fill="' + fix(o[5]) + '">' + String(o[1]).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>';
        }
        return s;
    },

    /** Правильная n-угольная звезда (путь): центр, внешний и внутренний радиусы, угол первой вершины в градусах. */
    star(cx, cy, R, r, n, rot) {
        let d = '';
        const a0 = ((rot == null ? -90 : rot) * Math.PI) / 180;
        for (let i = 0; i < n * 2; i++) {
            const a = a0 + (i * Math.PI) / n, rr = i % 2 ? r : R;
            d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
        }
        return d + 'Z';
    },
};

/** Цвет 0xRRGGBB -> '#rrggbb'. */
function lookHex(c) { return typeof c === 'string' ? c : '#' + (c & 0xffffff).toString(16).padStart(6, '0'); }
/** Смешать два цвета 0xRRGGBB (t 0..1 к b). */
function lookMix(a, b, t) {
    const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return (f(16) << 16) | (f(8) << 8) | f(0);
}

// ============================================================================================================
// Геометрия примитивов (одна на 3D-меши и на иконки) и сборка мешей.
//   { t:'b', p:[x,y,z], s:[sx,sy,sz], c }                      коробка
//   { t:'y', ..., k }      цилиндр по Y (радиусы sx/2, sz/2; k — масштаб верхнего круга: 0 — конус)
//   { t:'s', ... }         эллипсоид (диаметры)         { t:'t', s:[D, толщина, Dz] }  тор в плоскости XZ
//   { t:'x', pts:[[u,v]…], pl:'xy'|'zy', s:[1,1,толщина] } призма-многоугольник (звёздчатый относительно центра)
//   общее: r:[rx,ry,rz] градусы (порядок Ry·Rx·Rz), g:true — светится (emissive), c — цвет 0xRRGGBB
// ============================================================================================================

/** @satisfies {Record<string, any>} */
const LookGeo = {
    _mm(a, b) {
        const o = new Array(9);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
        return o;
    },

    /** Матрица 3×3 поворота R = Ry·Rx·Rz (градусы). */
    rot(r) {
        const d = Math.PI / 180, a = (r[0] || 0) * d, b = (r[1] || 0) * d, c = (r[2] || 0) * d;
        const sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b), sc = Math.sin(c), cc = Math.cos(c);
        const Rx = [1, 0, 0, 0, ca, -sa, 0, sa, ca], Ry = [cb, 0, sb, 0, 1, 0, -sb, 0, cb], Rz = [cc, -sc, 0, sc, cc, 0, 0, 0, 1];
        return this._mm(this._mm(Ry, Rx), Rz);
    },

    /** Углы [rx, 0, rz] (градусы), которые поворачивают ось Y в направление d. */
    dirRot(d) {
        const l = Math.hypot(d[0], d[1], d[2]) || 1, x = d[0] / l, y = d[1] / l, z = d[2] / l;
        return [Math.atan2(z, y) * 180 / Math.PI, 0, Math.asin(Math.max(-1, Math.min(1, -x))) * 180 / Math.PI];
    },

    /** Примитив -> { V: [[x,y,z,nx,ny,nz]…], T: [[i,j,k]…] } в координатах слоя. lo — грубая сетка (иконки). */
    solid(p, lo) {
        /** @type {number[][]} */ const V = [];
        /** @type {number[][]} */ const T = [];
        const s = p.s, hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
        const add = (x, y, z, nx, ny, nz) => { V.push([x, y, z, nx, ny, nz]); return V.length - 1; };
        const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
        if (p.t === 'b') {
            const F = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
                [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
            const H = [hx, hy, hz];
            for (const [n, u, v] of F) {
                const q = [];
                for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                    q.push(add((n[0] + a * u[0] + b * v[0]) * H[0], (n[1] + a * u[1] + b * v[1]) * H[1], (n[2] + a * u[2] + b * v[2]) * H[2], n[0], n[1], n[2]));
                }
                T.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
            }
        } else if (p.t === 'y') {
            const n = lo ? 10 : 16, k = p.k == null ? 1 : p.k, h = s[1];
            const ny = h > 0 ? (hx * (1 - k)) / h : 0;
            for (let i = 0; i <= n; i++) {
                const a = (i / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), nv = nrm(c, ny, sn);
                add(hx * c, -hy, hz * sn, nv[0], nv[1], nv[2]);
                add(hx * k * c, hy, hz * k * sn, nv[0], nv[1], nv[2]);
            }
            for (let i = 0; i < n; i++) { const a = i * 2; T.push([a, a + 1, a + 3], [a, a + 3, a + 2]); }
            for (const [yy, kk, ny2] of [[hy, k, 1], [-hy, 1, -1]]) {
                if (kk < 0.02) continue;
                const c0 = add(0, yy, 0, 0, ny2, 0), ring = [];
                for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push(add(hx * kk * Math.cos(a), yy, hz * kk * Math.sin(a), 0, ny2, 0)); }
                for (let i = 0; i < n; i++) T.push([c0, ring[i], ring[(i + 1) % n]]);
            }
        } else if (p.t === 's') {
            const L = lo ? 6 : 9, M = lo ? 8 : 14;
            for (let i = 0; i <= L; i++) {
                const ph = (i / L) * Math.PI, sp = Math.sin(ph), cp = Math.cos(ph);
                for (let j = 0; j <= M; j++) {
                    const th = (j / M) * Math.PI * 2, x = hx * sp * Math.cos(th), y = hy * cp, z = hz * sp * Math.sin(th);
                    const nv = nrm(x / (hx * hx || 1), y / (hy * hy || 1), z / (hz * hz || 1));
                    add(x, y, z, nv[0], nv[1], nv[2]);
                }
            }
            for (let i = 0; i < L; i++) for (let j = 0; j < M; j++) {
                const a = i * (M + 1) + j, b = a + M + 1;
                T.push([a, b, b + 1], [a, b + 1, a + 1]);
            }
        } else if (p.t === 't') {
            const U = lo ? 12 : 20, W = lo ? 6 : 8, R = hx, Rz = s[2] / 2 || hx, r = hy;
            for (let i = 0; i <= U; i++) {
                const u = (i / U) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
                for (let j = 0; j <= W; j++) {
                    const v = (j / W) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
                    add((R + r * cv) * cu, r * sv, (Rz + r * cv) * su, cv * cu, sv, cv * su);
                }
            }
            for (let i = 0; i < U; i++) for (let j = 0; j < W; j++) {
                const a = i * (W + 1) + j, b = a + W + 1;
                T.push([a, b, b + 1], [a, b + 1, a + 1]);
            }
        } else if (p.t === 'x') {
            const pts = p.pts, d = s[2] / 2, zy = p.pl === 'zy';
            let cu = 0, cv = 0, area = 0;
            for (const q of pts) { cu += q[0]; cv += q[1]; }
            cu /= pts.length; cv /= pts.length;
            for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
            const map = (u, v, w) => (zy ? [w, v, u] : [u, v, w]);
            for (const sg of [1, -1]) {
                const n = map(0, 0, sg);
                const m0 = map(cu, cv, d * sg), c0 = add(m0[0], m0[1], m0[2], n[0], n[1], n[2]);
                const ring = pts.map((q) => { const m = map(q[0], q[1], d * sg); return add(m[0], m[1], m[2], n[0], n[1], n[2]); });
                for (let i = 0; i < ring.length; i++) T.push([c0, ring[i], ring[(i + 1) % ring.length]]);
            }
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length], du = b[0] - a[0], dv = b[1] - a[1];
                const o = area >= 0 ? [dv, -du] : [-dv, du], n = map(o[0], o[1], 0), nl = Math.hypot(n[0], n[1], n[2]) || 1;
                const q = [[a, d], [b, d], [b, -d], [a, -d]].map(([e, w]) => { const m = map(e[0], e[1], w); return add(m[0], m[1], m[2], n[0] / nl, n[1] / nl, n[2] / nl); });
                T.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
            }
        }
        // поворот и перенос
        const R = this.rot(p.r || [0, 0, 0]), P = p.p || [0, 0, 0];
        for (const v of V) {
            const x = v[0], y = v[1], z = v[2], nx = v[3], ny = v[4], nz = v[5];
            v[0] = R[0] * x + R[1] * y + R[2] * z + P[0]; v[1] = R[3] * x + R[4] * y + R[5] * z + P[1]; v[2] = R[6] * x + R[7] * y + R[8] * z + P[2];
            v[3] = R[0] * nx + R[1] * ny + R[2] * nz; v[4] = R[3] * nx + R[4] * ny + R[5] * nz; v[5] = R[6] * nx + R[7] * ny + R[8] * nz;
            if (p.G) {   // поворот группы (слой) вокруг опоры
                const g = p.G, a = v[0], b = v[1], c = v[2], na = v[3], nb = v[4], nc = v[5];
                v[0] = g[0] * a + g[1] * b + g[2] * c; v[1] = g[3] * a + g[4] * b + g[5] * c; v[2] = g[6] * a + g[7] * b + g[8] * c;
                v[3] = g[0] * na + g[1] * nb + g[2] * nc; v[4] = g[3] * na + g[4] * nb + g[5] * nc; v[5] = g[6] * na + g[7] * nb + g[8] * nc;
            }
            if (p.O) { v[0] += p.O[0]; v[1] += p.O[1]; v[2] += p.O[2]; }
        }
        return { V, T };
    },

    /** Цвет 0xRRGGBB -> [r, g, b] 0..1. */
    rgb(c) { return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; },

    /** Собрать меш Babylon из примитивов (без дочерних): цвета в вершинах. null — примитивов нет. */
    mesh(scene, name, prims, lo) {
        if (!prims.length) return null;
        const B = Humanoid.builder(scene), col = [];
        for (const p of prims) {
            const g = this.solid(p, lo), base = B.pos.length / 3, rgb = this.rgb(p.c == null ? 0xffffff : p.c);
            for (const v of g.V) { B.vert(v[0], v[1], v[2], v[3], v[4], v[5], 0, 0); col.push(rgb[0], rgb[1], rgb[2], 1); }
            for (const t of g.T) B.tri(base + t[0], base + t[1], base + t[2]);
        }
        const m = B.mesh(name);
        m.setVerticesData(BABYLON.VertexBuffer.ColorKind, col);
        m.isPickable = false;
        return m;
    },

    /** Иконка из примитивов: SVG-строка path'ов с painter's sort. view: { yaw, pitch, back } (градусы). */
    iconSvg(prims, view, size) {
        const v = view || {}, yaw = (v.yaw == null ? 32 : v.yaw) * Math.PI / 180, pit = (v.pitch == null ? 16 : v.pitch) * Math.PI / 180;
        const back = !!v.back, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
        const L = (() => { const l = Math.hypot(-0.35, 0.75, 0.65); return [-0.35 / l, 0.75 / l, 0.65 / l]; })();
        /** @type {{ d: number, pts: number[][], fill: string }[]} */
        const tris = [];
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        const proj = (x, y, z) => {
            if (back) { x = -x; z = -z; }
            const x2 = x * cy + z * sy, z2 = -x * sy + z * cy;                  // поворот вокруг Y
            const u = -z2, vv = y * cp - x2 * sp, d = x2 * cp + y * sp;          // экран: вправо = -z, вверх, к зрителю
            return [u, vv, d];
        };
        const o0 = proj(0, 0, 0);
        const pn = (nx, ny, nz) => { const a = proj(nx, ny, nz); return [a[0] - o0[0], a[1] - o0[1], a[2] - o0[2]]; };
        for (const p of prims) {
            const g = this.solid(p, true), rgb = this.rgb(p.c == null ? 0xffffff : p.c);
            const P = g.V.map((q) => proj(q[0], q[1], q[2])), N = g.V.map((q) => pn(q[3], q[4], q[5]));
            for (const t of g.T) {
                const nx = N[t[0]][0] + N[t[1]][0] + N[t[2]][0], ny = N[t[0]][1] + N[t[1]][1] + N[t[2]][1], nz = N[t[0]][2] + N[t[1]][2] + N[t[2]][2];
                const nl = Math.hypot(nx, ny, nz) || 1;
                if (nz / nl < -0.02) continue;                                   // обратная грань
                const lit = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
                const k = p.g ? 1 : 0.64 + 0.45 * lit;
                const f = (a) => Math.max(0, Math.min(255, Math.round(a * k * 255 + (p.g ? 30 : 0))));
                const pts = t.map((i) => P[i]);
                for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, -q[1]); y1 = Math.max(y1, -q[1]); }
                tris.push({ d: (pts[0][2] + pts[1][2] + pts[2][2]) / 3, pts, fill: 'rgb(' + f(rgb[0]) + ',' + f(rgb[1]) + ',' + f(rgb[2]) + ')' });
            }
        }
        if (!tris.length) return '';
        tris.sort((a, b) => a.d - b.d);
        const S = size || 96, pad = S * 0.1, w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), sc = (S - pad * 2) / Math.max(w, h);
        const ox = (S - w * sc) / 2 - x0 * sc, oy = (S - h * sc) / 2 - y0 * sc;
        let out = '', run = '', fill = '';
        const flush = () => { if (run) out += '<path fill="' + fill + '" stroke="' + fill + '" d="' + run + '"/>'; run = ''; };
        for (const t of tris) {
            if (t.fill !== fill) { flush(); fill = t.fill; }
            run += 'M' + t.pts.map((q) => (q[0] * sc + ox).toFixed(1) + ' ' + (-q[1] * sc + oy).toFixed(1)).join('L') + 'Z';
        }
        flush();
        return '<g stroke-width=".6" stroke-linejoin="round">' + out + '</g>';
    },
};

// ============================================================================================================
// Вид предметов (по id каталога GameShopData.js). Единицы — px персонажа (рост 184).
//   Система координат части: Head — центр головы (±22 по X и Y, ±25 по Z, нос на +X);
//   UpperTorso — центр верха туловища (спина X = −17.5, плечи Y = +28, бока Z = ±35); LowerTorso — таз.
//   hats / back / faces: { P: [примитивы] } или { L: [слои] }; слой: { at: часть, o: [опора], r: [градусы] (поворот группы),
//   a: анимация | [анимации], sh: false (без тени), P: [примитивы] }.
//   Анимации: spin {s, ax}, bob {amp, f}, pulse {amp, f}, flap {amp, f, side}, cape {amp}, sway {amp, f}.
//   fx — { c, c2, rate, at, o, box, up, g } поверх умолчаний по редкости (rare — блик, epic — искры, legendary —
//   искры и свечение, mythic — аура).
//   faces: { art: [записи 256×144], glow } + свои примитивы; outfits: { top, bottom, sl: n|s|l, legs: l|s, shoe, print: { f, b } }.
// ============================================================================================================

const LookArt = (() => {
    const B = (x, y, z, sx, sy, sz, c, o) => ({ t: 'b', p: [x, y, z], s: [sx, sy, sz], c, ...o });
    const Y = (x, y, z, dx, h, dz, c, o) => ({ t: 'y', p: [x, y, z], s: [dx, h, dz], c, ...o });
    const S = (x, y, z, dx, dy, dz, c, o) => ({ t: 's', p: [x, y, z], s: [dx, dy, dz], c, ...o });
    const T = (x, y, z, D, th, c, o) => ({ t: 't', p: [x, y, z], s: [D, th, (o && o.dz) || D], c, ...o });
    const X = (pts, x, y, z, d, c, o) => ({ t: 'x', pts, p: [x, y, z], s: [1, 1, d], c, ...o });
    const G = { g: true };
    const INK = '#2a2430', SKIN = '#e2b896';
    const rad = (d) => (d * Math.PI) / 180;

    /** Звезда-многоугольник для призмы (u, v). */
    const starPts = (R, r, n) => { const o = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, q = i % 2 ? r : R; o.push([Math.cos(a) * q, Math.sin(a) * q]); } return o; };

    /** Цепочка конусов (рог, хвост): base, направления, длины, радиусы (n + 1), цвет. Возвращает { P, end }. */
    const chain = (base, dirs, lens, rads, c, o) => {
        const P = [];
        let cur = base.slice();
        for (let i = 0; i < dirs.length; i++) {
            const l = Math.hypot(dirs[i][0], dirs[i][1], dirs[i][2]) || 1, d = [dirs[i][0] / l, dirs[i][1] / l, dirs[i][2] / l];
            const mid = [cur[0] + d[0] * lens[i] / 2, cur[1] + d[1] * lens[i] / 2, cur[2] + d[2] * lens[i] / 2];
            P.push({ t: 'y', p: mid, s: [rads[i] * 2, lens[i], rads[i] * 2], k: rads[i + 1] / rads[i], c, r: LookGeo.dirRot(d), ...o });
            cur = [cur[0] + d[0] * lens[i], cur[1] + d[1] * lens[i], cur[2] + d[2] * lens[i]];
            if (i < dirs.length - 1) P.push({ t: 's', p: cur.slice(), s: [rads[i + 1] * 2, rads[i + 1] * 2, rads[i + 1] * 2], c, ...o });
        }
        return { P, end: cur };
    };

    /** Крыло веером перьев (плоскость zy), side +1 — правое (+Z). */
    const wing = (side, n, len, w, a0, a1, c, o, dx) => {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = n > 1 ? i / (n - 1) : 0, an = rad(a0 + (a1 - a0) * t), L = len * (1 - 0.3 * Math.abs(t - 0.35));
            const base = [[0, -w * 0.3], [L * 0.45, -w * 0.55], [L, 0], [L * 0.45, w * 0.5], [0, w * 0.3]];
            const pts = base.map(([u, v]) => [side * (u * Math.cos(an) - v * Math.sin(an)), u * Math.sin(an) + v * Math.cos(an)]);
            const col = typeof c === 'function' ? c(t, i) : c;
            out.push(X(pts, (dx || 0) - i * 0.12, 0, 0, 1.6, col, { pl: 'zy', ...o }));
        }
        return out;
    };

    /** Крыло-перепонка: многоугольник (z, y) от сустава, кости к вершинам. */
    const membrane = (side, pts, bones, c, c2, th, o) => {
        const P = [X(pts.map(([u, v]) => [side * u, v]), 0, 0, 0, 1.4, c, { pl: 'zy', ...o })];
        for (const [u, v] of bones) {
            const l = Math.hypot(u, v);
            P.push({ t: 'y', p: [0.4, v / 2, (side * u) / 2], s: [th, l, th], c: c2, r: LookGeo.dirRot([0, v, side * u]) });
        }
        return P;
    };

    // ----- шапки -------------------------------------------------------------------------------------
    const horn = (side, base, dirs, lens, rads, c, tip) => {
        const h = chain(base.map((v, i) => (i === 2 ? v * side : v)), dirs.map((d) => [d[0], d[1], d[2] * side]), lens, rads, c);
        if (tip) h.P.push(S(h.end[0], h.end[1], h.end[2], tip.d, tip.d, tip.d, tip.c, G));
        return h.P;
    };
    const both = (fn) => [...fn(1), ...fn(-1)];

    const crown = [Y(0, 25, 0, 46, 8, 52, 0xf2c230), Y(0, 21.8, 0, 46.6, 2, 52.6, 0xd89a10), S(23.4, 25, 0, 5, 5, 5, 0xff3355, G), S(23, 25, 14, 4.5, 4.5, 4.5, 0x33aaff, G), S(23, 25, -14, 4.5, 4.5, 4.5, 0x33aaff, G)];
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, h = i % 2 ? 10 : 15;
        crown.push(Y(Math.cos(a) * 20.5, 29 + h / 2, Math.sin(a) * 23.5, 8, h, 8, 0xf2c230, { k: 0.05 }));
        if (!(i % 2)) crown.push(S(Math.cos(a) * 20.5, 29 + h + 1, Math.sin(a) * 23.5, 4.2, 4.2, 4.2, i % 4 ? 0xff3355 : 0x33e0ff, G));
    }
    const partyDots = [];
    [[0.25, 20, 0xffd23f], [0.4, 140, 0x35c8ff], [0.55, 260, 0xffffff], [0.2, 200, 0x35ff9b], [0.65, 60, 0xffd23f], [0.35, 320, 0xffffff]].forEach(([t, a, c]) => {
        partyDots.push(S(Math.cos(rad(a)) * 17 * (1 - t) * 1.02, 22 + 36 * t, Math.sin(rad(a)) * 19 * (1 - t) * 1.02, 4, 4, 4, c));
    });
    const unicornRings = [];
    [0xff4a4a, 0xffa31a, 0xffe14a, 0x4fe36a, 0x35c8ff, 0xb06cff].forEach((c, i) => { const y = 27 + i * 3.8, r = 5.2 * (1 - (y - 23) / 28) + 0.9; unicornRings.push(Y(0, y, 0, r * 2, 2.2, r * 2, c, G)); });
    const starCrownStars = [];
    for (let i = 0; i < 5; i++) {
        const a = (i * 360) / 5;
        starCrownStars.push(X(starPts(7, 3, 5), Math.cos(rad(a)) * 27, 0, Math.sin(rad(a)) * 27, 1.8, 0xfff2a0, { r: [0, 90 - a, 0], g: true }));
        starCrownStars.push(S(Math.cos(rad(a + 36)) * 27, -3, Math.sin(rad(a + 36)) * 27, 3.4, 3.4, 3.4, 0xffd84a, G));
    }
    const dragonHorn = (side) => {
        const h = chain([-6, 20, 14 * side], [[-0.3, 0.9, 0.3 * side], [-0.65, 0.7, 0.2 * side], [-0.85, 0.35, 0.1 * side]], [14, 13, 12], [6.5, 5.5, 4, 0.7], 0x1a1a22);
        h.P.push(S(h.end[0], h.end[1], h.end[2], 5, 5, 5, 0xff6a1e, G));
        return h.P;
    };
    const horns = (fn) => both(fn);

    const hats = {
        hat_none: { P: [] },
        hat_beanie: { P: [S(0, 19, 0, 48, 34, 54, 0xc8302b), Y(0, 13, 0, 48.4, 7, 54.4, 0xa82320), S(0, 37.5, 0, 12, 12, 12, 0xf5f5f5)] },
        hat_cap: { P: [S(0, 17, 0, 47, 30, 52, 0xd62d2d), B(24, 13.5, 0, 20, 2.5, 34, 0x9d1f1f), S(0, 32, 0, 6, 6, 6, 0xf2c230)] },
        hat_bucket: { P: [Y(0, 27, 0, 44, 12, 50, 0xc9b66b, { k: 0.88 }), Y(0, 21.2, 0, 62, 2.4, 68, 0xb8a55a), Y(0, 22.8, 0, 44.8, 2.6, 50.8, 0x6b5a2a)] },
        hat_hardhat: { P: [S(0, 19, 0, 48, 36, 54, 0xf2c230), Y(0, 13.5, 0, 50, 3, 56, 0xe0ac1c), B(0, 38, 0, 50, 4, 10, 0xe0ac1c), S(22, 27, 0, 10, 10, 10, 0xfff2b0, G)], fx: { c: '#fff2b0', rate: 2, at: 'Head', o: [22, 27, 0] } },
        hat_cowboy: { P: [Y(0, 29, 0, 38, 16, 42, 0x7a4a24, { k: 0.9 }), Y(0, 21.5, 0, 64, 2.4, 72, 0x6b3f1e), B(0, 24.5, 38, 50, 2.4, 8, 0x6b3f1e, { r: [-22, 0, 0] }), B(0, 24.5, -38, 50, 2.4, 8, 0x6b3f1e, { r: [22, 0, 0] }),
            Y(0, 23.8, 0, 39.5, 3, 43.5, 0x2b1a0e), B(19.8, 23.8, 0, 1.4, 4.5, 6, 0xf2c230, G)], fx: { c: '#ffe9a0', rate: 2, o: [19.8, 23.8, 0] } },
        hat_top: { P: [Y(0, 36, 0, 35, 28, 39, 0x16161a, { k: 0.95 }), Y(0, 21.8, 0, 54, 2.4, 60, 0x16161a), Y(0, 24.6, 0, 36, 5, 40, 0xb3202a), B(18, 24.6, 0, 1.6, 5.4, 7, 0xf2c230, G)] },
        hat_pirate: { P: [S(0, 22, 0, 50, 18, 56, 0x1b1b1f),
            X([[-27, 0], [27, 0], [18, 13], [0, 20], [-18, 13]], 22, 23, 0, 3, 0x1b1b1f, { pl: 'zy' }), X([[-27, 0], [27, 0], [18, 13], [0, 20], [-18, 13]], -22, 23, 0, 3, 0x1b1b1f, { pl: 'zy' }),
            X([[-23, 0], [23, 0], [14, 10], [0, 15], [-14, 10]], 0, 23, 27, 3, 0x1b1b1f), X([[-23, 0], [23, 0], [14, 10], [0, 15], [-14, 10]], 0, 23, -27, 3, 0x1b1b1f),
            B(23.7, 23.4, 0, 1, 1.3, 54, 0xf2c230, G), B(0, 23.4, 27.8, 46, 1.3, 1, 0xf2c230, G), B(0, 23.4, -27.8, 46, 1.3, 1, 0xf2c230, G),
            S(24.4, 30, 0, 9, 9, 9, 0xf4f1ea), S(27.6, 31, 2.2, 2, 2.6, 2.6, 0x111111), S(27.6, 31, -2.2, 2, 2.6, 2.6, 0x111111),
            B(24.2, 25.5, 0, 1.4, 3, 16, 0xf4f1ea, { r: [30, 0, 0] }), B(24.2, 25.5, 0, 1.4, 3, 16, 0xf4f1ea, { r: [-30, 0, 0] })] },
        hat_crown: { P: crown, fx: { c: '#ffe58a', c2: '#fff6c8', rate: 9, o: [0, 34, 0], box: [20, 6, 22] } },
        hat_prison: { P: [S(0, 18, 0, 47, 28, 52, 0xf07d1e), Y(0, 12.8, 0, 47.6, 3.6, 52.6, 0x1a1a1a), S(0, 31.5, 0, 5, 5, 5, 0x1a1a1a)] },
        hat_headband: { P: [Y(0, 15.5, 0, 46, 6, 52, 0xd62d2d), S(-24, 15.5, 0, 6, 6, 8, 0xb82020), B(-30, 13, -5, 10, 2.4, 4, 0xd62d2d, { r: [0, 0, -25] }), B(-30, 12, 5, 11, 2.4, 4, 0xd62d2d, { r: [0, 0, -38] })] },
        hat_chef: { P: [Y(0, 24.5, 0, 46, 5, 52, 0xf5f5f5), S(0, 40, 0, 52, 30, 58, 0xffffff), S(0, 47, 14, 24, 20, 24, 0xffffff), S(0, 47, -14, 24, 20, 24, 0xffffff), S(0, 49, 0, 28, 22, 28, 0xffffff)] },
        hat_party: { P: [Y(0, 40, 0, 34, 36, 38, 0xe040a0, { k: 0.04 }), ...partyDots, S(0, 58.5, 0, 9, 9, 9, 0xffd23f, G)], fx: { c: '#ffd23f', c2: '#35c8ff', rate: 4, o: [0, 56, 0], g: 'confetti' } },
        hat_bunny: { P: [Y(0, 23, 0, 45, 3, 51, 0xffb3c7), ...both((s) => [S(-2, 45, 13 * s, 9, 38, 5, 0xffffff, { r: [10 * s, 0, 0] }), S(-0.6, 45, 13 * s, 5.4, 32, 3.2, 0xffb3c7, { r: [10 * s, 0, 0] })])],
            },
        hat_cat: { P: [Y(0, 22.5, 0, 45, 3, 51, 0x222226), ...both((s) => [X([[-9, 0], [9, 0], [0, 19]], -3, 21, 15 * s, 3.5, 0x222226, { pl: 'zy', r: [14 * s, 0, 0] }), X([[-5.5, 1], [5.5, 1], [0, 13.5]], -1.2, 21.5, 15 * s, 1.2, 0xff8fb1, { pl: 'zy', r: [14 * s, 0, 0] })])] },
        hat_viking: { P: [S(0, 19, 0, 48, 32, 54, 0x8a929c), Y(0, 13.5, 0, 49, 4, 55, 0x5a4630), B(23, 5, 0, 1.6, 13, 3.5, 0x6e7680), S(23.5, 13.5, 16, 3, 3, 3, 0xf2c230), S(23.5, 13.5, -16, 3, 3, 3, 0xf2c230),
            ...horns((s) => horn(s, [0, 20, 25], [[0, 0.35, 0.94], [0.1, 0.75, 0.65], [0.2, 1, 0.2]], [14, 14, 12], [5, 4.2, 3.2, 0.8], 0xf4efe0))] },
        hat_wizard: { P: [Y(0, 21.5, 0, 66, 2.4, 72, 0x4b2a8a), Y(0, 32, 0, 40, 22, 44, 0x5b34a8, { k: 0.55 }), ...chain([0, 43, 0], [[0, 1, 0], [-0.4, 1, 0], [-0.9, 0.8, 0]], [12, 11, 9], [11, 8, 5, 0.6], 0x5b34a8).P,
            Y(0, 24, 0, 40.5, 3, 44.5, 0xf2c230), S(16, 32, 5, 4, 4, 4, 0xffe14a, G), S(-12, 36, 12, 4, 4, 4, 0xffe14a, G), S(8, 28, -16, 4, 4, 4, 0xffe14a, G), S(-6, 44, -4, 3.4, 3.4, 3.4, 0xffe14a, G)],
            fx: { c: '#ffe14a', rate: 3, o: [-6, 44, 0] } },
        hat_propeller: { L: [{ at: 'Head', P: [S(0, 17, 0, 47, 30, 52, 0x2d7fe0), B(24, 13.5, 0, 20, 2.5, 34, 0xf2c230), S(0, 31, 0, 6, 6, 6, 0xd62d2d), Y(0, 35, 0, 2, 6, 2, 0x888888)] },
            { at: 'Head', o: [0, 38.5, 0], a: { k: 'spin', s: 16 }, P: [B(0, 0, 0, 40, 1.4, 5, 0xd62d2d), B(0, 0.4, 0, 5, 1.4, 40, 0xf2c230), S(0, 0.6, 0, 6, 5, 6, 0x888888)] }], fx: { c: '#35c8ff', rate: 4, o: [0, 40, 0], box: [18, 1, 18] } },
        hat_halo: { L: [{ at: 'Head', o: [0, 38, 0], sh: false, a: [{ k: 'bob', amp: 1.8, f: 2.2 }, { k: 'pulse', amp: 0.05, f: 3 }], P: [T(0, 0, 0, 34, 4.2, 0xffe58a, { g: true, dz: 38 })] }], fx: { c: '#ffe58a', rate: 7, o: [0, 38, 0], box: [16, 2, 18] } },
        hat_devil: { P: [...horns((s) => horn(s, [-2, 22, 13], [[-0.1, 1, 0.2], [-0.25, 1, 0.35]], [10, 9], [5.5, 4.2, 0.6], 0xc62828, { c: 0xff8a1e, d: 4 }))], fx: { c: '#ff8a1e', rate: 6, o: [-4, 40, 0], box: [4, 2, 22], g: 'dot', up: 24 } },
        hat_knight: { P: [S(0, 19, 0, 50, 36, 56, 0x9aa3ad), B(2, 0, 27, 36, 26, 3, 0x8a939d), B(2, 0, -27, 36, 26, 3, 0x8a939d), B(-23.5, 0, 0, 3, 34, 54, 0x8a939d), B(0, 38, 0, 50, 4, 5, 0x6c7580),
            B(21, 17, 0, 6, 9, 44, 0x6c7580, { r: [0, 0, -35] }), Y(0, 13.8, 0, 50.6, 2.4, 56.6, 0xf2c230, G),
            X([[-22, 0], [22, 0], [18, 10], [6, 17], [-8, 19], [-20, 13]], 0, 40, 0, 3, 0xd62d2d)], fx: { c: '#ffd86b', rate: 6, o: [0, 42, 0], box: [20, 4, 3] } },
        hat_unicorn: { P: [Y(0, 22, 0, 45, 3, 51, 0xff9ad5), Y(0, 36, 0, 10, 26, 10, 0xffffff, { k: 0.05 }), ...unicornRings,
            S(-6, 25, 0, 12, 12, 12, 0xff7ac8), S(-14, 22, 0, 12, 14, 12, 0xb06cff), S(-20, 17, 0, 10, 14, 10, 0x6cc8ff),
            ...both((s) => [X([[-5, 0], [5, 0], [0, 12]], 0, 22, 17 * s, 2.5, 0xffffff, { pl: 'zy', r: [18 * s, 0, 0] })])], fx: { c: '#ff9ad5', c2: '#9ad8ff', rate: 12, o: [0, 44, 0], box: [4, 10, 4], g: 'star' } },
        hat_dragon: { P: [...horns(dragonHorn)], fx: { c: '#ff7a1e', c2: '#ffd24a', rate: 16, o: [-16, 38, 0], box: [14, 6, 28], g: 'dot', up: 40 } },
        hat_starcrown: { L: [{ at: 'Head', o: [0, 27, 0], sh: false, a: { k: 'bob', amp: 1.2, f: 1.8 }, P: [T(0, 0, 0, 40, 3.5, 0xffd84a, { g: true, dz: 46 })] },
            { at: 'Head', o: [0, 36, 0], sh: false, a: { k: 'spin', s: 1.5 }, P: starCrownStars }], fx: { c: '#ffe58a', c2: '#fff6c8', rate: 12, o: [0, 38, 0], box: [26, 6, 28], g: 'star' } },
        // эксклюзив Daily Gift: золотая каска начальника с гербом, красными лампами и светящимся гребнем
        hat_boss_helmet: { P: [S(0, 19, 0, 50, 38, 56, 0xf2c230), Y(0, 13.5, 0, 53, 3.4, 59, 0xd89a10), B(0, 39, 0, 52, 4.5, 11, 0xffe58a, G), B(0, 37, 0, 4, 6, 40, 0xd89a10),
            B(25, 24, 0, 2, 13, 13, 0x1a1a1f), B(26, 24, 0, 1, 8, 2.4, 0xf2c230, G), B(26, 24, 0, 1, 2.4, 8, 0xf2c230, G),
            S(21, 33, 17, 7, 7, 7, 0xff3355, G), S(21, 33, -17, 7, 7, 7, 0xff3355, G), B(23, 15, 0, 2, 3, 52, 0x1a1a1f)], glow: 0.2,
            fx: { c: '#ffe58a', c2: '#fff6c8', rate: 12, o: [0, 40, 0], box: [22, 6, 24], g: 'star' } },
    };

    // ----- спина -----------------------------------------------------------------------------------
    const jet = (c1, c2, glow, extra) => [Y(-27, 2, 11, 16, 44, 16, c1, { k: 0.95 }), Y(-27, 2, -11, 16, 44, 16, c1, { k: 0.95 }), S(-27, 24, 11, 15, 10, 15, c1), S(-27, 24, -11, 15, 10, 15, c1),
        B(-22, 6, 0, 6, 10, 22, 0x30343c), Y(-27, -23, 11, 12, 7, 12, 0x2a2d33, { k: 0.7 }), Y(-27, -23, -11, 12, 7, 12, 0x2a2d33, { k: 0.7 }),
        Y(-27, 9, 11, 16.8, 5, 16.8, c2), Y(-27, 9, -11, 16.8, 5, 16.8, c2), S(-35.4, 14, 11, 3, 3, 3, glow, G), S(-35.4, 14, -11, 3, 3, 3, glow, G), ...(extra || [])];
    const straps = (c) => [B(18.4, 6, 15, 1.6, 40, 6, c), B(18.4, 6, -15, 1.6, 40, 6, c)];
    const capeShape = (w0, w1, h, c, o) => X([[-w0, 0], [w0, 0], [w1, -h], [-w1, -h]], -1.5, 0, 0, 2.2, c, { pl: 'zy', ...o });
    const clasp = [S(-16, 26.5, 18, 6, 6, 6, 0xf2c230, G), S(-16, 26.5, -18, 6, 6, 6, 0xf2c230, G), B(-16, 26.5, 0, 2, 2, 36, 0xf2c230, G)];
    const guitar = [S(0, -12, 0, 9, 28, 26, 0xc58a3a), S(0, 6, 0, 9, 22, 20, 0xc58a3a), Y(-4.6, -4, 0, 8, 0.6, 8, 0x1a1a1a, { r: [0, 0, 90] }), B(0, 34, 0, 4, 34, 5, 0x5a3a1c), B(0, 54, 0, 5, 10, 7, 0x2b1a0e), B(-4.4, -22, 0, 1.2, 2, 14, 0x2b1a0e),
        S(-0.5, 55, 3, 2, 2, 2, 0xd8d8d8), S(-0.5, 55, -3, 2, 2, 2, 0xd8d8d8)];
    const bowArc = [];
    for (let i = 0; i < 8; i++) {
        const a0 = rad(-62 + i * (124 / 8)), a1 = rad(-62 + (i + 1) * (124 / 8)), R = 30, xc = -10;
        const p0 = [xc - R * Math.cos(a0), R * Math.sin(a0)], p1 = [xc - R * Math.cos(a1), R * Math.sin(a1)];
        const d = [p1[0] - p0[0], p1[1] - p0[1], 0], l = Math.hypot(d[0], d[1]);
        bowArc.push({ t: 'y', p: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0], s: [3.2, l + 0.6, 3.2], c: 0x8a5a2b, r: LookGeo.dirRot(d) });
    }
    bowArc.push(Y(-24, 0, 0, 0.9, 52, 0.9, 0xeeeeee), B(-40, 0, 0, 4, 9, 4.6, 0x2b1a0e));
    const angelA = (side) => [...wing(side, 7, 52, 11, -30, 70, 0xffffff), ...wing(side, 6, 32, 10, -20, 75, 0xcfe8ff, G, 0.6)];
    const batA = (side) => membrane(side, [[0, 0], [14, 36], [26, 22], [38, 34], [50, 14], [60, 24], [62, -10], [44, -26], [24, -18], [8, -10]], [[14, 36], [38, 34], [60, 24], [62, -10]], 0x3a2150, 0x1d1028, 2.2);
    const butterflyA = (side) => [
        ...membrane(side, [[0, 0], [10, 30], [34, 52], [58, 44], [62, 22], [44, 4]].map(([u, v]) => [u * 1.1, v * 1.1]), [], 0x2b1640, 0x2b1640, 1),
        X([[0, 0], [10, 30], [34, 52], [58, 44], [62, 22], [44, 4]].map(([u, v]) => [side * u, v]), 0.5, 0, 0, 1.4, 0x35c8d9, { pl: 'zy' }),
        X([[0, -2], [40, -4], [52, -26], [40, -46], [16, -36], [4, -14]].map(([u, v]) => [side * u, v]), 0.5, 0, 0, 1.4, 0xff6fae, { pl: 'zy' }),
        S(1.4, 34, side * 40, 2, 9, 9, 0xffe14a, G), S(1.4, -26, side * 32, 2, 8, 8, 0xffe14a, G), S(1.4, 14, side * 24, 2, 6, 6, 0xffffff, G)];
    const phoenixA = (side) => wing(side, 8, 64, 12, -34, 78, (t) => lookMix(0xff3b1f, 0xffd24a, t), G);
    const dragonA = (side) => membrane(side, [[0, 0], [26, 60], [42, 34], [58, 54], [70, 26], [88, 28], [84, 0], [90, -8], [70, -20], [40, -30], [10, -16]], [[26, 60], [58, 54], [88, 28], [90, -8]], 0x5a1020, 0x16121a, 3.2)
        .concat([X([[0, 0], [26, 60], [42, 34], [58, 54], [70, 26], [88, 28], [84, 0], [90, -8], [70, -20], [40, -30], [10, -16]].map(([u, v]) => [side * u * 1.04, v * 1.04 - 0.5]), -0.6, 0, 0, 1.2, 0xff6a1e, { pl: 'zy', g: true })]);
    const voidStars = [S(-32, 18, 9, 2.4, 2.4, 2.4, 0xffffff, G), S(-33, -6, 14, 2.4, 2.4, 2.4, 0xff7cf0, G), S(-31, 4, -8, 2.4, 2.4, 2.4, 0x8cf0ff, G), S(-33, 12, -13, 2.4, 2.4, 2.4, 0xffffff, G)];
    const neonJet = jet(0x15161c, 0x19e6ff, 0x19e6ff, [B(-35.2, -4, 11, 0.8, 22, 1.2, 0x19e6ff, G), B(-35.2, -4, -11, 0.8, 22, 1.2, 0x19e6ff, G)]);

    const wingLayer = (P, side, o, anim) => ({ at: 'UpperTorso', o: o || [-20, 16, 10 * side], sh: false, a: anim || { k: 'flap', amp: 0.35, f: 3, side }, P: P(side) });

    const back = {
        back_none: { P: [] },
        back_pack: { P: [B(-26, -2, 0, 18, 38, 42, 0x4d7a3a), B(-26.5, 17, 0, 19, 8, 43, 0x3f6630), B(-37, -10, 0, 5, 16, 30, 0x3f6630), B(-26, 23, 0, 3, 2, 10, 0x222222), ...straps(0x2b2b2b)] },
        back_school: { P: [B(-26, 0, 0, 17, 42, 46, 0x2f6fc4), B(-36, -8, 0, 3.2, 22, 36, 0x255aa0), B(-37.8, -8, 0, 0.8, 2, 34, 0xf2c230), B(-34.6, 10, 0, 0.8, 3, 40, 0xe8f3ff), ...straps(0x1d1d22)] },
        back_bedroll: { P: [B(-25, -6, 0, 14, 30, 34, 0x6b5a3a), Y(-31, 18, 0, 13, 52, 13, 0x3a6d9a, { r: [90, 0, 0] }), Y(-31, 18, 14, 13.8, 3, 13.8, 0x5a3a1c, { r: [90, 0, 0] }), Y(-31, 18, -14, 13.8, 3, 13.8, 0x5a3a1c, { r: [90, 0, 0] }), ...straps(0x5a3a1c)] },
        back_cape_red: { L: [{ at: 'UpperTorso', o: [-18, 26, 0], a: { k: 'cape', amp: 0.55 }, P: [capeShape(24, 34, 60, 0xc62828), B(-1.5, -60, 0, 2.4, 3, 68, 0xf2c230)] }, { at: 'UpperTorso', P: clasp }], fx: { c: '#ffe9a0', rate: 2, o: [-16, 26.5, 18] } },
        back_guitar: { P: guitar },
        back_sword: { L: [{ at: 'UpperTorso', o: [-22, 0, 0], r: [35, 0, 0], P: [Y(0, 0, 0, 6, 70, 3.6, 0x3a2414), Y(0, 32, 0, 7, 5, 4.6, 0xf2c230), B(0, 36.5, 0, 5, 3, 17, 0xf2c230, G), Y(0, 44, 0, 3.6, 12, 3.6, 0x5a1a1a), S(0, 51.5, 0, 6, 6, 6, 0xf2c230, G), Y(0, -36, 0, 6, 4, 3.6, 0xf2c230, { k: 0.6 })] }],
            fx: { c: '#ffe9a0', rate: 4, o: [-22, 38, 14] } },
        back_bow: { L: [{ at: 'UpperTorso', o: [-22, -6, -14], P: [Y(0, 0, 0, 12, 38, 12, 0x6b4423, { k: 1.1 }), Y(0, 24, 3, 1.6, 16, 1.6, 0xd8c8a0), Y(0, 24, -2, 1.6, 15, 1.6, 0xd8c8a0), Y(-2, 22, 0, 1.6, 12, 1.6, 0xd8c8a0), B(0, 32, 3, 0.8, 6, 3, 0xd62d2d), B(0, 31, -2, 0.8, 6, 3, 0xd62d2d)] }, { at: 'UpperTorso', o: [0, 6, 4], P: bowArc }],
            fx: { c: '#ffe9a0', rate: 4, o: [-34, 6, 4] } },
        back_wings_angel: { L: [wingLayer(angelA, 1), wingLayer(angelA, -1)], fx: { c: '#fff6c8', c2: '#cfe8ff', rate: 12, o: [-30, 20, 0], box: [4, 24, 60], g: 'star' } },
        back_jet_orange: { P: jet(0xf07d1e, 0xf2c230, 0xffd24a), jet: { color: 0xf07d1e, color2: 0xf2c230, glow: 0xffd24a, flame: { core: '#fff3b0', outer: '#ff8a1e' } } },
        back_jet_blue: { P: jet(0x2d7fe0, 0xbfe3ff, 0x9ad8ff), jet: { color: 0x2d7fe0, color2: 0xbfe3ff, glow: 0x9ad8ff, flame: { core: '#e8fbff', outer: '#3ac8ff' } } },
        back_cape_blue: { L: [{ at: 'UpperTorso', o: [-18, 26, 0], a: { k: 'cape', amp: 0.5 }, P: [capeShape(24, 34, 62, 0x1f3c88), B(-1.5, -62, 0, 2.4, 3, 68, 0xf4f1ea)] }, { at: 'UpperTorso', P: [S(-16, 26.5, 18, 5, 5, 5, 0xf4f1ea), S(-16, 26.5, -18, 5, 5, 5, 0xf4f1ea), B(-16, 26.5, 0, 2, 2, 36, 0xf4f1ea)] }] },
        back_surfboard: { P: [S(-24, 0, 0, 4.5, 80, 22, 0x19c8d9, { r: [0, 0, 0] }), B(-26.4, 0, 0, 0.6, 76, 5, 0xff7a1a), B(-26.5, 16, 0, 0.6, 10, 12, 0xffffff), B(-28, -33, 0, 6, 10, 1.6, 0x145a63)], fx: { c: '#9ad8ff', rate: 2, o: [-26, 10, 0] } },
        back_shield: { P: [Y(-23, 0, 0, 40, 4, 40, 0x8a5a2b, { r: [0, 0, 90] }), T(-23, 0, 0, 40, 4, 0xaab2bc, { r: [0, 0, 90] }), S(-26, 0, 0, 10, 10, 10, 0xb9c0c8), B(-25, 0, 0, 0.6, 38, 1.5, 0x3b2410), B(-25, 0, 0, 0.6, 1.5, 38, 0x3b2410)], fx: { c: '#ffffff', rate: 2, o: [-26, 0, 0] } },
        back_wings_bat: { L: [wingLayer(batA, 1, [-20, 20, 10], { k: 'flap', amp: 0.28, f: 2.6, side: 1 }), wingLayer(batA, -1, [-20, 20, -10], { k: 'flap', amp: 0.28, f: 2.6, side: -1 })], fx: { c: '#b06cff', rate: 2, o: [-30, 20, 0], box: [4, 10, 40] } },
        back_cloak: { L: [{ at: 'UpperTorso', o: [-18, 26, 0], a: { k: 'cape', amp: 0.35 }, P: [capeShape(22, 36, 76, 0x5a2a9a), B(-1.5, -76, 0, 2.4, 3, 74, 0xf2c230)] }, { at: 'UpperTorso', P: [S(-14, 30, 0, 22, 24, 34, 0x4a1d7a), S(-16, 26.5, 18, 5, 5, 5, 0xf2c230, G), S(-16, 26.5, -18, 5, 5, 5, 0xf2c230, G)] }], fx: { c: '#c08cff', rate: 2, o: [-16, 30, 0] } },
        back_parachute: { P: [B(-27, 6, 0, 20, 50, 52, 0xf0802a), B(-37.2, 6, 0, 0.6, 44, 14, 0xf4f1ea), B(-37.2, 6, 17, 0.6, 44, 5, 0xf4f1ea), B(-37.2, 6, -17, 0.6, 44, 5, 0xf4f1ea), ...straps(0xf4f1ea), B(18.4, 4, 0, 1.6, 4, 30, 0xf4f1ea), S(-38, -8, 0, 5, 5, 5, 0xd62d2d)] },
        back_jet_neon: { P: neonJet, jet: { color: 0x15161c, color2: 0x19e6ff, glow: 0x19e6ff, flame: { core: '#d8fffe', outer: '#19e6ff' } }, fx: { c: '#19e6ff', rate: 7, o: [-32, 4, 0], box: [4, 20, 24], g: 'dot' } },
        back_wings_butterfly: { L: [wingLayer(butterflyA, 1, [-20, 16, 8], { k: 'flap', amp: 0.4, f: 4, side: 1 }), wingLayer(butterflyA, -1, [-20, 16, -8], { k: 'flap', amp: 0.4, f: 4, side: -1 })], fx: { c: '#ff9ad5', c2: '#9ad8ff', rate: 10, o: [-30, 16, 0], box: [4, 24, 70], g: 'star' } },
        back_cape_hero: { L: [{ at: 'UpperTorso', o: [-18, 26, 0], a: { k: 'cape', amp: 0.8 }, P: [capeShape(26, 38, 70, 0xb71c1c), B(-1.5, -70, 0, 2.4, 3.4, 76, 0xf2c230, G), B(-1.5, -35, 38 - 2, 2.4, 70, 2.6, 0xf2c230), B(-1.5, -35, -(38 - 2), 2.4, 70, 2.6, 0xf2c230),
            X(starPts(15, 6.5, 5), -3, -26, 0, 1.2, 0xffd84a, { pl: 'zy', g: true })] }, { at: 'UpperTorso', P: clasp }], fx: { c: '#ffd86b', rate: 8, o: [-22, -10, 0], box: [4, 24, 30], g: 'star' } },
        back_jet_gold: { P: jet(0xe8b923, 0xfff2b0, 0xfff2b0), jet: { color: 0xe8b923, color2: 0xfff2b0, glow: 0xfff2b0, flame: { core: '#fff6c8', outer: '#ffb300' } }, fx: { c: '#ffe58a', rate: 10, o: [-30, 4, 0], box: [6, 24, 28], g: 'star' } },
        back_wings_phoenix: { L: [wingLayer(phoenixA, 1, [-20, 16, 9], { k: 'flap', amp: 0.3, f: 2.8, side: 1 }), wingLayer(phoenixA, -1, [-20, 16, -9], { k: 'flap', amp: 0.3, f: 2.8, side: -1 })], fx: { c: '#ff7a1e', c2: '#ffd24a', rate: 22, o: [-30, 14, 0], box: [6, 26, 70], g: 'dot', up: 26 } },
        back_wings_dragon: { L: [wingLayer(dragonA, 1, [-20, 18, 10], { k: 'flap', amp: 0.26, f: 2.2, side: 1 }), wingLayer(dragonA, -1, [-20, 18, -10], { k: 'flap', amp: 0.26, f: 2.2, side: -1 })], fx: { c: '#ff6a1e', c2: '#ffd24a', rate: 24, o: [-30, 12, 0], box: [6, 30, 80], g: 'dot', up: 30 } },
        back_jet_void: { P: jet(0x241046, 0x9b3dff, 0xe08cff, voidStars), jet: { color: 0x241046, color2: 0x9b3dff, glow: 0xe08cff, flame: { core: '#f3d9ff', outer: '#b04dff' } }, fx: { c: '#c06cff', c2: '#ffffff', rate: 20, o: [-32, 4, 0], box: [8, 26, 30], g: 'star' } },
    };

    // ----- лица (холст 256×144, весь рисунок — записи LookDraw) ----------------------------------
    const eyes = (y, dx, rx, ry, f) => [['e', 128 - dx, y, rx, ry, f || INK], ['e', 128 + dx, y, rx, ry, f || INK]];
    const smile = (y, w, c, lw) => ['p', 'M' + (128 - w) + ' ' + y + ' Q128 ' + (y + w * 0.8) + ' ' + (128 + w) + ' ' + y, null, c || INK, lw || 6];
    const heartD = (cx, cy, w) => 'M' + cx + ' ' + (cy + 0.55 * w) + ' C' + (cx - 0.95 * w) + ' ' + (cy - 0.05 * w) + ' ' + (cx - 0.55 * w) + ' ' + (cy - 0.8 * w) + ' ' + cx + ' ' + (cy - 0.3 * w) + ' C' + (cx + 0.55 * w) + ' ' + (cy - 0.8 * w) + ' ' + (cx + 0.95 * w) + ' ' + (cy - 0.05 * w) + ' ' + cx + ' ' + (cy + 0.55 * w) + 'Z';
    const flameD = (cx, cy, k) => 'M' + cx + ' ' + (cy + 22 * k) + ' C' + (cx - 26 * k) + ' ' + (cy + 8 * k) + ' ' + (cx - 12 * k) + ' ' + (cy - 8 * k) + ' ' + cx + ' ' + (cy - 30 * k) + ' C' + (cx + 10 * k) + ' ' + (cy - 8 * k) + ' ' + (cx + 26 * k) + ' ' + (cy + 8 * k) + ' ' + cx + ' ' + (cy + 22 * k) + 'Z';
    const wrapBox = (c, y, h) => B(-0.4, y, 0, 45.2, h, 51.8, c);

    const faces = {
        face_default: { art: [...eyes(58, 43, 10, 16), ['p', 'M90 76 Q128 106 166 76', null, INK, 7]] },
        face_smile: { art: [...eyes(54, 43, 9, 14), ['p', 'M82 80 Q128 140 174 80 Z', INK], ['p', 'M92 83 Q128 96 164 83 L158 92 Q128 103 98 92 Z', '#fff']] },
        face_wink: { art: [['e', 85, 58, 10, 16, INK], ['p', 'M150 62 Q171 42 192 62', null, INK, 7], smile(80, 40, INK, 6)] },
        face_glasses: { art: [...eyes(58, 43, 6, 9), ['c', 85, 58, 29, 'rgba(210,235,255,.25)', '#1d1d22', 6], ['c', 171, 58, 29, 'rgba(210,235,255,.25)', '#1d1d22', 6], ['p', 'M114 56 Q128 46 142 56', null, '#1d1d22', 6], ['p', 'M56 56 L38 50 M200 56 L218 50', null, '#1d1d22', 6], smile(94, 28, INK, 6)] },
        face_shades: { art: [['r', 50, 38, 66, 38, '#111114', null, 0, 10], ['r', 140, 38, 66, 38, '#111114', null, 0, 10], ['r', 116, 44, 24, 7, '#111114'], ['p', 'M62 48 L84 48', null, 'rgba(255,255,255,.55)', 5], ['p', 'M152 48 L174 48', null, 'rgba(255,255,255,.55)', 5], smile(96, 28, INK, 6)], fx: { c: '#ffffff', rate: 2, o: [24, 2, 0], box: [1, 4, 18] } },
        face_bandana: { art: [...eyes(50, 43, 9, 14), ['p', 'M0 72 L256 72 L256 144 L0 144 Z', '#c8302b'], ['p', 'M0 72 L256 72', null, '#8a1f1c', 7], ['c', 52, 102, 6, '#f5e6c8'], ['c', 100, 112, 5, '#f5e6c8'], ['c', 156, 104, 6, '#f5e6c8'], ['c', 204, 114, 5, '#f5e6c8'], ['e', 128, 92, 8, 5, '#f5e6c8'], ['e', 78, 124, 7, 4, '#f5e6c8']],
            P: [wrapBox(0xc8302b, -11.5, 21), S(-24, -8, 0, 6, 6, 8, 0xa82320), B(-27, -14, 4, 7, 3, 3, 0xc8302b, { r: [0, 0, 20] }), B(-27, -14, -4, 7, 3, 3, 0xc8302b, { r: [0, 0, 35] })] },
        face_hockey: { art: [['r', 8, 2, 240, 140, '#f4f1ea', '#c9c5b8', 3, 50], ['e', 88, 56, 20, 13, '#161616'], ['e', 168, 56, 20, 13, '#161616'], ['p', 'M128 40 L128 96', null, '#cfcabb', 4], ['p', 'M36 18 L98 76', null, '#c62828', 5], ['p', 'M48 12 L80 44', null, '#c62828', 4],
            ...[[56, 96], [84, 100], [112, 104], [144, 104], [172, 100], [200, 96], [70, 120], [100, 124], [156, 124], [186, 120], [128, 116]].map(([x, y]) => ['c', x, y, 5, '#161616'])],
            P: [B(-0.4, -16.5, 0, 45.2, 11, 51.8, 0xf4f1ea), B(-0.4, 12, 0, 45.4, 3, 51.8, 0x222222)], fx: { c: '#ff4a4a', rate: 2, o: [24, 0, -8] } },
        face_ninja: { art: [['r', 0, 0, 256, 144, '#1b1b20'], ['r', 22, 34, 212, 54, SKIN, null, 0, 24], ['p', 'M48 62 Q85 38 120 62 Q85 74 48 62 Z', '#fff'], ['p', 'M136 62 Q171 38 208 62 Q171 74 136 62 Z', '#fff'], ['e', 86, 58, 9, 8, INK], ['e', 170, 58, 9, 8, INK], ['p', 'M44 46 L122 40 M212 46 L134 40', null, INK, 7]],
            P: [B(-0.4, 0, 0, 45.2, 44.4, 51.8, 0x1b1b20)], fx: { c: '#c62828', rate: 2, o: [24, 0, 0], box: [1, 3, 20] } },
        face_gold: { art: [['r', 16, 4, 224, 136, '#e8b923', '#a67c10', 4, 50], ['p', 'M50 56 Q85 36 120 56 Q85 74 50 56 Z', '#2a1c05'], ['p', 'M136 56 Q171 36 206 56 Q171 74 136 56 Z', '#2a1c05'], ['p', 'M44 38 Q85 20 124 36 M132 36 Q171 20 212 38', null, '#fff2b0', 4], ['p', 'M128 56 L128 100', null, '#a67c10', 5], ['p', 'M96 106 Q128 122 160 106', null, '#a67c10', 5], ['c', 128, 22, 7, '#35e0ff', '#a67c10', 2], ['c', 44, 84, 4, '#fff2b0'], ['c', 212, 84, 4, '#fff2b0']],
            glow: 0.35, P: [S(22.8, 11.5, 0, 6, 6, 6, 0x35e0ff, G), B(-0.4, -16.5, 0, 45.2, 11, 51.8, 0xe8b923)], fx: { c: '#ffe58a', rate: 9, o: [24, 2, 0], box: [2, 10, 16], g: 'star' } },
        face_angry: { art: [['p', 'M44 38 L108 58', null, INK, 10], ['p', 'M212 38 L148 58', null, INK, 10], ['e', 85, 68, 9, 9, INK], ['e', 171, 68, 9, 9, INK], ['p', 'M80 110 Q128 84 176 110 L164 114 L152 104 L140 114 L128 102 L116 114 L104 104 L92 114 Z', '#fff', INK, 5]] },
        face_surprise: { art: [['p', 'M62 24 Q85 12 108 24 M148 24 Q171 12 194 24', null, INK, 6], ['e', 85, 58, 22, 26, '#fff', INK, 5], ['e', 171, 58, 22, 26, '#fff', INK, 5], ['c', 85, 60, 8, INK], ['c', 171, 60, 8, INK], ['e', 128, 106, 15, 20, INK]] },
        face_sleepy: { art: [['e', 85, 62, 12, 6, INK], ['e', 171, 62, 12, 6, INK], ['p', 'M60 56 L110 56 M146 56 L196 56', null, INK, 6], ['e', 128, 100, 12, 7, INK], ['c', 176, 88, 13, 'rgba(150,215,255,.6)', '#7cc4ee', 3], ['c', 171, 83, 3, '#fff'], ['p', 'M214 24 L232 24 L214 40 L232 40', null, '#7ba8ff', 5]] },
        face_mustache: { art: [...eyes(48, 43, 9, 14), ['p', 'M128 76 Q104 62 78 72 Q62 78 52 70 Q56 92 82 90 Q108 90 128 82 Q148 90 174 90 Q200 92 204 70 Q194 78 178 72 Q152 62 128 76 Z', '#2a1a10'], ['p', 'M104 108 Q128 124 152 108', null, INK, 6]] },
        face_cat: { art: [['e', 85, 52, 12, 17, '#ffd34a', INK, 3], ['e', 171, 52, 12, 17, '#ffd34a', INK, 3], ['e', 85, 52, 4, 15, INK], ['e', 171, 52, 4, 15, INK], ['p', 'M116 78 L140 78 L128 91 Z', '#ff8fb1'], ['p', 'M128 91 L128 99 M128 99 Q116 110 104 101 M128 99 Q140 110 152 101', null, INK, 4], ['p', 'M60 86 L12 78 M60 96 L10 98 M62 106 L16 118 M196 86 L244 78 M196 96 L246 98 M194 106 L240 118', null, '#4a4250', 3]] },
        face_vampire: { art: [['p', 'M52 36 L112 50 M204 36 L144 50', null, INK, 7], ['e', 85, 58, 12, 16, '#fff', INK, 3], ['e', 171, 58, 12, 16, '#fff', INK, 3], ['c', 85, 60, 6, '#d01030'], ['c', 171, 60, 6, '#d01030'], ['p', 'M84 88 Q128 120 172 88 Q128 98 84 88 Z', '#3a0a14'], ['p', 'M100 94 L110 94 L104 114 Z', '#fff'], ['p', 'M146 94 L156 94 L152 114 Z', '#fff']], fx: { c: '#d01030', rate: 2, o: [24, 0, 0], box: [1, 3, 16] } },
        face_clown: { art: [['e', 85, 56, 31, 27, '#fff'], ['e', 171, 56, 31, 27, '#fff'], ['p', LookDraw.star(70, 50, 14, 6, 5), '#2d7fe0'], ['p', 'M171 36 L186 56 L171 78 L156 56 Z', '#d01030'], ['c', 85, 58, 6, INK], ['c', 171, 58, 6, INK], ['p', 'M64 90 Q128 146 192 90 Q128 112 64 90 Z', '#d01030'], ['c', 128, 80, 12, '#e8203a']],
            P: [S(23.2, -1.4, 0, 9, 9, 9, 0xe8203a), S(0, 11, 27, 14, 14, 14, 0xff6a1e), S(0, 11, -27, 14, 14, 14, 0x35c8ff)] },
        face_hearts: { art: [['p', heartD(85, 58, 26), '#ff3d7a', '#b0124a', 3], ['p', heartD(171, 58, 26), '#ff3d7a', '#b0124a', 3], ['e', 44, 92, 14, 8, 'rgba(255,100,130,.55)'], ['e', 212, 92, 14, 8, 'rgba(255,100,130,.55)'], smile(88, 28, INK, 6)], fx: { c: '#ff6fae', rate: 3, o: [24, 6, 0], box: [2, 6, 16], g: 'heart' } },
        face_skull: { art: [['r', 10, 2, 236, 140, '#f4f1ea', '#b8b3a4', 3, 60], ['e', 85, 58, 24, 26, '#111'], ['e', 171, 58, 24, 26, '#111'], ['c', 85, 60, 5, '#ff3b3b'], ['c', 171, 60, 5, '#ff3b3b'], ['p', 'M128 82 L116 106 L140 106 Z', '#222'], ['r', 82, 114, 92, 22, '#f4f1ea', '#111', 4, 6], ['p', 'M104 114 L104 136 M128 114 L128 136 M152 114 L152 136', null, '#111', 3]] },
        face_robot: { art: [['r', 8, 6, 240, 132, '#0e1a14', '#4a5a54', 6, 22], ['r', 56, 38, 52, 36, '#37ff9b', null, 0, 6], ['r', 148, 38, 52, 36, '#37ff9b', null, 0, 6], ['r', 68, 98, 22, 8, '#37ff9b'], ['r', 96, 98, 22, 8, '#37ff9b'], ['r', 124, 98, 22, 8, '#37ff9b'], ['r', 152, 98, 22, 8, '#37ff9b'], ['r', 180, 98, 14, 8, '#37ff9b']],
            glow: 0.8, P: [S(0, 0, 26.2, 6, 12, 6, 0x8a929c), S(0, 0, -26.2, 6, 12, 6, 0x8a929c), Y(0, 28, 0, 2, 12, 2, 0x8a929c), S(0, 35, 0, 5, 5, 5, 0x37ff9b, G)], fx: { c: '#37ff9b', rate: 5, o: [24, 0, 0], box: [1, 6, 18], g: 'pixel' } },
        face_tiger: { art: [['r', 6, 4, 244, 138, '#f08a24', null, 0, 50], ['e', 128, 104, 52, 30, '#fff3e0'], ['p', 'M128 6 L128 32 M100 8 L108 30 M156 8 L148 30 M10 70 L48 78 M10 92 L50 94 M246 70 L208 78 M246 92 L206 94', null, '#1a1a1a', 7], ['e', 85, 58, 11, 15, '#ffe14a', INK, 3], ['e', 171, 58, 11, 15, '#ffe14a', INK, 3], ['e', 85, 58, 4, 13, INK], ['e', 171, 58, 4, 13, INK], ['p', 'M114 84 L142 84 L128 98 Z', '#ff6b8b'], ['p', 'M128 98 L128 106 M128 106 Q114 116 102 108 M128 106 Q142 116 154 108', null, INK, 4]] },
        face_cyclops: { art: [['e', 128, 62, 54, 46, '#fff', INK, 6], ['c', 128, 62, 29, '#ff7a1a', '#a83a00', 4], ['e', 128, 62, 6, 24, '#111'], ['c', 115, 49, 6, '#fff'], ['p', 'M66 30 Q128 2 190 30', null, INK, 9], ['p', 'M100 122 Q128 136 156 122', null, INK, 6]],
            glow: 0.3, fx: { c: '#ff7a1a', rate: 7, o: [24, 2, 0], box: [1, 8, 16], g: 'dot' } },
        face_alien: { art: [['r', 6, 2, 244, 140, '#6fcf6a', null, 0, 60], ['p', 'M30 40 Q70 28 112 76 Q70 94 30 40 Z', '#101018'], ['p', 'M226 40 Q186 28 144 76 Q186 94 226 40 Z', '#101018'], ['e', 68, 56, 9, 5, 'rgba(255,255,255,.7)', null, 0, 20], ['e', 188, 56, 9, 5, 'rgba(255,255,255,.7)', null, 0, -20], ['p', 'M112 104 Q128 112 144 104', null, '#2f6a2c', 4], ['c', 122, 90, 2.5, '#2f6a2c'], ['c', 134, 90, 2.5, '#2f6a2c']], glow: 0.18, fx: { c: '#6fff9a', rate: 6, o: [24, 0, 0], box: [1, 8, 16], g: 'dot' } },
        face_ghost: { art: [['r', 10, 4, 236, 136, 'rgba(228,244,255,.92)', null, 0, 60], ['e', 85, 56, 21, 27, '#0c1620'], ['e', 171, 56, 21, 27, '#0c1620'], ['e', 85, 58, 10, 14, '#7ff3ff'], ['e', 171, 58, 10, 14, '#7ff3ff'], ['e', 128, 108, 18, 26, '#0c1620']],
            glow: 0.7, fx: { c: '#9ff6ff', c2: '#ffffff', rate: 18, o: [20, 0, 0], box: [4, 14, 22], g: 'dot', up: 22 } },
        face_fire: { art: [['p', flameD(85, 58, 1.1), '#ff7a1a'], ['p', flameD(85, 62, 0.62), '#ffe14a'], ['p', flameD(171, 58, 1.1), '#ff7a1a'], ['p', flameD(171, 62, 0.62), '#ffe14a'], ['p', 'M60 94 Q128 138 196 94 L184 108 L168 98 L152 112 L136 100 L120 112 L104 98 L88 110 L72 100 Z', '#ff4a10', '#ffe14a', 3]],
            glow: 0.85, fx: { c: '#ff7a1e', c2: '#ffd24a', rate: 26, o: [22, 4, 0], box: [2, 10, 24], g: 'dot', up: 40 } },
    };

    // ----- роби ------------------------------------------------------------------------------------
    const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
    const camoOps = (seed, cols) => {
        const r = rnd(seed), out = [];
        for (let i = 0; i < 26; i++) out.push(['e', r() * 200, r() * 160, 14 + r() * 26, 9 + r() * 16, cols[Math.floor(r() * cols.length)], null, 0, r() * 180]);
        return out;
    };
    const stripesH = (c, step, h, y0) => { const o = []; for (let y = y0 || 0; y < 160; y += step) o.push(['r', 0, y, 200, h, c]); return o; };
    const pocket = (txt, c, bg) => [['r', 110, 22, 70, 46, bg, c, 3, 5], ['t', txt, 145, 46, 28, c]];
    const jumpPrint = (num, c, band) => ({ f: [...pocket(num, c, 'rgba(255,255,255,.10)'), ['r', 0, 126, 200, 16, band || '#f2c230']], b: [['t', num, 100, 66, 76, c], ['r', 0, 126, 200, 16, band || '#f2c230']] });
    const starSpots = (seed, n, c) => { const r = rnd(seed), o = []; for (let i = 0; i < n; i++) o.push(['p', LookDraw.star(10 + r() * 180, 10 + r() * 140, 6 + r() * 6, 2.6, 5, r() * 72 - 90), r() > 0.35 ? c : '#fff6c8']); return o; };
    const dots = (seed, n, c, rmax) => { const r = rnd(seed), o = []; for (let i = 0; i < n; i++) o.push(['c', 6 + r() * 188, 4 + r() * 152, 1 + r() * (rmax || 3), c]); return o; };
    const plaid = (c1, c2) => { const o = []; for (let i = 0; i < 6; i++) { o.push(['r', i * 40 + 8, 0, 14, 160, c1]); o.push(['r', 0, i * 40 + 8, 200, 14, c1]); o.push(['r', i * 40 + 26, 0, 4, 160, c2]); o.push(['r', 0, i * 40 + 26, 200, 4, c2]); } return o; };
    const vest = (c) => [['p', 'M0 0 L58 0 L70 160 L0 160 Z', c], ['p', 'M200 0 L142 0 L130 160 L200 160 Z', c]];

    const outfits = {
        outfit_orange: { top: 0xf07d1e, bottom: 0xd96a12, sl: 's', shoe: 0x33363c, print: jumpPrint('417', '#ffffff') },
        outfit_blue_jail: { top: 0x2f6fc4, bottom: 0x233a66, sl: 's', shoe: 0x20242c, print: jumpPrint('208', '#ffffff', '#e8f3ff') },
        outfit_stripes: { top: 0xf2f1ea, bottom: 0x3a3a40, sl: 'l', shoe: 0x222226, print: { f: stripesH('#1b1b1f', 24, 11, 6), b: stripesH('#1b1b1f', 24, 11, 6) } },
        outfit_hoodie: { top: 0x7d838c, bottom: 0x2f4a78, sl: 'l', shoe: 0xeeeeee, print: { f: [['r', 24, 0, 152, 18, '#656b74'], ['p', 'M40 100 L160 100 L172 150 L28 150 Z', '#6a7079', '#4f545c', 3], ['p', 'M86 14 L84 56 M114 14 L116 56', null, '#f4f1ea', 3]], b: [['p', 'M24 0 Q100 78 176 0 Z', '#6a7079', '#4f545c', 3]] } },
        outfit_camo: { top: 0x5d6b3a, bottom: 0x6a6a45, sl: 'l', shoe: 0x3b2f22, print: { f: camoOps(7, ['#3f4a26', '#7a8a4a', '#2e3320', '#8d7a4a']), b: camoOps(19, ['#3f4a26', '#7a8a4a', '#2e3320', '#8d7a4a']) } },
        outfit_hazard: { top: 0x2b2d33, bottom: 0x39445a, sl: 's', shoe: 0x5a3d22, print: { f: [...vest('#f5d90a'), ['r', 0, 62, 70, 10, '#d8dde3'], ['r', 130, 62, 70, 10, '#d8dde3'], ['r', 0, 104, 70, 10, '#d8dde3'], ['r', 130, 104, 70, 10, '#d8dde3']], b: [['r', 0, 0, 200, 160, '#f5d90a'], ['r', 0, 56, 200, 12, '#d8dde3'], ['r', 0, 100, 200, 12, '#d8dde3']] } },
        outfit_tux: { top: 0x16171b, bottom: 0x16171b, sl: 'l', shoe: 0x0a0a0c, shine: 0.22, print: { f: [['p', 'M72 0 L128 0 L112 110 L100 150 L88 110 Z', '#f6f6f6'], ['p', 'M58 0 L100 74 L88 118 L52 20 Z', '#0b0b0e', '#3a3b40', 2], ['p', 'M142 0 L100 74 L112 118 L148 20 Z', '#0b0b0e', '#3a3b40', 2], ['p', 'M100 14 L72 2 L72 26 Z', '#c62828'], ['p', 'M100 14 L128 2 L128 26 Z', '#c62828'], ['r', 93, 6, 14, 16, '#a01c1c', null, 0, 3], ['c', 100, 54, 3.5, '#222'], ['c', 100, 80, 3.5, '#222']], b: [['p', 'M100 0 L100 160', null, '#2a2b30', 3]] } },
        outfit_astro: { top: 0xe9edf2, bottom: 0xe3e7ee, sl: 'l', shoe: 0xf0802a, print: { f: [['r', 44, 44, 112, 62, '#b9c0ca', '#8a929c', 3, 8], ['r', 54, 54, 52, 20, '#1c2a3a'], ['c', 126, 62, 7, '#d62d2d'], ['c', 144, 62, 7, '#37d46a'], ['c', 126, 90, 7, '#f2c230'], ['r', 112, 12, 44, 26, '#fff', '#2d4a8a', 2], ['r', 112, 18, 44, 4, '#c62828'], ['r', 112, 26, 44, 4, '#c62828'], ['r', 0, 126, 200, 12, '#f0802a']], b: [['r', 44, 18, 112, 112, '#d3d9e1', '#8a929c', 3, 10], ['c', 100, 70, 22, null, '#8a929c', 4]] },
            L: [{ at: 'UpperTorso', o: [0, 27, 0], P: [T(0, 0, 0, 30, 6, 0xf0802a, { dz: 56 })] }] },
        outfit_golden: { top: 0xe8b923, bottom: 0xd6a517, sl: 'l', shoe: 0xb8860b, shine: 0.5, print: { f: [...pocket('417', '#5a3a00', 'rgba(255,255,255,.18)'), ['p', 'M20 6 L60 6 L30 150 L8 150 Z', 'rgba(255,255,255,.22)'], ['r', 0, 126, 200, 16, '#fff2b0']], b: [['t', '417', 100, 66, 76, '#6b4a00'], ['r', 0, 126, 200, 16, '#fff2b0']] }, fx: { c: '#ffe58a', rate: 9, at: 'UpperTorso', box: [20, 26, 36], g: 'star' } },
        outfit_red_jail: { top: 0xc83a2a, bottom: 0x8c2619, sl: 's', shoe: 0x2a1a18, print: jumpPrint('666', '#ffffff', '#f4f1ea') },
        outfit_tshirt: { top: 0xf4f4f0, bottom: 0x2f6fc4, sl: 's', legs: 's', shoe: 0xffffff, print: { f: [['p', LookDraw.star(100, 70, 36, 16, 5), '#f2c230', '#c99a10', 3]], b: [] } },
        outfit_gray13: { top: 0x8c9096, bottom: 0x6b6f75, sl: 's', shoe: 0x2a2c30, print: { f: [['t', '13', 100, 70, 74, '#f4f1ea']], b: [['t', '13', 100, 70, 90, '#f4f1ea']] } },
        outfit_pajama: { top: 0x8fc3ec, bottom: 0x7fb0dc, sl: 'l', shoe: 0xffb3c7, print: { f: [...starSpots(3, 12, '#ffe14a'), ['p', 'M0 0 L100 38 L200 0', null, '#fff', 6]], b: starSpots(5, 12, '#ffe14a') } },
        outfit_chef: { top: 0xf6f6f2, bottom: 0x3a3f47, sl: 'l', shoe: 0x222226, print: { f: [['p', 'M48 0 L48 160 M152 0 L152 160', null, '#d8d8d2', 3], ['c', 72, 34, 5, '#c9c5b8'], ['c', 72, 74, 5, '#c9c5b8'], ['c', 72, 114, 5, '#c9c5b8'], ['c', 128, 34, 5, '#c9c5b8'], ['c', 128, 74, 5, '#c9c5b8'], ['c', 128, 114, 5, '#c9c5b8'], ['p', 'M70 0 L130 0 L100 38 Z', '#d62d2d']], b: [] } },
        outfit_ninja: { top: 0x17171c, bottom: 0x17171c, sl: 'l', shoe: 0x0e0e12, print: { f: [['p', 'M20 0 L180 130 M180 0 L20 130', null, '#2b2b33', 12], ['r', 0, 112, 200, 34, '#c62828'], ['p', 'M96 118 L134 152 L112 156 Z', '#9d1f1f']], b: [['p', 'M20 0 L180 130 M180 0 L20 130', null, '#2b2b33', 12], ['r', 0, 112, 200, 34, '#c62828']] } },
        outfit_pirate: { top: 0xe9e6dc, bottom: 0x2e2a36, sl: 'l', shoe: 0x2a1e14, print: { f: [...stripesH('#27396b', 28, 14, 4), ...vest('#6b4423'), ['r', 0, 118, 200, 34, '#c62828'], ['r', 88, 122, 24, 26, '#f2c230', '#b8860b', 2, 3]], b: [...stripesH('#27396b', 28, 14, 4), ['r', 0, 118, 200, 34, '#c62828']] } },
        outfit_cowboy: { top: 0xc13a2b, bottom: 0x2c4f86, sl: 'l', shoe: 0x4a2f1a, print: { f: [...plaid('rgba(255,255,255,.32)', 'rgba(0,0,0,.28)'), ...vest('#7a4a24'), ['p', LookDraw.star(150, 50, 17, 7.5, 5), '#f2c230', '#b8860b', 2]], b: plaid('rgba(255,255,255,.32)', 'rgba(0,0,0,.28)') } },
        outfit_knight: { top: 0x9aa3ad, bottom: 0x808a94, sl: 'l', shoe: 0x555c66, shine: 0.3, print: { f: [['p', 'M30 8 L170 8 L170 80 Q170 140 100 154 Q30 140 30 80 Z', '#f4f1ea', '#555c66', 4], ['r', 92, 18, 16, 122, '#c62828'], ['r', 44, 54, 112, 16, '#c62828'], ['p', 'M0 100 L30 100 M170 100 L200 100', null, '#6c7580', 5], ['c', 40, 20, 4, '#6c7580'], ['c', 160, 20, 4, '#6c7580']], b: [['p', 'M0 50 L200 50 M0 100 L200 100 M100 0 L100 160', null, '#6c7580', 5]] },
            L: [{ at: 'UpperTorso', P: [S(0, 26, 52, 40, 22, 40, 0x9aa3ad), S(0, 26, -52, 40, 22, 40, 0x9aa3ad), Y(0, 21, 52, 41, 2.4, 41, 0xf2c230), Y(0, 21, -52, 41, 2.4, 41, 0xf2c230)] }] },
        outfit_dino: { top: 0x4caf50, bottom: 0x3a8f40, sl: 'l', shoe: 0x2f7a35, print: { f: [['e', 100, 86, 60, 70, '#f1e7a8'], ['p', 'M50 70 L150 70 M46 92 L154 92 M52 114 L148 114', null, '#d9cb7a', 4]], b: [['c', 50, 40, 12, '#2f7a35'], ['c', 130, 28, 10, '#2f7a35'], ['c', 90, 90, 14, '#2f7a35'], ['c', 160, 100, 11, '#2f7a35'], ['c', 40, 120, 9, '#2f7a35']] },
            L: [{ at: 'UpperTorso', P: [-20, -8, 4, 16, 24].map((y, i) => Y(-19, y, 0, 9 - i * 0.6, 12 - i * 0.6, 9 - i * 0.6, i % 2 ? 0xf2a230 : 0xf2c230, { k: 0, r: [0, 0, 80] })) },
                { at: 'LowerTorso', P: chain([-15, -4, 0], [[-1, -0.1, 0], [-1, 0.05, 0], [-1, 0.25, 0]], [16, 14, 12], [8, 6.5, 4.5, 0.6], 0x4caf50).P }] },
        outfit_neon: { top: 0x0d0d18, bottom: 0x0d0d18, sl: 'l', shoe: 0x101018, glow: 0.55, print: { f: [['p', 'M0 40 L70 40 L100 70 L130 40 L200 40', null, 'rgba(25,230,255,.35)', 12], ['p', 'M0 40 L70 40 L100 70 L130 40 L200 40', null, '#19e6ff', 4], ['p', 'M0 112 L60 112 L100 148 L140 112 L200 112', null, 'rgba(255,61,242,.35)', 12], ['p', 'M0 112 L60 112 L100 148 L140 112 L200 112', null, '#ff3df2', 4], ['c', 100, 72, 22, null, '#19e6ff', 4]], b: [['p', 'M40 0 L40 160 M160 0 L160 160', null, 'rgba(25,230,255,.35)', 12], ['p', 'M40 0 L40 160 M160 0 L160 160', null, '#19e6ff', 4], ['p', 'M100 0 L100 160', null, '#ff3df2', 4]] }, fx: { c: '#19e6ff', c2: '#ff3df2', rate: 6, at: 'UpperTorso', box: [20, 24, 36], g: 'dot' } },
        outfit_royal: { top: 0x6a1b9a, bottom: 0x4a1270, sl: 'l', shoe: 0xd4a017, shine: 0.3, print: { f: [['p', 'M0 0 L200 0 L200 34 L100 90 L0 34 Z', '#f6f6f6'], ...dots(11, 14, '#1b1b20', 3), ['p', 'M0 34 L100 90 L200 34', null, '#f2c230', 6], ['p', 'M100 90 L100 160', null, '#f2c230', 6], ['c', 100, 94, 9, '#e8203a', '#f2c230', 3]], b: [['p', 'M0 0 L200 0 L200 30 L100 70 L0 30 Z', '#f6f6f6'], ['c', 100, 104, 30, null, '#f2c230', 6], ['p', LookDraw.star(100, 104, 20, 8, 5), '#f2c230']] },
            L: [{ at: 'UpperTorso', o: [0, 26.5, 0], P: [T(0, 0, 0, 38, 7, 0xf6f6f6, { dz: 62 })] }], fx: { c: '#ffe58a', c2: '#c08cff', rate: 9, at: 'UpperTorso', box: [20, 26, 36], g: 'star' } },
        outfit_cyber: { top: 0x1a1f2b, bottom: 0x1a1f2b, sl: 'l', shoe: 0x0f1219, shine: 0.2, glow: 0.5, print: { f: [['p', 'M0 30 L50 30 L70 50 L70 100 M200 30 L150 30 L130 50 L130 100', null, '#19e6ff', 4], ['p', 'M100 36 L130 54 L130 90 L100 108 L70 90 L70 54 Z', 'rgba(25,230,255,.22)', '#19e6ff', 4], ['c', 100, 72, 10, '#19e6ff'], ['p', 'M40 120 L90 120 L100 134 M160 120 L110 120 L100 134', null, '#19e6ff', 4]], b: [['p', 'M0 40 L60 40 L80 60 L80 150 M200 40 L140 40 L120 60 L120 150', null, '#19e6ff', 4], ['c', 80, 60, 5, '#19e6ff'], ['c', 120, 60, 5, '#19e6ff']] },
            L: [{ at: 'UpperTorso', P: [B(0, 26, 52, 28, 8, 34, 0x232a3a), B(0, 30.5, 52, 28, 1.2, 34, 0x19e6ff, G), B(0, 26, -52, 28, 8, 34, 0x232a3a), B(0, 30.5, -52, 28, 1.2, 34, 0x19e6ff, G)] }], fx: { c: '#19e6ff', rate: 8, at: 'UpperTorso', box: [20, 24, 40], g: 'pixel' } },
        outfit_galaxy: { top: 0x120a2e, bottom: 0x120a2e, sl: 'l', shoe: 0x120a2e, glow: 0.5, print: { f: [['e', 60, 50, 80, 50, 'rgba(140,60,255,.5)'], ['e', 150, 100, 90, 56, 'rgba(255,60,170,.38)'], ['e', 110, 70, 64, 40, 'rgba(40,160,255,.34)'], ...dots(23, 34, '#ffffff', 2.2), ['p', LookDraw.star(150, 40, 9, 3.4, 4), '#fff6c8'], ['p', LookDraw.star(52, 112, 7, 2.6, 4), '#fff6c8']], b: [['e', 140, 60, 80, 50, 'rgba(40,160,255,.4)'], ['e', 60, 110, 84, 54, 'rgba(255,60,170,.38)'], ['e', 100, 80, 60, 40, 'rgba(140,60,255,.4)'], ...dots(41, 34, '#ffffff', 2.2)] }, fx: { c: '#c08cff', c2: '#ffffff', rate: 22, at: 'UpperTorso', box: [24, 30, 42], g: 'star', up: 12 } },
        outfit_inferno: { top: 0x1a0d0a, bottom: 0x1a0d0a, sl: 'l', shoe: 0x1a0d0a, glow: 0.55, print: { f: [['p', 'M20 0 L44 40 L30 70 L60 110 L48 160 M150 0 L132 36 L158 74 L140 116 L170 160', null, '#ff7a1a', 6], ['p', 'M0 160 L0 126 Q14 96 24 126 Q38 84 54 124 Q68 92 82 128 Q96 80 110 126 Q126 90 140 128 Q154 96 168 126 Q184 100 200 128 L200 160 Z', '#ff7a1a'], ['p', 'M0 160 L0 140 Q12 120 22 140 Q36 112 52 140 Q66 120 80 142 Q96 108 110 142 Q126 118 140 142 Q154 120 168 142 Q184 122 200 142 L200 160 Z', '#ffe14a']], b: [['p', 'M30 0 L50 44 L38 80 L70 120 M160 0 L146 40 L170 84 L150 130', null, '#ff7a1a', 6], ['p', 'M0 160 L0 130 Q16 100 30 130 Q46 92 62 130 Q78 98 100 130 Q120 96 138 130 Q156 100 172 130 Q188 108 200 130 L200 160 Z', '#ff7a1a']] }, fx: { c: '#ff7a1e', c2: '#ffd24a', rate: 26, at: 'UpperTorso', box: [20, 20, 36], g: 'dot', up: 36 } },
        // эксклюзив Daily Gift: «Король побега» — пурпурная роба, золотая корона-принт, горностаевая кайма, мантия
        outfit_king_escape: { top: 0x7a1fa8, bottom: 0x4a1270, sl: 'l', shoe: 0xd4a017, shine: 0.38, glow: 0.12, print: { f: [['p', 'M0 0 L200 0 L200 28 L100 70 L0 28 Z', '#f6f6f6'], ...dots(31, 12, '#1b1b20', 3), ['p', 'M0 28 L100 70 L200 28', null, '#f2c230', 5],
                ['p', 'M52 118 L52 78 L72 98 L100 64 L128 98 L148 78 L148 118 Z', '#f2c230', '#8a5a00', 4], ['r', 52, 114, 96, 12, '#e0a010', '#8a5a00', 3, 2], ['c', 100, 70, 6, '#ff3355', '#8a5a00', 2], ['c', 60, 86, 5, '#33aaff', '#8a5a00', 2], ['c', 140, 86, 5, '#33aaff', '#8a5a00', 2], ['r', 0, 138, 200, 22, '#f6f6f6'], ...dots(5, 8, '#1b1b20', 3)],
                b: [['p', 'M0 0 L200 0 L200 26 L100 56 L0 26 Z', '#f6f6f6'], ['p', 'M44 118 L44 60 L72 90 L100 40 L128 90 L156 60 L156 118 Z', '#f2c230', '#8a5a00', 5], ['p', LookDraw.star(100, 86, 14, 6, 5), '#ff3355'], ['r', 0, 138, 200, 22, '#f6f6f6']] },
            L: [{ at: 'UpperTorso', o: [0, 26.5, 0], P: [T(0, 0, 0, 38, 7, 0xf6f6f6, { dz: 62 })] }, { at: 'UpperTorso', P: [B(-20.5, 0, 0, 3, 58, 64, 0x8e2cc2), B(-21.2, -29, 0, 3.2, 3, 66, 0xf6f6f6), B(-21.2, 27, 0, 3.4, 3, 64, 0xf2c230, G)] }],
            fx: { c: '#ffe58a', c2: '#d9a0ff', rate: 12, at: 'UpperTorso', box: [20, 26, 36], g: 'star' } },
        // эксклюзив Daily Gift: «Неон-хамелеон» — переливающаяся чешуя, неоновые гребни на спине
        outfit_chameleon: { top: 0x12b89a, bottom: 0x0e7f9a, sl: 'l', shoe: 0xff3df2, shine: 0.3, glow: 0.7, print: { f: [...Array.from({ length: 28 }, (_, i) => ['e', 14 + (i % 7) * 28 + (Math.floor(i / 7) % 2) * 14, 14 + Math.floor(i / 7) * 36, 15, 11, ['rgba(255,61,242,.45)', 'rgba(25,230,255,.5)', 'rgba(140,255,90,.45)', 'rgba(255,225,70,.4)'][(i * 3 + Math.floor(i / 7)) % 4], 'rgba(0,0,0,.35)', 2]),
                ['p', 'M0 90 Q50 60 100 90 T200 90', null, '#ff3df2', 4], ['c', 100, 86, 15, null, '#f4ff6a', 4], ['c', 100, 86, 5, '#f4ff6a']],
                b: [...Array.from({ length: 28 }, (_, i) => ['e', 14 + (i % 7) * 28 + (Math.floor(i / 7) % 2) * 14, 14 + Math.floor(i / 7) * 36, 15, 11, ['rgba(25,230,255,.5)', 'rgba(255,61,242,.45)', 'rgba(255,225,70,.4)', 'rgba(140,255,90,.45)'][(i * 5 + Math.floor(i / 7)) % 4], 'rgba(0,0,0,.35)', 2]), ['p', 'M100 0 L100 160', null, '#f4ff6a', 5]] },
            L: [{ at: 'UpperTorso', P: [...[-24, -8, 8, 24].map((y, i) => X([[-6, 0], [6, 0], [0, 14]], -19, y, 0, 2.4, i % 2 ? 0xff3df2 : 0x19e6ff, { pl: 'xy', r: [0, 0, 90], g: true }))] }],
            fx: { c: '#19e6ff', c2: '#ff3df2', rate: 16, at: 'UpperTorso', box: [20, 26, 40], g: 'pixel' } },
        // эксклюзив Daily Gift: «Ночная тень» — чёрный плащ с серебристой каймой, лиловые звёзды и шлейф теней
        outfit_night_shadow: { top: 0x15141f, bottom: 0x0f0e17, sl: 'l', shoe: 0x0a0a10, shine: 0.12, glow: 0.3, print: { f: [['p', 'M0 0 L70 0 L100 74 L130 0 L200 0', null, '#c8c8e8', 7], ['p', 'M100 74 L100 160', null, '#8a6cff', 4], ['c', 100, 72, 9, '#8a6cff', '#c8c8e8', 3], ...starSpots(77, 7, '#a98cff')],
                b: [['p', 'M0 12 Q100 52 200 12', null, '#c8c8e8', 6], ...starSpots(91, 12, '#a98cff'), ['p', LookDraw.star(100, 92, 26, 10, 5), '#8a6cff', '#c8c8e8', 3]] },
            L: [{ at: 'UpperTorso', P: [B(-20.5, 0, 0, 3, 62, 70, 0x1b1a2b), B(-24, -28, 0, 3, 36, 76, 0x15141f, { r: [0, 0, 12] }), B(-21.8, 31, 0, 3.4, 3, 72, 0xc8c8e8, G), B(-22.5, -4, 0, 1.6, 5, 5, 0x8a6cff, G), B(-22.5, -18, 14, 1.6, 4, 4, 0x8a6cff, G), B(-22.5, 12, -16, 1.6, 4, 4, 0x8a6cff, G)] }],
            fx: { c: '#8a6cff', c2: '#2a2440', rate: 18, at: 'UpperTorso', box: [24, 30, 44], g: 'dot', up: 6 } },
    };

    /** Форма охраны (маскировка): та же структура, что у робы и шапки. */
    const GUARD = {
        outfit: { top: 0x2c5296, bottom: 0x20242f, sl: 'l', shoe: 0x111114, print: { f: [['r', 28, 34, 44, 38, null, '#1d3a70', 3, 3], ['r', 128, 34, 44, 38, null, '#1d3a70', 3, 3], ['p', LookDraw.star(150, 56, 12, 5.2, 5), '#f2c230'], ['p', 'M100 0 L112 14 L106 66 L100 72 L94 66 L88 14 Z', '#15171c'], ['c', 100, 96, 3, '#f2c230'], ['c', 100, 116, 3, '#f2c230'], ['r', 0, 134, 200, 8, '#15171c']], b: [] },
            L: [{ at: 'UpperTorso', P: [B(0, 27, 52, 14, 3, 18, 0xf2c230), B(0, 27, -52, 14, 3, 18, 0xf2c230)] }] },
        hat: { P: [Y(0, 24, 0, 48, 8, 54, 0x1d3a70), Y(0, 29, 0, 50, 8, 56, 0x1d3a70, { k: 0.95 }), Y(0, 22.4, 0, 49, 3, 55, 0x111114), B(24, 22, 0, 14, 2.5, 40, 0x0f1a33), S(24.5, 27, 0, 4.5, 6, 6, 0xf2c230, G)] },
    };

    // ----- следы ---------------------------------------------------------------------------------------
    // Слой: g — форма частицы (LookArt.GLYPHS; 'dot' — мягкий круг движка), c / c2 — цвета, a — альфа,
    // mode: 'run' (на земле при беге) | 'air' (в воздухе) | 'all', rate — частиц/с на полной скорости, life, size — пары,
    // dir — пара векторов направления, spd — сила выброса, grav, spin, sg — размер по жизни, blend: 'add' | 'std', cg — градиент цвета.
    const SG_FADE = [[0, 0.3], [0.25, 1], [1, 0.2]];
    const lay = (o) => ({ g: 'dot', c: '#ffffff', a: 0.9, mode: 'all', rate: 20, life: [0.5, 1], size: [4, 8], dir: [[-0.4, 0.2, -0.4], [0.4, 1, 0.4]], spd: [8, 24], grav: [0, 0, 0], blend: 'add', sg: SG_FADE, off: [0, 6, 0], ...o });
    const RAINBOW = [[0, '#ff3b3b', 1], [0.17, '#ff9f1c', 1], [0.34, '#ffe14a', 1], [0.5, '#4fe36a', 1], [0.67, '#35c8ff', 1], [0.84, '#6a5cff', 0.9], [1, '#c24dff', 0]];
    const FIRE = [[0, '#fff3b0', 1], [0.25, '#ffb347', 1], [0.6, '#ff4a10', 0.8], [1, '#3a1a10', 0]];
    const trails = {
        trail_none: { T: [] },
        trail_dust: { c: '#d8c9a8', T: [lay({ c: '#d8c9a8', a: 0.5, blend: 'std', mode: 'run', rate: 30, life: [0.4, 0.9], size: [10, 20], dir: [[-0.3, 0.1, -0.3], [0.3, 0.5, 0.3]], spd: [6, 20], sg: [[0, 0.4], [1, 1.8]] }),
            lay({ c: '#d8c9a8', a: 0.5, blend: 'std', mode: 'air', rate: 14, life: [0.5, 1], size: [10, 18], sg: [[0, 0.4], [1, 1.6]] })] },
        trail_sparks: { c: '#ffb347', T: [lay({ g: 'spark', c: '#ffb347', c2: '#fff0b0', mode: 'all', rate: 34, life: [0.35, 0.8], size: [5, 10], spd: [30, 90], grav: [0, -160, 0], dir: [[-0.6, 0.2, -0.6], [0.6, 1, 0.6]], spin: [-4, 4] })] },
        trail_leaves: { c: '#6fcf6a', T: [lay({ g: 'leaf', c: '#6fcf6a', c2: '#d9b24a', rate: 16, life: [0.8, 1.5], size: [8, 14], spd: [10, 40], grav: [0, -22, 0], spin: [-3, 3], blend: 'std', a: 1, sg: [[0, 0.5], [0.2, 1], [1, 0.7]] })] },
        trail_bubbles: { c: '#9ad8ff', T: [lay({ g: 'bubble', c: '#bfe8ff', rate: 12, life: [0.8, 1.6], size: [7, 16], spd: [6, 22], grav: [0, 26, 0], dir: [[-0.5, 0.3, -0.5], [0.5, 1, 0.5]], a: 0.85, sg: [[0, 0.4], [0.3, 1], [1, 1.1]] })] },
        trail_hearts: { c: '#ff6fae', T: [lay({ g: 'heart', c: '#ff6fae', c2: '#ff9ad0', rate: 9, life: [0.9, 1.5], size: [9, 15], spd: [10, 30], grav: [0, 22, 0], spin: [-1, 1] })] },
        trail_stars: { c: '#ffd24a', T: [lay({ g: 'star', c: '#ffd24a', c2: '#fff6c8', rate: 14, life: [0.6, 1.2], size: [8, 15], spd: [18, 48], grav: [0, -30, 0], spin: [-3, 3], dir: [[-0.7, 0.2, -0.7], [0.7, 1, 0.7]] })] },
        trail_rainbow: { c: '#35c8ff', T: [lay({ g: 'dot', cg: RAINBOW, rate: 70, life: [0.6, 0.9], size: [10, 14], spd: [0, 4], dir: [[-0.1, 0.1, -0.1], [0.1, 0.3, 0.1]], sg: [[0, 0.8], [1, 1]], off: [0, 4, 0] })] },
        trail_fire: { c: '#ff7a1e', T: [lay({ g: 'dot', cg: FIRE, rate: 60, life: [0.4, 0.9], size: [12, 24], spd: [8, 30], grav: [0, 70, 0], dir: [[-0.35, 0.3, -0.35], [0.35, 1, 0.35]], sg: [[0, 0.6], [0.3, 1], [1, 0.2]] }),
            lay({ g: 'spark', c: '#ffd24a', rate: 22, life: [0.6, 1.2], size: [4, 8], spd: [20, 60], grav: [0, 40, 0] })] },
        trail_smoke: { c: '#9a9aa2', T: [lay({ c: '#8e8e96', a: 0.55, blend: 'std', mode: 'all', rate: 26, life: [0.7, 1.5], size: [14, 26], spd: [4, 16], grav: [0, 18, 0], sg: [[0, 0.4], [1, 2]] })] },
        trail_snow: { c: '#eaf6ff', T: [lay({ g: 'snow', c: '#ffffff', rate: 22, life: [0.9, 1.7], size: [6, 12], spd: [8, 28], grav: [0, -26, 0], spin: [-2, 2], sg: [[0, 0.6], [0.2, 1], [1, 0.6]] })] },
        trail_notes: { c: '#7ba8ff', T: [lay({ g: 'note', c: '#7ba8ff', c2: '#ff9ad0', rate: 8, life: [0.9, 1.5], size: [10, 16], spd: [10, 30], grav: [0, 24, 0], spin: [-1, 1] })] },
        trail_petals: { c: '#ffb3c7', T: [lay({ g: 'petal', c: '#ffb3c7', c2: '#ffd9e4', rate: 18, life: [0.9, 1.6], size: [7, 12], spd: [8, 30], grav: [0, -20, 0], spin: [-3, 3], blend: 'std', a: 1 })] },
        trail_confetti: { c: '#ffd23f', T: [lay({ g: 'confetti', c: '#ff4aa0', c2: '#35c8ff', rate: 34, life: [0.7, 1.3], size: [6, 10], spd: [30, 90], grav: [0, -110, 0], spin: [-6, 6], blend: 'std', a: 1, dir: [[-0.7, 0.4, -0.7], [0.7, 1, 0.7]] }),
            lay({ g: 'confetti', c: '#ffd23f', c2: '#4fe36a', rate: 20, life: [0.7, 1.3], size: [6, 10], spd: [30, 80], grav: [0, -110, 0], spin: [-6, 6], blend: 'std', a: 1 })] },
        trail_coins: { c: '#ffd24a', T: [lay({ g: 'coin', c: '#ffd24a', c2: '#fff0b0', rate: 8, life: [0.8, 1.3], size: [9, 14], spd: [20, 60], grav: [0, -170, 0], spin: [-5, 5], blend: 'std', a: 1 })] },
        trail_pixels: { c: '#37ff9b', T: [lay({ g: 'pixel', c: '#37ff9b', c2: '#35c8ff', rate: 26, life: [0.5, 1], size: [5, 9], spd: [10, 40], grav: [0, -20, 0], sg: [[0, 1], [1, 1]] })] },
        trail_ice: { c: '#bfe8ff', T: [lay({ g: 'diamond', c: '#bfe8ff', c2: '#ffffff', rate: 14, life: [0.6, 1.2], size: [7, 13], spd: [14, 44], grav: [0, -50, 0], spin: [-2, 2] })] },
        trail_lightning: { c: '#ffe14a', T: [lay({ g: 'bolt', c: '#ffe14a', c2: '#fff6c8', rate: 12, life: [0.18, 0.45], size: [12, 22], spd: [14, 50], grav: [0, 0, 0], spin: [-2, 2], dir: [[-1, 0.2, -1], [1, 1, 1]] }), lay({ g: 'spark', c: '#9ad8ff', rate: 20, life: [0.2, 0.5], size: [4, 8], spd: [30, 90] })] },
        trail_ghost: { c: '#cfeaff', T: [lay({ g: 'dot', c: '#cfeaff', c2: '#eaffff', rate: 14, life: [0.9, 1.6], size: [12, 22], spd: [6, 22], grav: [0, 28, 0], a: 0.55, sg: [[0, 0.4], [0.4, 1], [1, 1.4]] })] },
        trail_butterflies: { c: '#ff9ad5', T: [lay({ g: 'butterfly', c: '#35d6d9', c2: '#ff7ac8', rate: 7, life: [1.1, 1.8], size: [11, 18], spd: [10, 34], grav: [0, 14, 0], spin: [-1.2, 1.2], blend: 'std', a: 1 })] },
        trail_stardust: { c: '#ffe58a', T: [lay({ g: 'dot', c: '#ffe58a', c2: '#9ad8ff', rate: 44, life: [0.7, 1.4], size: [4, 9], spd: [8, 40], grav: [0, 10, 0], dir: [[-0.8, 0.2, -0.8], [0.8, 1, 0.8]] }), lay({ g: 'star', c: '#ffffff', c2: '#fff0b0', rate: 10, life: [0.6, 1.2], size: [7, 13], spd: [14, 50], spin: [-2, 2] })] },
        trail_plasma: { c: '#c06cff', T: [lay({ g: 'dot', c: '#c06cff', c2: '#ff4ad8', rate: 40, life: [0.5, 1], size: [14, 26], spd: [10, 44], grav: [0, 20, 0], a: 0.8, sg: [[0, 0.5], [0.3, 1], [1, 0.1]] }), lay({ g: 'spark', c: '#ffffff', rate: 14, life: [0.3, 0.7], size: [4, 8], spd: [30, 80] })] },
        trail_galaxy: { c: '#8c5cff', T: [lay({ g: 'dot', cg: [[0, '#6a5cff', 0.9], [0.4, '#c24dff', 0.8], [0.8, '#ff4aa0', 0.5], [1, '#ff4aa0', 0]], rate: 50, life: [0.8, 1.5], size: [14, 28], spd: [6, 30], dir: [[-0.8, -0.1, -0.8], [0.8, 0.5, 0.8]], sg: [[0, 0.5], [1, 1.2]] }), lay({ g: 'star', c: '#ffffff', c2: '#9ad8ff', rate: 18, life: [0.8, 1.6], size: [6, 12], spd: [10, 50], spin: [-2, 2] })] },
        trail_void: { c: '#b04dff', T: [lay({ g: 'dot', c: '#150822', a: 0.95, blend: 'std', rate: 36, life: [0.8, 1.5], size: [16, 30], spd: [6, 24], grav: [0, 6, 0], sg: [[0, 0.5], [0.5, 1], [1, 0.4]] }), lay({ g: 'dot', cg: [[0, '#ff4ad8', 0.8], [1, '#6a1bd0', 0]], rate: 30, life: [0.6, 1.2], size: [14, 24], spd: [8, 28], sg: [[0, 1], [1, 1.5]] }), lay({ g: 'spark', c: '#e08cff', rate: 12, life: [0.5, 1], size: [4, 8], spd: [20, 60] })] },
    };

    // ----- формы частиц следа (рисунок 64×64, белый — окрашивается цветом слоя) -------------------
    const GLYPHS = {
        spark: [['p', 'M32 2 Q35 29 62 32 Q35 35 32 62 Q29 35 2 32 Q29 29 32 2 Z', '#fff']],
        star: [['p', LookDraw.star(32, 33, 30, 13, 5), '#fff']],
        heart: [['p', heartD(32, 32, 30), '#fff']],
        bubble: [['c', 32, 32, 27, 'rgba(255,255,255,.18)', '#fff', 5], ['p', 'M18 24 Q22 14 32 12', null, '#fff', 4]],
        coin: [['c', 32, 32, 28, '#fff'], ['c', 32, 32, 19, null, 'rgba(0,0,0,.35)', 4], ['r', 29, 20, 6, 24, 'rgba(0,0,0,.3)', null, 0, 2]],
        leaf: [['p', 'M6 56 C6 22 30 6 58 6 C58 34 44 56 6 56 Z', '#fff'], ['p', 'M10 52 L44 18', null, 'rgba(0,0,0,.28)', 3]],
        note: [['e', 20, 50, 13, 9, '#fff', null, 0, -20], ['r', 30, 8, 6, 42, '#fff'], ['p', 'M34 8 Q56 14 52 32 Q46 22 34 22 Z', '#fff']],
        snow: [['p', 'M32 4 L32 60 M8 18 L56 46 M8 46 L56 18', null, '#fff', 5], ['c', 32, 32, 6, '#fff']],
        bolt: [['p', 'M38 2 L12 36 L28 36 L22 62 L52 24 L34 24 Z', '#fff']],
        diamond: [['p', 'M32 2 L58 26 L32 62 L6 26 Z', '#fff'], ['p', 'M6 26 L58 26 M32 2 L22 26 L32 62 L42 26 Z', null, 'rgba(0,0,0,.25)', 2]],
        petal: [['p', 'M32 60 C6 44 6 14 32 4 C58 14 58 44 32 60 Z', '#fff']],
        pixel: [['r', 8, 8, 48, 48, '#fff']],
        confetti: [['r', 14, 4, 36, 56, '#fff', null, 0, 4]],
        butterfly: [['p', 'M32 32 C20 4 2 8 6 30 C8 40 22 40 32 32 Z M32 32 C44 4 62 8 58 30 C56 40 42 40 32 32 Z M32 34 C22 40 8 46 14 58 C24 62 32 46 32 34 Z M32 34 C42 40 56 46 50 58 C40 62 32 46 32 34 Z', '#fff'], ['r', 30, 22, 4, 26, 'rgba(0,0,0,.4)', null, 0, 2]],
    };

    return { DEFS: { ...hats, ...back, ...faces, ...outfits, ...trails }, GUARD, GLYPHS };
})();

// ============================================================================================================
// GameLook
// ============================================================================================================

/** @satisfies {Record<string, any>} */
const GameLook = {
    /** Вид предметов по id каталога. */
    DEFS: /** @type {Record<string, any>} */ (LookArt.DEFS),
    GUARD: /** @type {Record<string, any>} */ (LookArt.GUARD),
    GLYPHS: /** @type {Record<string, any[]>} */ (LookArt.GLYPHS),
    /** Цвета редкостей (рамки карточек, свечение). */
    RARITY: { common: '#9aa3ad', rare: '#3d9be9', epic: '#b05cf0', legendary: '#f2c230', mythic: '#ff4f8b' },
    /** Часть модели, к которой крепится вид слота. */
    PART: { outfits: 'UpperTorso', hats: 'Head', faces: 'Head', back: 'UpperTorso' },
    SLOTS: ['outfits', 'hats', 'faces', 'back'],
    /** Частота искр по редкости (умолчание, если у предмета нет своего fx.rate). */
    FX_RATE: { common: 0, rare: 2, epic: 5, legendary: 9, mythic: 20 },
    FX_COLOR: { rare: '#bfe8ff', epic: '#e0b0ff', legendary: '#ffe58a', mythic: '#ff9ad5' },
    /** Папки растровых иконок (Codex): файл есть — карточка берёт его, нет — процедурный SVG. */
    RASTER: { items: 'assets/ui/items/', icons: 'assets/ui/icons/', faces: 'assets/ui/faces/' },

    /** @type {WeakMap<any, any>} */ _st: new WeakMap(),
    /** @type {WeakMap<any, any>} */ _mats: new WeakMap(),
    /** @type {Set<any>} */ _active: new Set(),
    /** @type {any} */ _tr: null,
    /** @type {Record<string, any>} */ _icons: {},
    /** @type {Record<string, any>} */ _ras: {},
    /** @type {Array<(kind: string, id: string, url: string) => void>} */ _rasListeners: [],

    rarityColor(r) { return this.RARITY[r] || this.RARITY.common; },

    _fx(opts) { return (opts && opts.fx) || (typeof window !== 'undefined' && window.app && window.app.fx) || null; },
    _mobile() { return typeof IS_MOBILE !== 'undefined' && IS_MOBILE; },

    // ---- материалы и текстуры ---------------------------------------------------------------

    /** Общие материалы вида сцены: solid — цвет в вершинах с подсветкой как у тела, glow — светится сам. */
    _material(scene, glow) {
        let m = this._mats.get(scene);
        if (!m) { m = {}; this._mats.set(scene, m); }
        const k = glow ? 'glow' : 'solid';
        if (m[k] && !m[k]._look_dead) return m[k];
        const mat = /** @type {any} */ (new BABYLON.StandardMaterial('look-' + k, scene));
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        if (glow) { mat.emissiveColor = new BABYLON.Color3(1, 1, 1); mat.disableLighting = true; mat.specularColor = new BABYLON.Color3(0, 0, 0); }
        else { mat.emissiveColor = new BABYLON.Color3(0.16, 0.16, 0.16); mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08); }
        mat.onDisposeObservable.add(() => { mat._look_dead = true; });
        m[k] = mat;
        return mat;
    },

    /** Материал с рисунком (принт на торсе): холст vw×vh записей -> текстура w×h. */
    _decalMaterial(scene, name, ops, vw, vh, w, h, glow) {
        const tex = new BABYLON.DynamicTexture(name + '-tex', { width: w, height: h }, scene, true);
        const ctx = /** @type {any} */ (tex.getContext());
        ctx.clearRect(0, 0, w, h);
        ctx.save(); ctx.scale(w / vw, h / vh);
        LookDraw.paint(ctx, ops);
        ctx.restore();
        tex.hasAlpha = true;
        tex.update(true);
        const m = new BABYLON.StandardMaterial(name, scene);
        m.diffuseTexture = tex;
        m.useAlphaFromDiffuseTexture = true;
        m.specularColor = new BABYLON.Color3(0, 0, 0);
        m.diffuseColor = new BABYLON.Color3(1, 1, 1);
        m.zOffset = -2;
        if (glow) { const g = Math.min(1, glow); m.emissiveColor = new BABYLON.Color3(g, g, g); }
        return m;
    },

    /** Плоская наклейка на торсе: side +1 — грудь (+X), −1 — спина (−X). */
    _decalMesh(scene, name, side, hw, hh, x) {
        const B = Humanoid.builder(scene);
        const z0 = side > 0 ? hw : -hw, z1 = -z0;
        const a = B.vert(x, -hh, z0, side, 0, 0, 0, 0), b = B.vert(x, -hh, z1, side, 0, 0, 1, 0), c = B.vert(x, hh, z1, side, 0, 0, 1, 1), d = B.vert(x, hh, z0, side, 0, 0, 0, 1);
        B.quad(a, b, c, d);
        const m = B.mesh(name);
        m.isPickable = false;
        return m;
    },

    // ---- сборка и снятие по слотам ---------------------------------------------------------

    /** Слои определения -> меши на части модели; анимации — в rec.anims. */
    _layers(model, view, rec, layers, defaultAt) {
        const scene = view.scene;
        for (const L of layers) {
            const parent = model.part(L.at || defaultAt);
            if (!parent || !L.P || !L.P.length) continue;
            const G = L.r ? LookGeo.rot(L.r) : null, piv = L.o || [0, 0, 0];
            /** @type {any[]} */ const solid = [], glow = [];
            for (const p of L.P) (p.g ? glow : solid).push(G ? { ...p, G } : p);
            for (const [list, isGlow] of /** @type {[any[], boolean][]} */ ([[solid, false], [glow, true]])) {
                if (!list.length) continue;
                const m = LookGeo.mesh(scene, 'look-' + rec.id, list, false);
                if (!m) continue;
                m.material = this._material(scene, isGlow);
                m.parent = parent;
                m.position.set(piv[0], piv[1], piv[2]);
                World3D.addObject(view, m, 'actor', { castShadow: L.sh !== false && !isGlow, ink: false, outline: false });
                rec.meshes.push(m);
                if (L.a) rec.anims.push({ mesh: m, piv, a: Array.isArray(L.a) ? L.a : [L.a] });
            }
        }
    },

    /** Форма-«глиф» частицы -> ключ текстуры в ParticleFX (рисуется один раз на менеджер). 'dot' — штатный мягкий круг. */
    _glyph(fx, name) {
        if (!name || name === 'dot' || !this.GLYPHS[name]) return undefined;
        const key = 'look:' + name;
        if (!fx.textures.has(key)) {
            const tex = new BABYLON.DynamicTexture('look-glyph-' + name, 64, fx.scene, true);
            const ctx = /** @type {any} */ (tex.getContext());
            ctx.clearRect(0, 0, 64, 64);
            LookDraw.paint(ctx, this.GLYPHS[name]);
            tex.hasAlpha = true;
            tex.update();
            fx.textures.set(key, tex);
        }
        return key;
    },

    /** Искры, свечение и аура редких предметов. */
    _aura(model, rec, def, slot, rarity, opts) {
        const fx = this._fx(opts);
        if (!fx) return;
        const spec = def.fx || null;
        const base = this.FX_RATE[rarity] || 0;
        if (!spec && !base) return;
        const rate = ((spec && spec.rate != null) ? spec.rate : base) * (this._mobile() ? 0.7 : 1);
        if (!(rate > 0)) return;
        const part = model.part((spec && spec.at) || this.PART[slot] || 'UpperTorso');
        if (!part) return;
        const o = (spec && spec.o) || [0, 0, 0], b = (spec && spec.box) || [8, 8, 8];
        const c = (spec && spec.c) || this.FX_COLOR[rarity] || '#ffffff', c2 = (spec && spec.c2) || c;
        const big = rarity === 'legendary' || rarity === 'mythic';
        const up = (spec && spec.up) || 14;
        const local = new BABYLON.Vector3(o[0], o[1], o[2]);
        const h = fx.create({
            texture: this._glyph(fx, (spec && spec.g) || (rarity === 'rare' ? 'spark' : 'star')),
            rate, capacity: Math.ceil(rate * 2) + 6, life: big ? [0.7, 1.5] : [0.5, 1.1], size: big ? [3, 7] : [2.2, 5],
            speed: [up * 0.4, up], direction: [[-0.6, 0.3, -0.6], [0.6, 1, 0.6]], gravity: [0, (spec && spec.up) ? 0 : 8, 0], color: c, color2: c2,
            box: [[-b[0], -b[1], -b[2]], [b[0], b[1], b[2]]], sizeGradient: [[0, 0.3], [0.3, 1], [1, 0]],
            spin: [-2, 2], follow: () => { const p = BABYLON.Vector3.TransformCoordinates(local, part.getWorldMatrix()); return { x: p.x, y: p.y, z: p.z }; },
        });
        if (h) rec.fx.push(h);
    },

    _rec(id) { return { id, meshes: [], anims: [], fx: [], mats: [], undo: [] }; },

    _drop(model, st, rec) {
        for (const fn of rec.undo) { try { fn(); } catch (e) { /* модель уже снесена */ } }
        for (const h of rec.fx) { try { h.dispose(); } catch (e) { /* система уже убрана */ } }
        for (const m of rec.meshes) { try { World3D.removeObject(st.view, m); } catch (e) { /* уже уничтожен вместе с частью */ } }
        for (const m of rec.mats) { try { m.dispose(false, true); } catch (e) { /* уже уничтожен */ } }
        const set = new Set(rec.meshes);
        st.anims = st.anims.filter((a) => !set.has(a.mesh));
    },

    _color3(c) { return Humanoid.color3(c); },

    _buildOutfit(model, view, st, id, disguise, opts) {
        const def = disguise ? this.GUARD.outfit : (this.DEFS[id] || this.DEFS.outfit_orange);
        const rec = this._rec(id);
        const scene = view.scene;
        model.setColor('top', def.top);
        model.setColor('bottom', def.bottom);
        const k = def.shine != null ? def.shine : 0.16;
        for (const key of ['top', 'bottom']) if (model.mats[key]) model.mats[key].emissiveColor = model.mats[key].diffuseColor.scale(k);
        const swap = (names, mat) => {
            for (const n of names) {
                const p = model.part(n);
                if (!p) continue;
                const prev = p.material;
                p.material = mat;
                rec.undo.push(() => { if (!p.isDisposed()) p.material = prev; });
            }
        };
        if (def.sl === 'l') swap(['UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR'], model.mats.top);
        else if (def.sl === 's') swap(['UpperArmL', 'UpperArmR'], model.mats.top);
        if (def.legs === 's') swap(['LowerLegL', 'LowerLegR'], model.mats.skin);
        if (def.shoe != null) {
            const m = new BABYLON.StandardMaterial('look-shoe', scene);
            const c = this._color3(def.shoe);
            m.diffuseColor = c; m.emissiveColor = c.scale(0.16); m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
            m.metadata = { toonGroup: 'actor' };
            World3D.applyMaterialConstants(m, World3D.cfg());
            rec.mats.push(m);
            swap(['FootL', 'FootR'], m);
        }
        // принт: грудь и спина — наклейки на UpperTorso
        const torso = model.part('UpperTorso');
        if (torso && def.print) {
            const faces = [['f', 1, 17.7], ['b', -1, -17.7]];
            for (const [key, side, x] of faces) {
                const ops = def.print[key];
                if (!ops || !ops.length) continue;
                const mat = this._decalMaterial(scene, 'look-print-' + key, ops, 200, 160, 256, 205, def.glow || 0);
                const m = this._decalMesh(scene, 'look-print-' + key, side, 31.25, 25, x);
                m.material = mat; m.parent = torso;
                World3D.addObject(view, m, 'actor', { castShadow: false, ink: false, outline: false });
                rec.meshes.push(m); rec.mats.push(mat);
            }
        }
        if (def.L) this._layers(model, view, rec, def.L, 'UpperTorso');
        if (!disguise) this._aura(model, rec, def, 'outfits', this._rarity(id), opts);
        return rec;
    },

    _buildProp(model, view, st, slot, id, def, opts, rarityId) {
        const rec = this._rec(id);
        this._layers(model, view, rec, def.L || [{ at: this.PART[slot], P: def.P || [] }], this.PART[slot]);
        if (rarityId) this._aura(model, rec, def, slot, this._rarity(rarityId), opts);
        return rec;
    },

    _paintFace(model, id) {
        const mat = model.face && model.face.material;
        const tex = mat && mat.diffuseTexture;
        if (!tex) return;
        const W = 256, H = 144, def = this.DEFS[id];
        const ctx = /** @type {any} */ (tex.getContext());
        ctx.clearRect(0, 0, W, H);
        const img = id && id !== 'face_default' ? this._rasterImg('faces', id) : null;
        if (img) ctx.drawImage(img, 0, 0, W, H);
        else if (def && def.art && id !== 'face_default') LookDraw.paint(ctx, def.art);
        else Humanoid.drawFace(ctx, W, H);
        tex.update(true);
        const g = def && def.glow ? Math.min(1, def.glow) : 0;
        mat.emissiveColor = new BABYLON.Color3(g, g, g);
    },

    _buildFace(model, view, st, id, opts) {
        const def = this.DEFS[id] || this.DEFS.face_default;
        const rec = this._rec(id);
        this._paintFace(model, id);
        if (def.P && def.P.length) this._layers(model, view, rec, [{ at: 'Head', P: def.P }], 'Head');
        if (id !== 'face_default') this._aura(model, rec, def, 'faces', this._rarity(id), opts);
        return rec;
    },

    _rarity(id) {
        const it = typeof Shop !== 'undefined' && Shop.item ? Shop.item(id) : null;
        if (it && it.rarity) return it.rarity;
        if (typeof SHOP_ITEMS !== 'undefined') { const f = SHOP_ITEMS.find((i) => i.id === id); if (f) return f.rarity; }
        return 'common';
    },

    // ---- публичный API ------------------------------------------------------------------------

    /**
     * Надеть look (Shop.look()) на HumanoidModel. opts: { disguise, hideBack, fx }. Идемпотентно, по слотам.
     * @returns {{ jet: any } | null}
     */
    apply(model, look, view, opts) {
        if (!model || model.disposed) return null;
        const o = opts || {}, lk = look || {};
        const v = view || model.view;
        let st = this._st.get(model);
        if (!st) {
            st = { model, view: v, recs: {}, anims: [], t: 0, speed: 0, last: null, obs: null };
            this._st.set(model, st);
            this._active.add(st);
            const scene = v.scene;
            st.obs = scene.onBeforeRenderObservable.add(() => this._tick(st));
            st.scene = scene;
        }
        const want = {
            outfits: o.disguise ? '@guard' : (lk.outfits || 'outfit_orange'),
            hats: o.disguise ? '@guardcap' : (lk.hats && lk.hats !== 'hat_none' ? lk.hats : null),
            faces: lk.faces || 'face_default',
            back: o.hideBack ? null : (lk.back && lk.back !== 'back_none' ? lk.back : null),
        };
        for (const slot of this.SLOTS) {
            const cur = st.recs[slot], id = want[slot];
            if (cur && cur.id === id) continue;
            if (cur) { this._drop(model, st, cur); delete st.recs[slot]; }
            if (!id && slot !== 'outfits' && slot !== 'faces') continue;
            let rec = null;
            try {
                if (slot === 'outfits') rec = this._buildOutfit(model, v, st, id, !!o.disguise, o);
                else if (slot === 'faces') rec = this._buildFace(model, v, st, id, o);
                else if (slot === 'hats') rec = id === '@guardcap' ? this._buildProp(model, v, st, slot, id, this.GUARD.hat, o, null) : this._buildProp(model, v, st, slot, id, this.DEFS[id] || { P: [] }, o, id);
                else rec = this._buildProp(model, v, st, slot, id, this.DEFS[id] || { P: [] }, o, id);
            } catch (e) { console.warn('GameLook: не удалось надеть «' + id + '»:', (e && e.message) || e); }
            if (rec) { st.recs[slot] = rec; for (const a of rec.anims) st.anims.push(a); }
        }
        return { jet: this.jetpackSkin(lk.back) };
    },

    /** Снять всю косметику с модели и освободить ресурсы (при model.dispose() вызывается само). */
    clear(model) {
        const st = this._st.get(model);
        if (!st) return;
        for (const slot of Object.keys(st.recs)) { this._drop(model, st, st.recs[slot]); delete st.recs[slot]; }
        if (!model.disposed) { try { this._paintFace(model, 'face_default'); } catch (e) { /* лица нет */ } }
        if (st.obs && st.scene) st.scene.onBeforeRenderObservable.remove(st.obs);
        this._active.delete(st);
        this._st.delete(model);
    },

    /** Покадровые анимации слоёв: вращение, покачивание, взмахи крыльев, плащ по скорости. */
    _tick(st) {
        const model = st.model;
        if (model.disposed) { this.clear(model); return; }
        if (typeof Pause !== 'undefined' && Pause.active) return;
        const eng = st.scene.getEngine(), dt = Math.min(0.1, Math.max(0, eng.getDeltaTime() / 1000));
        st.t += dt;
        const torso = model.part('UpperTorso');
        if (torso && dt > 0) {
            const p = torso.getAbsolutePosition();
            if (st.last) {
                const sp = Math.min(1500, Math.hypot(p.x - st.last[0], p.z - st.last[2]) / dt);
                st.speed += (sp - st.speed) * Math.min(1, dt * 6);
            }
            st.last = [p.x, p.y, p.z];
        }
        const frac = Math.max(0, Math.min(1.2, st.speed / 480)), t = st.t;
        for (const an of st.anims) {
            const m = an.mesh;
            if (m.isDisposed()) continue;
            for (const a of an.a) {
                if (a.k === 'spin') m.rotation[a.ax || 'y'] = t * a.s;
                else if (a.k === 'bob') m.position.y = an.piv[1] + a.amp * Math.sin(t * a.f);
                else if (a.k === 'pulse') { const s = 1 + a.amp * Math.sin(t * a.f); m.scaling.set(s, s, s); }
                else if (a.k === 'flap') m.rotation.x = -a.side * a.amp * (0.5 + 0.5 * Math.sin(t * a.f * (1 + frac)));
                else if (a.k === 'cape') m.rotation.z = -(0.05 + a.amp * frac * 0.9 + 0.04 * Math.sin(t * 2.3 + 1));
                else if (a.k === 'sway') m.rotation.z = a.amp * Math.sin(t * a.f);
            }
        }
    },

    // ---- след -------------------------------------------------------------------------------------

    trailStop() {
        const tr = this._tr;
        if (!tr) return;
        for (const e of tr.layers) { try { e.h.dispose(); } catch (err) { /* уже убрана */ } }
        this._tr = null;
    },

    _trailStart(fx, id) {
        const def = this.DEFS[id];
        if (!def || !def.T || !def.T.length) return;
        const tr = { id, fx, pos: [0, 0, 0], last: null, speed: 0, layers: [] };
        const mob = this._mobile() ? 0.7 : 1;
        for (const l of def.T) {
            const capacity = Math.ceil(l.rate * mob * l.life[1] * 1.3) + 8;
            const h = fx.create({
                name: 'look-trail', texture: this._glyph(fx, l.g), rate: 0, capacity, life: l.life, size: l.size, speed: l.spd,
                direction: l.dir, gravity: l.grav, spin: l.spin, color: l.c, color2: l.c2, alpha: l.a, blend: l.blend, sizeGradient: l.sg,
                colorGradient: l.cg, box: [[-3, 0, -3], [3, 2, 3]],
                follow: () => ({ x: tr.pos[0] + l.off[0], y: tr.pos[1] + l.off[1], z: tr.pos[2] + l.off[2] }),
            });
            if (h) tr.layers.push({ h, l, mob });
        }
        this._tr = tr;
    },

    /**
     * След за героем: hero.x, hero.y (карта), hero.h (высота), hero.ch.grounded. look — Shop.look() или id следа.
     * Зовётся каждый кадр (дёшево: одна непрерывная система на слой, меняется только частота).
     */
    trail(hero, look, dt, opts) {
        const fx = this._fx(opts);
        if (!fx || !hero) { this.trailStop(); return; }
        const id = typeof look === 'string' ? look : (look && look.trails) || null;
        const want = id && id !== 'trail_none' ? id : null;
        if (this._tr && (this._tr.id !== want || this._tr.fx !== fx || fx.disposed)) this.trailStop();
        if (!this._tr && want) this._trailStart(fx, want);
        const tr = this._tr;
        if (!tr) return;
        const x = hero.x || 0, y = hero.y || 0, h = hero.h || 0;
        const ch = hero.ch || {};
        const grounded = ch.grounded !== undefined ? !!ch.grounded : (hero.grounded !== undefined ? !!hero.grounded : true);
        tr.pos[0] = x; tr.pos[1] = h; tr.pos[2] = y;
        const d = dt > 0 ? dt : 1 / 60;
        if (tr.last) {
            const sp = Math.hypot(x - tr.last[0], y - tr.last[1]) / d;
            tr.speed += ((sp > 3000 ? 0 : sp) - tr.speed) * Math.min(1, d * 8);
        }
        tr.last = [x, y];
        const frac = Math.min(1, tr.speed / 420);
        for (const e of tr.layers) {
            const mode = e.l.mode;
            let f = 0;
            if (mode === 'run') f = grounded && tr.speed > 40 ? frac : 0;
            else if (mode === 'air') f = grounded ? 0 : 1;
            else f = grounded ? (tr.speed > 40 ? frac : 0) : 1;
            e.h.setRate(e.l.rate * f * e.mob);
        }
    },

    // ---- джетпак -----------------------------------------------------------------------------------

    /** Цвета и пламя джетпака по предмету спины (id или look); без скина — штатный вид. */
    jetpackSkin(x) {
        const id = typeof x === 'string' ? x : x && x.back;
        const d = id && this.DEFS[id];
        if (d && d.jet) return { id, ...d.jet };
        return { id: null, color: 0x3a3f47, color2: 0xf07d1e, glow: 0xffd24a, flame: { core: '#fff3b0', outer: '#ff8a1e' } };
    },

    // ---- иконки ----------------------------------------------------------------------------------------

    /** Растровая картинка (Codex) — ленивая проверка наличия; по успеху зовёт onRaster-слушателей и рисует её на карточке. */
    _rasterUrl(kind, id, ext) { return this.RASTER[kind] + id + (ext || '.webp'); },

    _rasterImg(kind, id) {
        const key = kind + '/' + id;
        if (this._ras[key] === undefined && typeof Image !== 'undefined') {
            this._ras[key] = 0;
            const url = this._rasterUrl(kind, id), img = new Image();
            img.onload = () => {
                this._ras[key] = 1; this._ras[key + '#img'] = img;
                for (const fn of this._rasListeners.slice()) { try { fn(kind, id, url); } catch (e) { /* слушатель сломан */ } }
                if (kind === 'faces') for (const st of this._active) if (st.recs.faces && st.recs.faces.id === id) this._paintFace(st.model, id);
            };
            img.onerror = () => { this._ras[key] = -1; };
            img.src = url;
        }
        return this._ras[key] === 1 ? this._ras[key + '#img'] || null : null;
    },

    /** Путь растровой иконки, если файл найден (иначе null). Проверка идёт в фоне: слушайте onRaster. */
    rasterUrl(kind, id) { return this._rasterImg(kind, id) ? this._rasterUrl(kind, id) : null; },

    /** Подписка: fn(kind, id, url) — растровая картинка нашлась. Возвращает отписку. */
    onRaster(fn) {
        this._rasListeners.push(fn);
        return () => { const i = this._rasListeners.indexOf(fn); if (i >= 0) this._rasListeners.splice(i, 1); };
    },

    _svgWrap(inner, glow, color) {
        const halo = glow ? '<circle cx="48" cy="48" r="44" fill="' + color + '" opacity=".16"/><circle cx="48" cy="48" r="34" fill="' + color + '" opacity=".14"/>' : '';
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">' + halo + inner + '</svg>';
    },

    /** Примитивы определения в координатах части (слои уже сдвинуты и повёрнуты) — для иконки. */
    _flat(def, slot) {
        const layers = def.L || [{ at: this.PART[slot], P: def.P || [] }];
        const out = [];
        for (const L of layers) {
            const G = L.r ? LookGeo.rot(L.r) : null, O = L.o || [0, 0, 0];
            if ((L.at || this.PART[slot]) !== this.PART[slot]) continue;
            for (const p of L.P || []) out.push({ ...p, G, O });
        }
        return out;
    },

    _iconOutfit(def, skin) {
        const h = lookHex, top = h(def.top), bot = h(def.bottom), sk = skin || '#e2b896', shoe = h(def.shoe == null ? def.bottom : def.shoe);
        const arm = (x, w) => {
            if (def.sl === 'l') return '<rect x="' + x + '" y="31" width="' + w + '" height="28" rx="3" fill="' + top + '"/><rect x="' + x + '" y="57" width="' + w + '" height="5" rx="2" fill="' + sk + '"/>';
            if (def.sl === 's') return '<rect x="' + x + '" y="31" width="' + w + '" height="12" rx="3" fill="' + top + '"/><rect x="' + x + '" y="41" width="' + w + '" height="20" rx="3" fill="' + sk + '"/>';
            return '<rect x="' + x + '" y="31" width="' + w + '" height="30" rx="3" fill="' + sk + '"/>';
        };
        const leg = (x) => '<rect x="' + x + '" y="62" width="16" height="' + (def.legs === 's' ? 12 : 22) + '" rx="2" fill="' + bot + '"/>'
            + (def.legs === 's' ? '<rect x="' + x + '" y="72" width="16" height="10" fill="' + sk + '"/>' : '') + '<rect x="' + (x - 1) + '" y="82" width="18" height="6" rx="2" fill="' + shoe + '"/>';
        let s = leg(30) + leg(50) + arm(17, 11) + arm(68, 11);
        s += '<rect x="28" y="30" width="40" height="34" rx="3" fill="' + top + '"/>';
        s += '<g transform="translate(28 31) scale(.2 .2)">' + LookDraw.svg((def.print && def.print.f) || []) + '</g>';
        s += '<rect x="36" y="6" width="24" height="24" rx="4" fill="' + sk + '"/><ellipse cx="43" cy="19" rx="2" ry="3" fill="#2a2430"/><ellipse cx="53" cy="19" rx="2" ry="3" fill="#2a2430"/>';
        return s;
    },

    _iconFace(def) {
        const s = '<rect x="10" y="10" width="76" height="76" rx="10" fill="#e2b896" stroke="#b98d68" stroke-width="3"/>'
            + '<g transform="translate(16 31) scale(.25 .25)">' + LookDraw.svg(def.art || []) + '</g>';
        return s;
    },

    _iconTrail(def) {
        const layers = def.T || [];
        const pick = layers.find((l) => l.g !== 'dot') || layers[0];
        let s = '<path d="M14 80 Q30 62 28 56 L50 56 Q52 64 70 70 L72 80 Z" fill="#3a3f47" stroke="#23262b" stroke-width="3"/>';
        if (!pick) return s;
        const g = this.GLYPHS[pick.g];
        const cols = [];
        const cg = pick.cg || (layers.find((l) => l.cg) || {}).cg;
        for (let i = 0; i < 7; i++) cols.push(cg ? cg[Math.min(cg.length - 1, Math.floor(i * cg.length / 7))][1] : (i % 2 ? (pick.c2 || pick.c) : pick.c));
        for (let i = 0; i < 7; i++) {
            const t = i / 6, x = 26 + t * 50 - (i % 2) * 4, y = 66 - t * 38 + ((i % 3) - 1) * 6, sz = 32 - t * 16, op = 1 - t * 0.4;
            if (g) s += '<g transform="translate(' + (x - sz / 2).toFixed(1) + ' ' + (y - sz / 2).toFixed(1) + ') scale(' + (sz / 64).toFixed(3) + ')" opacity="' + op.toFixed(2) + '">' + LookDraw.svg(g, cols[i]) + '</g>';
            else s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (sz / 2.4).toFixed(1) + '" fill="' + cols[i] + '" opacity="' + op.toFixed(2) + '"/>';
        }
        return s;
    },

    /**
     * Данные иконки карточки: { id, svg, raster, color, glow, rarity }. svg — готовая строка <svg> (процедурная, из тех же данных,
     * что и меш на герое); raster — путь assets/ui/items/<id>.webp, если файл найден (иначе null; слушайте onRaster).
     */
    icon(item) {
        const it = typeof item === 'string' ? ((typeof Shop !== 'undefined' && Shop.item && Shop.item(item)) || (typeof SHOP_ITEMS !== 'undefined' && SHOP_ITEMS.find((i) => i.id === item)) || { id: item }) : item;
        if (!it) return { id: '', svg: this._svgWrap('', false, '#fff'), raster: null, color: this.RARITY.common, glow: false, rarity: 'common' };
        const id = it.id, rarity = it.rarity || this._rarity(id), color = this.rarityColor(rarity);
        const glow = rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic';
        let c = this._icons[id];
        if (!c) {
            const def = this.DEFS[id] || {}, slot = it.tab || it.slot || '';
            let inner = '';
            try {
                if (slot === 'outfits') inner = this._iconOutfit(def);
                else if (slot === 'faces') inner = this._iconFace(def);
                else if (slot === 'trails') inner = this._iconTrail(def);
                else if (slot === 'hats') {
                    const head = [{ t: 'b', p: [0, 0, 0], s: [44, 44, 50], c: 0xe2b896 }, { t: 's', p: [22, 1, 17], s: [3, 7, 6], c: 0x2a2430 }, { t: 's', p: [22, 1, -17], s: [3, 7, 6], c: 0x2a2430 }];
                    inner = LookGeo.iconSvg(head.concat(this._flat(def, slot)), { yaw: 34, pitch: 14 });
                } else if (slot === 'back') {
                    const torso = [{ t: 'b', p: [0, 0, 0], s: [35, 56, 70], c: 0xf07d1e }, { t: 'b', p: [0, 41, 0], s: [26, 26, 28], c: 0xe2b896 }];
                    inner = LookGeo.iconSvg(torso.concat(this._flat(def, slot)), { yaw: 28, pitch: 12, back: true });
                }
            } catch (e) { inner = ''; }
            c = this._icons[id] = this._svgWrap(inner, glow, color);
        }
        return { id, svg: c, raster: this.rasterUrl('items', id), color, glow, rarity };
    },

    /** Монета и значок рекламы: { svg, raster } (assets/ui/icons/coin.webp, ad.webp, если есть). */
    uiIcon(kind) {
        const svgs = {
            coin: '<circle cx="48" cy="48" r="34" fill="#f2c230" stroke="#b8860b" stroke-width="6"/><circle cx="48" cy="48" r="22" fill="none" stroke="#b8860b" stroke-width="4"/><rect x="44" y="34" width="8" height="28" rx="3" fill="#b8860b"/>',
            ad: '<rect x="10" y="22" width="76" height="52" rx="9" fill="#23262b" stroke="#f2c230" stroke-width="5"/><path d="M40 36 L64 48 L40 60 Z" fill="#f07d1e"/>',
        };
        return { svg: this._svgWrap(svgs[kind] || '', false, '#fff'), raster: this.rasterUrl('icons', kind) };
    },
};
