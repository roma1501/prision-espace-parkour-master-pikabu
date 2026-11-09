// GameShopData.js — каталог косметики «Prision Espace Parkour Master»: вкладки, предметы, витрины уровней.
// Формат Shop.js (Shop.init({ tabs: SHOP_TABS, items: SHOP_ITEMS })). Вид каждого предмета на персонаже —
// в GameLook.js (GameLook.DEFS[id]); ключ — тот же id (проверка: node tools/shop-check.mjs).
//
// Цена в строке каталога: число >= 100 — монеты, число 1..5 — просмотры рекламы (дороже/реже = больше).
// Эксклюзивы Daily Gift — 8-й элемент строки 'daily' (в проверку 35/65 не входят, в магазине скрыты, пока не получены).
// Правило пользователя на вкладку: 24 предмета = 1 дефолтный + 8 за монеты (~35%) + 15 за рекламу (~65%).
// Поле desc { ru, en } — короткое описание вида (по нему Codex рисует растровую иконку
// assets/ui/items/<id>.webp, 256×256, альфа; пока файла нет, карточка рисует процедурный SVG из GameLook.icon).
//
// Редкости: common / rare / epic / legendary / mythic. В Shop.js «mythic» нет — добавляем его сюда же
// (RARITIES, вес выпадения, подписи ru/en), чтобы randomItem и rarityLabel его знали.

const SHOP_TABS = [
    { id: 'outfits', name: { ru: 'Робы', en: 'Outfits' } },
    { id: 'hats', name: { ru: 'Шапки', en: 'Hats' } },
    { id: 'faces', name: { ru: 'Лица', en: 'Faces' } },
    { id: 'back', name: { ru: 'Спина', en: 'Back' } },
    { id: 'trails', name: { ru: 'Следы', en: 'Trails' } },
];

/** Предметы, которые показывают витрины уровней (маркер stand n=0..11): сначала доступные, потом мечты. */
const SHOP_STANDS = [
    'trail_sparks', 'outfit_stripes', 'back_cape_red', 'face_shades', 'trail_hearts', 'hat_propeller',
    'hat_cowboy', 'outfit_tux', 'trail_rainbow', 'back_wings_angel', 'hat_crown', 'outfit_golden',
];

const SHOP_ITEMS = (() => {
    // Строка: [id, ru, en, rarity, price, descRu, descEn]
    /** @type {Record<string, any[][]>} */
    const T = {
        outfits: [
            ['outfit_orange', 'Оранжевая роба', 'Orange Jumpsuit', 'common', 0, 'Оранжевая тюремная роба с белым номером на груди и спине.', 'Orange prison jumpsuit with a white number on chest and back.'],
            ['outfit_blue_jail', 'Синяя роба', 'Blue Jumpsuit', 'common', 100, 'Синяя роба с номером, тёмно-синие штаны.', 'Blue jumpsuit with a number, navy trousers.'],
            ['outfit_stripes', 'Полосатая роба', 'Striped Uniform', 'common', 150, 'Классическая бело-чёрная полосатая роба.', 'Classic black and white striped uniform.'],
            ['outfit_hoodie', 'Серая худи', 'Grey Hoodie', 'common', 180, 'Серая худи с карманом-кенгуру и джинсы.', 'Grey hoodie with a kangaroo pocket and jeans.'],
            ['outfit_camo', 'Камуфляж', 'Camouflage', 'rare', 400, 'Зелёно-коричневый камуфляж, штаны хаки.', 'Green-brown camouflage with khaki trousers.'],
            ['outfit_hazard', 'Сигнальный жилет', 'Hi-Vis Vest', 'rare', 520, 'Жёлтый жилет со светоотражающими полосами поверх тёмной футболки.', 'Yellow hi-vis vest with reflective stripes over a dark shirt.'],
            ['outfit_tux', 'Смокинг', 'Tuxedo', 'epic', 900, 'Чёрный смокинг, белая манишка и бабочка.', 'Black tuxedo, white shirt front and bow tie.'],
            ['outfit_astro', 'Скафандр', 'Spacesuit', 'epic', 1100, 'Белый скафандр с нашивками и оранжевыми манжетами.', 'White spacesuit with patches and orange cuffs.'],
            ['outfit_golden', 'Золотая роба', 'Golden Jumpsuit', 'legendary', 1500, 'Сияющая золотая роба с блестящим номером.', 'Shining golden jumpsuit with a glittering number.'],
            ['outfit_red_jail', 'Красная роба', 'Red Jumpsuit', 'common', 1, 'Красная роба с белым номером.', 'Red jumpsuit with a white number.'],
            ['outfit_tshirt', 'Футболка и шорты', 'Tee and Shorts', 'common', 1, 'Белая футболка и синие шорты, голые руки и ноги.', 'White tee and blue shorts, bare arms and legs.'],
            ['outfit_gray13', 'Серая роба «13»', 'Grey Jumpsuit 13', 'common', 2, 'Серая роба с крупной цифрой 13.', 'Grey jumpsuit with a big number 13.'],
            ['outfit_pajama', 'Пижама', 'Pyjamas', 'rare', 2, 'Голубая пижама со звёздочками.', 'Light blue pyjamas with little stars.'],
            ['outfit_chef', 'Поварской китель', 'Chef Coat', 'rare', 2, 'Белый двубортный китель с пуговицами и красным платком.', 'White double-breasted coat with buttons and a red neckerchief.'],
            ['outfit_ninja', 'Ниндзя', 'Ninja', 'rare', 3, 'Чёрный костюм с красным поясом.', 'Black suit with a red sash.'],
            ['outfit_pirate', 'Пират', 'Pirate', 'rare', 3, 'Полосатая тельняшка, коричневый жилет и красный кушак.', 'Striped shirt, brown vest and a red sash.'],
            ['outfit_cowboy', 'Ковбой', 'Cowboy', 'rare', 3, 'Клетчатая рубашка, кожаный жилет, синие джинсы.', 'Plaid shirt, leather vest, blue jeans.'],
            ['outfit_knight', 'Рыцарь', 'Knight', 'epic', 4, 'Стальные доспехи с гербом-крестом на груди.', 'Steel armour with a cross emblem on the chest.'],
            ['outfit_dino', 'Костюм динозавра', 'Dino Suit', 'epic', 4, 'Зелёный костюм с кремовым брюшком и гребнем на спине.', 'Green suit with a cream belly and spikes on the back.'],
            ['outfit_neon', 'Неон', 'Neon', 'epic', 4, 'Чёрный костюм со светящимися бирюзовыми и розовыми линиями.', 'Black suit with glowing cyan and pink lines.'],
            ['outfit_royal', 'Королевская мантия', 'Royal Robe', 'legendary', 5, 'Пурпурная мантия с горностаевым воротником и золотой каймой.', 'Purple robe with an ermine collar and gold trim.'],
            ['outfit_cyber', 'Кибер-броня', 'Cyber Armour', 'legendary', 5, 'Тёмная броня со светящимися голубыми схемами.', 'Dark armour with glowing blue circuitry.'],
            ['outfit_galaxy', 'Галактика', 'Galaxy', 'mythic', 5, 'Костюм из ночного космоса: туманности и мерцающие звёзды.', 'A suit of deep space: nebulae and twinkling stars.'],
            ['outfit_inferno', 'Огненный костюм', 'Inferno', 'mythic', 5, 'Чёрная обугленная одежда с лавовыми трещинами и пламенем.', 'Charred black clothes with lava cracks and flames.'],
            // Эксклюзивы Daily Gift (7-й день): не продаются, на колесе не выпадают (exclusive: 'daily', цена не задаётся).
            ['outfit_king_escape', 'Король побега', 'Escape King', 'legendary', 0, 'Пурпурная роба с золотой короной-принтом на груди и горностаевой каймой.', 'Purple jumpsuit with a golden crown print on the chest and ermine trim.', 'daily'],
            ['outfit_chameleon', 'Неон-хамелеон', 'Neon Chameleon', 'mythic', 0, 'Роба-хамелеон: бирюзово-розовая чешуя с неоновым свечением.', 'Chameleon suit: teal-pink scales with a neon glow.', 'daily'],
            ['outfit_night_shadow', 'Ночная тень', 'Night Shadow', 'mythic', 0, 'Чёрный плащ с серебристой каймой и лиловыми звёздами, тянется шлейф теней.', 'Black cloak with silver trim and violet stars, trailing shadows.', 'daily'],
        ],
        hats: [
            ['hat_none', 'Без шапки', 'No Hat', 'common', 0, 'Пустое место — ничего на голове.', 'Empty slot: nothing on the head.'],
            ['hat_beanie', 'Бини', 'Beanie', 'common', 100, 'Красная вязаная шапка с помпоном.', 'Red knitted beanie with a pompom.'],
            ['hat_cap', 'Кепка', 'Cap', 'common', 120, 'Бейсболка с козырьком.', 'Baseball cap with a visor.'],
            ['hat_bucket', 'Панама', 'Bucket Hat', 'common', 180, 'Хаки панама с узкими полями.', 'Khaki bucket hat with a short brim.'],
            ['hat_hardhat', 'Каска', 'Hard Hat', 'rare', 350, 'Жёлтая строительная каска с гребнем.', 'Yellow construction hard hat with a ridge.'],
            ['hat_cowboy', 'Ковбойская шляпа', 'Cowboy Hat', 'rare', 500, 'Коричневая шляпа с загнутыми полями и ремешком.', 'Brown hat with curled brim and a band.'],
            ['hat_top', 'Цилиндр', 'Top Hat', 'epic', 850, 'Чёрный цилиндр с красной лентой.', 'Black top hat with a red ribbon.'],
            ['hat_pirate', 'Треуголка', 'Pirate Hat', 'epic', 1100, 'Чёрная треуголка с золотой кромкой и черепом.', 'Black tricorn with gold trim and a skull.'],
            ['hat_crown', 'Корона', 'Crown', 'legendary', 1500, 'Золотая корона с красными и синими камнями.', 'Golden crown with red and blue gems.'],
            ['hat_prison', 'Тюремная шапочка', 'Prison Cap', 'common', 1, 'Круглая оранжевая шапочка с чёрной полосой.', 'Round orange cap with a black stripe.'],
            ['hat_headband', 'Повязка', 'Headband', 'common', 1, 'Красная повязка на лбу с хвостиками сзади.', 'Red headband with tails at the back.'],
            ['hat_chef', 'Поварской колпак', 'Chef Hat', 'common', 2, 'Высокий белый поварской колпак.', 'Tall white chef hat.'],
            ['hat_party', 'Праздничный колпак', 'Party Hat', 'rare', 2, 'Разноцветный конус в горошек с помпоном.', 'Colourful polka-dot cone with a pompom.'],
            ['hat_bunny', 'Ушки зайца', 'Bunny Ears', 'rare', 2, 'Длинные белые уши с розовой серединой.', 'Long white ears with pink insides.'],
            ['hat_cat', 'Кошачьи ушки', 'Cat Ears', 'rare', 3, 'Чёрные треугольные ушки на ободке.', 'Black triangular ears on a band.'],
            ['hat_viking', 'Шлем викинга', 'Viking Helmet', 'rare', 3, 'Стальной шлем с двумя белыми рогами.', 'Steel helmet with two white horns.'],
            ['hat_wizard', 'Колпак мага', 'Wizard Hat', 'rare', 3, 'Фиолетовый острый колпак со звёздами и широкими полями.', 'Purple pointed hat with stars and a wide brim.'],
            ['hat_propeller', 'Пропеллер', 'Propeller Cap', 'epic', 4, 'Яркая кепка с вращающимся пропеллером.', 'Bright cap with a spinning propeller.'],
            ['hat_halo', 'Нимб', 'Halo', 'epic', 4, 'Золотое светящееся кольцо над головой.', 'Glowing golden ring above the head.'],
            ['hat_devil', 'Рожки', 'Devil Horns', 'epic', 4, 'Красные рожки с тлеющими кончиками.', 'Red horns with glowing tips.'],
            ['hat_knight', 'Рыцарский шлем', 'Knight Helm', 'legendary', 5, 'Стальной шлем с забралом и красным плюмажем.', 'Steel helm with a visor and a red plume.'],
            ['hat_unicorn', 'Единорог', 'Unicorn', 'legendary', 5, 'Радужный рог и розовая грива, сияние.', 'Rainbow horn and pink mane with a glow.'],
            ['hat_dragon', 'Рога дракона', 'Dragon Horns', 'mythic', 5, 'Чёрные изогнутые рога с огненным свечением.', 'Curved black horns with a fiery glow.'],
            ['hat_starcrown', 'Звёздная корона', 'Star Crown', 'mythic', 5, 'Корона из светящихся звёзд, кружащих над головой.', 'A crown of glowing stars orbiting the head.'],
            ['hat_boss_helmet', 'Золотая каска начальника', 'Chief Golden Hard Hat', 'legendary', 0, 'Золотая каска с гербом тюрьмы, красными лампами и сияющим гребнем.', 'Golden hard hat with the prison crest, red lamps and a shining ridge.', 'daily'],
        ],
        faces: [
            ['face_default', 'Обычное лицо', 'Plain Face', 'common', 0, 'Два глаза и лёгкая улыбка.', 'Two eyes and a small smile.'],
            ['face_smile', 'Широкая улыбка', 'Big Smile', 'common', 100, 'Радостные глаза и очень широкая улыбка.', 'Happy eyes and a very wide smile.'],
            ['face_wink', 'Подмигивание', 'Wink', 'common', 120, 'Один глаз прищурен, хитрая улыбка.', 'One eye closed, a sly smile.'],
            ['face_glasses', 'Очки', 'Glasses', 'common', 150, 'Круглые очки в чёрной оправе.', 'Round glasses with black frames.'],
            ['face_shades', 'Тёмные очки', 'Shades', 'rare', 350, 'Чёрные солнечные очки с бликом.', 'Black sunglasses with a glint.'],
            ['face_bandana', 'Бандана', 'Bandana Mask', 'rare', 450, 'Красная бандана с узором, закрывает нос и рот.', 'Red patterned bandana covering nose and mouth.'],
            ['face_hockey', 'Хоккейная маска', 'Hockey Mask', 'epic', 900, 'Белая маска с отверстиями и красными шрамами.', 'White mask with holes and red scars.'],
            ['face_ninja', 'Маска ниндзя', 'Ninja Mask', 'epic', 1000, 'Чёрная ткань, остались только прищуренные глаза.', 'Black cloth with only narrowed eyes showing.'],
            ['face_gold', 'Золотая маска', 'Golden Mask', 'legendary', 1500, 'Золотая церемониальная маска с узором.', 'Golden ceremonial mask with ornaments.'],
            ['face_angry', 'Злое лицо', 'Angry', 'common', 1, 'Сдвинутые брови, зубастый оскал.', 'Furrowed brows and a toothy snarl.'],
            ['face_surprise', 'Удивление', 'Surprised', 'common', 1, 'Огромные глаза и круглый рот.', 'Huge eyes and a round mouth.'],
            ['face_sleepy', 'Сонный', 'Sleepy', 'common', 2, 'Полузакрытые глаза и пузырь из носа.', 'Half-closed eyes and a snot bubble.'],
            ['face_mustache', 'Усы', 'Mustache', 'rare', 2, 'Пышные закрученные усы.', 'Bushy curled mustache.'],
            ['face_cat', 'Кошачья мордочка', 'Cat Face', 'rare', 2, 'Розовый носик, ротик и усики-вибриссы.', 'Pink nose, little mouth and whiskers.'],
            ['face_vampire', 'Вампир', 'Vampire', 'rare', 3, 'Бледные глаза с красными зрачками и клыки.', 'Pale eyes with red pupils and fangs.'],
            ['face_clown', 'Клоун', 'Clown', 'rare', 3, 'Грим клоуна и красный круглый нос.', 'Clown paint and a round red nose.'],
            ['face_hearts', 'Влюблённый', 'Heart Eyes', 'rare', 3, 'Глаза-сердечки и румянец.', 'Heart-shaped eyes and blushing cheeks.'],
            ['face_skull', 'Череп', 'Skull Paint', 'epic', 4, 'Белый грим-череп с чёрными глазницами.', 'White skull paint with black sockets.'],
            ['face_robot', 'Робот', 'Robot', 'epic', 4, 'Пиксельный зелёный экран-лицо с LED-глазами.', 'Pixel green screen face with LED eyes.'],
            ['face_tiger', 'Тигр', 'Tiger Paint', 'epic', 4, 'Оранжевый грим с чёрными полосами и носом.', 'Orange paint with black stripes and a nose.'],
            ['face_cyclops', 'Циклоп', 'Cyclops', 'legendary', 5, 'Один огромный светящийся глаз.', 'One enormous glowing eye.'],
            ['face_alien', 'Пришелец', 'Alien', 'legendary', 5, 'Зелёный грим и огромные чёрные глаза-миндалины.', 'Green paint and huge black almond eyes.'],
            ['face_ghost', 'Призрак', 'Ghost', 'mythic', 5, 'Бледное лицо с пустыми светящимися глазами и воем.', 'Pale face with hollow glowing eyes and a wail.'],
            ['face_fire', 'Огненный взгляд', 'Fire Gaze', 'mythic', 5, 'Глаза-пламя и огненная улыбка, искры.', 'Flaming eyes and a fiery grin with sparks.'],
        ],
        back: [
            ['back_none', 'Без спины', 'Nothing', 'common', 0, 'Ничего на спине.', 'Nothing on the back.'],
            ['back_pack', 'Рюкзак', 'Backpack', 'common', 100, 'Зелёный походный рюкзак с ремнями.', 'Green hiking backpack with straps.'],
            ['back_school', 'Ранец', 'School Bag', 'common', 140, 'Синий ранец с карманом и жёлтой молнией.', 'Blue school bag with a pocket and a yellow zip.'],
            ['back_bedroll', 'Скатка', 'Bedroll', 'common', 180, 'Свёрнутый спальник поверх маленького рюкзака.', 'Rolled sleeping bag on a small pack.'],
            ['back_cape_red', 'Красный плащ', 'Red Cape', 'rare', 350, 'Красный плащ с золотой застёжкой.', 'Red cape with a golden clasp.'],
            ['back_guitar', 'Гитара', 'Guitar', 'rare', 500, 'Акустическая гитара на ремне за спиной.', 'Acoustic guitar slung on the back.'],
            ['back_sword', 'Меч', 'Sword', 'epic', 850, 'Стальной меч в ножнах за спиной.', 'Steel sword in a scabbard on the back.'],
            ['back_bow', 'Лук и колчан', 'Bow and Quiver', 'epic', 900, 'Деревянный лук и колчан со стрелами.', 'Wooden bow and a quiver of arrows.'],
            ['back_wings_angel', 'Крылья ангела', 'Angel Wings', 'legendary', 1500, 'Большие белые светящиеся крылья.', 'Big white glowing wings.'],
            ['back_jet_orange', 'Джетпак: оранж', 'Jetpack: Orange', 'common', 1, 'Оранжевый джетпак с жёлтой полосой.', 'Orange jetpack with a yellow stripe.'],
            ['back_jet_blue', 'Джетпак: синий', 'Jetpack: Blue', 'common', 1, 'Синий джетпак, голубое пламя.', 'Blue jetpack with a light blue flame.'],
            ['back_cape_blue', 'Синий плащ', 'Blue Cape', 'common', 2, 'Тёмно-синий плащ с белым подбоем.', 'Navy cape with a white lining.'],
            ['back_surfboard', 'Доска для сёрфа', 'Surfboard', 'rare', 2, 'Яркая доска с волной на спине.', 'Bright surfboard with a wave on the back.'],
            ['back_shield', 'Щит', 'Shield', 'rare', 2, 'Круглый деревянный щит с металлическим умбоном.', 'Round wooden shield with a metal boss.'],
            ['back_wings_bat', 'Крылья летучей мыши', 'Bat Wings', 'rare', 3, 'Тёмные перепончатые крылья.', 'Dark leathery wings.'],
            ['back_cloak', 'Мантия', 'Cloak', 'rare', 3, 'Фиолетовая мантия с капюшоном.', 'Purple cloak with a hood.'],
            ['back_parachute', 'Парашют', 'Parachute', 'rare', 3, 'Сумка парашюта с оранжево-белыми лямками.', 'Parachute pack with orange-white straps.'],
            ['back_jet_neon', 'Джетпак: неон', 'Jetpack: Neon', 'epic', 4, 'Чёрный джетпак с неоновым свечением.', 'Black jetpack with neon glow.'],
            ['back_wings_butterfly', 'Крылья бабочки', 'Butterfly Wings', 'epic', 4, 'Разноцветные крылья с узором.', 'Colourful patterned wings.'],
            ['back_cape_hero', 'Плащ героя', 'Hero Cape', 'epic', 4, 'Развевающийся золотисто-красный плащ с эмблемой-звездой.', 'Flowing gold-red cape with a star emblem.'],
            ['back_jet_gold', 'Джетпак: золото', 'Jetpack: Gold', 'legendary', 5, 'Золотой сияющий джетпак.', 'Shining golden jetpack.'],
            ['back_wings_phoenix', 'Крылья феникса', 'Phoenix Wings', 'legendary', 5, 'Огненные крылья, летят искры.', 'Fiery wings shedding embers.'],
            ['back_wings_dragon', 'Крылья дракона', 'Dragon Wings', 'mythic', 5, 'Огромные чёрные крылья с раскалённым краем.', 'Huge black wings with a glowing edge.'],
            ['back_jet_void', 'Джетпак: бездна', 'Jetpack: Void', 'mythic', 5, 'Фиолетово-чёрный джетпак со звёздами внутри.', 'Purple-black jetpack with stars inside.'],
        ],
        trails: [
            ['trail_none', 'Без следа', 'No Trail', 'common', 0, 'Нет следа.', 'No trail.'],
            ['trail_dust', 'Пыль', 'Dust', 'common', 100, 'Облачка пыли из-под ног.', 'Puffs of dust from the feet.'],
            ['trail_sparks', 'Искры', 'Sparks', 'common', 130, 'Оранжевые искры сыплются за героем.', 'Orange sparks fly behind the hero.'],
            ['trail_leaves', 'Листья', 'Leaves', 'common', 180, 'Зелёные листочки кружат следом.', 'Green leaves swirl behind.'],
            ['trail_bubbles', 'Пузыри', 'Bubbles', 'rare', 350, 'Мыльные пузыри поднимаются от ног.', 'Soap bubbles rise from the feet.'],
            ['trail_hearts', 'Сердечки', 'Hearts', 'rare', 450, 'Розовые сердечки остаются в воздухе.', 'Pink hearts left floating in the air.'],
            ['trail_stars', 'Звёзды', 'Stars', 'epic', 850, 'Золотые звёзды рассыпаются за героем.', 'Golden stars scatter behind the hero.'],
            ['trail_rainbow', 'Радуга', 'Rainbow', 'epic', 1000, 'Лента цветных огоньков, как радуга.', 'A ribbon of coloured lights, like a rainbow.'],
            ['trail_fire', 'Огненный след', 'Fire Trail', 'legendary', 1500, 'Язычки пламени и искры остаются позади.', 'Flames and embers left behind.'],
            ['trail_smoke', 'Дым', 'Smoke', 'common', 1, 'Серые клубы дыма.', 'Grey puffs of smoke.'],
            ['trail_snow', 'Снежинки', 'Snowflakes', 'common', 1, 'Белые снежинки кружатся и падают.', 'White snowflakes swirl and fall.'],
            ['trail_notes', 'Ноты', 'Music Notes', 'common', 2, 'Весёлые нотки летят вверх.', 'Cheerful music notes float upward.'],
            ['trail_petals', 'Лепестки', 'Petals', 'rare', 2, 'Розовые лепестки вишни.', 'Pink cherry petals.'],
            ['trail_confetti', 'Конфетти', 'Confetti', 'rare', 2, 'Разноцветные кусочки конфетти.', 'Multi-coloured confetti pieces.'],
            ['trail_coins', 'Монетки', 'Coins', 'rare', 3, 'Золотые монетки сыплются на землю.', 'Golden coins rain to the ground.'],
            ['trail_pixels', 'Пиксели', 'Pixels', 'rare', 3, 'Зелёные и голубые пиксели-квадратики.', 'Green and cyan square pixels.'],
            ['trail_ice', 'Ледяные кристаллы', 'Ice Crystals', 'rare', 3, 'Голубые ледяные кристаллы.', 'Pale blue ice crystals.'],
            ['trail_lightning', 'Молнии', 'Lightning', 'epic', 4, 'Жёлтые электрические разряды.', 'Yellow electric bolts.'],
            ['trail_ghost', 'Призраки', 'Ghost Wisps', 'epic', 4, 'Бледные призрачные огоньки.', 'Pale ghostly wisps.'],
            ['trail_butterflies', 'Бабочки', 'Butterflies', 'epic', 4, 'Бирюзовые и розовые бабочки порхают следом.', 'Teal and pink butterflies flutter behind.'],
            ['trail_stardust', 'Звёздная пыль', 'Stardust', 'legendary', 5, 'Мерцающая золотисто-голубая звёздная пыль.', 'Twinkling gold-blue stardust.'],
            ['trail_plasma', 'Плазма', 'Plasma', 'legendary', 5, 'Фиолетово-розовые светящиеся сгустки.', 'Glowing purple-pink plasma blobs.'],
            ['trail_galaxy', 'Галактика', 'Galaxy', 'mythic', 5, 'Вихрь звёзд и туманностей.', 'A swirl of stars and nebulae.'],
            ['trail_void', 'Бездна', 'Void', 'mythic', 5, 'Тёмные сгустки с пурпурным краем.', 'Dark blobs with a magenta rim.'],
        ],
    };
    const out = [];
    for (const tab of Object.keys(T)) {
        for (const [id, ru, en, rarity, price, dru, den, excl] of T[tab]) {
            /** @type {any} */
            const it = { id, tab, name: { ru, en }, rarity, desc: { ru: dru, en: den } };
            if (excl) it.exclusive = excl;
            else if (price === 0) it.default = true;
            else if (price >= 100) it.price = { coins: price };
            else it.price = { ads: price };
            out.push(it);
        }
    }
    return out;
})();

// «Мифическая» редкость: добавляем к Shop.js (его RARITIES — common…legendary).
if (typeof Shop !== 'undefined') {
    if (Shop.RARITIES.indexOf('mythic') < 0) Shop.RARITIES.push('mythic');
    const weights = /** @type {Record<string, number>} */ (Shop.RARITY_WEIGHT);
    if (!weights.mythic) weights.mythic = 0.25;
}
if (typeof LANG_STRINGS !== 'undefined') {
    if (LANG_STRINGS.ru && !LANG_STRINGS.ru['shop.rarity.mythic']) LANG_STRINGS.ru['shop.rarity.mythic'] = 'Мифический';
    if (LANG_STRINGS.en && !LANG_STRINGS.en['shop.rarity.mythic']) LANG_STRINGS.en['shop.rarity.mythic'] = 'Mythic';
}
