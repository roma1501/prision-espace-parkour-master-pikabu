// GameRewardsData.js — данные наград «Prision Espace Parkour Master»: ежедневный подарок и колесо фортуны.
// Формат DailyGift.js / Wheel.js; предметы — id из js/GameShopData.js (здесь только реальные id каталога).
//
// DAILY_REWARDS — дни 1–6 по нарастающей, монеты > 0 на каждом дне (так работает «за рекламу ×2»).
// DAILY_EXCLUSIVE — очередь эксклюзивных скинов 7-го дня (exclusive: 'daily' в каталоге: в магазине не продаются,
//   на колесе не выпадают). Когда все получены, 7-й день даёт крупную награду монетами (DAILY_FALLBACK_COINS).
// WHEEL_SECTORS — 8 секторов: 6 сумм монет (20/40/60/100/150/300) и 2 сектора «случайный предмет магазина»
//   (обычный/редкий и до эпического). weight — относительная вероятность; секторы стоят вперемешку, чтобы
//   крупные призы не лежали рядом. Вращений за рекламу в день — WHEEL_AD_SPINS_PER_DAY (Constants.js).

/** @type {Array<{ coins?: number, randomItems?: number, maxRarity?: string }>} */
const DAILY_REWARDS = [
    { coins: 50 },
    { coins: 80 },
    { coins: 120 },
    { coins: 180, randomItems: 1, maxRarity: 'rare' },
    { coins: 260 },
    { coins: 380, randomItems: 1, maxRarity: 'epic' },
];

/** Эксклюзивные скины 7-го дня, по кругам: 1-й круг — первый, 2-й — второй… */
const DAILY_EXCLUSIVE = ['outfit_king_escape', 'hat_boss_helmet', 'outfit_chameleon', 'outfit_night_shadow'];

/** @type {Array<{ weight: number, coins?: number, randomItem?: boolean, maxRarity?: string }>} */
const WHEEL_SECTORS = [
    { coins: 20, weight: 22 },
    { coins: 100, weight: 11 },
    { coins: 40, weight: 20 },
    { randomItem: true, maxRarity: 'rare', weight: 9 },
    { coins: 60, weight: 16 },
    { coins: 300, weight: 2 },
    { randomItem: true, maxRarity: 'epic', weight: 3 },
    { coins: 150, weight: 6 },
];
