// GameShopUI.js — окно магазина косметики «Prision Espace Parkour Master» (тюремный стиль: графитовая табличка на болтах,
// жёлто-чёрная разметка, бирки-вкладки, карточки-таблички с рамкой редкости). Логика — Shop.js, вид предметов — GameLook.js.
//
// API:
//   GameShopUI.init({ onClose, onPreview(look), onEvent(name, data), parent })
//        onPreview(look) — Shop.look() с примеркой выбранного предмета: ядро надевает его на героя в 3D (GameLook.apply);
//        onClose — окно закрыто (look героя уже вернулся к надетому: onPreview зовётся перед onClose);
//        onEvent('buy' | 'equip' | 'unequip' | 'ad' | 'ui', данные) — для звуков и эффектов (GameFx / GameAudio).
//   GameShopUI.open({ tab?, item? })  открыть (item — сразу выбрать предмет: витрина уровня); close(); isOpen;
//   GameShopUI.layout() -> { side: 'right' | 'bottom', size } — где панель (центр с героем открыт: сдвиньте камеру/героя);
//   GameShopUI.refresh()  перерисовать состояния (монеты начислены извне); GameShopUI.destroy().
// Окно — панель сбоку (альбомный экран) или снизу (портрет, половина экрана). Тексты — LANG_STRINGS 'shop.*' (ru/en).
// Реклама: кнопка «Посмотреть рекламу» неактивна на паузе между rewarded («Через N с», Platform.onRewardedCooldown) и когда
// реклама недоступна; повторное нажатие во время показа игнорируется. Прогресс просмотров виден точками и «2/5».

const GAME_SHOP_TEXT = {
    ru: {
        'shop.title': 'Магазин',
        'shop.close': 'Закрыть',
        'shop.coins': 'Монеты',
        'shop.tryOn': 'Примерка: смотри на герое',
        'shop.bought': 'Куплено и надето!',
        'shop.unlocked': 'Открыто и надето!',
        'shop.adCounted': 'Просмотр засчитан: {a}/{b}',
        'shop.adFailed': 'Реклама не досмотрена: просмотр не засчитан.',
        'shop.buyFor': 'Купить за {n}',
        'shop.default': 'Стандартный',
        'shop.adLeft': 'Ещё просмотров: {n}',
        'shop.wait': 'Подождите…',
        'shop.free': 'Бесплатно',
        'shop.adsOnly': 'Открывается просмотрами рекламы',
        'shop.owned.count': '{a}/{b}',
        'shop.rarity.mythic': 'Мифический',
        'shop.watchShort': 'Реклама',
    },
    en: {
        'shop.title': 'Shop',
        'shop.close': 'Close',
        'shop.coins': 'Coins',
        'shop.tryOn': 'Try-on: look at the hero',
        'shop.bought': 'Bought and equipped!',
        'shop.unlocked': 'Unlocked and equipped!',
        'shop.adCounted': 'View counted: {a}/{b}',
        'shop.adFailed': 'The ad was not finished: view not counted.',
        'shop.buyFor': 'Buy for {n}',
        'shop.default': 'Standard',
        'shop.adLeft': 'Views left: {n}',
        'shop.wait': 'Please wait…',
        'shop.free': 'Free',
        'shop.adsOnly': 'Unlocked by watching ads',
        'shop.owned.count': '{a}/{b}',
        'shop.rarity.mythic': 'Mythic',
        'shop.watchShort': 'Ad',
    },
};
if (typeof LANG_STRINGS !== 'undefined') {
    for (const code of Object.keys(GAME_SHOP_TEXT)) {
        const dict = LANG_STRINGS[code];
        if (!dict) continue;
        for (const key of Object.keys(GAME_SHOP_TEXT[code])) if (!(key in dict)) dict[key] = GAME_SHOP_TEXT[code][key];
    }
}

const GAME_SHOP_CSS = `
.pes-root{position:fixed;inset:0;z-index:60;pointer-events:none;font-family:var(--pe-font,'Montserrat',system-ui,sans-serif);color:#f4f1ea;
  --or:#f07d1e;--gr:#23262b;--gr2:#1b1d21;--st:#3a3f47;--st2:#2e3238;--yl:#f2c230;--ch:#f4f1ea;--rc:#9aa3ad;
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.pes-root[hidden]{display:none}
.pes-root *{box-sizing:border-box}
.pes-panel{position:absolute;pointer-events:auto;display:flex;flex-direction:column;background:
  repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 2px,transparent 2px 6px),linear-gradient(180deg,#2a2d33,#202328);
  border:3px solid var(--st);box-shadow:0 0 0 2px #121316,0 10px 40px rgba(0,0,0,.55),inset 0 0 0 2px rgba(255,255,255,.04);
  top:0;right:0;bottom:0;width:min(46vw,560px);min-width:340px}
.pes-bolt{position:absolute;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#8b929c,#454b54 60%,#2b2f35);box-shadow:0 1px 1px rgba(0,0,0,.6);z-index:3}
.pes-bolt::after{content:'';position:absolute;left:1px;right:1px;top:50%;height:1.5px;background:rgba(0,0,0,.55);transform:rotate(35deg)}
.pes-head{position:relative;flex:none;padding:0 0 0 0}
.pes-haz{height:9px;background:repeating-linear-gradient(-45deg,var(--yl) 0 12px,#17181b 12px 24px);border-bottom:2px solid #121316}
.pes-bar{display:flex;align-items:center;gap:10px;padding:8px 12px 6px}
.pes-title{margin:0;font-size:clamp(15px,2.4vh,22px);font-weight:900;letter-spacing:.14em;text-transform:uppercase;background:var(--or);color:var(--ch);
  padding:5px 14px 4px;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 50%,calc(100% - 9px) 100%,0 100%);padding-right:22px;text-shadow:0 2px 0 rgba(0,0,0,.35);flex:none}
.pes-sp{flex:1}
.pes-coins{display:flex;align-items:center;gap:7px;background:#15171a;border:2px solid var(--st);border-radius:999px;padding:3px 14px 3px 4px;font-weight:900;font-size:clamp(14px,2.2vh,19px);color:var(--yl);letter-spacing:.04em;font-variant-numeric:tabular-nums}
.pes-coins .pes-ci{width:26px;height:26px;flex:none;display:block}
.pes-coins.bump{animation:pes-bump .35s ease}
.pes-x{flex:none;width:36px;height:36px;border:2px solid var(--st);background:#15171a;color:var(--ch);font:900 18px/1 inherit;border-radius:6px;cursor:pointer;display:grid;place-items:center;padding:0}
.pes-x:hover,.pes-x:focus-visible{background:var(--or);border-color:var(--or);outline:none}
.pes-x svg{width:16px;height:16px}
.pes-tabs{flex:none;display:flex;gap:6px;padding:4px 12px 8px;overflow-x:auto;scrollbar-width:none}
.pes-tabs::-webkit-scrollbar{display:none}
.pes-tab{position:relative;flex:1 0 auto;min-width:64px;border:0;cursor:pointer;color:#c9cdd3;background:var(--st);font:800 clamp(10px,1.7vh,13px)/1.1 inherit;font-family:inherit;letter-spacing:.08em;text-transform:uppercase;
  padding:9px 12px 7px 22px;clip-path:polygon(8px 0,100% 0,100% 100%,0 100%,0 8px);text-align:left;transition:background .12s,color .12s}
.pes-tab::before{content:'';position:absolute;left:8px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:#15171a;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.pes-tab small{display:block;font-size:.78em;font-weight:700;opacity:.65;letter-spacing:.04em;margin-top:2px}
.pes-tab:hover{background:#4a505a}
.pes-tab[aria-selected=true]{background:var(--or);color:var(--ch);text-shadow:0 1px 0 rgba(0,0,0,.3)}
.pes-tab:focus-visible{outline:2px solid var(--yl);outline-offset:-3px}
.pes-grid{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 12px 10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--pes-card,104px),1fr));gap:9px;align-content:start;touch-action:pan-y;
  scrollbar-width:thin;scrollbar-color:var(--st) transparent;overscroll-behavior:contain}
.pes-card{position:relative;display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:5px 5px 6px;border:0;border-top:4px solid var(--rc);background:var(--st2);color:inherit;font-family:inherit;text-align:center;cursor:pointer;
  border-radius:3px;box-shadow:0 0 0 1px #15171a,0 3px 0 #15171a;transition:transform .1s,box-shadow .1s;min-width:0}
.pes-card:hover{transform:translateY(-2px)}
.pes-card:focus-visible{outline:2px solid var(--yl);outline-offset:1px}
.pes-card[aria-pressed=true]{box-shadow:0 0 0 2px var(--yl),0 3px 0 #15171a;transform:translateY(-2px)}
.pes-card[aria-pressed=true]::after{content:'';position:absolute;inset:-5px;border:2px dashed var(--yl);border-radius:5px;pointer-events:none;opacity:.8}
.pes-card.r-common{--rc:#9aa3ad}.pes-card.r-rare{--rc:#3d9be9}.pes-card.r-epic{--rc:#b05cf0}.pes-card.r-legendary{--rc:#f2c230}
.pes-card.r-mythic{--rc:#ff4f8b;border-image:linear-gradient(90deg,#ff4f8b,#ffb347,#8b5cff,#ff4f8b) 1 0 0 0;border-image-slice:1}
.pes-card.r-legendary,.pes-card.r-mythic{background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 14%,var(--st2)),var(--st2) 60%)}
.pes-ico{display:block;aspect-ratio:1;background:radial-gradient(circle at 50% 40%,#2b2f36,#16181c);border-radius:2px;overflow:hidden;position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.pes-ico svg,.pes-ico img{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:contain;display:block}
.pes-card.is-locked .pes-ico svg,.pes-card.is-locked .pes-ico img{filter:brightness(.82) saturate(.85)}
.pes-card.r-legendary .pes-ico,.pes-card.r-mythic .pes-ico,.pes-card.r-epic .pes-ico{box-shadow:inset 0 0 14px color-mix(in srgb,var(--rc) 35%,transparent)}
.pes-nm{display:block;font-size:clamp(9px,1.45vh,11.5px);font-weight:800;letter-spacing:.04em;text-transform:uppercase;line-height:1.15;min-height:2.3em;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#e9e6dd;word-break:break-word}
.pes-st{display:flex;align-items:center;justify-content:center;gap:4px;min-height:18px;font-size:clamp(10px,1.55vh,12.5px);font-weight:900;letter-spacing:.03em;color:var(--ch);background:#17191d;border-radius:2px;padding:2px 4px;white-space:nowrap}
.pes-st.coins{color:var(--yl)}.pes-st.coins.poor{color:#ff8a6a}
.pes-st.ads{color:#ffe08a}.pes-st.have{color:#9be89b}.pes-st.worn{background:var(--or);color:var(--ch)}
.pes-st svg.pes-ci{width:14px;height:14px;flex:none}
.pes-pips{display:inline-flex;gap:2px;align-items:center}
.pes-pips i{width:6px;height:6px;border-radius:50%;background:#4a505a;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
.pes-pips i.on{background:var(--yl);box-shadow:0 0 4px rgba(242,194,48,.7)}
.pes-detail{flex:none;display:flex;align-items:stretch;gap:12px;padding:9px 12px 12px;border-top:3px solid var(--st);background:linear-gradient(180deg,#1c1e22,#17181c);position:relative}
.pes-dico{flex:none;width:clamp(54px,11vh,82px);aspect-ratio:1;background:radial-gradient(circle at 50% 40%,#2b2f36,#121316);border:3px solid var(--rc);border-radius:3px;position:relative;overflow:hidden}
.pes-dico svg,.pes-dico img{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:contain}
.pes-dinfo{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px}
.pes-dname{font-size:clamp(13px,2.2vh,18px);font-weight:900;letter-spacing:.06em;text-transform:uppercase;line-height:1.1;overflow:hidden;text-overflow:ellipsis}
.pes-drar{align-self:flex-start;font-size:clamp(9px,1.45vh,11px);font-weight:900;letter-spacing:.12em;text-transform:uppercase;background:var(--rc);color:#17181b;padding:1px 7px 1px;clip-path:polygon(0 0,calc(100% - 5px) 0,100% 50%,calc(100% - 5px) 100%,0 100%);padding-right:11px}
.pes-dnote{font-size:clamp(10px,1.6vh,12.5px);font-weight:600;color:#aeb4bc;line-height:1.25;min-height:1.25em}
.pes-dnote.warn{color:#ffb38a}.pes-dnote.ok{color:#9be89b}
.pes-act{flex:none;align-self:center;min-width:clamp(128px,24vh,176px);display:flex;flex-direction:column;gap:5px;align-items:stretch}
.pes-btn{position:relative;border:0;cursor:pointer;font-family:inherit;font-weight:900;font-size:clamp(12px,2vh,16px);letter-spacing:.07em;text-transform:uppercase;padding:11px 14px 10px;color:var(--ch);background:var(--or);
  box-shadow:0 4px 0 #8f4509,0 0 0 2px #17181b;border-radius:3px;display:flex;align-items:center;justify-content:center;gap:7px;transition:transform .08s,box-shadow .08s,background .12s;min-height:44px;text-shadow:0 2px 0 rgba(0,0,0,.3)}
.pes-btn:hover:not(:disabled){background:#ff8d2e}
.pes-btn:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 #8f4509,0 0 0 2px #17181b}
.pes-btn:focus-visible{outline:2px solid var(--yl);outline-offset:3px}
.pes-btn.watch{background:var(--yl);color:#1b1d21;text-shadow:none;box-shadow:0 4px 0 #8c6c0c,0 0 0 2px #17181b}
.pes-btn.watch:hover:not(:disabled){background:#ffd24a}
.pes-btn.equip{background:var(--ch);color:#1b1d21;text-shadow:none;box-shadow:0 4px 0 #8d8a80,0 0 0 2px #17181b}
.pes-btn.unequip{background:var(--st);color:var(--ch);box-shadow:0 4px 0 #1b1d21,0 0 0 2px #17181b}
.pes-btn:disabled{cursor:not-allowed;background:#3a3f47;color:#8b929c;box-shadow:0 4px 0 #23262b,0 0 0 2px #17181b;text-shadow:none}
.pes-btn.busy{opacity:.8}
.pes-btn svg{width:20px;height:20px;flex:none}
.pes-msg{position:absolute;left:12px;right:12px;bottom:calc(100% + 8px);padding:8px 12px;background:#15171a;border:2px solid var(--yl);color:var(--ch);font-weight:800;font-size:clamp(11px,1.8vh,14px);letter-spacing:.03em;text-align:center;pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .15s,transform .15s}
.pes-msg.on{opacity:1;transform:none}
.pes-msg.bad{border-color:#ff6a4a}.pes-msg.good{border-color:#6be06b}
@keyframes pes-bump{50%{transform:scale(1.12)}}
@keyframes pes-shine{to{background-position:200% 0}}
.pes-card.r-mythic .pes-nm{background:linear-gradient(90deg,#ff7aa8,#ffd27a,#b08cff,#ff7aa8);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:pes-shine 3.5s linear infinite}
@media (prefers-reduced-motion:reduce){.pes-card.r-mythic .pes-nm{animation:none}.pes-coins.bump{animation:none}}
/* портрет: панель снизу, половина экрана, центр с героем открыт */
@media (max-aspect-ratio:1/1){
  .pes-panel{top:auto;left:0;right:0;bottom:0;width:auto;min-width:0;height:min(54vh,560px);border-width:3px 0 0 0}
  .pes-grid{--pes-card:92px}
}
/* низкий альбомный экран (телефон набок): компактнее */
@media (min-aspect-ratio:1/1) and (max-height:430px){
  .pes-panel{width:min(52vw,500px);min-width:300px}
  .pes-haz{height:6px}.pes-bar{padding:4px 10px 3px}.pes-tabs{padding:2px 10px 5px}
  .pes-grid{--pes-card:84px;gap:6px;padding:3px 10px 6px}
  .pes-card{gap:2px;padding:3px 3px 4px}.pes-nm{min-height:2.2em}
  .pes-detail{padding:6px 10px 8px;gap:8px}.pes-btn{padding:8px 10px 7px;min-height:38px}
  .pes-x{width:30px;height:30px}.pes-coins .pes-ci{width:22px;height:22px}
}
.pes-short{display:none}
@media (max-width:520px){
  .pes-long{display:none}.pes-short{display:inline}
  .pes-bar{padding:7px 8px 5px;gap:6px}.pes-title{font-size:15px;padding-right:18px}.pes-coins{padding-right:10px}
  .pes-tabs{padding:3px 8px 6px}.pes-grid{padding:4px 8px 8px;gap:7px}
  .pes-detail{padding:8px 8px 10px;gap:8px}.pes-dico{width:56px}.pes-act{min-width:0;flex:0 0 auto}.pes-btn{padding:9px 10px 8px;font-size:13px;letter-spacing:.04em}
}
@media (max-width:380px){.pes-grid{--pes-card:84px}.pes-title{letter-spacing:.08em}}
`;

/** @satisfies {Record<string, any>} */
const GameShopUI = {
    /** @type {any} */ cfg: {},
    /** @type {HTMLElement | null} */ root: null,
    /** @type {any} */ els: {},
    open_: false,
    tab: 'outfits',
    sel: '',
    busy: false,
    /** @type {any[]} */ subs: [],
    /** @type {any} */ timer: null,
    /** @type {any} */ msgTimer: null,
    _lastCoins: -1,
    /** @type {any} */ _onLang: null,
    _waiting: false,

    get isOpen() { return this.open_; },

    /** Строка 'shop.*' (ru/en); без Lang — из GAME_SHOP_TEXT. */
    t(key, params) {
        if (typeof Lang !== 'undefined' && Lang.has(key)) return Lang.t(key, params);
        if (typeof Shop !== 'undefined' && Shop.has(key)) return Shop.t(key, params);
        const code = typeof Lang !== 'undefined' && Lang.code ? Lang.code : (typeof GAME_LANG !== 'undefined' ? GAME_LANG : 'ru');
        const s = (GAME_SHOP_TEXT[code] || GAME_SHOP_TEXT.en)[key] || GAME_SHOP_TEXT.en[key] || key;
        return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
    },

    /**
     * @param {{ onClose?: () => void, onPreview?: (look: any) => void, onEvent?: (name: string, data?: any) => void, parent?: HTMLElement }} [cfg]
     */
    init(cfg) {
        this.cfg = cfg || {};
        if (!document.getElementById('pes-style')) {
            const st = document.createElement('style');
            st.id = 'pes-style';
            st.textContent = GAME_SHOP_CSS;
            document.head.appendChild(st);
        }
        if (this.root) this.root.remove();
        const root = document.createElement('div');
        root.className = 'pes-root';
        root.id = 'pe-shop';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', this.t('shop.title'));
        (this.cfg.parent || document.body).appendChild(root);
        this.root = root;
        this._onLang = () => { if (this.open_) this.build(); };
        window.addEventListener('lory-language', this._onLang);
        if (typeof GameLook !== 'undefined' && GameLook.onRaster) {
            GameLook.onRaster((kind, id) => { if (this.open_ && kind === 'items') this.paintIcons(id); });
        }
        return this;
    },

    destroy() {
        this.close(true);
        window.removeEventListener('lory-language', this._onLang);
        if (this.root) this.root.remove();
        this.root = null;
    },

    emit(name, data) { try { if (typeof this.cfg.onEvent === 'function') this.cfg.onEvent(name, data); } catch (e) { console.warn('GameShopUI: onEvent:', e); } },

    emitPreview() {
        try { if (typeof this.cfg.onPreview === 'function') this.cfg.onPreview(Shop.look()); } catch (e) { console.warn('GameShopUI: onPreview:', e); }
    },

    /** Где панель: справа (альбом) или снизу (портрет); size — её ширина или высота в px. */
    layout() {
        const r = this.root && this.root.firstElementChild ? this.root.firstElementChild.getBoundingClientRect() : null;
        const portrait = window.innerHeight >= window.innerWidth;
        return { side: portrait ? 'bottom' : 'right', size: r ? Math.round(portrait ? r.height : r.width) : 0 };
    },

    /**
     * Открыть. opts: { tab, item } — вкладка / сразу выбрать предмет (витрина уровня).
     */
    open(opts) {
        if (!this.root) this.init(this.cfg);
        if (this.open_) { if (opts && (opts.item || opts.tab)) this.focusOn(opts); return; }
        const o = opts || {};
        this.open_ = true;
        this.busy = false;
        Shop.clearPreview();
        const tabs = Shop.tabs();
        const it = o.item && Shop.item(o.item);
        this.tab = (it && it.tab) || o.tab || (tabs.find((t) => t.id === this.tab) ? this.tab : (tabs[0] && tabs[0].id) || '');
        this.sel = it ? it.id : (Shop.equippedId(this.tab) || '');
        this.build();
        this.root.hidden = false;
        this.subs.push(Shop.on((e) => {
            if (e.type === 'preview') return;           // примерку шлём сами (после выбора), без дублей
            this.refresh();
            if (e.type === 'equip' || e.type === 'unequip') this.emitPreview();
        }));
        if (typeof Platform !== 'undefined' && Platform.onRewardedCooldown) this.subs.push(Platform.onRewardedCooldown(() => this.refresh()));
        this.timer = setInterval(() => { if (this.needsTick()) this.refresh(); }, 500);
        if (this.sel) Shop.preview(this.sel);
        this.emitPreview();
        this.emit('ui', { what: 'open' });
    },

    focusOn(o) {
        const it = o.item && Shop.item(o.item);
        if (it) { this.tab = it.tab; this.sel = it.id; Shop.clearPreview(); Shop.preview(it.id); this.build(); this.emitPreview(); }
        else if (o.tab) this.setTab(o.tab);
    },

    /** Закрыть: примерка снимается, герой возвращается к надетому (onPreview), затем onClose. silent — без колбэков. */
    close(silent) {
        if (!this.open_) return;
        this.open_ = false;
        for (const off of this.subs) { try { off(); } catch (e) { /* подписка уже снята */ } }
        this.subs = [];
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        if (this.msgTimer) { clearTimeout(this.msgTimer); this.msgTimer = null; }
        if (this.root) this.root.hidden = true;
        Shop.clearPreview();
        if (silent) return;
        this.emitPreview();
        this.emit('ui', { what: 'close' });
        try { if (typeof this.cfg.onClose === 'function') this.cfg.onClose(); } catch (e) { console.warn('GameShopUI: onClose:', e); }
    },

    needsTick() {
        if (this.busy) return false;
        const c = this.sel && Shop.card(this.sel);
        return Shop.adWaitSec() > 0 || this._waiting || !!(c && c.adWait);
    },

    // ---- сборка DOM ---------------------------------------------------------------------------------

    el(tag, cls, html) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    },

    coinSvg() { return (typeof GameLook !== 'undefined' ? GameLook.uiIcon('coin') : { svg: '' }).svg.replace('<svg ', '<svg class="pes-ci" ').replace(/width="100%" height="100%"/, ''); },
    adSvg() { return (typeof GameLook !== 'undefined' ? GameLook.uiIcon('ad') : { svg: '' }).svg.replace(/width="100%" height="100%"/, ''); },

    /** Полная сборка окна (открытие, смена языка, смена вкладки пересобирает только сетку). */
    build() {
        const root = /** @type {HTMLElement} */ (this.root);
        root.innerHTML = '';
        const panel = this.el('div', 'pes-panel');
        for (const pos of ['left:4px;top:13px', 'right:4px;top:13px', 'left:4px;bottom:4px', 'right:4px;bottom:4px']) {
            const b = this.el('i', 'pes-bolt'); b.setAttribute('style', pos); panel.appendChild(b);
        }
        const head = this.el('div', 'pes-head');
        head.appendChild(this.el('div', 'pes-haz'));
        const bar = this.el('div', 'pes-bar');
        bar.appendChild(this.el('h2', 'pes-title', this.t('shop.title')));
        bar.appendChild(this.el('div', 'pes-sp'));
        const coins = this.el('div', 'pes-coins');
        coins.setAttribute('title', this.t('shop.coins'));
        coins.innerHTML = this.coinSvg() + '<span class="pes-cn">0</span>';
        bar.appendChild(coins);
        const x = this.el('button', 'pes-x', '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>');
        x.setAttribute('type', 'button'); x.setAttribute('aria-label', this.t('shop.close'));
        x.addEventListener('click', () => { this.emit('ui', { what: 'click' }); this.close(); });
        bar.appendChild(x);
        head.appendChild(bar);
        const tabs = this.el('div', 'pes-tabs');
        tabs.setAttribute('role', 'tablist');
        head.appendChild(tabs);
        panel.appendChild(head);
        const grid = this.el('div', 'pes-grid');
        panel.appendChild(grid);
        const detail = this.el('div', 'pes-detail');
        const msg = this.el('div', 'pes-msg');
        msg.setAttribute('role', 'status');
        detail.appendChild(msg);
        const dico = this.el('div', 'pes-dico');
        const info = this.el('div', 'pes-dinfo');
        const dname = this.el('div', 'pes-dname'), drar = this.el('div', 'pes-drar'), dnote = this.el('div', 'pes-dnote');
        info.append(dname, drar, dnote);
        const act = this.el('div', 'pes-act');
        const btn = this.el('button', 'pes-btn');
        btn.setAttribute('type', 'button');
        btn.addEventListener('click', () => this.doAction());
        act.appendChild(btn);
        detail.append(dico, info, act);
        panel.appendChild(detail);
        root.appendChild(panel);
        this.els = { panel, tabs, grid, coins: coins.querySelector('.pes-cn'), coinBox: coins, dico, dname, drar, dnote, btn, msg, cards: {}, tabBtns: {} };
        this.buildTabs();
        this.buildGrid();
        this.refresh();
    },

    buildTabs() {
        const { tabs } = this.els;
        tabs.innerHTML = '';
        this.els.tabBtns = {};
        for (const t of Shop.tabs()) {
            const b = this.el('button', 'pes-tab');
            b.setAttribute('type', 'button'); b.setAttribute('role', 'tab');
            b.dataset.tab = t.id;
            b.innerHTML = '';
            b.append(document.createTextNode(t.name));
            const sm = this.el('small');
            b.appendChild(sm);
            b.addEventListener('click', () => { if (t.id !== this.tab) { this.emit('ui', { what: 'tab' }); this.setTab(t.id); } });
            tabs.appendChild(b);
            this.els.tabBtns[t.id] = { b, sm };
        }
    },

    buildGrid() {
        const { grid } = this.els;
        grid.innerHTML = '';
        this.els.cards = {};
        for (const c of Shop.cards(this.tab, { lockedExclusive: false })) {
            const b = this.el('button', 'pes-card');
            b.setAttribute('type', 'button');
            b.dataset.id = c.id;
            const ico = this.el('span', 'pes-ico'), nm = this.el('span', 'pes-nm'), st = this.el('span', 'pes-st');
            b.append(ico, nm, st);
            b.addEventListener('click', () => this.select(c.id));
            grid.appendChild(b);
            this.els.cards[c.id] = { b, ico, nm, st };
            this.paintIcon(ico, c);
        }
    },

    /** Иконка: растровая (assets/ui/items/<id>.webp, если файл есть) или процедурный SVG из GameLook. */
    paintIcon(target, c) {
        if (typeof GameLook === 'undefined') { target.textContent = ''; return; }
        const ic = GameLook.icon(c.item || c.id);
        target.innerHTML = ic.raster ? '<img alt="" draggable="false" src="' + ic.raster + '">' : ic.svg;
    },

    paintIcons(id) {
        const els = this.els.cards && this.els.cards[id];
        if (els) this.paintIcon(els.ico, Shop.card(id));
        if (this.sel === id) this.paintDetail();
    },

    // ---- состояние ----------------------------------------------------------------------------------

    pips(n, k) {
        let s = '<span class="pes-pips">';
        for (let i = 0; i < n; i++) s += '<i' + (i < k ? ' class="on"' : '') + '></i>';
        return s + '</span>';
    },

    paintCard(c) {
        const e = this.els.cards[c.id];
        if (!e) return;
        e.b.className = 'pes-card r-' + (c.rarity || 'common') + (c.owned ? ' is-owned' : ' is-locked') + (c.equipped ? ' is-equipped' : '');
        e.b.setAttribute('aria-pressed', this.sel === c.id ? 'true' : 'false');
        e.nm.textContent = c.name;
        let cls = 'pes-st', html = '';
        if (c.equipped) { cls += ' worn'; html = this.t('shop.equipped'); }
        else if (c.owned) { cls += ' have'; html = '&#10003; ' + this.t('shop.owned'); }
        else if (c.kind === 'coins') { cls += ' coins' + (c.affordable ? '' : ' poor'); html = this.coinSvg() + c.price; }
        else if (c.kind === 'ads') { cls += ' ads'; html = this.pips(c.need, c.progress) + ' ' + c.progress + '/' + c.need; }
        else html = c.priceLabel;
        if (e.st.className !== cls) e.st.className = cls;
        if (e.st.innerHTML !== html) e.st.innerHTML = html;
        e.b.setAttribute('aria-label', c.name + ', ' + c.rarityLabel + ', ' + c.priceLabel);
    },

    paintDetail() {
        const E = this.els, c = this.sel ? Shop.card(this.sel) : null;
        if (!c) {
            E.dname.textContent = '';
            E.drar.style.display = 'none';
            E.dnote.textContent = '';
            E.dico.innerHTML = '';
            E.btn.style.display = 'none';
            return;
        }
        const col = typeof GameLook !== 'undefined' ? GameLook.rarityColor(c.rarity) : '#9aa3ad';
        E.panel.style.setProperty('--rc', col);
        E.dname.textContent = c.name;
        E.drar.style.display = '';
        E.drar.textContent = c.rarityLabel || '';
        if (E.dico.dataset.id !== c.id) { E.dico.dataset.id = c.id; this.paintIcon(E.dico, c); }
        // заметка: примерка / условие / подсказка
        let note = '', nc = 'pes-dnote';
        if (!c.owned) {
            note = c.kind === 'ads' && c.hint === '' ? this.t('shop.adLeft', { n: c.need - c.progress }) : (c.hint || '');
            if (c.kind === 'coins' && !c.enabled) nc += ' warn';
            if (c.kind === 'ads' && c.hint) nc += ' warn';
            if (!note) note = this.t('shop.tryOn');
        } else if (c.equipped) { note = ''; nc += ' ok'; }
        E.dnote.className = nc;
        E.dnote.textContent = note;
        // кнопка
        const b = E.btn;
        b.style.display = c.action === 'none' ? 'none' : '';
        let label = c.actionLabel, kind = c.action, icon = '';
        if (c.action === 'buy') label = this.t('shop.buyFor', { n: c.price }), icon = this.coinSvg();
        else if (c.action === 'watch') {
            icon = this.adSvg();
            label = c.adWait > 0 ? this.t('shop.adIn', { n: c.adWait }) : '<span class="pes-long">' + this.t('shop.watch') + '</span><span class="pes-short">' + this.t('shop.watchShort') + '</span> ' + c.progress + '/' + c.need;
        }
        b.className = 'pes-btn ' + kind + (this.busy ? ' busy' : '');
        b.disabled = this.busy || !c.enabled;
        const html = (icon ? icon : '') + '<span>' + (this.busy ? this.t('shop.wait') : label) + '</span>';
        if (b.innerHTML !== html) b.innerHTML = html;
        this._waiting = c.action === 'watch' && c.adWait > 0;
    },

    refresh() {
        if (!this.open_ || !this.els.cards) return;
        const coins = Shop.coins;
        if (this.els.coins.textContent !== String(coins)) {
            if (this._lastCoins >= 0 && coins !== this._lastCoins) { this.els.coinBox.classList.remove('bump'); void this.els.coinBox.offsetWidth; this.els.coinBox.classList.add('bump'); }
            this.els.coins.textContent = String(coins);
        }
        this._lastCoins = coins;
        for (const c of Shop.cards(this.tab, { lockedExclusive: false })) this.paintCard(c);
        for (const t of Shop.tabs()) {
            const e = this.els.tabBtns[t.id];
            if (!e) continue;
            e.b.setAttribute('aria-selected', t.id === this.tab ? 'true' : 'false');
            e.sm.textContent = this.t('shop.owned.count', { a: t.owned, b: t.count });
        }
        this.paintDetail();
    },

    // ---- действия -----------------------------------------------------------------------------------

    setTab(id) {
        this.tab = id;
        Shop.clearPreview();
        this.sel = Shop.equippedId(id) || '';
        this.buildGrid();
        this.els.grid.scrollTop = 0;
        this.els.dico.dataset.id = '';
        this.refresh();
        this.emitPreview();
    },

    select(id) {
        if (this.busy) return;
        this.emit('ui', { what: 'select' });
        this.sel = id;
        const it = Shop.item(id);
        if (it && Shop.isEquipped(id)) Shop.clearPreview(Shop.slotOf(it)); else Shop.preview(id);
        this.refresh();
        this.emitPreview();
    },

    message(text, kind) {
        const m = this.els.msg;
        if (!m || !text) return;
        m.textContent = text;
        m.className = 'pes-msg on' + (kind ? ' ' + kind : '');
        if (this.msgTimer) clearTimeout(this.msgTimer);
        this.msgTimer = setTimeout(() => { m.classList.remove('on'); }, 3200);
    },

    /** Основное действие выбранной карточки (купить / реклама / надеть / снять) с защитой от двойного нажатия. */
    async doAction() {
        if (this.busy || !this.sel) return;
        const before = Shop.card(this.sel);
        if (!before || !before.enabled || before.action === 'none') return;
        this.busy = true;
        this.paintDetail();
        let r = null;
        try { r = await Shop.act(this.sel); } catch (e) { r = { ok: false, reason: 'error' }; console.warn('GameShopUI: действие не удалось:', e); }
        this.busy = false;
        if (!this.open_) return;
        const id = before.id;
        if (r && r.ok) {
            if (before.action === 'buy') { this.message(this.t('shop.bought'), 'good'); this.emit('buy', { id }); }
            else if (before.action === 'watch') {
                if (r.unlocked) { this.message(this.t('shop.unlocked'), 'good'); this.emit('buy', { id, ad: true }); }
                else { this.message(this.t('shop.adCounted', { a: r.progress, b: r.need }), 'good'); this.emit('ad', { id, progress: r.progress, need: r.need }); }
            } else if (before.action === 'equip') this.emit('equip', { id });
            else this.emit('unequip', { id });
        } else if (r) {
            const reason = r.reason;
            if (reason === 'noCoins') this.message(this.t('shop.noCoins', { n: r.missing }), 'bad');
            else if (reason === 'adFailed') this.message(this.t('shop.adFailed'), 'bad');
            else if (reason === 'adUnavailable') this.message(this.t('shop.adUnavailable'), 'bad');
            else if (reason === 'cooldown') this.message(Shop.adWaitLabel() || this.t('shop.adUnavailable'), 'bad');
        }
        this.refresh();
        this.emitPreview();
    },
};
