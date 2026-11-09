// GameMetaUI.js — три окна «Prision Espace Parkour Master» в тюремном стиле: «Подарок дня» (передачи по дням),
// «Колесо фортуны» (тюремная рулетка) и «Рекорды» (доска лучших беглецов). Логика — DailyGift.js, Wheel.js, Platform.leaderboard();
// данные — GameRewardsData.js (DAILY_REWARDS, DAILY_EXCLUSIVE, WHEEL_SECTORS); вид предметов — GameLook.js; стили окон —
// GameHud.js (pe-plate, pe-btn, pe-stamp…) + свой <style>, который файл вставляет сам.
//
// API (ядро зовёт):
//   GameMetaUI.init({ state: { daily, wheel }, persist, onLogin, onClose, onCoins, onEvent })
//        — внутри DailyGift.init и Wheel.init (приёмник наград — Shop, поэтому после Shop.init). state — объекты из сохранения
//        игры (save.daily, save.wheel; их может не быть); persist — как у Shop (Platform.save всего объекта). После init ядро
//        пишет save.daily = DailyGift.state; save.wheel = Wheel.state (то же лежит в GameMetaUI.state).
//        onLogin() — игрок вошёл в аккаунт: ядро перечитывает сохранение; onClose() — любое из окон закрыто (вернуть меню:
//        GameHud.menu сам возвращается, но можно обновить модель); onCoins(n) — монеты изменились (обновить жетон);
//        onEvent('ui' | 'open' | 'close' | 'claim' | 'spin' | 'tick' | 'prize', данные) — для звуков и эффектов.
//   GameMetaUI.openDaily() · openWheel() · openLeaders() · close() · isOpen
//   GameMetaUI.maybeOfferDaily() — на показе меню: если DailyGift.shouldOffer() (и нет туториала) — открыть подарок и
//        markOffered(); заодно обновляет красные точки и видимость «Рекорды» (GameHud.metaBadges).
//   GameMetaUI.refreshBadges() — перерисовать точки меню (после смены дня или входа).
// Меню прячется, пока открыто окно (класс pe-meta-open на body), закрытие возвращает его. Эскейп и клик мимо — закрыть
// (колесо во время вращения не закрывается). Реклама — только rewarded по правилам DailyGift/Wheel; кнопки показывают
// «Через N с» на общей паузе между просмотрами. Строку «Score» и название площадки в интерфейсе не выводим.

const GAME_META_TEXT = {
    ru: {
        'meta.close': 'Закрыть',
        'daily.kick': 'Передачи заключённому', 'daily.title': 'Подарок дня', 'daily.claim': 'Забрать', 'daily.claimX2': '×2 за рекламу',
        'daily.got': 'Получено!', 'daily.allDone': 'Подарок на сегодня получен. Завтра ждёт следующая передача.',
        'daily.pick': 'Сегодня вам передача. Заберите её!',
        'daily.adFailed': 'Реклама не досмотрена: награда не удвоена.', 'daily.exclusive': 'Эксклюзив',
        'daily.exclusiveHint': 'Нигде больше не продаётся', 'daily.equip': 'Надеть', 'daily.equipped': 'Надето', 'daily.big': 'Крупная награда',
        'daily.today': 'Сегодня', 'daily.tomorrow': 'Завтра', 'daily.claimed': 'Получено',
        'wheel.kick': 'Тюремная рулетка', 'wheel.title': 'Колесо фортуны', 'wheel.spin': 'Крутить', 'wheel.freeShort': 'бесплатно',
        'wheel.freeInShort': 'Бесплатно через', 'wheel.adShort': 'За рекламу', 'wheel.adLeft': 'Осталось {a} из {b}',
        'wheel.banked': 'Просмотр засчитан', 'wheel.none': 'Вращения закончились', 'wheel.adFailed': 'Реклама не досмотрена: вращение не засчитано.',
        'wheel.recovered': 'Приз за прошлое вращение уже получен.', 'wheel.item': 'Предмет', 'wheel.win': 'Выигрыш!', 'wheel.spinning': 'Крутится…',
        'wheel.hint': 'Одно бесплатное вращение в день и ещё несколько за рекламу.',
        'leaders.kick': 'Доска лучших беглецов', 'leaders.title': 'Рекорды', 'leaders.empty': 'Пока нет лучших игроков',
        'leaders.loading': 'Загрузка…', 'leaders.error': 'Не удалось загрузить таблицу.', 'leaders.retry': 'Повторить',
        'leaders.login': 'Войдите в аккаунт', 'leaders.you': 'Вы', 'leaders.signHint': 'Войдите, чтобы ваш результат попал в таблицу.',
    },
    en: {
        'meta.close': 'Close',
        'daily.kick': 'Parcels for the inmate', 'daily.title': 'Daily gift', 'daily.claim': 'Claim', 'daily.claimX2': 'Watch ad ×2',
        'daily.got': 'Received!', 'daily.allDone': 'Today\'s gift is claimed. The next parcel arrives tomorrow.',
        'daily.pick': 'A parcel for you today. Claim it!',
        'daily.adFailed': 'The ad was not finished: the reward was not doubled.', 'daily.exclusive': 'Exclusive',
        'daily.exclusiveHint': 'Not sold anywhere else', 'daily.equip': 'Equip', 'daily.equipped': 'Equipped', 'daily.big': 'Big reward',
        'daily.today': 'Today', 'daily.tomorrow': 'Tomorrow', 'daily.claimed': 'Claimed',
        'wheel.kick': 'Prison roulette', 'wheel.title': 'Wheel of fortune', 'wheel.spin': 'Spin', 'wheel.freeShort': 'free',
        'wheel.freeInShort': 'Free in', 'wheel.adShort': 'Watch ad', 'wheel.adLeft': '{a} of {b} left',
        'wheel.banked': 'View counted', 'wheel.none': 'No spins left', 'wheel.adFailed': 'The ad was not finished: the spin was not counted.',
        'wheel.recovered': 'The prize for your last spin has been collected.', 'wheel.item': 'Item', 'wheel.win': 'You won!', 'wheel.spinning': 'Spinning…',
        'wheel.hint': 'One free spin a day and a few more for watching ads.',
        'leaders.kick': 'Top escapees board', 'leaders.title': 'Records', 'leaders.empty': 'No top players yet',
        'leaders.loading': 'Loading…', 'leaders.error': 'Could not load the table.', 'leaders.retry': 'Retry',
        'leaders.login': 'Sign in', 'leaders.you': 'You', 'leaders.signHint': 'Sign in to get your result on the board.',
    },
};
if (typeof LANG_STRINGS !== 'undefined') {
    // свои тексты перекрывают заготовки движка (в них «x2» латиницей), остальное добавляем как есть
    for (const code of Object.keys(GAME_META_TEXT)) Object.assign(LANG_STRINGS[code] || {}, GAME_META_TEXT[code]);
}

const GAME_META_CSS = `
body.pe-meta-open #pe-menu { display: none !important; }
.mu-modal { z-index: 41; }
.mu-modal .pe-win { width: min(780px, 100%); min-width: 0; max-width: 100%; }
.mu-modal .pe-win.mu-wheel { width: min(860px, 100%); }
.mu-modal .pe-win.mu-leaders { width: min(560px, 100%); }
.mu-x { position: absolute; right: 8px; top: 8px; z-index: 6; width: 40px; height: 40px; min-height: 40px; padding: 0; margin: 0; font-size: 22px; }
.mu-x::before, .mu-x::after { display: none; }
.mu-x[aria-disabled="true"] { opacity: .4; }
.mu-modal .pe-hd { margin: 0 -18px 2px; padding: 4px 56px 0; }
.mu-note { position: relative; padding: 8px 14px; color: var(--pe-pen); font-size: 14px; font-weight: 800; line-height: 1.25; min-height: 2.4em; display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; text-align: center;
  background: var(--pe-noise), var(--pe-paper); border: 2px solid var(--pe-ink); transform: rotate(-.4deg); box-shadow: 0 4px 0 rgba(0,0,0,.5); clip-path: polygon(0 0, 100% 2%, 99% 100%, 1% 98%); }
.mu-note .pe-mk { font-size: 1.05em; }
.mu-note b { font-weight: 900; font-variant-numeric: tabular-nums; }
.mu-note .pe-ic { width: 1.5em; height: 1.5em; }
.mu-hint { min-height: 1.1em; font-size: 13px; font-weight: 700; color: var(--pe-yel); text-shadow: 0 2px 0 #000; }
.mu-btns { display: flex; gap: 10px; align-items: flex-start; justify-content: center; flex-wrap: wrap; margin-top: 2px; }
.mu-btns .pe-btn { flex: 1 1 210px; margin-bottom: 9px; }
.mu-btns .pe-btn[hidden] { display: none; }
.mu-btns .pe-lbl .main { font-size: 1em; }
.mu-item { display: block; width: 100%; height: 100%; }
.mu-item svg, .mu-item img { width: 100%; height: 100%; display: block; object-fit: contain; pointer-events: none; -webkit-user-drag: none; filter: drop-shadow(0 3px 2px rgba(0,0,0,.45)); }

/* ---------- подарок: передачи по дням ---------- */
.mu-days { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px 12px; padding: 22px 6px 10px; }
.mu-day { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
.mu-day .tg { position: absolute; top: -17px; left: 50%; z-index: 4; padding: .08em .6em .02em; font-size: 12px; font-weight: 900; font-style: normal; text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; color: var(--pe-pen);
  background: var(--pe-noise), var(--pe-tape); border: 2px solid var(--pe-ink); box-shadow: 0 3px 0 rgba(0,0,0,.5); transform: translateX(-50%) rotate(-3deg); }
.mu-day:nth-child(2n) .tg { transform: translateX(-50%) rotate(2.5deg); }
.mu-box { position: relative; width: 100%; aspect-ratio: 1.12; display: flex; align-items: center; justify-content: center; border: 3px solid var(--pe-ink); border-radius: 2px;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, transparent 2px 6px), var(--pe-scratch), var(--pe-noise), linear-gradient(180deg, #cf9f60, #a67a40);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.18), inset 0 -6px 0 rgba(0,0,0,.18), 0 6px 0 rgba(0,0,0,.5), 0 10px 10px rgba(0,0,0,.35); }
.mu-box::before { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 19%; margin-left: -9.5%; background: var(--pe-noise), repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 2px, transparent 2px 6px), var(--pe-tape); box-shadow: 0 0 0 1px rgba(0,0,0,.3); }
.mu-box::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 3px; margin-top: -1.5px; background: rgba(60,30,10,.45); }
.mu-ico { position: relative; z-index: 2; width: 54%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; padding: 5px; background: var(--pe-noise), var(--pe-paper); border: 2px solid var(--pe-ink); transform: rotate(-4deg); box-shadow: 0 3px 0 rgba(0,0,0,.45); }
.mu-ico .pe-ic { width: 100%; height: 100%; }
.mu-ico .plus { position: absolute; left: -9px; top: -9px; width: 22px; height: 22px; border-radius: 50%; background: var(--pe-or); border: 2px solid var(--pe-ink); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; text-shadow: 0 1px 0 #000; }
.mu-amt { font-size: clamp(15px, 3.6vw, 21px); font-weight: 900; color: var(--pe-yel); text-shadow: 0 2px 0 #000; transform: rotate(-1.2deg); white-space: nowrap; line-height: 1.05; font-variant-numeric: tabular-nums; }
.mu-amt small { display: block; font-size: .56em; color: var(--pe-chalk); letter-spacing: .02em; opacity: .92; }
.mu-flag { position: absolute; z-index: 5; left: 50%; bottom: 20px; padding: .05em .6em; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; color: #1b1d21; white-space: nowrap; background: var(--pe-noise), var(--pe-yel); border: 2px solid var(--pe-ink); transform: translateX(-50%) rotate(-5deg); box-shadow: 0 3px 0 rgba(0,0,0,.5); }
.mu-stamp { position: absolute; z-index: 5; left: 50%; top: 32%; padding: .04em .4em; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; color: #c2332a; background: rgba(233,227,207,.94); border: 3px double currentColor; transform: translateX(-50%) rotate(-12deg); filter: url(#pe-ink); pointer-events: none; }
.mu-lock { position: absolute; z-index: 5; right: -4px; top: -4px; width: 30px; height: 30px; padding: 4px; color: #1b1d21; background: var(--pe-noise), #c9a24a; border: 2px solid var(--pe-ink); border-radius: 50%; box-shadow: 0 3px 0 rgba(0,0,0,.5); display: none; }
.mu-lock .pe-ic { width: 100%; height: 100%; }
.mu-day.st-claimed .mu-box { filter: brightness(.62) saturate(.8); }
.mu-day.st-claimed .mu-amt { opacity: .6; }
.mu-day.st-locked .mu-box { filter: brightness(.8) saturate(.75); }
.mu-day.st-locked .mu-lock { display: block; }
.mu-day.st-tomorrow .mu-flag { background: var(--pe-steel); color: var(--pe-chalk); }
.mu-day.st-today { transform: translateY(-3px); }
.mu-day.st-today .mu-box { box-shadow: 0 0 0 3px var(--pe-yel), 0 0 22px 5px rgba(242,194,48,.65), 0 6px 0 rgba(0,0,0,.5), 0 10px 10px rgba(0,0,0,.35); animation: mu-glow .7s steps(3) infinite alternate; }
.mu-day.st-today .tg { background: var(--pe-yel); }
.mu-day.ex { grid-column: 1 / -1; align-items: stretch; margin-top: 6px; }
.mu-exbox { position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 16px 14px 12px; text-align: left; border: 3px solid var(--pe-ink); border-radius: 3px;
  background: var(--pe-bolt) left 5px top 5px / 9px 9px no-repeat, var(--pe-bolt) right 5px top 5px / 9px 9px no-repeat, var(--pe-bolt) left 5px bottom 5px / 9px 9px no-repeat, var(--pe-bolt) right 5px bottom 5px / 9px 9px no-repeat,
    radial-gradient(ellipse at 18% 50%, rgba(255,214,110,.34), transparent 62%), var(--pe-scratch), var(--pe-noise), linear-gradient(180deg, #4a4130, #2b2820);
  box-shadow: inset 0 0 0 3px #b8861a, inset 0 0 0 5px var(--pe-ink), 0 6px 0 rgba(0,0,0,.5), 0 10px 12px rgba(0,0,0,.4); }
.mu-exico { flex: 0 0 auto; width: clamp(72px, 20vw, 112px); aspect-ratio: 1; padding: 6px; background: radial-gradient(circle, rgba(255,226,140,.5), transparent 72%); animation: pe-bob 1.6s steps(2) infinite; }
.mu-extx { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.mu-extx .rar { align-self: flex-start; padding: 1px 9px; font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: var(--pe-ink); background: var(--pe-yel); transform: rotate(-2deg); }
.mu-extx .nm { font-size: clamp(17px, 3.6vw, 24px); font-weight: 900; text-transform: uppercase; letter-spacing: .03em; color: var(--pe-yel); text-shadow: 0 2px 0 #000; line-height: 1.05; }
.mu-extx .hn { font-size: 12px; font-weight: 700; color: var(--pe-chalk); opacity: .85; }
.mu-day.ex.st-claimed .mu-exbox { filter: brightness(.7); }
.mu-day.ex.st-today .mu-exbox { box-shadow: inset 0 0 0 3px #ffe58a, inset 0 0 0 5px var(--pe-ink), 0 0 22px 5px rgba(242,194,48,.65), 0 6px 0 rgba(0,0,0,.5); }
.mu-day.ex .mu-stamp { top: 38%; font-size: 18px; }
.mu-day.ex .mu-flag { bottom: auto; top: -12px; left: auto; right: 22px; transform: rotate(4deg); }
.mu-day.ex .tg { left: 26px; transform: rotate(-3deg); }
.mu-day.ex.st-locked .mu-lock, .mu-day.ex.st-tomorrow .mu-lock { display: block; right: 14px; top: 14px; }
.mu-got { display: flex; align-items: center; justify-content: center; gap: 8px 14px; flex-wrap: wrap; width: 100%; }
.mu-got .stp { padding: .04em .5em; font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #178a42; border: 3px double currentColor; transform: rotate(-5deg); filter: url(#pe-ink); }
.mu-got .gi { display: inline-flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 900; }
.mu-got .gi .mu-item, .mu-got .gi .pe-ic { width: 34px; height: 34px; }
.mu-got .pe-btn { min-height: 38px; padding: 2px 14px; font-size: 14px; margin: 0; }
@keyframes mu-glow { from { filter: brightness(1); } to { filter: brightness(1.14); } }
@media (min-width: 620px) and (min-height: 461px) { .mu-days { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 26px 10px; } .mu-amt { font-size: clamp(14px, 2vw, 18px); } .mu-flag { font-size: 10px; bottom: 16px; } }

/* ---------- колесо: тюремная рулетка ---------- */
.mu-wbody { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.mu-disc { --ds: min(88vw, 50vh, 400px); position: relative; width: var(--ds); height: var(--ds); flex: 0 0 auto; margin-top: calc(var(--ds) * .2); filter: drop-shadow(0 10px 8px rgba(0,0,0,.5)); }
.mu-disc svg.wh { display: block; width: 100%; height: 100%; overflow: visible; }
.mu-disc .rot { transform-origin: 210px 210px; will-change: transform; }
.mu-disc .sec path.pl { transition: none; }
.mu-disc .sec.win path.pl { stroke: #fff6c8; stroke-width: 5; animation: pe-blink .35s steps(2) infinite; }
.mu-disc text { font-family: var(--pe-font); font-weight: 900; }
.mu-baton { position: absolute; z-index: 3; left: 50%; top: calc(var(--ds) * -.19); width: calc(var(--ds) * .085); margin-left: calc(var(--ds) * -.0425); transform-origin: 50% 12%; filter: drop-shadow(0 4px 2px rgba(0,0,0,.5)); pointer-events: none; }
.mu-baton svg { display: block; width: 100%; height: auto; }
.mu-ctl { display: flex; flex-direction: column; gap: 6px; align-items: stretch; width: min(100%, 360px); }
.mu-ctl .pe-btn { margin-bottom: 9px; }
.mu-lever .lv { width: 1.9em; height: 1.9em; flex: 0 0 auto; overflow: visible; }
.mu-lever .lv .stick { transform-origin: 20px 30px; transform: rotate(-38deg); }
.mu-lever.pulled .lv .stick { transform: rotate(38deg); }
.mu-lever .pe-lbl { align-items: flex-start; text-align: left; }
.mu-lever .big-t { font-size: 1.06em; }
.mu-prize { margin: 0; }
.mu-prize.on { animation: pe-slam .28s steps(7); }
.mu-prize .pi { display: inline-flex; align-items: center; gap: 8px; }
.mu-prize .pi .mu-item, .mu-prize .pi .pe-ic { width: 38px; height: 38px; }
.mu-prize .stp { color: #a8650a; }
@media (min-width: 520px) and (max-height: 560px) {
  .mu-wbody { flex-direction: row; justify-content: center; align-items: center; gap: 18px; }
  .mu-disc { --ds: min(62vh, 46vw, 340px); }
}
@media (min-width: 760px) and (min-height: 561px) {
  .mu-wbody { flex-direction: row; justify-content: center; align-items: center; gap: 22px; }
  .mu-disc { --ds: min(48vw, 62vh, 420px); }
}

/* ---------- рекорды: доска лучших беглецов ---------- */
.mu-board { position: relative; margin: 4px -4px 0; padding: 14px; border: 6px solid #5c3d1f; border-radius: 4px;
  background: var(--pe-noise), radial-gradient(circle at 20% 30%, rgba(255,230,180,.16) 0 2px, transparent 3px) 0 0 / 22px 22px, radial-gradient(circle at 70% 60%, rgba(60,30,10,.28) 0 2px, transparent 3px) 0 0 / 17px 17px, radial-gradient(ellipse at 50% 0, rgba(255,235,190,.2), transparent 70%), #b9854d;
  box-shadow: inset 0 0 0 2px rgba(0,0,0,.4), inset 0 6px 14px rgba(40,20,5,.5), 0 6px 0 rgba(0,0,0,.5), 0 10px 14px rgba(0,0,0,.4); }
.mu-board, .mu-list { min-width: 0; }
.mu-list { display: flex; flex-direction: column; gap: 12px; max-height: min(52vh, 420px); overflow-y: auto; padding: 4px 4px 8px; scrollbar-width: thin; scrollbar-color: #5c3d1f transparent; }
.mu-card { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 12px 8px 8px; text-align: left; color: var(--pe-pen); background: var(--pe-noise), var(--pe-paper); border: 2px solid var(--pe-ink); box-shadow: 0 4px 0 rgba(0,0,0,.45); transform: rotate(var(--r, -.6deg)); flex: 0 0 auto; }
.mu-card:nth-child(2n) { --r: .7deg; } .mu-card:nth-child(3n) { --r: -1deg; }
.mu-card::before { content: ''; position: absolute; left: 50%; top: -7px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ff9a8f, #c0261c 70%); border: 2px solid var(--pe-ink); box-shadow: 0 3px 0 rgba(0,0,0,.4); }
.mu-card.me { background: var(--pe-noise), #f3e3a0; box-shadow: 0 0 0 3px var(--pe-yel), 0 4px 0 3px rgba(0,0,0,.45); }
.mu-card .rk { flex: 0 0 auto; min-width: 2.1em; height: 2.1em; padding: 0 .3em; display: inline-flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--pe-chalk); background: var(--pe-steel); border: 2px solid var(--pe-ink); border-radius: 50%; text-shadow: 0 2px 0 #000; }
.mu-card.r1 .rk { background: radial-gradient(circle at 35% 30%, #ffe9a6, #d9a93e 60%, #9a6f1f); color: #4a3208; text-shadow: none; }
.mu-card.r2 .rk { background: radial-gradient(circle at 35% 30%, #f4f6f9, #aab0ba 60%, #6d7480); color: #23262b; text-shadow: none; }
.mu-card.r3 .rk { background: radial-gradient(circle at 35% 30%, #f0b27a, #b86a2c 60%, #6e3a12); color: #2b1606; text-shadow: none; }
.mu-ph { flex: 0 0 auto; width: 44px; height: 52px; padding: 3px 3px 9px; background: #fbf8ee; border: 1px solid #8a8472; box-shadow: 0 2px 0 rgba(0,0,0,.35); transform: rotate(-3deg); }
.mu-ph .im { display: block; width: 100%; height: 100%; background: #cfc8b0 center / cover no-repeat; }
.mu-ph .im svg { width: 100%; height: 100%; display: block; }
.mu-card .nm { flex: 1 1 auto; min-width: 0; font-size: 17px; font-weight: 800; color: #1a2d5a; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mu-card .sc { white-space: nowrap; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--pe-pen); }
.mu-card .sc .pe-ic { width: 1.1em; height: 1.1em; color: #a8650a; }
.mu-card .you { position: absolute; right: -6px; top: -12px; padding: 0 .5em; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; color: #1b1d21; background: var(--pe-noise), var(--pe-yel); border: 2px solid var(--pe-ink); transform: rotate(5deg); box-shadow: 0 2px 0 rgba(0,0,0,.5); }
.mu-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 12px; margin: 6px 14px; text-align: center; font-size: 17px; font-weight: 800; color: var(--pe-pen); background: var(--pe-noise), var(--pe-paper); border: 2px solid var(--pe-ink); box-shadow: 0 4px 0 rgba(0,0,0,.45); transform: rotate(-.8deg); position: relative; }
.mu-state::before { content: ''; position: absolute; left: 50%; top: -8px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ff9a8f, #c0261c 70%); border: 2px solid var(--pe-ink); }
.mu-state .pe-ic { width: 44px; height: 44px; color: #7a5a1e; }
.mu-state.load .pe-ic { animation: pe-bob .8s steps(2) infinite; }
.mu-state .pe-btn { margin: 0; min-height: 44px; font-size: 16px; }
.mu-sub { font-size: 12px; opacity: .8; margin: 0; }
@media (max-width: 480px) {
  .mu-card { display: grid; grid-template-columns: auto auto minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 10px; row-gap: 0; align-items: center; }
  .mu-card .rk { grid-row: 1 / 3; } .mu-card .mu-ph { grid-row: 1 / 3; } .mu-card .nm { grid-column: 3; grid-row: 1; align-self: end; } .mu-card .sc { grid-column: 3; grid-row: 2; align-self: start; }
  .mu-board { padding: 10px; } .mu-modal .pe-win { padding-left: 12px; padding-right: 12px; } .mu-modal .pe-hd { margin: 0 -12px 2px; }
}
@media (min-width: 600px) {
  .mu-modal .pe-win.mu-leaders { width: min(740px, 100%); }
  .mu-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; align-content: start; }
}
@media (max-height: 460px) and (orientation: landscape) {
  .mu-modal { padding: 6px; }
  .mu-modal .pe-win { gap: 5px; padding-bottom: 8px; }
  .mu-modal .pe-hd { padding: 0 52px; margin-bottom: 0; } .mu-modal .pe-kick { display: none; } .mu-modal .pe-title { font-size: 22px; }
  .mu-x { width: 34px; height: 34px; min-height: 34px; right: 6px; top: 6px; font-size: 18px; }
  .mu-modal .pe-btn { min-height: 44px; font-size: 16px; padding: 2px 12px; margin-bottom: 8px; }
  .mu-days { grid-template-columns: repeat(6, minmax(0, 1fr)) minmax(0, 1.9fr); gap: 16px 6px; padding: 16px 2px 4px; }
  .mu-day .tg { font-size: 9px; top: -13px; } .mu-day { gap: 3px; }
  .mu-box { aspect-ratio: 1.05; } .mu-ico { padding: 3px; } .mu-ico .plus { width: 16px; height: 16px; font-size: 11px; left: -6px; top: -6px; }
  .mu-amt { font-size: 13px; } .mu-flag { font-size: 8px; bottom: 12px; padding: 0 .3em; } .mu-stamp { font-size: 8px; border-width: 2px; top: 30%; } .mu-lock { width: 20px; height: 20px; padding: 2px; right: -3px; top: -3px; }
  .mu-day.ex { grid-column: auto; margin-top: 0; }
  .mu-exbox { flex-direction: column; justify-content: center; text-align: center; padding: 8px 4px 6px; gap: 2px; height: 100%; }
  .mu-exico { width: min(60px, 80%); } .mu-extx { align-items: center; } .mu-extx .rar { display: none; } .mu-extx .nm { font-size: 11px; } .mu-extx .hn { display: none; }
  .mu-day.ex .mu-flag { display: none; } .mu-day.ex .mu-stamp { font-size: 9px; } .mu-day.ex .tg { left: 50%; transform: translateX(-50%) rotate(-3deg); }
  .mu-note { padding: 4px 10px; font-size: 12px; min-height: 0; } .mu-hint { font-size: 11px; min-height: 0; }
  .mu-btns { gap: 8px; flex-wrap: nowrap; } .mu-btns .pe-btn { flex: 1 1 0; min-width: 0; } .mu-btns .pe-btn small { font-size: .5em; }
  .mu-wbody { gap: 14px; } .mu-ctl { gap: 3px; width: min(100%, 320px); }
  .mu-board { padding: 8px; border-width: 5px; } .mu-list { max-height: 44vh; gap: 10px; }
  .mu-card { padding: 5px 10px 5px 6px; } .mu-card .nm { font-size: 15px; } .mu-card .sc { font-size: 16px; }
  .mu-state { padding: 10px; font-size: 15px; gap: 6px; } .mu-state .pe-ic { width: 32px; height: 32px; }
}
`;

/** Простой запасной значок «заключённый» для карточки без аватара. */
const GAME_META_MUG = '<svg viewBox="0 0 44 50" aria-hidden="true"><rect width="44" height="50" fill="#cfc8b0"/><path d="M4 50 V40 q0 -8 10 -9 h16 q10 1 10 9 V50Z" fill="#f07d1e" stroke="#14161a" stroke-width="2"/><rect x="14" y="10" width="16" height="19" fill="#e3b88e" stroke="#14161a" stroke-width="2"/><rect x="14" y="10" width="16" height="5" fill="#3a2a1c"/><rect x="18" y="19" width="3" height="2.4" fill="#14161a"/><rect x="25" y="19" width="3" height="2.4" fill="#14161a"/><rect x="19" y="25" width="7" height="1.6" fill="#14161a"/></svg>';

/** @satisfies {Record<string, any>} */
const GameMetaUI = {
    /** @type {any} */ cfg: {},
    /** Состояния для сохранения: ядро кладёт их в save.daily и save.wheel. @type {{ daily: any, wheel: any }} */
    state: { daily: null, wheel: null },
    inited: false,
    /** Какое окно открыто: '' | 'daily' | 'wheel' | 'leaders'. */
    cur: '',
    /** @type {Record<string, HTMLElement>} */ els: {},
    /** @type {any} */ _timer: null,
    _busy: false,
    /** @type {any} */ _got: null,
    /** @type {any} */ _prize: null,
    _msg: '',
    _angle: 0,
    _spinning: false,
    /** @type {any} */ _anim: null,
    _lbBusy: false,
    /** @type {any} */ _lb: null,
    _lbAt: 0,
    _lbProbeAt: 0,
    /** Таблица рекордов доступна (Platform.leaderboard() не вернул null). */
    hasLeaders: false,
    /** @type {any} */ _recovered: null,
    _recShown: false,
    /** @type {any} */ _winIdx: null,
    /** @type {any} */ _secs: null,
    _lbState: '',
    _loginBusy: false,

    get isOpen() { return !!this.cur; },

    // ------------------------------------------------------------------ тексты и мелочи

    t(key, p) { return typeof Lang !== 'undefined' ? Lang.t(key, p) : key; },
    _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); },
    _ic(name, svg) { return typeof GameHud !== 'undefined' ? GameHud._ic(name, svg) : '<span class="pe-ic"></span>'; },
    _ev(name, d) { try { if (typeof this.cfg.onEvent === 'function') this.cfg.onEvent(name, d || {}); } catch (e) { /* звук необязателен */ } },
    _sink() { return typeof Shop !== 'undefined' && Shop.state ? Shop : null; },
    _coins() { try { if (typeof this.cfg.onCoins === 'function') this.cfg.onCoins(this._sink() ? Shop.coins : 0); } catch (e) { console.warn('GameMetaUI: onCoins:', e); } },
    _num(n) { return Math.round(Number(n) || 0).toLocaleString(typeof Lang !== 'undefined' && Lang.code === 'en' ? 'en-US' : 'ru-RU'); },
    _reduced() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } },

    /** Записать html в элемент, только если он изменился (не пересоздавать картинки и анимации каждую секунду). */
    _put(el, html) {
        const e = /** @type {any} */ (el);
        if (e.__h === html) return false;
        e.__h = html; el.innerHTML = html;
        if (typeof GameHud !== 'undefined') GameHud._upgrade(el);
        this._items(el);
        return true;
    },

    /** Иконка предмета магазина: процедурный SVG (GameLook.icon), растр Codex подменяет его, когда файл найден. */
    _itemIcon(id) {
        let svg = '';
        try { svg = typeof GameLook !== 'undefined' ? GameLook.icon(id).svg : ''; } catch (e) { svg = ''; }
        return '<span class="mu-item" data-item="' + this._esc(id) + '">' + svg + '</span>';
    },

    _items(root) {
        for (const el of Array.from(root.querySelectorAll('.mu-item[data-item]'))) {
            const h = /** @type {HTMLElement} */ (el), id = h.dataset.item || '';
            const path = (typeof GAME_HUD_ART !== 'undefined' ? GAME_HUD_ART.itemsDir : 'assets/ui/items/') + id + '.webp';
            if (!id || h.dataset.up === path || typeof GameHud === 'undefined') continue;
            h.dataset.up = path;
            GameHud._probe(path, (ok) => { if (ok) h.innerHTML = '<img alt="" draggable="false" src="' + path + '">'; });
        }
    },

    // ------------------------------------------------------------------ запуск

    init(cfg) {
        this.cfg = cfg || {};
        const st = this.cfg.state || {};
        const sink = this._sink();
        const persist = this.cfg.persist;
        if (typeof DailyGift !== 'undefined') {
            DailyGift.init({ rewards: typeof DAILY_REWARDS !== 'undefined' ? DAILY_REWARDS : [], exclusive: typeof DAILY_EXCLUSIVE !== 'undefined' ? DAILY_EXCLUSIVE : undefined, rewardsSink: sink, state: st.daily, persist });
            this.state.daily = DailyGift.state;
        }
        if (typeof Wheel !== 'undefined') {
            Wheel.init({ sectors: typeof WHEEL_SECTORS !== 'undefined' ? WHEEL_SECTORS : [], rewardsSink: sink, state: st.wheel, persist, onChange: (e) => { if (e.type === 'prize' && e.recovered) this._recovered = e; } });
            this.state.wheel = Wheel.state;
        }
        if (typeof document === 'undefined') return this;
        if (!this.inited) {
            this.inited = true;
            const style = document.createElement('style');
            style.id = 'pe-meta-css'; style.textContent = GAME_META_CSS;
            document.head.appendChild(style);
            this._build();
            window.addEventListener('lory-language', () => { if (this.cur) this._renderAll(true); });
            if (typeof Platform !== 'undefined' && typeof Platform.onRewardedCooldown === 'function') Platform.onRewardedCooldown(() => { if (this.cur) this._renderAll(); });
        }
        if (this._recovered) this._coins();
        this.refreshBadges();
        this._probeLeaders(true);
        return this;
    },

    _build() {
        const holder = document.createElement('div');
        holder.className = 'pe-root';
        const x = '<button type="button" class="pe-btn steel mu-x" data-k="x" aria-label="' + this.t('meta.close') + '">×</button>';
        holder.innerHTML =
            '<div class="pe-modal mu-modal" id="pe-daily"><div class="pe-win pe-plate mu-daily" data-k="win">' + x +
            '<div class="pe-hd"><div class="pe-kick">' + this.t('daily.kick') + '</div><h2 class="pe-title pe-sten">' + this.t('daily.title') + '</h2></div>' +
            '<div class="mu-days" data-k="days"></div><div class="mu-note" data-k="note"></div><div class="mu-hint" data-k="hint"></div>' +
            '<div class="mu-btns"><button type="button" class="pe-btn green big" data-k="claim"></button><button type="button" class="pe-btn yel" data-k="x2"></button></div></div></div>' +

            '<div class="pe-modal mu-modal" id="pe-wheel"><div class="pe-win pe-plate mu-wheel" data-k="win">' + x +
            '<div class="pe-hd"><div class="pe-kick">' + this.t('wheel.kick') + '</div><h2 class="pe-title pe-sten">' + this.t('wheel.title') + '</h2></div>' +
            '<div class="mu-wbody"><div class="mu-disc" data-k="disc"><div class="mu-baton" data-k="baton"></div><div data-k="wheelBox"></div></div>' +
            '<div class="mu-ctl"><div class="mu-note mu-prize" data-k="prize"></div><div class="mu-hint" data-k="hint"></div>' +
            '<button type="button" class="pe-btn hot big mu-lever" data-k="spin"></button><button type="button" class="pe-btn yel" data-k="spinAd"></button></div></div></div></div>' +

            '<div class="pe-modal mu-modal" id="pe-leaders"><div class="pe-win pe-plate mu-leaders" data-k="win">' + x +
            '<div class="pe-hd"><div class="pe-kick">' + this.t('leaders.kick') + '</div><h2 class="pe-title pe-sten">' + this.t('leaders.title') + '</h2></div>' +
            '<div class="mu-board"><div class="mu-list" data-k="list"></div><div data-k="state"></div></div>' +
            '<div class="mu-hint" data-k="hint"></div>' +
            '<div class="mu-btns"><button type="button" class="pe-btn hot big" data-k="login" hidden></button></div></div></div>';
        while (holder.firstChild) {
            const m = /** @type {HTMLElement} */ (holder.firstChild);
            document.body.appendChild(m);
            const key = m.id.replace('pe-', '');
            for (const e of Array.from(m.querySelectorAll('[data-k]'))) this.els[key + '.' + /** @type {HTMLElement} */ (e).dataset.k] = /** @type {HTMLElement} */ (e);
            this.els[key] = m;
            m.addEventListener('click', (e) => { if (e.target === m) this.close(); });
        }
        const on = (k, fn) => { const b = this.els[k]; if (b) b.addEventListener('click', (e) => { e.stopPropagation(); if (b.getAttribute('aria-disabled') === 'true') return; fn(); }); };
        for (const w of ['daily', 'wheel', 'leaders']) on(w + '.x', () => this.close());
        on('daily.claim', () => this._claim(false));
        on('daily.x2', () => this._claim(true));
        on('wheel.spin', () => this._spin(false));
        on('wheel.spinAd', () => this._spin(true));
        on('leaders.login', () => this._login());
        this.els['wheel.baton'].innerHTML = this._batonSvg();
    },

    // ------------------------------------------------------------------ открыть и закрыть

    _open(which) {
        if (!this.inited) return;
        if (this.cur && this.cur !== which) this.close(true);
        if (this.cur === which) return;
        this.cur = which;
        this._busy = false; this._msg = ''; this._got = null; this._prize = null; this._winIdx = null; this._secs = null; this._lbState = '';
        if (which === 'wheel' && typeof Wheel !== 'undefined' && Wheel.state.pending) { const fin = Wheel.finish(); if (fin && fin.ok) { this._prize = fin; this._coins(); } }
        document.body.classList.add('pe-meta-open');
        const m = this.els[which];
        m.classList.remove('on'); void m.offsetWidth; m.classList.add('on');
        const win = this.els[which + '.win'];
        win.style.animation = 'none'; void win.offsetWidth; win.style.animation = '';
        this._renderAll(true);
        this._timer = setInterval(() => this._renderAll(), 500);
        this._ev('open', { what: which });
    },

    /** Закрыть открытое окно. silent — без onClose (переключение между окнами). Во время вращения колеса не закрывается. */
    close(silent) {
        if (!this.cur) return;
        if (this._spinning && !silent) return;
        const which = this.cur;
        this.cur = '';
        this.els[which].classList.remove('on');
        document.body.classList.remove('pe-meta-open');
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        this._lbBusy = false;
        this._ev('close', { what: which });
        this.refreshBadges();
        if (silent) return;
        if (typeof GameHud !== 'undefined') GameHud._modal();
        try { if (typeof this.cfg.onClose === 'function') this.cfg.onClose(); } catch (e) { console.warn('GameMetaUI: onClose:', e); }
    },

    openDaily() { this._open('daily'); },
    openWheel() { this._open('wheel'); },
    openLeaders() { this._open('leaders'); },

    /** На показе меню: подарок сам открывается один раз в день (не во время туториала), заодно обновляются точки. */
    maybeOfferDaily() {
        if (!this.inited) return;
        this.refreshBadges();
        this._probeLeaders(false);
        if (this.cur || typeof DailyGift === 'undefined') return;
        try { if (DailyGift.shouldOffer()) { this.openDaily(); DailyGift.markOffered(); } } catch (e) { console.warn('GameMetaUI: maybeOfferDaily:', e); }
    },

    /** Красные точки меню: подарок можно забрать, бесплатное вращение готово; «Рекорды» — только если таблица есть. */
    refreshBadges() {
        if (typeof GameHud === 'undefined' || !GameHud.metaBadges) return;
        let daily = 0, wheel = 0;
        try { daily = typeof DailyGift !== 'undefined' ? DailyGift.badge() : 0; } catch (e) { /* нет */ }
        try { wheel = typeof Wheel !== 'undefined' ? Wheel.badge() : 0; } catch (e) { /* нет */ }
        GameHud.metaBadges({ daily: daily > 0, wheel: wheel > 0, leaders: this.hasLeaders });
    },

    /** Есть ли лидерборд у площадки: запрос не чаще раза в минуту (лимит площадки), результат кэшируется. */
    async _probeLeaders(force) {
        if (typeof Platform === 'undefined' || typeof Platform.leaderboard !== 'function') return;
        const now = Date.now();
        if (!force && now - this._lbProbeAt < 60000) return;
        this._lbProbeAt = now;
        try {
            const list = await Platform.leaderboard({ avatarSize: 'medium' });
            if (Array.isArray(list)) { this._lb = list; this._lbAt = Date.now(); }
            this.hasLeaders = Array.isArray(list);
        } catch (e) { /* оставляем как было */ }
        this.refreshBadges();
    },

    _renderAll(force) {
        if (!this.cur) return;
        if (this.cur === 'daily') this._renderDaily(force);
        else if (this.cur === 'wheel') this._renderWheel(force);
        else this._renderLeaders(force);
    },

    // ================================================================== подарок

    _dayAmount(d) {
        const r = d.reward || {};
        let main = '', sub = '';
        if (r.coins > 0) main = '+' + this._num(r.coins);
        if (r.item) sub = this._esc(DailyGift.itemName(r.item));
        if (r.randomItems > 0) sub = '+ ' + this.t('wheel.item').toLowerCase();
        return '<span class="mu-amt">' + main + (sub ? '<small>' + sub + '</small>' : '') + '</span>';
    },

    _dayIcon(d) {
        const r = d.reward || {};
        if (r.item) return this._itemIcon(r.item);
        const pile = r.coins >= 150;
        return this._ic(pile ? 'coins_pile' : 'coin', 'coin') + (r.randomItems > 0 ? '<i class="plus">?</i>' : '');
    },

    _renderDaily(force) {
        const v = DailyGift.view();
        const days = v.days;
        let html = '';
        for (const d of days) {
            const flag = d.state === 'today' ? '<i class="mu-flag">' + this.t('daily.today') + '</i>' : d.state === 'tomorrow' ? '<i class="mu-flag">' + this.t('daily.tomorrow') + '</i>' : '';
            const stamp = d.state === 'claimed' ? '<i class="mu-stamp">' + this.t('daily.claimed') + '</i>' : '';
            const lock = '<i class="mu-lock">' + this._ic('lock') + '</i>';
            if (d.exclusive) {
                const r = d.reward || {};
                const skin = r.exclusive || '';
                let body;
                if (skin) {
                    let rar = this.t('daily.exclusive');
                    body = '<div class="mu-exico">' + this._itemIcon(skin) + '</div><div class="mu-extx"><span class="rar">' + this._esc(rar) + '</span><b class="nm">' + this._esc(DailyGift.itemName(skin)) +
                        '</b><span class="hn">' + this.t('daily.exclusiveHint') + '</span></div>';
                } else {
                    body = '<div class="mu-exico">' + this._ic('coins_pile', 'coin') + '</div><div class="mu-extx"><span class="rar">' + this.t('daily.big') + '</span><b class="nm">+' + this._num(r.coins) + '</b></div>';
                }
                html += '<div class="mu-day ex st-' + d.state + '" title="' + this._esc(d.label) + '"><i class="tg">' + this._esc(d.dayLabel) + '</i><div class="mu-exbox">' + body + '</div>' + flag + stamp + lock + '</div>';
            } else {
                html += '<div class="mu-day st-' + d.state + '" title="' + this._esc(d.label) + '"><i class="tg">' + this._esc(d.dayLabel) + '</i><div class="mu-box"><span class="mu-ico">' + this._dayIcon(d) + '</span>' + flag + stamp + lock + '</div>' + this._dayAmount(d) + '</div>';
            }
        }
        this._put(this.els['daily.days'], html);

        // записка: что получено / когда следующий подарок
        const note = this.els['daily.note'];
        if (this._got) this._put(note, this._gotHtml(this._got, 'daily'));
        else this._put(note, '<span class="pe-mk">' + this._esc(v.canClaim ? this.t('daily.pick') : (v.nextLabel || this.t('daily.allDone'))) + '</span>');
        if (this._got) this._bindGot(note);
        if (this._got && !v.canClaim) { /* оставляем записку с наградой; время до следующего — в подсказке */ }

        // кнопки
        const claim = this.els['daily.claim'], x2 = this.els['daily.x2'];
        const busy = this._busy;
        const claimOff = !v.claim.enabled || busy;
        this._put(claim, v.claim.enabled ? this._ic('check') + '<span>' + this._esc(v.claim.label) + '</span>' : '<span>' + this.t('daily.claimed') + '</span>');
        claim.setAttribute('aria-disabled', String(claimOff));
        claim.className = 'pe-btn big ' + (v.claim.enabled ? 'green' : 'steel');
        x2.hidden = !v.x2.available;
        const x2Sub = v.x2.adWait > 0 ? this.t('daily.adIn', { n: v.x2.adWait }) : (v.x2.available ? this._x2Sub(v) : '');
        this._put(x2, this._ic('ad') + '<span class="pe-lbl"><span class="main">' + this._esc(this.t('daily.claimX2')) + '</span>' + (x2Sub ? '<small>' + this._esc(x2Sub) + '</small>' : '') + '</span>');
        x2.setAttribute('aria-disabled', String(!v.x2.enabled || busy));
        let hint = this._msg || (v.x2.adWait > 0 ? '' : v.x2.hint) || '';
        if (this._got && !v.canClaim && v.nextLabel) hint = v.nextLabel;
        this.els['daily.hint'].textContent = hint;
    },

    /** Коротко, что даст удвоение: «+760 + предмет ×2». */
    _x2Sub(v) {
        const d = v.days.find((x) => x.state === 'today');
        if (!d) return '';
        const r = d.reward || {};
        return (r.coins > 0 ? '+' + this._num(r.coins * 2) : '') + (r.randomItems > 0 ? (r.coins > 0 ? ' + ' : '') + this.t('wheel.item').toLowerCase() + ' ×2' : '');
    },

    /** Разметка записки «Получено»: что выдано. */
    _gotHtml(g, kind) {
        let items = '';
        let equip = '';
        for (const it of g.got || []) {
            if (it.type === 'coins') {
                const txt = it.converted ? (typeof Lang !== 'undefined' ? Lang.t('reward.dup', { n: it.amount }) : '+' + it.amount) : '+' + this._num(it.amount);
                items += '<span class="gi">' + this._ic(it.amount >= 150 ? 'coins_pile' : 'coin', 'coin') + '<b>' + this._esc(txt) + '</b></span>';
            } else if (it.id) {
                const name = typeof Shop !== 'undefined' ? Shop.name(it.id) : it.id;
                items += '<span class="gi">' + this._itemIcon(it.id) + '<b>' + this._esc(name) + '</b></span>';
                if (!equip) equip = it.id;
            }
        }
        const eq = equip && this._sink() ? '<button type="button" class="pe-btn green" data-equip="' + this._esc(equip) + '">' + this.t(Shop.isEquipped(equip) ? 'daily.equipped' : 'daily.equip') + '</button>' : '';
        const head = kind === 'wheel' ? this.t('wheel.win') : this.t('daily.got');
        return '<div class="mu-got"><span class="stp">' + this._esc(head) + '</span>' + items + eq + '</div>';
    },

    _bindGot(root) {
        for (const b of Array.from(root.querySelectorAll('button[data-equip]'))) {
            const h = /** @type {HTMLElement} */ (b);
            if (/** @type {any} */ (h).__b) continue;
            /** @type {any} */ (h).__b = 1;
            h.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = h.dataset.equip || '';
                if (typeof Shop === 'undefined' || !id || Shop.isEquipped(id)) return;
                Shop.equip(id);
                this._ev('ui', { what: 'equip' });
                (/** @type {any} */ (root)).__h = '';
                this._renderAll(true);
            });
        }
    },

    async _claim(double) {
        if (this._busy || typeof DailyGift === 'undefined') return;
        this._msg = '';
        let r;
        if (double) {
            this._busy = true; this._renderDaily();
            try { r = await DailyGift.claimX2(); } catch (e) { r = { ok: false, reason: 'adFailed' }; }
            this._busy = false;
        } else {
            r = DailyGift.claim();
        }
        if (r && r.ok) {
            this._got = r;
            this._ev('claim', { day: r.day, mult: r.mult, got: r.got, exclusive: r.day === DailyGift.cycleDays() });
            this._coins();
        } else if (r && r.reason === 'adFailed') this._msg = this.t('daily.adFailed');
        else if (r && (r.reason === 'cooldown' || r.reason === 'adUnavailable')) this._msg = this.t('daily.adUnavailable');
        this.refreshBadges();
        if (this.cur === 'daily') this._renderDaily(true);
    },

    // ================================================================== колесо

    _batonSvg() {
        return '<svg viewBox="0 0 40 120" aria-hidden="true"><path d="M13 6 Q20 0 27 6 L27 86 Q27 96 24 108 Q20 118 16 108 Q13 96 13 86 Z" fill="#1d1f24" stroke="#14161a" stroke-width="3" stroke-linejoin="round"/>' +
            '<rect x="13" y="22" width="14" height="6" fill="#f2c230"/><rect x="13" y="34" width="14" height="3.4" fill="#f2c230"/><path d="M16 8 V84" stroke="#6b7280" stroke-width="1.8" opacity=".55"/>' +
            '<path d="M16.5 98 Q20 118 23.5 98 Z" fill="#e2453c"/><circle cx="20" cy="13" r="3.2" fill="#0c0d10" stroke="#6b7280" stroke-width="1.2"/></svg>';
    },

    /** Диск: восемь секторов-табличек с заклёпками, номиналы и иконки предметов. Рисуется один раз на открытие и смену языка. */
    _wheelSvg(secs) {
        const n = secs.length, step = 360 / n, C = 210;
        const pt = (r, deg) => { const a = deg * Math.PI / 180; return [(C + r * Math.sin(a)).toFixed(1), (C - r * Math.cos(a)).toFixed(1)]; };
        const wedge = (a0, a1, R, r) => { const p0 = pt(R, a0), p1 = pt(R, a1), p2 = pt(r, a1), p3 = pt(r, a0); return 'M' + p0 + 'A' + R + ' ' + R + ' 0 0 1 ' + p1 + 'L' + p2 + 'A' + r + ' ' + r + ' 0 0 0 ' + p3 + 'Z'; };
        let g = '';
        secs.forEach((s, i) => {
            const a = i * step;
            let fill = i % 2 ? '#3a3f47' : '#4a5059';
            if (s.kind === 'item') fill = '#b3382f';
            else if (s.coins >= 150) fill = '#d9ad25';
            else if (s.coins >= 60) fill = '#d8680f';
            let inner = '';
            if (s.kind === 'item' && s.itemId) {
                let svg = '';
                try { svg = GameLook.icon(s.itemId).svg; } catch (e) { svg = ''; }
                svg = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
                inner += '<circle cx="' + C + '" cy="' + (C - 118) + '" r="35" fill="rgba(20,22,26,.45)" stroke="rgba(244,241,234,.35)" stroke-width="2"/><g data-item="' + this._esc(s.itemId) + '"><svg x="' + (C - 31) + '" y="' + (C - 149) + '" width="62" height="62" viewBox="0 0 96 96">' + svg + '</svg></g>';
            } else {
                const txt = String(s.coins);
                const fs = txt.length >= 3 ? 36 : 40;
                inner += '<text x="' + C + '" y="' + (C - 118) + '" text-anchor="middle" font-size="' + fs + '" fill="#f4f1ea" stroke="#14161a" stroke-width="7" paint-order="stroke" stroke-linejoin="round"' + (/[69]/.test(txt) ? ' text-decoration="underline"' : '') + '>' + this._esc(txt) + '</text>' +
                    '<g transform="translate(' + C + ' ' + (C - 80) + ')"><circle r="17" fill="#f2c230" stroke="#14161a" stroke-width="3"/><circle r="11" fill="none" stroke="#b8861a" stroke-width="2.4"/><path d="M-3.6 -5.5v11M0 -5.5v11M3.6 -5.5v11" stroke="#b8861a" stroke-width="2"/></g>';
            }
            const rv = [pt(172, a - step / 2 + 7), pt(172, a + step / 2 - 7)].map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.6" fill="#cfd4dc" stroke="#14161a" stroke-width="1.6"/>').join('');
            g += '<g class="sec" data-i="' + i + '"><path class="pl" d="' + wedge(a - step / 2, a + step / 2, 187, 52) + '" fill="' + fill + '" stroke="#14161a" stroke-width="3.5" stroke-linejoin="round"/>' +
                '<path d="' + wedge(a - step / 2 + 2, a + step / 2 - 2, 185, 150) + '" fill="rgba(255,255,255,.1)"/><g transform="rotate(' + a + ' ' + C + ' ' + C + ')">' + inner + '</g>' + rv + '</g>';
        });
        let bolts = '';
        for (let i = 0; i < 24; i++) { const p = pt(197, i * 15); bolts += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.8" fill="#cfd4dc" stroke="#14161a" stroke-width="1.6"/>'; }
        return '<svg class="wh" viewBox="0 0 420 420" aria-hidden="true"><defs><radialGradient id="mu-sh" cx="50%" cy="50%" r="50%"><stop offset="55%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,.35)"/></radialGradient>' +
            '<linearGradient id="mu-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d7480"/><stop offset=".5" stop-color="#3a3f47"/><stop offset="1" stop-color="#23262b"/></linearGradient></defs>' +
            '<g class="rot" data-k="rot"><circle cx="210" cy="210" r="207" fill="url(#mu-rim)" stroke="#14161a" stroke-width="5"/><circle cx="210" cy="210" r="190" fill="#14161a"/>' + g + '<circle cx="210" cy="210" r="187" fill="url(#mu-sh)" pointer-events="none"/>' + bolts +
            '<circle cx="210" cy="210" r="50" fill="#23262b" stroke="#14161a" stroke-width="4"/><circle cx="210" cy="210" r="36" fill="url(#mu-rim)" stroke="#14161a" stroke-width="3"/><circle cx="210" cy="210" r="14" fill="#cfd4dc" stroke="#14161a" stroke-width="3"/><path d="M202 210h16M210 202v16" stroke="#6d7480" stroke-width="2.4"/></g></svg>';
    },

    _lever() {
        return '<svg class="lv" viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="30" width="28" height="8" rx="2" fill="#23262b" stroke="#14161a" stroke-width="2"/><g class="stick"><rect x="18" y="6" width="4" height="25" fill="#cfd4dc" stroke="#14161a" stroke-width="1.6"/><circle cx="20" cy="7" r="6.2" fill="#e2453c" stroke="#14161a" stroke-width="2"/></g></svg>';
    },

    _renderWheel(force) {
        if (force || !this._secs) this._secs = Wheel.sectors();
        const secs = this._secs;
        const key = secs.map((s) => s.kind + s.itemId + s.coins).join('|') + (typeof Lang !== 'undefined' ? Lang.code : '');
        const box = this.els['wheel.wheelBox'];
        if (force || /** @type {any} */ (box).__k !== key) {
            /** @type {any} */ (box).__k = key;
            box.innerHTML = this._wheelSvg(secs);
            this._items(box);
            this._setAngle(this._angle);
            if (this._winIdx != null) this._hilite(this._winIdx);
        }
        const st = Wheel.status();
        // записка: приз / подсказка
        const prize = this.els['wheel.prize'];
        if (this._prize) this._put(prize, this._gotHtml(this._prize, 'wheel'));
        else if (this._spinning) this._put(prize, '<span class="pe-mk">' + this.t('wheel.spinning') + '</span>');
        else this._put(prize, '<span class="pe-mk">' + this._esc(this._recovered && !this._recShown ? this.t('wheel.recovered') : this.t('wheel.hint')) + '</span>');
        if (this._prize) this._bindGot(prize);
        // рычаг: бесплатное вращение
        const lever = this.els['wheel.spin'];
        const off = this._spinning || this._busy || !st.canSpinFree;
        let main, sub;
        if (this._spinning) { main = this.t('wheel.spinning'); sub = ''; }
        else if (st.freeAvailable) { main = this.t('wheel.spin'); sub = this.t('wheel.freeShort'); }
        else { main = st.nextFreeLabel; sub = this.t('wheel.freeInShort'); }
        this._put(lever, this._lever() + '<span class="pe-lbl"><span class="main big-t">' + this._esc(main) + '</span>' + (sub ? '<small>' + this._esc(sub) + '</small>' : '') + '</span>');
        lever.setAttribute('aria-disabled', String(off));
        lever.classList.toggle('pulled', this._spinning);
        // вращение за рекламу
        const ad = this.els['wheel.spinAd'];
        let amain = this.t('wheel.adShort'), asub = '';
        if (st.banked > 0) { amain = this.t('wheel.spin'); asub = this.t('wheel.banked'); }
        else if (st.adWait > 0) asub = this.t('wheel.adIn', { n: st.adWait });
        else if (st.adLeft > 0) asub = this.t('wheel.adLeft', { a: st.adLeft, b: st.adLimit });
        else asub = this.t('wheel.none');
        const adOff = this._spinning || this._busy || !st.canSpinAd;
        this._put(ad, this._ic('ad') + '<span class="pe-lbl"><span class="main">' + this._esc(amain) + '</span><small>' + asub + '</small></span>');
        ad.setAttribute('aria-disabled', String(adOff));
        this.els['wheel.hint'].textContent = this._msg || (!st.canSpinFree && !st.canSpinAd && !this._spinning && st.hint && st.hint !== st.adLabel ? st.hint : '');
        this.els['wheel.x'].setAttribute('aria-disabled', String(this._spinning));
    },

    _setAngle(a) {
        this._angle = a;
        const rot = this.els['wheel.wheelBox'].querySelector('.rot');
        if (rot) /** @type {HTMLElement} */ (rot).style.transform = 'rotate(' + a + 'deg)';
    },

    _hilite(i) {
        this._winIdx = i;
        for (const s of Array.from(this.els['wheel.wheelBox'].querySelectorAll('.sec'))) s.classList.toggle('win', i != null && Number(/** @type {HTMLElement} */ (s).dataset.i) === i);
    },

    async _spin(ad) {
        if (this._spinning || this._busy || typeof Wheel === 'undefined') return;
        this._msg = ''; this._prize = null; this._recShown = true; this._hilite(null);
        let r;
        if (ad) {
            this._busy = true; this._renderWheel();
            try { r = await Wheel.spinAd(); } catch (e) { r = { ok: false, reason: 'adFailed' }; }
            this._busy = false;
        } else r = Wheel.spinFree();
        if (!r || !r.ok) {
            if (r && r.reason === 'adFailed') this._msg = this.t('wheel.adFailed');
            else if (r && (r.reason === 'cooldown' || r.reason === 'adUnavailable')) this._msg = this.t('wheel.adUnavailable');
            this.refreshBadges();
            if (this.cur === 'wheel') this._renderWheel();
            return;
        }
        this.refreshBadges();
        this._ev('spin', { kind: r.kind, sector: r.sector });
        this._secs = null; this._winIdx = null;
        if (this.cur !== 'wheel') { Wheel.finish(); this._coins(); return; }
        this._animate(r);
    },

    /** Крутит диск до угла результата (он выбран заранее, Wheel.angleFrom ставит диск точно на сектор), затем Wheel.finish(). */
    _animate(res) {
        const from = this._angle;
        const to = Wheel.angleFrom(from, res);
        const dur = this._reduced() ? 700 : Math.max(1200, res.durationMs || 5500);
        this._spinning = true;
        const t0 = performance.now();
        const step = Wheel.step();
        const baton = this.els['wheel.baton'];
        let lastSec = Math.floor((from + step / 2) / step), done = false;
        const finish = () => {
            if (done) return;
            done = true;
            this._spinning = false; this._anim = null;
            this._setAngle(to);
            baton.style.transform = '';
            const fin = Wheel.finish();
            if (fin && fin.ok) {
                this._prize = fin; this._winIdx = fin.sector;
                this._ev('prize', { sector: fin.sector, prize: fin.prize, got: fin.got });
                this._coins();
                if (this.cur === 'wheel') this._hilite(fin.sector);
            }
            this.refreshBadges();
            if (this.cur === 'wheel') { this._renderWheel(); const p = this.els['wheel.prize']; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); }
        };
        const timer = setTimeout(finish, dur + 400);   // вкладка свёрнута, rAF стоит — приз всё равно выдастся
        const frame = (now) => {
            if (done) return;
            const k = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 4);
            const a = from + (to - from) * e;
            this._setAngle(a);
            const sIdx = Math.floor((a + step / 2) / step);
            if (sIdx !== lastSec) { lastSec = sIdx; this._ev('tick', { k }); }
            // дубинка: щёлкает о границы секторов, отклонение затухает между ними
            const f = (((a + step / 2) % step) + step) % step / step;
            const speed = Math.min(1, ((to - from) * 4 * Math.pow(1 - k, 3) / (dur / 1000)) / 700);
            baton.style.transform = 'rotate(' + (Math.max(0, 1 - f * 3.2) * 24 * speed).toFixed(1) + 'deg)';
            if (k >= 1) { clearTimeout(timer); finish(); return; }
            this._anim = requestAnimationFrame(frame);
        };
        this._renderWheel();
        this._anim = requestAnimationFrame(frame);
    },

    // ================================================================== рекорды

    async _loadLeaders(force) {
        if (this._lbBusy) return;
        const fresh = this._lb && Date.now() - this._lbAt < (force ? 8000 : 45000);
        if (fresh) { this._lbState = 'ok'; return; }
        this._lbBusy = true; this._lbState = 'load';
        this._renderLeaders(true);
        let list = null;
        try { list = typeof Platform !== 'undefined' ? await Platform.leaderboard({ avatarSize: 'medium' }) : null; } catch (e) { list = null; }
        this._lbBusy = false;
        if (this.cur !== 'leaders') return;
        if (Array.isArray(list)) { this._lb = list; this._lbAt = Date.now(); this._lbState = 'ok'; this.hasLeaders = true; }
        else this._lbState = 'error';
        this._renderLeaders(true);
    },

    _renderLeaders(force) {
        const list = this.els['leaders.list'], state = this.els['leaders.state'], login = this.els['leaders.login'];
        if (!this._lbState) { this._lbState = 'load'; this._loadLeaders(false); }
        let canLogin = false;
        try { canLogin = typeof Platform !== 'undefined' && Platform.canLogin(); } catch (e) { canLogin = false; }
        login.hidden = !canLogin;
        if (canLogin) this._put(login, this._ic('star') + '<span>' + this.t('leaders.login') + '</span>');
        login.setAttribute('aria-disabled', String(!!this._loginBusy));
        this.els['leaders.hint'].textContent = canLogin ? this.t('leaders.signHint') : '';
        const s = this._lbState;
        if (s === 'ok' && this._lb && this._lb.length) {
            state.innerHTML = ''; /** @type {any} */ (state).__h = '';
            let html = '';
            for (const e of this._lb) {
                const rank = Math.max(1, Math.round(Number(e.rank) || 0));
                const nm = String(e.name || '').trim() || '—';
                const av = e.avatar ? /^(https?:|data:image\/|assets\/|\/)/.test(String(e.avatar)) ? this._esc(e.avatar) : '' : '';
                html += '<div class="mu-card' + (e.me ? ' me' : '') + (rank <= 3 ? ' r' + rank : '') + '"><span class="rk">' + rank + '</span><span class="mu-ph"><span class="im"' + (av ? ' data-av="' + av + '"' : '') + '>' + GAME_META_MUG + '</span></span>' +
                    '<span class="nm">' + this._esc(nm) + '</span><span class="sc">' + this._ic('trophy') + this._num(e.score) + '</span>' + (e.me ? '<i class="you">' + this.t('leaders.you') + '</i>' : '') + '</div>';
            }
            if (this._put(list, html)) {
                for (const el of Array.from(list.querySelectorAll('.im[data-av]'))) {
                    const h = /** @type {HTMLElement} */ (el), url = h.dataset.av || '';
                    const img = new Image();
                    img.onload = () => { h.style.backgroundImage = 'url("' + url + '")'; h.innerHTML = ''; };
                    img.src = url;   // не загрузился — остаётся запасная карточка
                }
            }
        } else {
            this._put(list, '');
            let body;
            if (s === 'load') body = '<div class="mu-state load">' + this._ic('clock') + '<span>' + this.t('leaders.loading') + '</span></div>';
            else if (s === 'error') body = '<div class="mu-state">' + this._ic('alarm') + '<span>' + this.t('leaders.error') + '</span><button type="button" class="pe-btn steel" data-retry="1">' + this.t('leaders.retry') + '</button></div>';
            else body = '<div class="mu-state">' + this._ic('trophy') + '<span>' + this.t('leaders.empty') + '</span></div>';
            if (this._put(state, body)) {
                const b = state.querySelector('button[data-retry]');
                if (b) b.addEventListener('click', (e) => { e.stopPropagation(); this._lbState = ''; this._lb = null; this._loadLeaders(true); });
            }
        }
    },

    async _login() {
        if (this._loginBusy || typeof Platform === 'undefined') return;
        this._loginBusy = true; this._renderLeaders();
        let ok = false;
        try { ok = !!(await Platform.login()); } catch (e) { ok = false; }
        this._loginBusy = false;
        if (ok) {
            try { if (typeof this.cfg.onLogin === 'function') await this.cfg.onLogin(); } catch (e) { console.warn('GameMetaUI: onLogin:', e); }
            this._lb = null; this._lbState = '';
            this.refreshBadges();
            if (this.cur === 'leaders') this._loadLeaders(true);
        } else if (this.cur === 'leaders') this._renderLeaders();
    },
};
