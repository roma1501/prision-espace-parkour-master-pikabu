// GameHud.js — интерфейс «Prision Espace Parkour Master»: меню с выбором уровня, HUD, окна, результаты.
// Образ — тюрьма: таблички на болтах, жетоны, бирки, трафаретные надписи, жёлто-чёрная разметка, решётки.
// Палитра: сигнальный оранжевый #f07d1e, графит #23262b/#2c3036, сталь #3a3f47, разметка #f2c230, мел #f4f1ea,
// тревога #e2453c, выход #3fdc78. Шрифт — Montserrat 800–900 (assets/fonts/montserrat.ttf, есть кириллица).
// Все стили вставляются при init (index.html не нужен), тексты — ключи ui.* в LANG_STRINGS, раскладка — HudLayout.
//
// API (docs/DESIGN.md §7): init(handlers) · menu(show, model) · setCoins(n, gained) · task(text|null) · toast(text, ms, kind)
//   levelTitle(n, title) · chase(on) · spotted(on) · flash(kind) · jetFuel(k|null) · superJump(k|null) · disguise(on)
//   keys([N…]) · progress(k) · complete({...}) · caught(text) · pause(on) · chestOffer({...}) · standOffer({...})
//   setSound(on) · hideAll()
// Сверх контракта: hud(on) · setQuality(q) · overlayOpen() · tutorialCss() · tick(dt) (необязателен — свой RAF) ·
//   menu(false, { hud: false }) — скрыть меню, не показывая HUD (магазин) · standRefresh(item) · closeWindows().
// Мета-кнопки меню (Подарок / Колесо / Рекорды): обработчики onDaily · onWheel · onLeaders; metaBadges({ daily, wheel, leaders }) —
//   красные точки (daily, wheel: true | число) и видимость «Рекорды» (leaders: false — скрыть). Окна рисует GameMetaUI.

Object.assign(LANG_STRINGS.ru, {
    'ui.play': 'Играть', 'ui.level': 'Уровень {n}', 'ui.levelSelect': 'Выбор уровня', 'ui.shop': 'Магазин',
    'ui.howto': 'Как играть', 'ui.sound': 'Звук', 'ui.quality': 'Графика',
    'ui.q.auto': 'Авто', 'ui.q.low': 'Низкое', 'ui.q.medium': 'Среднее', 'ui.q.high': 'Высокое',
    'ui.locked': 'Закрыто', 'ui.done': 'Пройден', 'ui.best': 'Рекорд', 'ui.current': 'Текущий',
    'ui.paused': 'Пауза', 'ui.resume': 'Продолжить', 'ui.restart': 'Заново', 'ui.menu': 'В меню',
    'ui.next': 'Далее', 'ui.again': 'Ещё раз', 'ui.close': 'Закрыть', 'ui.later': 'Не сейчас',
    'ui.run': 'Беги!', 'ui.spotted': 'Тебя заметили!', 'ui.caught': 'Пойман!',
    'ui.complete': 'Побег удался!', 'ui.finalWin': 'Свобода!', 'ui.finalSub': 'Ты сбежал из тюрьмы начальника Гримма.',
    'ui.levelDone': 'Уровень {n} пройден', 'ui.coinsEarned': 'Монеты', 'ui.time': 'Время', 'ui.falls': 'Падения',
    'ui.bestResult': 'Лучшее время', 'ui.newRecord': 'Новый рекорд!',
    'ui.chest': 'Передачка', 'ui.chestCoins': '+{n} монет', 'ui.watchAd': 'Открыть за рекламу', 'ui.adShort': 'За рекламу',
    'ui.adIn': 'Через {n} с', 'ui.adProgress': 'За рекламу {a}/{b}', 'ui.buyFor': 'Купить за {n}', 'ui.equip': 'Надеть',
    'ui.equipped': 'Надето', 'ui.noCoins': 'Не хватает монет: {n}', 'ui.stand': 'Витрина',
    'ui.task': 'Задание', 'ui.pauseBtn': 'Пауза', 'ui.respawnBtn': 'На чекпоинт', 'ui.coinsAria': 'Монеты',
    'ui.fuel': 'Топливо', 'ui.superJump': 'Супер-прыжок', 'ui.disguise': 'Маскировка', 'ui.key': 'Ключ-карта',
    'ui.hintMove': 'Нажмите, чтобы управлять',
    'ui.plan': 'План побега', 'ui.secret': 'Секретно', 'ui.plan1': 'Выбраться из камеры', 'ui.plan2': 'Не попасться Гримму', 'ui.plan3': 'Дойти до выхода',
    'ui.inspect': 'Досмотр', 'ui.parcelFor': 'Передача заключённому', 'ui.caseClosed': 'Дело закрыто', 'ui.caseNo': 'Личное дело № {n}', 'ui.cell': 'Камера {n}', 'ui.standTitle': 'Обновка',
    'meta.daily': 'Подарок', 'meta.wheel': 'Колесо', 'meta.leaders': 'Рекорды',
});
Object.assign(LANG_STRINGS.en, {
    'ui.play': 'Play', 'ui.level': 'Level {n}', 'ui.levelSelect': 'Level select', 'ui.shop': 'Shop',
    'ui.howto': 'How to play', 'ui.sound': 'Sound', 'ui.quality': 'Graphics',
    'ui.q.auto': 'Auto', 'ui.q.low': 'Low', 'ui.q.medium': 'Medium', 'ui.q.high': 'High',
    'ui.locked': 'Locked', 'ui.done': 'Cleared', 'ui.best': 'Best', 'ui.current': 'Current',
    'ui.paused': 'Paused', 'ui.resume': 'Resume', 'ui.restart': 'Restart', 'ui.menu': 'Menu',
    'ui.next': 'Next', 'ui.again': 'Again', 'ui.close': 'Close', 'ui.later': 'Not now',
    'ui.run': 'Run!', 'ui.spotted': 'You were spotted!', 'ui.caught': 'Busted!',
    'ui.complete': 'Escaped!', 'ui.finalWin': 'Freedom!', 'ui.finalSub': 'You broke out of Warden Grimm\'s prison.',
    'ui.levelDone': 'Level {n} cleared', 'ui.coinsEarned': 'Coins', 'ui.time': 'Time', 'ui.falls': 'Falls',
    'ui.bestResult': 'Best time', 'ui.newRecord': 'New record!',
    'ui.chest': 'Care package', 'ui.chestCoins': '+{n} coins', 'ui.watchAd': 'Open with an ad', 'ui.adShort': 'Watch ad',
    'ui.adIn': 'In {n} s', 'ui.adProgress': 'Watch ad {a}/{b}', 'ui.buyFor': 'Buy for {n}', 'ui.equip': 'Equip',
    'ui.equipped': 'Equipped', 'ui.noCoins': 'Need {n} more coins', 'ui.stand': 'Display',
    'ui.task': 'Task', 'ui.pauseBtn': 'Pause', 'ui.respawnBtn': 'To checkpoint', 'ui.coinsAria': 'Coins',
    'ui.fuel': 'Fuel', 'ui.superJump': 'Super jump', 'ui.disguise': 'Disguise', 'ui.key': 'Key card',
    'ui.hintMove': 'Click to control',
    'ui.plan': 'Escape plan', 'ui.secret': 'Top secret', 'ui.plan1': 'Get out of the cell', 'ui.plan2': 'Dodge Warden Grimm', 'ui.plan3': 'Reach the exit',
    'ui.inspect': 'Inspection', 'ui.parcelFor': 'Parcel for the inmate', 'ui.caseClosed': 'Case closed', 'ui.caseNo': 'Case file No. {n}', 'ui.cell': 'Cell {n}', 'ui.standTitle': 'New gear',
    'meta.daily': 'Gift', 'meta.wheel': 'Wheel', 'meta.leaders': 'Records',
});

// --- растровая графика (рисует Codex, docs/CODEX-IMAGEGEN-PROMPT.md): есть файл — берём, нет — запасной SVG/CSS ---
const GAME_HUD_ART = {
    logo: (String(GAME_PLATFORM) === 'pikabu' ? 'assets/ui/logo-pikabu.webp' : 'assets/ui/logo.webp'),
    levels: ['assets/ui/levels/level-1.webp', 'assets/ui/levels/level-2.webp', 'assets/ui/levels/level-3.webp', 'assets/ui/levels/level-4.webp',
        'assets/ui/levels/level-5.webp', 'assets/ui/levels/level-6.webp', 'assets/ui/levels/level-7.webp'],
    icons: {
        coin: 'assets/ui/icons/coin.webp', chest: 'assets/ui/icons/chest.webp', chest_open: 'assets/ui/icons/chest_open.webp',
        key_blue: 'assets/ui/icons/key_blue.webp', key_red: 'assets/ui/icons/key_red.webp', key_green: 'assets/ui/icons/key_green.webp',
        key_yellow: 'assets/ui/icons/key_yellow.webp', jetpack: 'assets/ui/icons/jetpack.webp', fuel: 'assets/ui/icons/fuel.webp',
        superjump: 'assets/ui/icons/superjump.webp', disguise: 'assets/ui/icons/disguise.webp', lock: 'assets/ui/icons/lock.webp',
        check: 'assets/ui/icons/check.webp', star: 'assets/ui/icons/star.webp', clock: 'assets/ui/icons/clock.webp',
        fall: 'assets/ui/icons/fall.webp', shop: 'assets/ui/icons/shop.webp', play: 'assets/ui/icons/play.webp',
        pause: 'assets/ui/icons/pause.webp', settings: 'assets/ui/icons/settings.webp', sound_on: 'assets/ui/icons/sound_on.webp',
        sound_off: 'assets/ui/icons/sound_off.webp', home: 'assets/ui/icons/home.webp', restart: 'assets/ui/icons/restart.webp',
        respawn: 'assets/ui/icons/respawn.webp', help: 'assets/ui/icons/help.webp', ad: 'assets/ui/icons/ad.webp',
        trophy: 'assets/ui/icons/trophy.webp', handcuffs: 'assets/ui/icons/handcuffs.webp', alarm: 'assets/ui/icons/alarm.webp',
        quality: 'assets/ui/icons/quality.webp', exit_door: 'assets/ui/icons/exit_door.webp', map: 'assets/ui/icons/map.webp',
        coins_pile: 'assets/ui/icons/coins_pile.webp',
    },
    itemsDir: 'assets/ui/items/',
};

const GAME_HUD_KEYCOLORS = ['#e2453c', '#4aa3ff', '#3fdc78', '#f2c230', '#c77dff', '#f4f1ea'];
const GAME_HUD_KEYICONS = ['key_red', 'key_blue', 'key_green', 'key_yellow'];

/** Запасные SVG-иконки (viewBox 24, currentColor). */
const GAME_HUD_SVG = {
    coin: '<circle cx="12" cy="12" r="10" fill="#f2c230" stroke="#14161a" stroke-width="1.6"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#b8861a" stroke-width="1.6"/><path d="M9.5 8.6v6.8M12 8.6v6.8M14.5 8.6v6.8" stroke="#b8861a" stroke-width="1.3"/>',
    pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
    respawn: '<path d="M5 3h2.2v18H5z"/><path d="M8 4h11l-3.2 4 3.2 4H8z"/>',
    restart: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/>',
    sound_on: '<path d="M3 9v6h4l5 4V5L7 9z"/><path d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    sound_off: '<path d="M3 9v6h4l5 4V5L7 9z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    shop: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.8" fill="#23262b"/>',
    help: '<circle cx="12" cy="12" r="10.5"/><text x="12" y="17.6" text-anchor="middle" font-size="15" font-weight="900" fill="#23262b" font-family="Montserrat,Arial,sans-serif">?</text>',
    home: '<path d="M4 21V3h16v18zm3-3h10V6H7z" fill-rule="evenodd"/><path d="M12 6v12M7 12h10" stroke="currentColor" stroke-width="1.6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.6"/>',
    check: '<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>',
    clock: '<circle cx="12" cy="13.5" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 13.5V9M10 3h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    fall: '<circle cx="17" cy="5" r="2.6"/><path d="M4 9l7 3 4 3 5 5M11 12l-1 6M15 15l-5 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    play: '<path d="M7 4l14 8-14 8z"/>',
    ad: '<rect x="3" y="5" width="18" height="12.5" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M10 8.8l5 3-5 3z"/><path d="M8 21h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4M11 14h2v4h3v3H8v-3h3z"/>',
    handcuffs: '<circle cx="7" cy="15" r="4.5" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="17" cy="15" r="4.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M9 7l2 4M15 7l-2 4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    alarm: '<path d="M6 19v-6a6 6 0 0 1 12 0v6z"/><path d="M4 21.5h16M12 2v3M3.5 6.5l2 2M20.5 6.5l-2 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    fuel: '<path d="M5 8l3-4h6v4h3l2 3v10H5z"/><rect x="9" y="11.5" width="6" height="6" rx="1" fill="#23262b"/>',
    jetpack: '<rect x="4" y="3" width="7" height="15" rx="3.2"/><rect x="13" y="3" width="7" height="15" rx="3.2"/><path d="M5.5 18l1.5 3 1.5-3M14.5 18l1.5 3 1.5-3"/>',
    superjump: '<path d="M5 12l7-7 7 7M5 19l7-7 7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
    disguise: '<path d="M3 15c0-6 4-10 9-10s9 4 9 10z"/><path d="M2 16.5h20V19H2z"/><rect x="10" y="8.5" width="4" height="3.4" rx=".6" fill="#23262b"/>',
    key: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><rect x="2" y="8.5" width="20" height="3" fill="#14161a" opacity=".6"/><rect x="5" y="14" width="5" height="3" rx=".8" fill="#14161a" opacity=".6"/>',
    star: '<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z"/>',
    exit_door: '<path d="M5 21V3h14v18z"/><path d="M13 12h5M16 9l3 3-3 3" fill="none" stroke="#23262b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    map: '<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    warn: '<path d="M12 2.5l10.5 18.5h-21z"/><path d="M12 9v5.5" stroke="#23262b" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.5" fill="#23262b"/>',
    chest: '<rect x="2.5" y="10" width="19" height="11" rx="1.5" fill="#3a3f47"/><path d="M2.5 11a9.5 8 0 0 1 19 0z" fill="#f07d1e"/><rect x="2.5" y="10" width="19" height="2.4" fill="#14161a" opacity=".5"/><rect x="9.8" y="11" width="4.4" height="6" rx="1" fill="#f2c230" stroke="#14161a" stroke-width="1"/><path d="M6 6.5v14M18 6.5v14" stroke="#14161a" stroke-width="1.4" opacity=".6"/>',
    glasses: '<rect x="2" y="8" width="8.5" height="7" rx="2.5"/><rect x="13.5" y="8" width="8.5" height="7" rx="2.5"/><path d="M10 11h4" stroke="currentColor" stroke-width="2"/>',
    shirt: '<path d="M8 3l4 2 4-2 6 4-2.5 4L17 10v11H7V10l-2.5 1L2 7z"/>',
    gift: '<rect x="3" y="11" width="18" height="10" fill="#d9a35a" stroke="#14161a" stroke-width="1.4"/><rect x="2" y="7.5" width="20" height="4.5" fill="#e8b873" stroke="#14161a" stroke-width="1.4"/><rect x="10.3" y="7.5" width="3.4" height="13.5" fill="#e2453c" stroke="#14161a" stroke-width="1"/><path d="M12 7.5C8 7.5 7 3 9.5 3S12 6 12 7.5zM12 7.5c4 0 5-4.5 2.5-4.5S12 6 12 7.5z" fill="#e2453c" stroke="#14161a" stroke-width="1.1"/>',
    wheel: '<circle cx="12" cy="12" r="10.2" fill="#3a3f47" stroke="#14161a" stroke-width="1.6"/><path d="M12 12L12 1.8A10.2 10.2 0 0 1 19.2 4.8zM12 12L22.2 12A10.2 10.2 0 0 1 19.2 19.2zM12 12L12 22.2A10.2 10.2 0 0 1 4.8 19.2zM12 12L1.8 12A10.2 10.2 0 0 1 4.8 4.8z" fill="#f07d1e"/><circle cx="12" cy="12" r="3" fill="#cfd4dc" stroke="#14161a" stroke-width="1.2"/><path d="M12 0.4l-2.2 3.4h4.4z" fill="#f2c230" stroke="#14161a" stroke-width=".8"/>',
    comet: '<circle cx="17" cy="7" r="4"/><path d="M14 9L3 20M16 12L7 21M12 7L3 13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};

const GAME_HUD_CSS = `
@font-face { font-family: 'PEM Montserrat'; src: url('assets/fonts/montserrat.ttf') format('truetype'); font-weight: 100 900; font-style: normal; font-display: swap; }
:root {
  --pe-or: #f07d1e; --pe-or2: #c75d0a; --pe-g1: #23262b; --pe-g2: #2c3036; --pe-steel: #3a3f47; --pe-yel: #f2c230;
  --pe-chalk: #f4f1ea; --pe-red: #e2453c; --pe-grn: #3fdc78; --pe-ink: #14161a;
  --pe-paper: #e9e3cf; --pe-pen: #1f2630; --pe-tape: #d9ca90; --pe-brass: #d6a53a;
  --pe-font: 'PEM Montserrat', Montserrat, 'Arial Black', system-ui, sans-serif;
  --pe-noise: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0 0 0 -.14'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");
  --pe-bolt: radial-gradient(circle, #cfd4dc 0 1.4px, #101215 2px 3.4px, transparent 3.8px);
  --pe-scratch: linear-gradient(112deg, transparent 0 31%, rgba(255,255,255,.1) 31.3% 31.8%, transparent 32.2% 100%), linear-gradient(64deg, transparent 0 58%, rgba(255,255,255,.08) 58.2% 58.6%, transparent 59% 100%), linear-gradient(98deg, transparent 0 77%, rgba(0,0,0,.25) 77.2% 77.7%, transparent 78% 100%);
  --pe-steelbg: repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px), linear-gradient(180deg, #4a5059, #3a3f47 14%, #30343a 86%, #25282d);
  --tut-bg: #e4ddc7; --tut-fg: #1f2630; --tut-accent: #d4561a; --tut-border: #14161a; --tut-font: var(--pe-font); --tut-radius: 2px; --tut-z: 60; --tut-accent-bg: rgba(20,22,26,.1);
  --lory-input-fg: #f4f1ea; --lory-input-bg: rgba(35,38,43,.5); --lory-input-accent: #f07d1e; --lory-ctx-size: 100px;
}
.pe-root, .pe-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
#pe-hud, .pe-modal, #pe-menu { font-family: var(--pe-font); font-weight: 800; color: var(--pe-chalk); line-height: 1.15; user-select: none; -webkit-user-select: none; }
.pe-ic { display: inline-flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em; flex: 0 0 auto; }
.pe-ic svg, .pe-ic img { width: 100%; height: 100%; display: block; object-fit: contain; fill: currentColor; pointer-events: none; -webkit-user-drag: none; }
/* трафарет: перемычка через буквы; маркер: наклон и неровная линия */
.pe-sten { font-weight: 900; text-transform: uppercase; letter-spacing: .08em; -webkit-mask-image: linear-gradient(#000 0 calc(50% - 1.2px), transparent calc(50% - 1.2px) calc(50% + 1.2px), #000 calc(50% + 1.2px)); mask-image: linear-gradient(#000 0 calc(50% - 1.2px), transparent calc(50% - 1.2px) calc(50% + 1.2px), #000 calc(50% + 1.2px)); }
.pe-mk { display: inline-block; font-weight: 800; font-style: italic; letter-spacing: -.01em; transform: rotate(-1.4deg) skewX(-6deg); }
/* металл: пятна, шляпки заклёпок, вмятины */
.pe-plate { position: relative; border: 3px solid var(--pe-ink); border-radius: 3px; color: var(--pe-chalk);
  box-shadow: inset 0 2px 0 rgba(255,255,255,.14), inset 0 -3px 0 rgba(0,0,0,.35), 0 5px 0 rgba(0,0,0,.5), 0 9px 12px rgba(0,0,0,.35);
  background: var(--pe-bolt) left 4px top 4px / 9px 9px no-repeat, var(--pe-bolt) right 4px top 4px / 9px 9px no-repeat, var(--pe-bolt) left 4px bottom 4px / 9px 9px no-repeat, var(--pe-bolt) right 4px bottom 4px / 9px 9px no-repeat,
    var(--pe-scratch), var(--pe-noise), var(--pe-steelbg); }

/* кнопки: тяжёлые таблички, эмаль, заклёпки; без плавности — нажатие мгновенное */
.pe-btn { --bg: #3d434c; --lo: #1d2024; appearance: none; font: inherit; font-weight: 900; font-size: clamp(17px, 2.3vw, 24px); text-transform: uppercase; letter-spacing: .09em; color: var(--pe-chalk);
  position: relative; min-height: 54px; padding: 8px 26px; display: inline-flex; align-items: center; justify-content: center; gap: .5em; cursor: pointer; text-align: center; margin: 0 0 9px;
  border: 3px solid var(--pe-ink); border-radius: 3px; background: linear-gradient(180deg, rgba(255,255,255,.13), transparent 35%, rgba(0,0,0,.2)), var(--pe-scratch), var(--pe-noise), var(--bg);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.15), inset 0 -4px 0 rgba(0,0,0,.3), 0 6px 0 var(--lo), 0 6px 0 3px var(--pe-ink), 0 12px 12px rgba(0,0,0,.35);
  text-shadow: 0 2px 0 rgba(0,0,0,.5); touch-action: manipulation; }
.pe-btn::before, .pe-btn::after { content: ''; position: absolute; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; background: var(--pe-bolt); pointer-events: none; }
.pe-btn::before { left: 6px; } .pe-btn::after { right: 6px; }
.pe-btn:hover { filter: brightness(1.12); }
.pe-btn:active, .pe-btn.pressed { transform: translateY(5px); box-shadow: inset 0 0 0 2px rgba(255,255,255,.1), inset 0 5px 8px rgba(0,0,0,.4), 0 1px 0 var(--lo), 0 1px 0 3px var(--pe-ink); filter: none; }
.pe-btn.steel { --bg: #3d434c; }
.pe-btn.hot { --bg: #d8680f; --lo: #7e3a06; color: #fff7ea; }
.pe-btn.green, .pe-btn.ok { --bg: #2a9a52; --lo: #14562c; color: #f2fff6; }
.pe-btn.red { --bg: #c23a32; --lo: #6e1b17; }
.pe-btn.yel { --bg: #d9ad25; --lo: #7d6208; color: #1b1d21; text-shadow: none; }
.pe-btn[aria-disabled="true"] { filter: grayscale(.9) brightness(.65); cursor: default; }
.pe-btn[aria-disabled="true"]:active { transform: none; }
.pe-btn .pe-ic { width: 1.35em; height: 1.35em; }
.pe-btn small { display: block; font-size: .55em; font-weight: 800; letter-spacing: .1em; opacity: .9; margin-top: .15em; }
.pe-btn .pe-lbl { display: flex; flex-direction: column; align-items: center; }
.pe-ib { --bg: #3d434c; --lo: #1d2024; appearance: none; font: inherit; color: var(--pe-chalk); position: relative; width: 50px; height: 50px; min-width: 44px; min-height: 44px; padding: 0; margin: 0 0 7px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 3px solid var(--pe-ink); border-radius: 3px; background: var(--pe-bolt) left 3px top 3px / 8px 8px no-repeat, var(--pe-bolt) right 3px bottom 3px / 8px 8px no-repeat, var(--pe-scratch), var(--pe-noise), var(--pe-steelbg);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.12), inset 0 -3px 0 rgba(0,0,0,.3), 0 5px 0 var(--lo), 0 5px 0 3px var(--pe-ink), 0 9px 10px rgba(0,0,0,.3); touch-action: manipulation; font-weight: 900; font-size: 14px; }
.pe-ib:active { transform: translateY(4px); box-shadow: inset 0 4px 6px rgba(0,0,0,.4), 0 1px 0 var(--lo), 0 1px 0 3px var(--pe-ink); }
.pe-ib .pe-ic { width: 26px; height: 26px; }
.pe-ib.wide { width: auto; padding: 0 12px; }
.pe-ib.or { color: var(--pe-or); }
.pe-bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 20px; }
.pe-bars i { display: block; width: 5px; background: var(--pe-chalk); }
.pe-bars.auto i { background: transparent; box-shadow: inset 0 0 0 2px var(--pe-chalk); }
.pe-bars i.off { opacity: .28; }

/* жетон столовой: латунный, выбитое число */
.tok { position: relative; flex: 0 0 auto; width: 3.3em; height: 3.3em; border-radius: 50%; display: flex; align-items: center; justify-content: center; transform: rotate(-6deg);
  background: repeating-conic-gradient(#e3b84e 0 7deg, #94691c 7deg 14deg); border: 2px solid var(--pe-ink); box-shadow: 0 4px 0 rgba(0,0,0,.5), 0 7px 8px rgba(0,0,0,.35); }
.tok::before { content: ''; position: absolute; inset: 9%; border-radius: 50%; background: var(--pe-noise), radial-gradient(circle at 34% 28%, #ffe9a6, #d9a93e 50%, #9a6f1f); box-shadow: inset 0 0 0 2px #7a5514, inset 0 3px 5px rgba(255,255,255,.35); }
.tok b { position: relative; font-size: 1.15em; font-weight: 900; font-variant-numeric: tabular-nums; color: #52390f; text-shadow: 0 1px 0 rgba(255,236,170,.85), 0 -1px 0 rgba(60,40,5,.5); letter-spacing: -.02em; }
.tok.d4 b { font-size: .92em; } .tok.d5 b { font-size: .75em; }

/* ---------- HUD ---------- */
#pe-hud { position: fixed; inset: 0; z-index: 20; pointer-events: none; overflow: hidden; }
.pe-hb { display: none; font-size: calc(16px * var(--hl-k, 1)); }
#pe-hud.run #pe-coins, #pe-hud.run #pe-btns { display: flex; }
#pe-hud.run #pe-gauges.on { display: flex; }
#pe-hud.run #pe-alert.on { display: flex; }
#pe-hud.run #pe-task.on { display: block; }
#pe-hud.run #pe-toast.vis { display: flex; }
#pe-hud.run #pe-ctx.on { display: flex; }
html.hl-touch #pe-ctx { display: none !important; }
#pe-coins { align-items: center; gap: .6em; }
#pe-coins .tok { width: 3.1em; height: 3.1em; }
#pe-coins.bump .tok { animation: pe-clank .3s steps(6); }
.pe-gain { position: absolute; left: 3.4em; top: 100%; margin-top: .1em; font-size: 1.5em; font-weight: 900; color: var(--pe-yel); paint-order: stroke fill; -webkit-text-stroke: .16em var(--pe-ink); animation: pe-gain .9s steps(12) forwards; pointer-events: none; white-space: nowrap; }
#pe-level { display: none; flex-direction: column; justify-content: center; gap: .3em; min-width: 0; max-width: 11em; }
#pe-level.on { display: flex; }
#pe-level .row { display: flex; align-items: center; gap: .5em; min-width: 0; }
#pe-level .n { flex: 0 0 auto; min-width: 2.1em; padding: .22em .35em .18em; text-align: center; font-size: .95em; color: var(--pe-ink); background: var(--pe-yel); border: 2px solid var(--pe-ink); transform: rotate(-3deg); box-shadow: 0 2px 0 rgba(0,0,0,.5); -webkit-mask-image: none; mask-image: none; letter-spacing: .02em; }
#pe-level .t { font-size: .95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 0 #000, 0 0 5px rgba(0,0,0,.6); color: var(--pe-chalk); }
.pe-prog { flex: 0 0 auto; position: relative; height: .8em; background: repeating-linear-gradient(90deg, rgba(20,22,26,.7) 0 5px, transparent 5px 9px); border-bottom: 2px solid rgba(244,241,234,.55); }
.pe-prog i { display: block; height: 100%; width: 0; background: var(--pe-chalk); -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 9px); mask-image: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 9px); transition: width .3s steps(8); filter: drop-shadow(0 2px 0 rgba(0,0,0,.7)); }
#pe-btns { gap: .5em; pointer-events: auto; justify-content: flex-end; align-items: stretch; }
#pe-btns .pe-ib { flex: 1 1 0; width: auto; height: 100%; min-height: 0; margin: 0; max-width: 4em; font-size: inherit; }
#pe-btns .pe-ib:nth-child(2) { transform: rotate(1.2deg); } #pe-btns .pe-ib:nth-child(2):active { transform: translateY(4px) rotate(1.2deg); }
#pe-btns .pe-ib .pe-ic { width: 60%; height: 60%; }
/* приборная панель: манометр топлива, термометр супер-прыжка */
#pe-gauges { width: max-content; align-items: center; justify-content: flex-end; gap: .7em; flex-wrap: wrap; padding: .45em .8em .45em .8em; max-width: calc(var(--hl-w, 100vw) - 2 * var(--hl-m, 10px)); transform: rotate(.8deg); }
.ins[hidden] { display: none; }
.ins { position: relative; display: flex; align-items: center; justify-content: center; }
.ins svg { display: block; overflow: visible; }
.ins.fuel svg { width: 3.4em; height: 3.4em; filter: drop-shadow(0 2px 0 rgba(0,0,0,.6)); }
.ins.sj svg { width: 1.5em; height: 3.4em; filter: drop-shadow(0 2px 0 rgba(0,0,0,.6)); }
.ins .needle { transition: transform .35s cubic-bezier(.3,1.9,.5,1); transform-origin: 32px 32px; }
.ins .hg { transition: y .15s steps(4), height .15s steps(4); }
.ins.low { animation: pe-blink .4s steps(2) infinite; }
.ins.low .face { fill: #4a1612; }
.ins.dis .badge { width: 2.7em; height: 2.7em; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--pe-noise), radial-gradient(circle at 35% 30%, #6d7480, #343840); border: 2px solid var(--pe-ink); color: #7db8ff; box-shadow: 0 2px 0 rgba(0,0,0,.6), inset 0 0 0 2px rgba(255,255,255,.12); }
.ins.dis .badge .pe-ic { width: 70%; height: 70%; }
.ins.dis::after { content: ''; position: absolute; right: -.2em; top: -.1em; width: .7em; height: .7em; border-radius: 50%; background: var(--pe-grn); border: 2px solid var(--pe-ink); box-shadow: 0 0 .7em var(--pe-grn); }
.ins.keys { gap: .15em; } .ins.keys .pe-ic { width: 2em; height: 2em; transform: rotate(-8deg); filter: drop-shadow(0 2px 0 rgba(0,0,0,.6)); } .ins.keys span:nth-child(2n) .pe-ic { transform: rotate(7deg); }
#pe-alert { flex-direction: column; align-items: center; gap: .4em; }
.pe-run, .pe-spot { display: none; align-items: center; justify-content: center; gap: .4em; white-space: nowrap; }
.pe-run { font-size: 2.2em; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; color: var(--pe-red); paint-order: stroke fill; -webkit-text-stroke: .2em var(--pe-chalk); text-shadow: 0 .06em 0 #000; transform: rotate(-3deg); animation: pe-clangs .5s steps(2) infinite; padding-left: 1.2em; position: relative; }
.pe-run::before { content: ''; position: absolute; left: 0; top: 50%; width: .8em; height: .8em; margin-top: -.4em; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ff9a8f, #d3261c); border: .08em solid var(--pe-ink); box-shadow: 0 0 .5em .15em rgba(226,69,60,.8); -webkit-text-stroke: 0; }
.pe-spot { font-size: 1.1em; padding: .35em .9em .35em .6em; color: var(--pe-pen); background: var(--pe-noise), #e8d9a0; border: 2px solid var(--pe-ink); transform: rotate(1.6deg); box-shadow: 0 4px 0 rgba(0,0,0,.5); animation: pe-shake .45s steps(4) infinite; clip-path: polygon(0 0, 100% 0, 98% 50%, 100% 100%, 0 100%, 2% 50%); }
.pe-spot .pe-ic { width: 1.3em; height: 1.3em; color: var(--pe-red); }
#pe-alert.chase .pe-run { display: flex; } #pe-alert.spot .pe-spot { display: flex; }
#pe-chase { position: absolute; inset: 0; opacity: 0; pointer-events: none; box-shadow: inset 0 0 0 .7vmin rgba(226,69,60,.95), inset 0 0 14vmin 2vmin rgba(226,69,60,.6); }
#pe-chase.on { opacity: 1; animation: pe-pulse .6s steps(3) infinite alternate; }
/* задание — надпись маркером на малярном скотче */
#pe-task { display: none; filter: drop-shadow(0 4px 0 rgba(0,0,0,.45)); transform: rotate(-.8deg); }
#pe-task .tape { display: flex; align-items: center; gap: .7em; padding: .5em 1.6em .5em 1.4em; background: var(--pe-noise), repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0 2px, transparent 2px 6px), var(--pe-tape); color: var(--pe-pen);
  clip-path: polygon(0 14%, 1.4% 0, 2.4% 12%, 3.6% 2%, 100% 0, 99% 22%, 100% 46%, 98.6% 70%, 100% 100%, 3% 100%, 2% 84%, 0 92%); }
#pe-task .tag { flex: 0 0 auto; font-size: .66em; font-weight: 900; text-transform: uppercase; color: #8d2a22; border: 2px solid #8d2a22; padding: .15em .45em; transform: rotate(-4deg); letter-spacing: .1em; }
#pe-task .txt { font-size: 1.15em; line-height: 1.15; color: #1a1612; }
#pe-task.on { animation: pe-slam .28s steps(7); }
#pe-toast { align-items: center; justify-content: center; gap: .6em; padding: .45em 1.1em .45em 1.3em; text-align: center; color: var(--pe-pen); background: var(--pe-noise), var(--pe-paper); border: 2px solid var(--pe-ink); transform: rotate(1.2deg); box-shadow: 0 4px 0 rgba(0,0,0,.5);
  clip-path: polygon(0 0, 100% 2%, 99% 100%, 1% 98%); }
#pe-toast::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: .5em; background: var(--pe-steel); }
#pe-toast.good::before { background: #2a9a52; } #pe-toast.bad::before { background: var(--pe-red); } #pe-toast.coin::before, #pe-toast.warn::before { background: #d9ad25; }
#pe-toast span { font-size: 1.05em; }
#pe-toast.vis { animation: pe-slam .24s steps(6); } #pe-toast.vis.out { animation: pe-out .2s steps(4) forwards; }
#pe-ctx { align-items: center; gap: .6em; padding: .35em 1em .35em .5em; white-space: nowrap; max-width: calc(100vw - 24px); background: var(--pe-noise), #1c1e22; border: 2px solid var(--pe-ink); box-shadow: 0 4px 0 rgba(0,0,0,.5); transform: rotate(-.7deg); }
#pe-ctx kbd { font: inherit; font-weight: 900; min-width: 2em; height: 2em; padding: 0 .4em; display: inline-flex; align-items: center; justify-content: center; color: var(--pe-ink); background: var(--pe-chalk); border: 2px solid var(--pe-ink); border-radius: 4px; box-shadow: 0 3px 0 #8d8a82, inset 0 -2px 0 rgba(0,0,0,.15); text-transform: uppercase; }
#pe-ctx .l { font-size: 1.15em; text-shadow: 0 2px 0 #000; overflow: hidden; text-overflow: ellipsis; font-style: italic; }
#pe-flash { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
#pe-flash.go { animation: pe-flash .6s steps(6) forwards; }
#pe-flash.k-caught { background: radial-gradient(ellipse at center, rgba(226,69,60,.25) 0, rgba(226,69,60,.85) 100%); }
#pe-flash.k-death { background: radial-gradient(ellipse at center, rgba(120,10,10,.4) 0, rgba(30,0,0,.95) 100%); }
#pe-flash.k-hit { background: rgba(255,255,255,.75); }
#pe-flash.k-checkpoint { background: radial-gradient(ellipse at center, rgba(63,220,120,0) 30%, rgba(63,220,120,.5) 100%); }
#pe-flash.k-win { background: rgba(255,246,200,.8); }

/* ---------- окна ---------- */
.pe-modal { position: fixed; inset: 0; z-index: 40; display: none; padding: 12px; overflow-y: auto; background: radial-gradient(ellipse at center, rgba(14,15,18,.5), rgba(14,15,18,.84)); }
.pe-modal.on { display: flex; }
.pe-modal.ghost { pointer-events: none; background: none; }
.pe-win { position: relative; width: min(440px, 100%); margin: auto; display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 0 18px 14px; text-align: center; animation: pe-drop .42s steps(10) both; }
.pe-win.pe-plate { padding-top: 14px; }
.pe-title { margin: 0; text-align: center; font-size: clamp(28px, 6vw, 40px); line-height: 1; color: var(--pe-or); -webkit-text-stroke: .1em var(--pe-ink); paint-order: stroke fill; text-shadow: 0 .08em 0 var(--pe-ink); }
.pe-kick { font-size: 12px; letter-spacing: .3em; color: var(--pe-chalk); opacity: .75; text-transform: uppercase; margin-bottom: 2px; }
.pe-sub { margin: 0; font-size: clamp(14px, 2.2vw, 17px); opacity: .9; font-weight: 700; }
.pe-row { display: flex; gap: 10px; justify-content: center; align-items: flex-start; flex-wrap: wrap; }
.pe-row .pe-btn { flex: 1 1 130px; }
.pe-win .pe-btn.big { font-size: clamp(20px, 3.2vw, 28px); min-height: 62px; }
.pe-hint { font-size: 13px; font-weight: 700; color: var(--pe-yel); min-height: 1em; }
.pe-x { position: absolute; right: 8px; top: 8px; width: 38px; height: 38px; min-width: 38px; min-height: 38px; margin: 0; }
.pe-sheet { transform: rotate(-.5deg); }
.pe-sheet .pe-btn:nth-of-type(2n) { transform: rotate(.4deg); } .pe-sheet .pe-btn:nth-of-type(2n):active { transform: translateY(5px) rotate(.4deg); }

/* ---------- главное меню: планшет «План побега» и ряд камер ---------- */
#pe-menu { position: fixed; inset: 0; z-index: 40; display: none; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; grid-template-rows: auto minmax(min-content, 1fr) auto; --bw: min(44vw, 520px); --lw: calc(var(--bw) - 56px); --ld: 10;
  background: linear-gradient(90deg, rgba(14,15,18,.55) 0, rgba(14,15,18,.12) 48%, transparent 66%), linear-gradient(180deg, rgba(14,15,18,.5) 0, transparent 18%); }
#pe-menu.on { display: grid; grid-template-columns: minmax(0, 1fr); }
.pe-top { grid-row: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 14px) 0 calc(env(safe-area-inset-left, 0px) + 14px); font-size: 17px; }
.pe-top .tok { width: 3.4em; height: 3.4em; margin-bottom: 7px; }
.pe-tools { display: flex; gap: 10px; align-items: flex-start; }
.pe-main { grid-row: 2; display: flex; align-items: center; justify-content: flex-start; padding: 4px max(3vw, 16px); }
.pe-board { position: relative; width: var(--bw); margin-top: 18px; padding: 22px 12px 12px; transform: rotate(-.9deg); background: var(--pe-scratch), var(--pe-noise), linear-gradient(180deg, #3a3f47, #262a30); border: 3px solid var(--pe-ink); border-radius: 4px; box-shadow: inset 0 0 0 2px rgba(255,255,255,.1), 0 8px 0 rgba(0,0,0,.45), 0 16px 22px rgba(0,0,0,.45); }
.pe-board .clip { position: absolute; left: 50%; top: -16px; width: 92px; height: 34px; margin-left: -46px; background: var(--pe-bolt) 12px 50% / 10px 10px no-repeat, var(--pe-bolt) right 12px top 50% / 10px 10px no-repeat, linear-gradient(180deg, #aab0ba, #6d7480 55%, #4a5059); border: 3px solid var(--pe-ink); border-radius: 4px 4px 12px 12px; box-shadow: 0 4px 0 rgba(0,0,0,.45); z-index: 3; }
.pe-paper { position: relative; padding: 14px 16px 16px; color: var(--pe-pen); text-align: left; overflow: hidden; transform: rotate(.5deg);
  background: var(--pe-noise), radial-gradient(circle at 86% 14%, transparent 0 20px, rgba(130,85,25,.2) 21px 24px, transparent 25px), radial-gradient(ellipse at 8% 100%, rgba(60,40,10,.2), transparent 45%), radial-gradient(ellipse at 100% 60%, rgba(60,40,10,.12), transparent 40%),
    repeating-linear-gradient(0deg, rgba(60,105,165,.26) 0 1px, transparent 1px 15px), repeating-linear-gradient(90deg, rgba(60,105,165,.26) 0 1px, transparent 1px 15px), var(--pe-paper);
  clip-path: polygon(0 0, 100% 0, 100% 95%, 96% 100%, 91% 96%, 85% 100%, 78% 96%, 70% 100%, 61% 96%, 52% 100%, 43% 96%, 33% 100%, 24% 96%, 14% 100%, 6% 96%, 0 100%); box-shadow: inset 0 0 28px rgba(80,55,15,.3); }
.pe-paper .hdr { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 13px; color: #4a5361; letter-spacing: .16em; border-bottom: 2px solid #4a5361; padding-bottom: 4px; margin-bottom: 8px; }
.pe-paper .hdr b { font-size: 1.3em; color: var(--pe-pen); letter-spacing: .12em; }
.pe-paper .hdr span:last-child { font-weight: 800; letter-spacing: .06em; }
.pe-secret { position: absolute; right: 10px; top: 42px; padding: .1em .45em; font-size: 15px; font-weight: 900; letter-spacing: .14em; color: #c2332a; border: 3px double #c2332a; transform: rotate(11deg); mix-blend-mode: multiply; opacity: .88; filter: url(#pe-ink); pointer-events: none; }
.pe-logo { width: 100%; position: relative; }
.pe-logo .txt { display: flex; flex-direction: column; align-items: flex-start; gap: .22em; font-size: calc(var(--lw) / var(--ld)); max-width: 100%; }
.pe-logo .l1 { font-size: .34em; font-weight: 800; letter-spacing: .3em; padding: .15em .1em; color: var(--pe-pen); border-top: .12em solid var(--pe-pen); border-bottom: .12em solid var(--pe-pen); white-space: nowrap; }
.pe-logo .l2 { font-weight: 900; line-height: .95; letter-spacing: .005em; white-space: nowrap; color: #e2700e; paint-order: stroke fill; -webkit-text-stroke: .13em var(--pe-ink); text-shadow: .05em .07em 0 var(--pe-ink); transform: rotate(-1.5deg); }
.pe-logo .bar { height: .14em; width: 82%; margin-top: .1em; background: var(--pe-ink); transform: rotate(-1.5deg); }
.pe-logo img { display: none; width: 100%; height: auto; -webkit-user-drag: none; }
.pe-logo.img img { display: block; } .pe-logo.img .txt { display: none; }
.pe-plan { margin: 8px 0 0; padding: 0; list-style: none; font-size: 14px; color: var(--pe-pen); counter-reset: pl; }
.pe-plan li { counter-increment: pl; display: flex; align-items: baseline; gap: .5em; padding: 2px 0; }
.pe-plan li::before { content: ''; flex: 0 0 auto; width: .9em; height: .9em; border: 2px solid var(--pe-pen); transform: rotate(-3deg) translateY(.12em); }
.pe-plan li.on::before { background: linear-gradient(135deg, transparent 38%, #c2332a 38% 56%, transparent 56%), linear-gradient(45deg, transparent 38%, #c2332a 38% 56%, transparent 56%); }
.pe-plan .pe-mk { color: #1a2d5a; font-size: 1.05em; }
.pe-acts { display: flex; gap: 14px; align-items: flex-start; margin-top: 14px; }
.pe-play { --bg: #4b525c; --lo: #1a1c20; flex: 1 1 auto; min-height: 78px; font-size: clamp(28px, 3.6vw, 42px); margin: 0 0 9px; padding: 8px 34px; letter-spacing: .14em; background: var(--pe-bolt) left 9px top 9px / 10px 10px no-repeat, var(--pe-bolt) right 9px top 9px / 10px 10px no-repeat, var(--pe-bolt) left 9px bottom 9px / 10px 10px no-repeat, var(--pe-bolt) right 9px bottom 9px / 10px 10px no-repeat, var(--pe-scratch), var(--pe-noise), var(--pe-steelbg);
  border-width: 4px; box-shadow: inset 0 0 0 3px rgba(255,255,255,.13), inset 0 -5px 0 rgba(0,0,0,.35), 0 8px 0 var(--lo), 0 8px 0 4px var(--pe-ink), 0 16px 16px rgba(0,0,0,.4); }
.pe-play::before, .pe-play::after { display: none; }
.pe-play .pe-lbl .main { color: #ff8a24; text-shadow: 0 .05em 0 #000, 0 0 .5em rgba(255,138,36,.25); }
.pe-play .pe-ic { color: #ff8a24; width: 1.1em; height: 1.1em; filter: drop-shadow(0 3px 0 #000); }
.pe-play .sub { display: block; font-size: .36em; letter-spacing: .2em; color: var(--pe-chalk); opacity: .85; font-weight: 800; -webkit-mask-image: none; mask-image: none; text-shadow: 0 2px 0 #000; }
.pe-play:hover { transform: translateY(5px); filter: none; box-shadow: inset 0 0 0 3px rgba(255,255,255,.1), inset 0 5px 10px rgba(0,0,0,.45), 0 3px 0 var(--lo), 0 3px 0 4px var(--pe-ink), 0 8px 10px rgba(0,0,0,.35); }
.pe-play:active { transform: translateY(8px); box-shadow: inset 0 6px 12px rgba(0,0,0,.55), 0 0 0 4px var(--pe-ink); }
/* магазин — бирка-ценник на верёвочке */
.pe-tag { position: relative; flex: 0 0 auto; width: 88px; min-height: 88px; margin: 0 0 6px; padding: 24px 6px 8px; appearance: none; font: inherit; color: var(--pe-pen); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; border: 0;
  background: var(--pe-noise), var(--pe-tape); clip-path: polygon(22% 0, 78% 0, 100% 22%, 100% 100%, 0 100%, 0 22%); transform-origin: 50% -14px; transform: rotate(5deg); filter: drop-shadow(0 4px 0 rgba(0,0,0,.5)); touch-action: manipulation; }
.pe-tag::before { content: ''; position: absolute; left: 50%; top: 7px; width: 13px; height: 13px; margin-left: -6.5px; border-radius: 50%; background: #2a2d33; box-shadow: inset 0 2px 3px #000, 0 0 0 3px #a89a62; }
.pe-tag .pe-ic { width: 32px; height: 32px; color: var(--pe-pen); }
.pe-tagwrap { position: relative; flex: 0 0 auto; }
.pe-tagwrap::before { content: ''; position: absolute; left: 50%; top: -22px; width: 2px; height: 36px; background: #cbbf8e; transform: rotate(-12deg); transform-origin: 50% 100%; box-shadow: 1px 1px 0 rgba(0,0,0,.4); }
.pe-tag:hover { animation: pe-swing .6s steps(10); } .pe-tag:active { transform: rotate(5deg) translateY(3px); }
.pe-strip { grid-row: 3; position: relative; padding: 14px 0 calc(env(safe-area-inset-bottom, 0px) + 4px); min-width: 0; background: linear-gradient(180deg, rgba(14,15,18,0), rgba(14,15,18,.72) 22%, rgba(14,15,18,.9)); }
.pe-strip::before { content: ''; position: absolute; left: 0; right: 0; top: 10px; height: 14px; background: var(--pe-bolt) 0 50% / 36px 14px repeat-x, var(--pe-steelbg); border-top: 3px solid var(--pe-ink); border-bottom: 3px solid var(--pe-ink); }
.pe-strip-h { position: relative; padding: 22px max(4vw, 18px) 0; font-size: 12px; font-weight: 900; letter-spacing: .3em; text-transform: uppercase; color: var(--pe-chalk); opacity: .85; text-shadow: 0 2px 0 #000; }
.pe-cells { display: flex; gap: 14px; overflow-x: auto; padding: 10px max(4vw, 18px) 12px; scroll-snap-type: x proximity; scrollbar-width: thin; scrollbar-color: var(--pe-steel) transparent; justify-content: safe center; align-items: flex-end; }
.pe-door { position: relative; flex: 0 0 auto; width: clamp(112px, 15vw, 152px); height: clamp(166px, 24vh, 200px); scroll-snap-align: center; appearance: none; font: inherit; color: var(--pe-chalk); text-align: left; padding: 0; margin: 0; cursor: pointer; background: #0c0d10; border: 4px solid var(--pe-ink); border-radius: 2px; box-shadow: 0 0 0 3px #4a5059, 0 8px 0 rgba(0,0,0,.5); perspective: 560px; touch-action: manipulation; }
.pe-door:nth-child(2n) { transform: rotate(.4deg); } .pe-door:nth-child(3n) { transform: rotate(-.5deg); }
.pe-door .glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 70% 40%, #ffe29a, #c8771d 60%, #5a2f08); opacity: 0; }
.pe-door .leaf { position: absolute; inset: 0; transform-origin: 0 50%; display: flex; flex-direction: column; gap: 5px; padding: 8px 9px 7px; overflow: hidden; transition: transform .22s cubic-bezier(.3,1.7,.5,1);
  background: radial-gradient(circle, #9aa1ac 0 1.3px, #101215 1.9px 3px, transparent 3.4px) 4px 8px / 8px 24px repeat-y, radial-gradient(circle, #9aa1ac 0 1.3px, #101215 1.9px 3px, transparent 3.4px) right 4px top 8px / 8px 24px repeat-y, var(--pe-scratch), var(--pe-noise), linear-gradient(90deg, #2c3036, #444a53 9%, #3a3f47 50%, #2a2e34); }
.pe-door .win { position: relative; flex: 0 0 auto; height: 36%; border: 3px solid var(--pe-ink); background: #08090b; box-shadow: inset 0 0 0 2px #5b6270; overflow: hidden; }
.pe-door .win .art { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0; }
.pe-door .win .art.on { opacity: .6; }
.pe-door .win .bars { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 7px, #8d949f 7px 9px, #2c3036 9px 11px); }
.pe-door .plq { position: relative; align-self: flex-start; margin: -12px 0 0 -3px; padding: .15em .45em .05em; font-size: 24px; line-height: 1; color: #12151a; background: var(--pe-noise), #c9a24a; border: 2px solid var(--pe-ink); box-shadow: 0 2px 0 rgba(0,0,0,.5); transform: rotate(-2deg); letter-spacing: .04em; }
.pe-door .tape { position: relative; margin: 1px -3px 0; padding: 3px 7px 4px; font-size: 12px; line-height: 1.1; color: #1a1612; background: var(--pe-noise), var(--pe-tape); transform: rotate(-1.4deg); min-height: 2.4em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere;
  clip-path: polygon(0 10%, 3% 0, 6% 12%, 100% 0, 98% 40%, 100% 78%, 97% 100%, 5% 100%, 2% 85%, 0 94%); }
.pe-door .tape span { display: inline-block; transform: skewX(-6deg); }
.pe-door .f { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; margin-top: auto; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; text-shadow: 0 2px 0 #000; min-height: 17px; }
.pe-door .f > span { display: inline-flex; align-items: center; gap: 4px; }
.pe-door .f .pe-ic { width: 15px; height: 15px; }
.pe-tally { position: relative; display: inline-flex; gap: 3px; height: 14px; align-items: center; padding: 0 3px; }
.pe-tally i { width: 2px; height: 13px; background: var(--pe-chalk); border-radius: 1px; transform: rotate(var(--r, 0deg)); opacity: .92; }
.pe-tally b { position: absolute; left: -1px; right: -1px; top: 6px; height: 2px; background: var(--pe-chalk); border-radius: 1px; transform: rotate(-26deg); opacity: .92; }
.pe-door .lockg { display: none; position: absolute; inset: 0; pointer-events: none; }
.pe-door .lockg svg { width: 100%; height: 100%; }
.pe-door:hover .leaf { transform: perspective(560px) rotateY(-11deg); }
.pe-door.cur { box-shadow: 0 0 0 3px #4a5059, 0 0 26px 6px rgba(255,170,70,.45), 0 8px 0 rgba(0,0,0,.5); }
.pe-door.cur .glow { opacity: 1; }
.pe-door.cur .leaf, .pe-door.cur:hover .leaf { transform: perspective(560px) rotateY(-27deg); }
.pe-door.locked { cursor: default; }
.pe-door.locked .leaf { filter: brightness(.7) saturate(.6); }
.pe-door.locked:hover .leaf { transform: none; }
.pe-door.locked .lockg { display: block; }
.pe-door:active .leaf { transition: none; }
/* мета-бирки: подарок, колесо, рекорды (красная точка — можно забрать) */
.pe-main { flex-wrap: wrap; row-gap: 4px; }
.pe-extras { display: flex; flex-wrap: nowrap; gap: 4px 18px; align-items: flex-start; margin: 22px 0 0 28px; }
.pe-tagwrap[hidden], .pe-dot[hidden] { display: none; }
.pe-tag.meta .pe-ic { width: 36px; height: 36px; }
.pe-extras .pe-tagwrap:nth-child(2n) .pe-tag { transform: rotate(-4deg); } .pe-extras .pe-tagwrap:nth-child(3n) .pe-tag { transform: rotate(3deg); }
.pe-extras .pe-tagwrap:nth-child(2n) .pe-tag:active { transform: rotate(-4deg) translateY(3px); } .pe-extras .pe-tagwrap:nth-child(3n) .pe-tag:active { transform: rotate(3deg) translateY(3px); }
.pe-dot { position: absolute; right: 3px; top: 24px; width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ff9a8f, #d3261c); border: 2px solid var(--pe-ink); box-shadow: 0 0 10px 2px rgba(226,69,60,.85); animation: pe-pulse .6s steps(3) infinite alternate; pointer-events: none; z-index: 2; }
@media (orientation: portrait) {
  #pe-menu { --bw: min(94vw, 520px); }
  .pe-main { flex-direction: column; justify-content: center; align-items: center; }
  .pe-board { margin-top: 24px; }
  .pe-extras { margin: 18px 0 0; justify-content: center; width: var(--bw); }
}
/* низкий экран: планшет компактнее, логотип меньше, ряд уровней поднят — всё меню помещается */
@media (max-height: 560px) {
  #pe-menu { --bw: min(40vw, 380px); }
  .pe-main { align-items: center; padding-top: 0; padding-bottom: 0; }
  .pe-board { margin-top: 14px; padding: 18px 10px 4px; }
  .pe-paper { padding: 8px 12px 12px; }
  .pe-paper .hdr, .pe-plan { display: none; }
  .pe-secret { top: 8px; right: 6px; font-size: 11px; border-width: 2px; }
  .pe-logo .txt { font-size: min(calc(var(--lw) / var(--ld)), 6.6vh); }
  .pe-logo img { width: auto; max-width: 100%; max-height: min(22vh, 124px); margin: 0 auto; }
  .pe-acts { margin-top: 8px; gap: 10px; }
  .pe-play { min-height: 54px; font-size: clamp(22px, 7vh, 32px); margin-bottom: 8px; padding: 4px 18px; }
  .pe-play .sub { font-size: .38em; }
  .pe-extras { margin: 16px 0 0 18px; gap: 4px 10px; }
  .pe-extras .pe-tag { width: 70px; min-height: 74px; padding: 20px 4px 6px; font-size: 11px; letter-spacing: 0; }
  .pe-extras .pe-tag .pe-ic { width: 30px; height: 30px; } .pe-dot { right: 2px; top: 18px; width: 14px; height: 14px; }
  .pe-strip { padding-top: 8px; } .pe-strip::before { top: 6px; height: 10px; } .pe-strip-h { display: none; }
  .pe-cells { padding: 10px max(3vw, 14px) 12px; gap: 10px; }
  .pe-door { width: clamp(100px, 14vw, 128px); height: clamp(98px, 29vh, 128px); border-width: 3px; }
}
@media (max-height: 560px) and (orientation: portrait) {
  #pe-menu { --bw: min(94vw, 520px); }
  .pe-extras { margin: 12px 0 0; }
}
@media (max-height: 840px) { .pe-plan { display: none; } }
@media (max-height: 460px) {
  #pe-menu { --bw: min(46vw, 400px); }
  .pe-top { position: absolute; left: auto; right: 0; top: 0; z-index: 2; font-size: 13px; padding-left: 0; gap: 12px; } .pe-top .tok { margin-bottom: 4px; width: 3em; height: 3em; }
  .pe-top .pe-ib { height: 42px; min-height: 42px; margin-bottom: 4px; } .pe-top .pe-ib:not(.wide) { width: 42px; }
  .pe-main { align-items: center; }
  .pe-board { padding: 14px 8px 4px; margin-top: 8px; } .pe-paper { padding: 6px 10px 10px; }
  .pe-paper .hdr, .pe-plan, .pe-secret { display: none; }
  .pe-acts { margin-top: 6px; gap: 8px; } .pe-play { min-height: 48px; font-size: 24px; margin-bottom: 7px; } .pe-tag { width: 60px; min-height: 60px; padding-top: 16px; font-size: 0; } .pe-tag .pe-ic { width: 26px; height: 26px; }
  .pe-extras .pe-tag { width: 62px; min-height: 66px; padding-top: 18px; font-size: 10px; } .pe-extras .pe-tag .pe-ic { width: 26px; height: 26px; } .pe-extras { margin-top: 12px; }
  .pe-strip { padding-top: 6px; } .pe-strip-h { display: none; } .pe-strip::before { top: 8px; height: 10px; }
  .pe-cells { padding: 8px max(4vw, 18px) 4px; gap: 9px; }
  .pe-door { width: clamp(100px, 13vw, 124px); height: clamp(96px, 28vh, 118px); border-width: 3px; }
  .pe-door .leaf { padding: 4px 6px 3px; gap: 1px; } .pe-door .win { height: 21%; }
  .pe-door .f .pe-tally { display: none; } .pe-door .f { flex-wrap: nowrap; gap: 5px; white-space: nowrap; }
  .pe-door .plq { font-size: 15px; margin-top: -7px; } .pe-door .tape { font-size: 11px; min-height: 0; -webkit-line-clamp: 2; } .pe-door .f { font-size: 10px; min-height: 12px; } .pe-door .f .pe-ic { width: 12px; height: 12px; }
  .pe-strip-h { display: none; }
  .pe-win { gap: 6px; padding-bottom: 10px; } .pe-win.pe-plate { padding-top: 10px; } .pe-title { font-size: 24px; }
  .pe-btn { min-height: 46px; padding: 4px 14px; font-size: 17px; margin-bottom: 8px; } .pe-win .pe-btn.big { min-height: 50px; font-size: 20px; }
  .pe-art, .pe-art.stand { width: 58px; height: 58px; } .pe-pedestal { padding: 8px 8px 4px; gap: 2px; } .pe-big { font-size: 22px; white-space: nowrap; }
  .pe-hint { min-height: 0; font-size: 12px; }
}
@media (max-height: 460px) and (orientation: landscape) {
  #pe-chest .pe-win, #pe-stand .pe-win { width: min(640px, 100%); display: grid; grid-template-columns: 1fr 1fr; column-gap: 14px; align-items: center; }
  #pe-chest .pe-hd, #pe-stand .pe-hd { grid-column: 1 / -1; }
  #pe-chest .pe-art { grid-area: 2 / 1; } #pe-chest .pe-big { grid-area: 3 / 1; }
  #pe-chest .pe-win > :nth-child(4) { grid-area: 2 / 2; } #pe-chest .pe-win > :nth-child(5) { grid-area: 3 / 2; }
  #pe-stand .pe-pedestal { grid-area: 2 / 1 / 5 / 2; margin: 0; }
  #pe-stand .pe-win > :nth-child(3) { grid-area: 2 / 2; } #pe-stand .pe-win > :nth-child(4) { grid-area: 3 / 2; } #pe-stand .pe-win > :nth-child(5) { grid-area: 4 / 2; }
}

/* ---------- личное дело: результат ---------- */
.pe-folder { width: min(500px, 100%); padding: 0 0 14px; background: none; text-align: left; animation: pe-drop .5s steps(12) both; }
.pe-folder .sheet { position: relative; padding: 30px 16px 40px; color: var(--pe-pen); transform: rotate(-.6deg); box-shadow: 0 8px 0 rgba(0,0,0,.5), 0 16px 22px rgba(0,0,0,.5);
  background: var(--pe-noise), radial-gradient(ellipse at 90% 8%, rgba(130,85,25,.22), transparent 30%), radial-gradient(ellipse at 0 100%, rgba(60,40,10,.2), transparent 45%), repeating-linear-gradient(0deg, rgba(60,105,165,.2) 0 1px, transparent 1px 15px), #e2d6b5; border: 2px solid var(--pe-ink); }
.pe-folder .tab { position: absolute; left: 14px; top: -16px; padding: 4px 14px 2px; font-size: 13px; letter-spacing: .2em; color: var(--pe-pen); background: var(--pe-noise), #d6c797; border: 2px solid var(--pe-ink); border-bottom: 0; transform: rotate(-1deg); }
.pe-folder .clipx { position: absolute; right: 22px; top: -22px; width: 20px; height: 54px; z-index: 2; border: 4px solid #9aa1ac; border-radius: 10px; box-shadow: 1px 2px 0 rgba(0,0,0,.5); transform: rotate(8deg); }
.pe-folder .clipx::after { content: ''; position: absolute; left: 2px; right: 2px; top: 10px; height: 36px; border: 3px solid #9aa1ac; border-radius: 6px; }
.pe-folder .hd { padding-right: 30px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: #4a5361; border-bottom: 2px solid #4a5361; padding-bottom: 4px; }
.pe-folder .hd b { color: var(--pe-pen); font-size: 1.25em; }
.pe-folder .lv { margin: 6px 0 0; font-size: 16px; color: #1a2d5a; }
.pe-body { display: flex; gap: 14px; align-items: flex-start; margin-top: 10px; }
.pe-mug { flex: 0 0 auto; width: 92px; border: 3px solid var(--pe-ink); background: #cfc8b0; box-shadow: 0 3px 0 rgba(0,0,0,.4); transform: rotate(-2.5deg); }
.pe-mug svg { display: block; width: 100%; height: auto; }
.pe-proto { flex: 1 1 auto; min-width: 0; margin: 0; padding: 0; list-style: none; counter-reset: pr; }
.pe-proto li { counter-increment: pr; display: flex; align-items: baseline; gap: 6px; padding: 5px 0; font-size: 15px; font-weight: 800; color: var(--pe-pen); animation: pe-slam .26s steps(6) both; animation-delay: calc(var(--i, 0) * .12s + .35s); }
.pe-proto li::before { content: counter(pr) '.'; color: #4a5361; min-width: 1.3em; }
.pe-proto .dots { flex: 1; border-bottom: 2px dotted #4a5361; transform: translateY(-3px); min-width: 8px; }
.pe-proto .v { font-size: 1.2em; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--pe-pen); }
.pe-proto li.rec .v { color: #1b7a40; }
.pe-stampbig { align-self: center; margin: -34px 0 -4px; padding: .06em .5em; font-size: clamp(22px, 5vw, 34px); white-space: nowrap; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #178a42; background: #e9e3cf; border: .1em solid currentColor; box-shadow: 0 0 0 3px var(--pe-ink), 0 6px 0 3px rgba(0,0,0,.45); transform: rotate(-6deg); filter: url(#pe-ink); animation: pe-stampin .42s steps(8) .25s both; max-width: 100%; position: relative; z-index: 2; text-align: center; line-height: 1.05; }
.pe-stampbig.gold { color: #a8650a; font-size: clamp(26px, 6vw, 40px); }
.pe-stampbig small { display: block; font-size: .3em; letter-spacing: .3em; }
.pe-folder .pe-row { padding: 0 6px; margin-top: 8px; }
#pe-caught { z-index: 45; align-items: center; justify-content: center; pointer-events: none; background: none; }
#pe-caught .box { margin: auto; text-align: center; animation: pe-stampin .4s steps(8) both; }
#pe-caught .st { display: inline-block; padding: .05em .45em; font-size: clamp(36px, 10vw, 68px); font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: var(--pe-red); background: rgba(233,227,207,.94); border: .1em solid currentColor; box-shadow: 0 0 0 3px var(--pe-ink); transform: rotate(-7deg); filter: url(#pe-ink); }
#pe-caught p { margin: 12px 0 0; font-size: clamp(15px, 3vw, 20px); font-weight: 800; text-shadow: 0 2px 0 #000, 0 0 8px #000; }

/* передачка и витрина */
.pe-hd { margin: 0 -18px 4px; padding: 6px 16px 0; }
.pe-art { align-self: center; width: clamp(110px, 28vw, 170px); height: clamp(86px, 22vw, 134px); position: relative; filter: drop-shadow(0 8px 5px rgba(0,0,0,.5)); animation: pe-bob 1.6s steps(2) infinite; }
.pe-art .pe-ic { width: 100%; height: 100%; }
.pe-art.stand { width: clamp(84px, 20vw, 120px); height: clamp(84px, 20vw, 120px); animation: none; }
.pe-pedestal { position: relative; align-self: stretch; padding: 14px 8px 10px; margin: 2px 0; display: flex; flex-direction: column; align-items: center; gap: 4px; border: 3px solid var(--pe-ink);
  background: radial-gradient(ellipse at 50% 0, rgba(255,235,170,.25), transparent 70%), repeating-linear-gradient(90deg, rgba(0,0,0,.3) 0 3px, transparent 3px 14px), #1a1c20; box-shadow: inset 0 0 0 2px #596070; }
.pe-pedestal .nm { font-size: clamp(18px, 3vw, 22px); font-weight: 900; text-transform: uppercase; letter-spacing: .04em; text-shadow: 0 2px 0 #000; }
.pe-pedestal .rar { font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; padding: 2px 8px; color: var(--pe-ink); background: var(--pe-tape); transform: rotate(-2deg); }
.pe-big { font-size: clamp(30px, 6vw, 42px); font-weight: 900; color: var(--pe-yel); display: flex; align-items: center; justify-content: center; gap: .3em; text-shadow: 0 .06em 0 #000; transform: rotate(-1.2deg); }
.pe-big .pe-ic { width: 1.1em; height: 1.1em; }
.pe-win.cwin { width: min(500px, 100%); }
@media (max-height: 460px) {
  .pe-win.cwin { width: min(560px, 100%); }
  .pe-folder .sheet { padding: 24px 12px 30px; } .pe-mug { width: 66px; } .pe-proto li { padding: 2px 0; font-size: 13px; } .pe-folder .lv { font-size: 13px; margin-top: 2px; }
  .pe-stampbig { font-size: 22px; margin-top: -26px; margin-bottom: 0; } .pe-stampbig.gold { font-size: 24px; }
  .pe-folder .pe-row { flex-wrap: nowrap; margin-top: 4px; } .pe-folder .pe-btn { flex: 1 1 0; min-width: 0; padding: 4px 8px; font-size: 15px; } .pe-folder .pe-btn.green { flex: 1.4 1 0 !important; }
}

@keyframes pe-clank { 0% { transform: rotate(-6deg) scale(1); } 33% { transform: rotate(-12deg) scale(1.22); } 66% { transform: rotate(0deg) scale(1.1); } 100% { transform: rotate(-6deg) scale(1); } }
@keyframes pe-gain { 0% { opacity: 0; transform: translateY(-8px); } 12% { opacity: 1; transform: translateY(0) scale(1.2); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(28px); } }
@keyframes pe-blink { 50% { opacity: .55; } }
@keyframes pe-clangs { 0%, 100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(-1.5deg) translateY(-2px) scale(1.04); } }
@keyframes pe-shake { 0%, 100% { transform: rotate(1.6deg) translateX(0); } 25% { transform: rotate(1.6deg) translateX(-3px); } 75% { transform: rotate(1.6deg) translateX(3px); } }
@keyframes pe-pulse { from { opacity: .45; } to { opacity: 1; } }
@keyframes pe-slam { 0% { transform: translateY(-34px) scale(1.06); opacity: 0; } 70% { transform: translateY(3px); opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes pe-out { to { transform: translateY(-14px); opacity: 0; } }
@keyframes pe-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
@keyframes pe-drop { 0% { transform: translateY(-60px); opacity: 0; } 55% { transform: translateY(6px); opacity: 1; } 75% { transform: translateY(-3px); } 100% { transform: none; } }
@keyframes pe-stampin { 0% { transform: rotate(-6deg) scale(2.4); opacity: 0; } 70% { transform: rotate(-6deg) scale(.94); opacity: 1; } 100% { transform: rotate(-6deg) scale(1); opacity: 1; } }
@keyframes pe-swing { 0% { transform: rotate(5deg); } 25% { transform: rotate(-9deg); } 50% { transform: rotate(11deg); } 75% { transform: rotate(-3deg); } 100% { transform: rotate(5deg); } }
@keyframes pe-bob { 50% { transform: translateY(-4px) rotate(1deg); } }
@media (prefers-reduced-motion: reduce) { .pe-root *, #pe-hud *, .pe-modal *, #pe-menu * { animation: none !important; transition: none !important; } }

/* экранное управление Input: стик и контекстная кнопка в стиле игры */
:root .lory-stick { border: 4px solid rgba(244,241,234,.8); background: rgba(35,38,43,.5); box-shadow: 0 0 0 3px rgba(20,22,26,.8); }
:root .lory-stick i { background: #4b525c; box-shadow: 0 0 0 3px var(--pe-ink), inset 0 3px 0 rgba(255,255,255,.25), 0 0 0 6px rgba(240,125,30,.6); opacity: 1; }
:root .lory-ctx { font-family: var(--pe-font); font-weight: 900; text-transform: uppercase; border: 4px solid var(--pe-ink); color: #fff; background: var(--pe-bolt) 50% 6px / 9px 9px no-repeat, var(--pe-noise), radial-gradient(circle at 50% 32%, #f0883a, #d8680f 60%, #96460a);
  box-shadow: 0 0 0 4px #4a5059, 0 0 0 7px var(--pe-ink), 0 8px 10px 4px rgba(0,0,0,.4), inset 0 3px 0 rgba(255,255,255,.3); }
:root .lory-ctx:active, :root .lory-ctx.held { transform: translateY(4px) scale(.96); }
:root .lory-ctx-label { font-size: calc(var(--lory-ctx-d) * .15); letter-spacing: .03em; text-shadow: 0 2px 0 #000; max-width: 86%; }
:root .lory-ctx-icon { font-size: calc(var(--lory-ctx-d) * .4); filter: drop-shadow(0 2px 0 rgba(0,0,0,.5)); }
`;

const GAME_HUD_TUT_CSS = `
.lory-tut-card { border: 2px solid #14161a; border-radius: 1px; transform: rotate(-.6deg); font-weight: 800; box-shadow: 0 5px 0 rgba(0,0,0,.5), 0 10px 14px rgba(0,0,0,.35); padding-top: 14px;
  background: var(--pe-noise, none), repeating-linear-gradient(0deg, rgba(60,105,165,.18) 0 1px, transparent 1px 15px), #e4ddc7; clip-path: polygon(0 0, 100% 1%, 100% 94%, 96% 100%, 88% 96%, 78% 100%, 66% 96%, 52% 100%, 38% 96%, 24% 100%, 10% 96%, 0 100%); }
.lory-tut-card::before { content: ''; position: absolute; left: 50%; top: -3px; width: 74px; height: 14px; margin-left: -37px; background: #d9ca90; opacity: .95; transform: rotate(-2deg); }
.lory-tut-title { color: #b8470f; text-transform: uppercase; letter-spacing: .06em; font-weight: 900; }
.lory-tut-key { border-radius: 4px; background: #1f2630; color: #f4f1ea; box-shadow: 0 3px 0 #000; }
.lory-tut-skip { border-radius: 2px; border: 2px solid #14161a; background: #c9b97a; color: #1a1612; box-shadow: 0 3px 0 #14161a; text-transform: uppercase; letter-spacing: .05em; }
.lory-tut-bar { border-radius: 0; background: rgba(20,22,26,.2); } .lory-tut-bar i { background: #d4561a; }
.lory-tut-final { border: 2px solid #14161a; border-radius: 1px; background: #e4ddc7; color: #1a7a40; text-transform: uppercase; letter-spacing: .06em; }
`;

/** Большие запасные картинки со своим viewBox. */
const GAME_HUD_BIG = {
    chest_open: { vb: '0 0 140 110', body:
        '<ellipse cx="70" cy="102" rx="56" ry="6" fill="#000" opacity=".35"/>' +
        '<path d="M22 34 L36 8 H104 L118 34 Z" fill="#8a5a2c" stroke="#14161a" stroke-width="3" stroke-linejoin="round"/><path d="M40 12 L34 32 M70 10 V32 M100 12 L106 32" stroke="#5a3715" stroke-width="3"/>' +
        '<rect x="14" y="38" width="112" height="60" fill="#a06a34" stroke="#14161a" stroke-width="3"/><path d="M14 58 H126 M14 78 H126" stroke="#6b4420" stroke-width="2.5"/>' +
        '<path d="M14 38 h16 v60 h-16 M110 38 h16 v60 h-16" fill="#3a3f47" stroke="#14161a" stroke-width="3"/>' +
        '<g fill="#f2c230" stroke="#14161a" stroke-width="2"><ellipse cx="46" cy="40" rx="13" ry="5"/><ellipse cx="62" cy="36" rx="13" ry="5"/><ellipse cx="80" cy="39" rx="13" ry="5"/><ellipse cx="96" cy="36" rx="12" ry="5"/><ellipse cx="70" cy="30" rx="12" ry="5"/></g>' +
        '<path d="M46 28 l12 -8 l22 4 l-4 12 z" fill="#d9c48f" stroke="#14161a" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<text x="70" y="82" text-anchor="middle" font-size="14" font-weight="900" fill="#14161a" opacity=".75" font-family="Montserrat,Arial,sans-serif" letter-spacing="2">ПЕРЕДАЧА</text>' },
    mug: { vb: '0 0 60 84', body:
        '<rect width="60" height="84" fill="#cfc8b0"/><g stroke="#14161a" stroke-width="1.2">' +
        '<path d="M0 8h14M0 16h8M0 24h14M0 32h8M0 40h14M0 48h8M0 56h14M0 64h8M0 72h14"/></g>' +
        '<g font-size="5" font-weight="900" fill="#14161a" font-family="Montserrat,Arial,sans-serif"><text x="16" y="10">200</text><text x="16" y="26">190</text><text x="16" y="42">180</text><text x="16" y="58">170</text><text x="16" y="74">160</text></g>' +
        '<path d="M8 84 V68 q0 -10 12 -12 h22 q12 2 12 12 V84Z" fill="#f07d1e" stroke="#14161a" stroke-width="2"/>' +
        '<rect x="20" y="22" width="24" height="26" fill="#e3b88e" stroke="#14161a" stroke-width="2"/><rect x="20" y="22" width="24" height="7" fill="#3a2a1c"/>' +
        '<rect x="26" y="34" width="4" height="3" fill="#14161a"/><rect x="35" y="34" width="4" height="3" fill="#14161a"/><rect x="27" y="42" width="10" height="2" fill="#14161a"/><rect x="26" y="48" width="12" height="8" fill="#e3b88e"/>' +
        '<rect x="14" y="66" width="32" height="14" fill="#f4f1ea" stroke="#14161a" stroke-width="2"/><text x="30" y="77" text-anchor="middle" font-size="9" font-weight="900" fill="#14161a" font-family="Montserrat,Arial,sans-serif">4071</text>' },
};

/** @satisfies {Record<string, any>} */
const GameHud = {
    /** @type {Record<string, any>} */ cb: {},
    /** @type {HTMLElement | null} */ root: null,
    /** @type {Record<string, any>} */ el: {},
    coins: 0,
    _coinFrom: 0, _coinTo: 0, _coinT: 1,
    quality: 'auto',
    sound: true,
    _model: null,
    _toastT: 0, _caughtT: 0, _task: '',
    _lvN: 0,
    _chest: null, _stand: null,
    /** @type {Record<string, any> | null} */ _meta: null,
    _ctxText: '', _ctxOn: false,
    _ready: false, _inputStyled: false, _tutPlaced: false, _last: 0, _cdKey: '',
    /** @type {Record<string, boolean | undefined>} */ _imgOk: {},
    /** @type {Record<string, Function[]>} */ _imgWait: {},

    // ------------------------------------------------------------------ изображения и иконки

    /** Проба картинки: cb(true|false). Один запрос на путь. */
    _probe(path, cb) {
        const ok = this._imgOk[path];
        if (ok !== undefined) { cb(ok); return; }
        if (this._imgWait[path]) { this._imgWait[path].push(cb); return; }
        this._imgWait[path] = [cb];
        const done = (v) => { this._imgOk[path] = v; const w = this._imgWait[path] || []; delete this._imgWait[path]; for (const f of w) f(v); };
        const im = new Image();
        im.onload = () => done(true);
        im.onerror = () => done(false);
        im.src = path;
    },

    /** Разметка иконки: запасной SVG сразу, картинка Codex подменяет его, когда файл найден. */
    _ic(name, svgName) {
        const big = /** @type {Record<string, any>} */ (GAME_HUD_BIG)[svgName || name];
        const body = big ? big.body : (GAME_HUD_SVG[svgName || name] || GAME_HUD_SVG[name] || '');
        return '<span class="pe-ic" data-ic="' + name + '"><svg viewBox="' + (big ? big.vb : '0 0 24 24') + '" aria-hidden="true">' + body + '</svg></span>';
    },

    /** Подменить запасные иконки внутри root картинками, если они есть. */
    _upgrade(root) {
        const r = root || document;
        for (const el of Array.from(r.querySelectorAll('.pe-ic[data-ic]'))) {
            const e = /** @type {HTMLElement} */ (el);
            const name = e.dataset.ic;
            const path = /** @type {Record<string, string>} */ (GAME_HUD_ART.icons)[name || ''];
            if (!path || e.dataset.up === path) continue;
            e.dataset.up = path;
            this._probe(path, (ok) => { if (ok) e.innerHTML = '<img alt="" draggable="false" src="' + path + '">'; });
        }
    },

    _set(el, html) { el.innerHTML = html; this._upgrade(el); },

    _t(key, p) { return typeof Lang !== 'undefined' ? Lang.t(key, p) : key; },

    /** Текст из строки или { ru, en }. */
    _tx(v, def) {
        if (v == null) return def == null ? '' : def;
        if (typeof v === 'string') return v;
        const code = typeof Lang !== 'undefined' ? Lang.code : 'ru';
        return v[code] || v.en || v.ru || def || '';
    },

    _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },

    fmt(sec) {
        if (sec == null || !isFinite(sec)) return '--:--';
        const s = Math.max(0, sec), m = Math.floor(s / 60);
        return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0');
    },

    _color(c) {
        if (typeof c === 'number') return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
        return c ? String(c) : '';
    },

    /** Жетон с числом: разметка. */
    _tok(k) { return '<div class="tok"><b data-k="' + k + '">0</b></div>'; },

    /** Манометр топлива (SVG). */
    _dial() {
        let t = '';
        for (let i = 0; i <= 10; i++) {
            const a = (-120 + 24 * i) * Math.PI / 180, r1 = i % 5 === 0 ? 18 : 20.5, r2 = 24.5, s = Math.sin(a), c = -Math.cos(a);
            t += '<line x1="' + (32 + s * r1).toFixed(1) + '" y1="' + (32 + c * r1).toFixed(1) + '" x2="' + (32 + s * r2).toFixed(1) + '" y2="' + (32 + c * r2).toFixed(1) + '" stroke="' + (i <= 2 ? '#e2453c' : '#f4f1ea') + '" stroke-width="' + (i % 5 === 0 ? 2.2 : 1.3) + '"/>';
        }
        return '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30.5" fill="#596070" stroke="#14161a" stroke-width="2.5"/><circle cx="32" cy="32" r="27" fill="#2a2e34" stroke="#14161a" stroke-width="1.5"/><circle class="face" cx="32" cy="32" r="25" fill="#14161a"/>' + t +
            '<g transform="translate(24 40) scale(.66)" fill="#f07d1e"><path d="M5 8l3-4h6v4h3l2 3v10H5z"/></g>' +
            '<g class="needle" style="transform:rotate(120deg)"><path d="M32 36 L30.6 10 L33.4 10 Z" fill="#f07d1e" stroke="#14161a" stroke-width=".8"/></g>' +
            '<circle cx="32" cy="32" r="4" fill="#9aa1ac" stroke="#14161a" stroke-width="1.5"/><path d="M12 22 A22 22 0 0 1 30 8" stroke="#fff" stroke-width="2" fill="none" opacity=".18" stroke-linecap="round"/></svg>';
    },

    /** Термометр супер-прыжка (SVG). */
    _thermo() {
        let t = '';
        for (let i = 0; i <= 8; i++) t += '<line x1="19" x2="' + (i % 4 === 0 ? 25 : 22.5) + '" y1="' + (5 + i * 5) + '" y2="' + (5 + i * 5) + '" stroke="#f4f1ea" stroke-width="1.4"/>';
        return '<svg viewBox="0 0 28 64"><rect x="8" y="1" width="12" height="46" rx="6" fill="#14161a" stroke="#9aa1ac" stroke-width="2"/><circle cx="14" cy="54" r="8.5" fill="#14161a" stroke="#9aa1ac" stroke-width="2"/>' +
            '<circle cx="14" cy="54" r="6" fill="#3fdc78"/><rect class="hg" x="12" y="5" width="4" height="41" fill="#3fdc78"/>' + t + '<path d="M10 6 V44" stroke="#fff" stroke-width="1.2" opacity=".25"/></svg>';
    },

    // ------------------------------------------------------------------ запуск

    init(cb) {
        this.cb = cb || {};
        if (typeof document === 'undefined') return this;
        if (this._ready) return this;
        this._ready = true;
        const st = document.createElement('style');
        st.id = 'pe-hud-css'; st.textContent = GAME_HUD_CSS;
        document.head.appendChild(st);
        try { if (document.fonts && document.fonts.load) document.fonts.load('900 24px "PEM Montserrat"'); } catch (e) { /* шрифт подгрузится сам */ }
        this._build();
        this._bind();
        if (typeof Quality !== 'undefined' && Quality.choice) this.quality = Quality.choice;
        this.setQuality(this.quality, true);
        this.setSound(typeof Sound !== 'undefined' ? !Sound.muted : true);
        this._layout();
        if (typeof window !== 'undefined') window.addEventListener('lory-language', () => this._relang());
        if (typeof requestAnimationFrame === 'function') {
            const loop = (t) => { const dt = this._last ? Math.min(0.1, (t - this._last) / 1000) : 0.016; this._last = t; this.tick(dt); requestAnimationFrame(loop); };
            requestAnimationFrame(loop);
        }
        return this;
    },

    _build() {
        const I = (n) => this._ic(n);
        const root = this.root = document.createElement('div');
        root.id = 'pe-hud'; root.className = 'pe-root';
        root.innerHTML =
            '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
            '<filter id="pe-ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" color-interpolation-filters="sRGB" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 2.2" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="s"/><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="2" result="w"/><feDisplacementMap in="s" in2="w" scale="3"/></filter></defs></svg>' +
            '<div id="pe-chase"></div>' +
            '<div id="pe-coins" class="pe-hb" aria-label="' + this._t('ui.coinsAria') + '">' + this._tok('coinsN') +
            '<div id="pe-level"><div class="row"><span class="n pe-sten" data-k="lvN">1</span><span class="t pe-mk" data-k="lvT"></span></div><div class="pe-prog"><i data-k="prog"></i></div></div></div>' +
            '<div id="pe-btns" class="pe-hb"><button type="button" class="pe-ib" data-k="respawn" aria-label="' + this._t('ui.respawnBtn') + '">' + I('respawn') + '</button>' +
            '<button type="button" class="pe-ib" data-k="pause" aria-label="' + this._t('ui.pauseBtn') + '">' + I('pause') + '</button></div>' +
            '<div id="pe-gauges" class="pe-hb pe-plate">' +
            '<div class="ins fuel" data-k="fuel" hidden title="' + this._t('ui.fuel') + '">' + this._dial() + '</div>' +
            '<div class="ins sj" data-k="sj" hidden title="' + this._t('ui.superJump') + '">' + this._thermo() + '</div>' +
            '<div class="ins dis" data-k="dis" hidden title="' + this._t('ui.disguise') + '"><div class="badge">' + I('disguise') + '</div></div>' +
            '<div class="ins keys" data-k="keys" hidden></div></div>' +
            '<div id="pe-alert" class="pe-hb"><div class="pe-run" data-t="ui.run"></div><div class="pe-spot">' + I('warn') + '<span data-t="ui.spotted"></span></div></div>' +
            '<div id="pe-task" class="pe-hb"><div class="tape"><span class="tag" data-t="ui.task"></span><span class="txt pe-mk" data-k="taskT"></span></div></div>' +
            '<div id="pe-toast" class="pe-hb"><span class="pe-mk" data-k="toastT"></span></div>' +
            '<div id="pe-ctx" class="pe-hb"><kbd data-k="ctxKey">E</kbd><span class="l" data-k="ctxL"></span></div>' +
            '<div id="pe-flash"></div>';
        document.body.appendChild(root);

        const holder = document.createElement('div');
        holder.className = 'pe-root';
        holder.innerHTML =
            '<div id="pe-menu">' +
            '<div class="pe-top">' + this._tok('menuCoins') +
            '<div class="pe-tools"><button type="button" class="pe-ib" data-k="sound" aria-label="' + this._t('ui.sound') + '"></button>' +
            '<button type="button" class="pe-ib wide" data-k="quality" aria-label="' + this._t('ui.quality') + '"><span class="pe-bars" data-k="qbars"></span><span data-k="qlbl"></span></button>' +
            '<button type="button" class="pe-ib" data-k="howto" aria-label="' + this._t('ui.howto') + '">' + I('help') + '</button></div></div>' +
            '<div class="pe-main"><div class="pe-board"><i class="clip"></i><div class="pe-paper">' +
            '<div class="hdr"><b class="pe-sten" data-t="ui.plan"></b><span class="pe-mk" data-k="planNo"></span></div>' +
            '<div class="pe-secret pe-sten" data-t="ui.secret"></div>' +
            '<div class="pe-logo" data-k="logo"><img alt="Prision Espace Parkour Master" draggable="false"><div class="txt"><div class="l1">PRISION ESPACE</div><div class="l2">PARKOUR MASTER</div><div class="bar"></div></div></div>' +
            '<ul class="pe-plan"><li class="on"><span class="pe-mk" data-t="ui.plan1"></span></li><li><span class="pe-mk" data-t="ui.plan2"></span></li><li><span class="pe-mk" data-t="ui.plan3"></span></li></ul></div>' +
            '<div class="pe-acts"><button type="button" class="pe-btn pe-play" data-k="play"><span class="pe-lbl"><span class="main pe-sten" data-t="ui.play"></span><span class="sub" data-k="playSub"></span></span></button>' +
            '<div class="pe-tagwrap"><button type="button" class="pe-tag" data-k="shop" aria-label="' + this._t('ui.shop') + '">' + I('shop') + '<span class="pe-mk" data-t="ui.shop"></span></button></div></div></div>' +
            '<div class="pe-extras">' + this._metaTag('daily', 'gift') + this._metaTag('wheel', 'wheel') + this._metaTag('leaders', 'trophy', true) + '</div></div>' +
            '<div class="pe-strip"><div class="pe-strip-h pe-mk" data-t="ui.levelSelect"></div><div class="pe-cells" data-k="cells"></div></div></div>' +

            '<div class="pe-modal" id="pe-pause"><div class="pe-win pe-plate pe-sheet"><div class="pe-hd"><div class="pe-kick" data-t="ui.inspect"></div><h2 class="pe-title pe-sten" data-t="ui.paused"></h2></div>' +
            '<button type="button" class="pe-btn hot big" data-k="resume">' + I('play') + '<span data-t="ui.resume"></span></button>' +
            '<div class="pe-row"><button type="button" class="pe-btn steel" data-k="restart">' + I('restart') + '<span data-t="ui.restart"></span></button>' +
            '<button type="button" class="pe-btn steel" data-k="menu">' + I('home') + '<span data-t="ui.menu"></span></button></div>' +
            '<div class="pe-row"><button type="button" class="pe-ib" data-k="sound" aria-label="' + this._t('ui.sound') + '"></button>' +
            '<button type="button" class="pe-ib wide" data-k="howto"><span class="pe-ic"><svg viewBox="0 0 24 24">' + GAME_HUD_SVG.help + '</svg></span><span data-t="ui.howto"></span></button>' +
            '<button type="button" class="pe-ib wide" data-k="quality"><span class="pe-bars" data-k="qbars"></span><span data-k="qlbl"></span></button></div></div></div>' +

            '<div class="pe-modal" id="pe-chest"><div class="pe-win pe-plate"><div class="pe-hd"><div class="pe-kick" data-t="ui.parcelFor"></div><h2 class="pe-title pe-sten" data-t="ui.chest"></h2></div>' +
            '<div class="pe-art" data-k="chestArt">' + this._ic('chest_open') + '</div>' +
            '<div class="pe-big">' + I('coin') + '<span data-k="chestN"></span></div>' +
            '<button type="button" class="pe-btn hot big" data-k="chestAd">' + I('ad') + '<span data-k="chestAdL"></span></button>' +
            '<button type="button" class="pe-btn steel" data-k="chestClose"><span data-t="ui.later"></span></button></div></div>' +

            '<div class="pe-modal" id="pe-stand"><div class="pe-win pe-plate"><div class="pe-hd"><div class="pe-kick" data-t="ui.stand"></div><h2 class="pe-title pe-sten" data-k="standTitle"></h2></div>' +
            '<div class="pe-pedestal"><div class="pe-art stand" data-k="standArt"></div><div class="nm" data-k="standName"></div><div class="rar" data-k="standRar"></div></div>' +
            '<div class="pe-hint" data-k="standHint"></div>' +
            '<button type="button" class="pe-btn big" data-k="standAct"></button>' +
            '<button type="button" class="pe-btn steel" data-k="standClose"><span data-t="ui.close"></span></button></div></div>' +

            '<div class="pe-modal" id="pe-complete"><div class="pe-win pe-folder" data-k="cwin"></div></div>' +
            '<div class="pe-modal ghost" id="pe-caught"><div class="box"><div class="st pe-sten" data-t="ui.caught"></div><p data-k="caughtT"></p></div></div>';
        while (holder.firstChild) document.body.appendChild(holder.firstChild);

        for (const e of Array.from(document.querySelectorAll('#pe-hud [data-k], #pe-menu [data-k], .pe-modal [data-k]'))) {
            const h = /** @type {HTMLElement} */ (e), k = h.dataset.k || '';
            (this.el[k] = this.el[k] || []).push(h);
        }
        for (const id of ['hud', 'menu', 'pause', 'chest', 'stand', 'complete', 'caught', 'coins', 'level', 'btns', 'gauges', 'alert', 'task', 'toast', 'ctx', 'chase', 'flash']) {
            this.el['#' + id] = document.getElementById('pe-' + id);
        }
        this.el['#hud'] = root;
        if (typeof Lang !== 'undefined') Lang.apply(document.body);
        this._upgrade(document.body);
        this._logo();
        if (this._meta) this.metaBadges({});
    },

    /** Бирка мета-окна в меню: подарок / колесо / рекорды (красная точка — можно забрать). */
    _metaTag(k, icon, hidden) {
        return '<div class="pe-tagwrap" data-w="' + k + '"' + (hidden ? ' hidden' : '') + '><button type="button" class="pe-tag meta" data-k="' + k + '" aria-label="' + this._t('meta.' + k) + '">' +
            this._ic(icon) + '<span class="pe-mk" data-t="meta.' + k + '"></span><i class="pe-dot" hidden></i></button></div>';
    },

    /**
     * Красные точки и видимость мета-кнопок меню. daily / wheel: true или число > 0 — точка; leaders: false — спрятать «Рекорды»
     * (площадка не даёт таблицу), true — показать. Поле можно не задавать — оно не меняется.
     */
    metaBadges(m) {
        if (!m) return;
        this._meta = Object.assign(this._meta || {}, m);
        if (!this._ready) return;
        const b = this._meta;
        for (const k of ['daily', 'wheel']) {
            const dot = document.querySelector('#pe-menu .pe-tag[data-k="' + k + '"] .pe-dot');
            if (dot) /** @type {HTMLElement} */ (dot).hidden = !b[k];
        }
        const w = document.querySelector('#pe-menu .pe-tagwrap[data-w="leaders"]');
        if (w) /** @type {HTMLElement} */ (w).hidden = !b.leaders;
    },

    /** Все элементы с data-k. */
    _all(k) { return /** @type {HTMLElement[]} */ (this.el[k] || []); },
    _one(k) { return /** @type {HTMLElement} */ ((this.el[k] || [])[0]); },

    _logo() {
        const box = this._one('logo'), img = /** @type {HTMLImageElement} */ (box.querySelector('img'));
        const path = GAME_HUD_ART.logo;
        this._probe(path, (ok) => { if (ok) { img.src = path; box.classList.add('img'); } });
    },

    _bind() {
        const click = (k, fn) => {
            for (const b of this._all(k)) b.addEventListener('click', (e) => {
                e.stopPropagation();
                if (b.getAttribute('aria-disabled') === 'true') return;
                fn(b);
            });
        };
        const call = (name, ...a) => { const f = this.cb && this.cb[name]; if (typeof f === 'function') return f.apply(this.cb, a); };
        click('play', () => { this._ui(); call('onPlay'); });
        click('shop', () => { this._ui(); call('onShop'); });
        click('howto', () => { this._ui(); call('onHowTo'); });
        click('daily', () => { this._ui(); call('onDaily'); });
        click('wheel', () => { this._ui(); call('onWheel'); });
        click('leaders', () => { this._ui(); call('onLeaders'); });
        click('sound', () => { this._ui(); call('onSound'); });
        click('quality', () => {
            const order = ['auto', 'low', 'medium', 'high'];
            const q = order[(order.indexOf(this.quality) + 1) % order.length];
            this.setQuality(q);
            this._ui();
            if (typeof this.cb.onQuality === 'function') this.cb.onQuality(q);
            else if (typeof Quality !== 'undefined') Quality.set(q);
        });
        click('pause', () => { this._ui(); call('onPause'); });
        click('respawn', () => { this._ui(); call('onRespawn'); });
        click('resume', () => { this._ui(); call('onResume'); });
        click('restart', () => { this._ui(); call('onRestart'); });
        click('menu', () => { this._ui(); call('onMenu'); });
        click('chestAd', () => { const c = this._chest; if (c && typeof c.onWatch === 'function') c.onWatch(); });
        click('chestClose', () => { const c = this._chest; this.closeWindows(); if (c && typeof c.onClose === 'function') c.onClose(); });
        click('standAct', () => {
            const s = this._stand; if (!s) return;
            const n = s.n, h = n.owned ? s.onEquip : n.kind === 'coins' ? s.onBuy : s.onWatch;
            if (typeof h === 'function') h(n.id);
        });
        click('standClose', () => { const s = this._stand; this.closeWindows(); if (s && typeof s.onClose === 'function') s.onClose(); });
        if (typeof Platform !== 'undefined' && typeof Platform.onRewardedCooldown === 'function') Platform.onRewardedCooldown(() => { this._cdKey = ''; });
    },

    _ui() { if (typeof GameAudio !== 'undefined' && GameAudio.play) { try { GameAudio.play('ui'); } catch (e) { /* звук необязателен */ } } },

    _layout() {
        if (typeof HudLayout === 'undefined') return;
        // сверху по центру — только задание; название уровня и прогресс — у монет; приборы справа под кнопками (в портрете слева под монетами)
        HudLayout.block('pe-coins', { dock: 'tl', w: 'auto', h: 'auto', el: '#pe-coins', order: 0 });
        HudLayout.block('pe-gauges', { dock: { wide: 'tr', default: 'tl' }, w: 'auto', h: 'auto', el: '#pe-gauges', order: 1 });
        HudLayout.block('pe-btns', { dock: 'tr', w: 112, h: 50, el: '#pe-btns', order: 0, min: 46 });
        HudLayout.block('pe-task', { dock: 'tc', w: 380, h: 'auto', fill: true, maxW: 620, minW: 220, el: '#pe-task', order: 2 });
        HudLayout.block('pe-toast', { dock: 'tc', w: 340, h: 46, fill: true, maxW: 520, minW: 180, el: '#pe-toast', order: 6 });
        HudLayout.block('pe-alert', { dock: 'bc', w: 'auto', h: 'auto', el: '#pe-alert', order: 1 });
        HudLayout.block('pe-ctx', { dock: 'bc', w: 'auto', h: 'auto', el: '#pe-ctx', order: 0 });
    },

    _relayout() { if (typeof HudLayout !== 'undefined' && HudLayout.schedule) HudLayout.schedule(); },

    _relang() {
        if (typeof Lang === 'undefined') return;
        Lang.apply(document.body);
        this.setQuality(this.quality, true);
        if (this._model) this._renderMenu();
        this._ctxText = '';
    },

    // ------------------------------------------------------------------ главное меню

    /** Меню поверх сцены. model: { levels: [{ id, title, unlocked, done, coins, best }], current (индекс с 0), coins }. */
    menu(show, model) {
        if (!this._ready) return;
        if (show) {
            this.closeWindows();
            if (model) { this._model = model; if (model.coins != null) this._setCoinsNow(model.coins); }
            this._renderMenu();
            this.el['#menu'].classList.add('on');
            this.hud(false);
            const sc = this._one('cells'), cur = /** @type {HTMLElement} */ (this.el['#menu'].querySelector('.pe-door.cur'));
            if (sc && cur) sc.scrollLeft = Math.max(0, cur.offsetLeft - sc.clientWidth / 2 + cur.offsetWidth / 2);
        } else {
            this.el['#menu'].classList.remove('on');
            this.hud(!(model && model.hud === false));
        }
        this._modal();
    },

    _lockSvg() {
        return '<svg viewBox="0 0 100 140" preserveAspectRatio="none"><path d="M-6 96 L106 74" stroke="#14161a" stroke-width="9" fill="none"/><path d="M-6 96 L106 74" stroke="#aab0ba" stroke-width="6" stroke-dasharray="9 5" fill="none"/>' +
            '<g transform="translate(50 82) scale(.8)"><path d="M-10 -4 V-12 a10 10 0 0 1 20 0 V-4" fill="none" stroke="#14161a" stroke-width="9"/><path d="M-10 -4 V-12 a10 10 0 0 1 20 0 V-4" fill="none" stroke="#c9ced6" stroke-width="5"/>' +
            '<rect x="-16" y="-5" width="32" height="26" rx="3" fill="#d6a53a" stroke="#14161a" stroke-width="3"/><circle cx="0" cy="5" r="3.5" fill="#14161a"/><rect x="-1.5" y="6" width="3" height="8" fill="#14161a"/></g></svg>';
    },

    _renderMenu() {
        const m = this._model; if (!m) return;
        const box = this._one('cells'); box.innerHTML = '';
        const levels = m.levels || [];
        const cur = m.current || 0;
        levels.forEach((lv, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            const locked = lv.unlocked === false;
            b.className = 'pe-door' + (locked ? ' locked' : '') + (lv.done ? ' done' : '') + (i === cur && !locked ? ' cur' : '');
            const title = this._tx(lv.title, '');
            let foot = '';
            if (!locked) {
                if (lv.done) foot += '<span class="pe-tally" aria-hidden="true"><i style="--r:-3deg"></i><i style="--r:2deg"></i><i style="--r:-1deg"></i><i style="--r:3deg"></i><b></b></span>';
                foot += '<span>' + this._ic('coin') + (lv.coins || 0) + '</span>';
                if (lv.best != null) foot += '<span>' + this._ic('clock') + this.fmt(lv.best) + '</span>';
            }
            b.innerHTML = '<i class="glow"></i><div class="leaf"><div class="win"><div class="art"></div><i class="bars"></i></div><div class="plq pe-sten">' + String(i + 1).padStart(2, '0') + '</div>' +
                '<div class="tape"><span></span></div><div class="f">' + foot + '</div></div>' + (locked ? '<div class="lockg">' + this._lockSvg() + '</div>' : '');
            /** @type {HTMLElement} */ (b.querySelector('.tape span')).textContent = title;
            b.setAttribute('aria-label', (i + 1) + ' ' + title + (locked ? ' — ' + this._t('ui.locked') : ''));
            if (locked) b.setAttribute('aria-disabled', 'true');
            else b.addEventListener('click', (e) => { e.stopPropagation(); this._ui(); if (typeof this.cb.onLevel === 'function') this.cb.onLevel(i); });
            box.appendChild(b);
            const art = GAME_HUD_ART.levels[i];
            if (art) this._probe(art, (ok) => { if (ok) { const a = /** @type {HTMLElement} */ (b.querySelector('.art')); a.style.backgroundImage = 'url("' + art + '")'; a.classList.add('on'); } });
        });
        this._upgrade(box);
        const lv = levels[cur];
        this._one('playSub').textContent = lv ? this._t('ui.cell', { n: cur + 1 }) + ' · ' + this._tx(lv.title, '') : '';
        this._one('planNo').textContent = '№ 4071';
        this._num(m.coins != null ? m.coins : this.coins);
    },

    // ------------------------------------------------------------------ HUD

    /** Показать/скрыть HUD забега. */
    hud(on) { if (this.root) this.root.classList.toggle('run', !!on); this._relayout(); },

    /** Число на всех жетонах (размер цифр по длине). */
    _num(n) {
        const s = String(n);
        for (const k of ['coinsN', 'menuCoins']) for (const e of this._all(k)) {
            e.textContent = s;
            const t = /** @type {HTMLElement} */ (e.parentElement);
            t.classList.toggle('d4', s.length === 4); t.classList.toggle('d5', s.length >= 5);
        }
    },

    _setCoinsNow(n) { this.coins = n; this._coinFrom = this._coinTo = n; this._coinT = 1; this._num(n); },

    /** Монеты: n — итог, gained — сколько только что подобрали (плавающее «+N», счётчик докручивается). */
    setCoins(n, gained) {
        if (!this._ready) return;
        if (gained > 0) {
            this._coinFrom = this.coins; this._coinTo = n; this._coinT = 0;
            const box = this.el['#coins'];
            box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
            const g = document.createElement('span');
            g.className = 'pe-gain'; g.textContent = '+' + gained;
            g.addEventListener('animationend', () => g.remove());
            box.appendChild(g);
        } else this._setCoinsNow(n);
    },

    levelTitle(n, title) {
        if (!this._ready) return;
        this._lvN = n;
        this._one('lvN').textContent = String(n);
        this._one('lvT').textContent = this._tx(title, '');
        this.el['#level'].classList.toggle('on', n != null || !!title);
        this._relayout();
    },

    progress(k) { if (this._ready) this._one('prog').style.width = Math.round(100 * Math.max(0, Math.min(1, k || 0))) + '%'; },

    task(text) {
        if (!this._ready) return;
        const box = this.el['#task'], t = text ? this._tx(text, '') : '';
        if (t === this._task) return;
        this._task = t;
        box.classList.remove('on');
        if (t) { this._one('taskT').textContent = t; void box.offsetWidth; box.classList.add('on'); }
        this._relayout();
    },

    toast(text, ms, kind) {
        if (!this._ready) return;
        const box = this.el['#toast'];
        this._one('toastT').textContent = this._tx(text, '');
        box.className = 'pe-hb vis ' + (kind || 'info');
        void box.offsetWidth;
        const dur = ms || 2200;
        this._toastT = performance.now() + dur;
        this._relayout();
        setTimeout(() => {
            if (performance.now() < this._toastT) return;
            box.classList.add('out');
            setTimeout(() => { if (performance.now() >= this._toastT) { box.classList.remove('vis', 'out'); this._relayout(); } }, 220);
        }, dur);
    },

    chase(on) {
        if (!this._ready) return;
        this.el['#chase'].classList.toggle('on', !!on);
        this.el['#alert'].classList.toggle('chase', !!on);
        this._alertSync();
    },

    spotted(on) {
        if (!this._ready) return;
        this.el['#alert'].classList.toggle('spot', !!on);
        this._alertSync();
    },

    _alertSync() { const a = this.el['#alert']; a.classList.toggle('on', a.classList.contains('chase') || a.classList.contains('spot')); this._relayout(); },

    /** Вспышка экрана: 'caught' | 'death' | 'hit' | 'checkpoint' | 'win'. */
    flash(kind) {
        if (!this._ready) return;
        const f = this.el['#flash'];
        f.className = 'k-' + (kind || 'hit');
        void f.offsetWidth;
        f.classList.add('go');
    },

    _gauge(k, on) { this._one(k).hidden = !on; const g = this.el['#gauges'], any = Array.from(g.children).some((c) => !(/** @type {HTMLElement} */ (c)).hidden); g.classList.toggle('on', any); this._relayout(); },

    _bar(k, v) {
        if (!this._ready) return;
        const chip = this._one(k);
        if (v == null) { this._gauge(k, false); return; }
        const x = Math.max(0, Math.min(1, v));
        if (k === 'fuel') {
            const n = /** @type {HTMLElement | null} */ (chip.querySelector('.needle'));
            if (n) n.style.transform = 'rotate(' + (-120 + 240 * x).toFixed(1) + 'deg)';
        } else {
            const hg = chip.querySelector('.hg');
            if (hg) { const h = 41 * x; hg.setAttribute('y', String(46 - h)); hg.setAttribute('height', h.toFixed(1)); }
        }
        chip.classList.toggle('low', k === 'fuel' && x < 0.25);
        if (chip.hidden) this._gauge(k, true);
    },

    jetFuel(k) { this._bar('fuel', k); },
    superJump(k) { this._bar('sj', k); },
    disguise(on) { if (this._ready) this._gauge('dis', !!on); },

    /** Ключ-карты: массив номеров групп. */
    keys(list) {
        if (!this._ready) return;
        const box = this._one('keys'), arr = list || [];
        let html = '';
        for (const n of arr) {
            const i = Math.abs(Math.round(n)) || 0, col = GAME_HUD_KEYCOLORS[i % GAME_HUD_KEYCOLORS.length];
            html += '<span style="color:' + col + '" title="' + this._t('ui.key') + '">' + this._ic(GAME_HUD_KEYICONS[i % GAME_HUD_KEYICONS.length], 'key') + '</span>';
        }
        this._set(box, html);
        this._gauge('keys', arr.length > 0);
    },

    // ------------------------------------------------------------------ звук и качество

    setSound(on) {
        this.sound = !!on;
        for (const b of this._all('sound')) { b.classList.toggle('or', !on); this._set(b, this._ic(on ? 'sound_on' : 'sound_off')); b.setAttribute('aria-pressed', String(!!on)); }
    },

    setQuality(q, silent) {
        this.quality = q;
        const lvl = q === 'low' ? 1 : q === 'medium' ? 2 : 3;
        let bars = '';
        for (let i = 1; i <= 3; i++) bars += '<i style="height:' + (5 + i * 5) + 'px"' + (i > lvl ? ' class="off"' : '') + '></i>';
        for (const e of this._all('qbars')) { e.innerHTML = bars; e.classList.toggle('auto', q === 'auto'); }
        for (const e of this._all('qlbl')) e.textContent = this._t('ui.q.' + q);
    },

    // ------------------------------------------------------------------ окна

    _modal() {
        const open = this.overlayOpen();
        document.body.classList.toggle('pe-modal-open', open);
    },

    /** Открыт ли экран поверх игры (меню, пауза, результат, сундук, витрина). */
    overlayOpen() {
        if (!this._ready) return false;
        if (document.body.classList.contains('pe-meta-open')) return true;
        return ['#menu', '#pause', '#chest', '#stand', '#complete'].some((k) => this.el[k].classList.contains('on'));
    },

    /** Закрыть окна (пауза, сундук, витрина, результат, «Пойман») без вызова обработчиков. Меню не трогает. */
    closeWindows() {
        if (!this._ready) return;
        for (const k of ['#pause', '#chest', '#stand', '#complete', '#caught']) this.el[k].classList.remove('on');
        this._chest = null; this._stand = null;
        this._modal();
    },

    /** Всё, кроме HUD забега: меню, окна, тревога, вспышка. */
    hideAll() {
        if (!this._ready) return;
        this.el['#menu'].classList.remove('on');
        this.closeWindows();
        this.chase(false); this.spotted(false);
        this.el['#flash'].className = '';
    },

    pause(on) {
        if (!this._ready) return;
        const p = this.el['#pause'];
        p.classList.remove('on');
        if (on) { void p.offsetWidth; p.classList.add('on'); }
        this._modal();
    },

    caught(text) {
        if (!this._ready) return;
        const c = this.el['#caught'];
        this._one('caughtT').textContent = text ? this._tx(text, '') : '';
        c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
        this.flash('caught');
        clearTimeout(this._caughtT);
        this._caughtT = /** @type {any} */ (setTimeout(() => c.classList.remove('on'), 1700));
    },

    // ------------------------------------------------------------------ сундук («передачка»)

    _adState(ready) {
        const left = typeof Platform !== 'undefined' && Platform.rewardedCooldownLeft ? Platform.rewardedCooldownLeft() : 0;
        const sup = typeof Platform === 'undefined' || !Platform.rewardedSupported || Platform.rewardedSupported();
        if (left > 0) return { label: this._t('ui.adIn', { n: left }), off: true };
        return { label: '', off: !sup || ready === false };
    },

    chestOffer(m) {
        if (!this._ready) return;
        m = m || {};
        this._chest = m;
        const n = m.coins != null ? m.coins : 100;
        this._one('chestN').textContent = this._t('ui.chestCoins', { n });
        this._cdKey = '';
        this._chestSync();
        this.el['#chest'].classList.add('on');
        this._modal();
    },

    _chestSync() {
        const m = this._chest; if (!m) return;
        const s = this._adState(m.adReady);
        const label = s.label || m.adLabel || this._t('ui.watchAd');
        this._one('chestAdL').textContent = label;
        this._one('chestAd').setAttribute('aria-disabled', String(!!s.off));
    },

    // ------------------------------------------------------------------ витрина

    /** Модель предмета: карточка Shop.card() или простые поля { name, price, need, progress, owned, equipped, color, icon, slot, rarity }. */
    _norm(item) {
        const c = item || {}, raw = c.item && typeof c.item === 'object' ? c.item : c;
        const priceObj = c.price != null ? c.price : raw.price;
        const price = typeof priceObj === 'number' ? priceObj : (priceObj && priceObj.coins) || 0;
        const need = c.need != null ? c.need : (priceObj && priceObj.ads) || 0;
        const kind = c.kind && c.kind !== 'free' ? c.kind : price > 0 ? 'coins' : need > 0 ? 'ads' : 'free';
        return {
            id: c.id != null ? c.id : raw.id, name: this._tx(c.name != null ? c.name : raw.name, ''), kind, price, need, progress: c.progress || 0,
            owned: !!c.owned, equipped: !!c.equipped, affordable: c.affordable != null ? !!c.affordable : this.coins >= price,
            hint: c.hint || '', rarity: c.rarityLabel || c.rarity || '', color: this._color(raw.color != null ? raw.color : c.color),
            icon: c.icon || raw.icon || '', slot: String(c.slot || raw.slot || raw.tab || ''),
        };
    },

    standOffer(m) {
        if (!this._ready) return;
        m = m || {};
        this._stand = Object.assign({}, m, { n: this._norm(m.item) });
        this._one('standTitle').textContent = this._t('ui.standTitle');
        this._standRender();
        this.el['#stand'].classList.add('on');
        this._modal();
    },

    /** Обновить открытую витрину новой моделью предмета (после покупки). */
    standRefresh(item) {
        if (!this._stand) return;
        this._stand.n = this._norm(item || this._stand.item);
        this._standRender();
    },

    _standRender() {
        const s = this._stand; if (!s) return;
        const n = s.n;
        this._one('standName').textContent = n.name;
        const rar = this._one('standRar'); rar.textContent = n.rarity; rar.style.display = n.rarity ? '' : 'none';
        const art = this._one('standArt');
        const slot = n.slot.toLowerCase();
        const fb = /jet/.test(slot) ? 'jetpack' : /trail|след/.test(slot) ? 'comet' : /glass|face|mask|eye/.test(slot) ? 'glasses' : /top|shirt|body|skin|outfit|robe/.test(slot) ? 'shirt' : 'disguise';
        art.innerHTML = '<span class="pe-ic"' + (n.color ? ' style="color:' + n.color + '"' : '') + '><svg viewBox="0 0 24 24">' + GAME_HUD_SVG[fb] + '</svg></span>';
        const icon = n.icon && /^assets\//.test(n.icon) ? n.icon : (n.id ? GAME_HUD_ART.itemsDir + n.id + '.webp' : '');
        if (icon) this._probe(icon, (ok) => { if (ok && this._stand === s) /** @type {HTMLElement} */ (art.firstChild).innerHTML = '<img alt="" draggable="false" src="' + icon + '">'; });
        this._cdKey = '';
        this._standSync();
    },

    _standSync() {
        const s = this._stand; if (!s) return;
        const n = s.n, btn = this._one('standAct');
        let label, off = false, hint = n.hint, icon = '', cls = 'pe-btn big';
        if (n.owned) {
            label = n.equipped ? this._t('ui.equipped') : this._t('ui.equip'); off = n.equipped; cls += ' green';
        } else if (n.kind === 'coins') {
            label = this._t('ui.buyFor', { n: n.price }); off = !n.affordable; icon = this._ic('coin'); cls += ' hot';
            if (off && !hint) hint = this._t('ui.noCoins', { n: Math.max(0, n.price - this.coins) });
        } else if (n.kind === 'ads') {
            const a = this._adState(true);
            label = a.label || this._t('ui.adProgress', { a: n.progress, b: n.need }); off = a.off; icon = this._ic('ad'); cls += ' yel';
        } else { label = n.name; off = true; }
        const key = [label, off, hint, cls, this.coins].join('|');
        if (key === this._cdKey) return;
        this._cdKey = key;
        btn.className = cls;
        this._set(btn, icon + '<span>' + this._esc(label) + '</span>');
        btn.setAttribute('aria-disabled', String(!!off));
        this._one('standHint').textContent = hint || '';
    },

    // ------------------------------------------------------------------ результат: личное дело

    complete(m) {
        if (!this._ready) return;
        m = m || {};
        const win = this._one('cwin'), last = !!m.isLast;
        const rec = m.best != null && m.time != null && m.time <= m.best + 0.001;
        const title = this._t(last ? 'ui.finalWin' : 'ui.complete');
        const sub = last ? this._t('ui.finalSub') : this._t('ui.levelDone', { n: m.level != null ? m.level : '' }) + (m.title ? ' · ' + this._tx(m.title, '') : '');
        const esc = (s) => this._esc(s);
        let i = 0;
        const line = (key, val, cls) => '<li class="' + (cls || '') + '" style="--i:' + (i++) + '"><span class="k">' + this._t(key) + '</span><span class="dots"></span><span class="v">' + val + '</span></li>';
        win.className = 'pe-win cwin pe-folder';
        win.innerHTML =
            '<div class="sheet"><span class="tab pe-sten">' + this._t('ui.caseClosed') + '</span><i class="clipx"></i>' +
            '<div class="hd"><b class="pe-sten">' + this._t('ui.caseNo', { n: 4071 }) + '</b><span class="pe-mk">' + esc(m.level != null ? this._t('ui.cell', { n: m.level }) : '') + '</span></div>' +
            '<p class="lv pe-mk">' + esc(sub) + '</p>' +
            '<div class="pe-body"><div class="pe-mug"><svg viewBox="' + GAME_HUD_BIG.mug.vb + '">' + GAME_HUD_BIG.mug.body + '</svg></div>' +
            '<ul class="pe-proto">' + line('ui.coinsEarned', '+' + (m.coins || 0)) + line('ui.time', this.fmt(m.time)) + line('ui.falls', m.deaths || 0) +
            (m.best != null ? line('ui.bestResult', this.fmt(m.best), rec ? 'rec' : '') : '') + '</ul></div></div>' +
            '<div class="pe-stampbig' + (last ? ' gold' : '') + '">' + esc(title) + (rec ? '<small>' + this._t('ui.newRecord') + '</small>' : '') + '</div>' +
            '<div class="pe-row">' +
            (last ? '' : '<button type="button" class="pe-btn green big" data-a="next" style="flex-basis:100%">' + this._ic('play') + '<span>' + this._t('ui.next') + '</span></button>') +
            '<button type="button" class="pe-btn steel" data-a="again">' + this._ic('restart') + '<span>' + this._t('ui.again') + '</span></button>' +
            '<button type="button" class="pe-btn steel" data-a="menu">' + this._ic('home') + '<span>' + this._t('ui.menu') + '</span></button></div>';
        const act = { next: m.onNext || this.cb.onNext, again: m.onReplay || this.cb.onRestart, menu: m.onMenu || this.cb.onMenu };
        for (const b of Array.from(win.querySelectorAll('button[data-a]'))) b.addEventListener('click', (e) => {
            e.stopPropagation(); this._ui();
            const f = act[/** @type {HTMLElement} */ (b).dataset.a || '']; if (typeof f === 'function') f();
        });
        this._upgrade(win);
        const c = this.el['#complete'];
        c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
        this.flash(last ? 'win' : 'checkpoint');
        this._modal();
    },

    // ------------------------------------------------------------------ каждый кадр

    /** Подпись контекстного действия, обратный отсчёт рекламы, счётчик монет. Зовётся из своего RAF; можно и из ядра. */
    tick(dt) {
        if (!this._ready) return;
        if (this._coinT < 1) {
            this._coinT = Math.min(1, this._coinT + (dt || 0.016) / 0.5);
            const k = 1 - Math.pow(1 - this._coinT, 3);
            this.coins = Math.round(this._coinFrom + (this._coinTo - this._coinFrom) * k);
            this._num(this.coins);
        }
        if (typeof Input !== 'undefined' && Input.context !== undefined) {
            const c = Input.context;
            const on = !!c, text = c ? (c.label ? this._t(c.label) : '') : '';
            if (on !== this._ctxOn || text !== this._ctxText) {
                this._ctxOn = on; this._ctxText = text;
                this._one('ctxL').textContent = text;
                const key = typeof Input.labelOf === 'function' ? Input.labelOf('interact') : '';
                this._one('ctxKey').textContent = key || 'E';
                this.el['#ctx'].classList.toggle('on', on && !!text);
                this._relayout();
            }
        }
        if (typeof HudLayout !== 'undefined') {
            if (!this._inputStyled && typeof Input !== 'undefined' && Input._inited) {
                this._inputStyled = true;
                HudLayout.block('input-action', { w: 104, h: 104, min: 72 });
                HudLayout.block('input-stick', { w: 190, h: 190, min: 100 });
            }
            // карточка обучения — под заданием в той же полосе, не поверх него
            if (!this._tutPlaced && HudLayout._defs && HudLayout._defs.tutorial) {
                this._tutPlaced = true;
                HudLayout.block('tutorial', { order: 5 });
            }
        }
        if (this._chest) this._chestSync();
        if (this._stand) this._standSync();
    },

    /** Стиль карточки обучения (Tutorial.init({ css: GameHud.tutorialCss() })); переменные --tut-* уже заданы в :root. */
    tutorialCss() { return GAME_HUD_TUT_CSS; },
};
