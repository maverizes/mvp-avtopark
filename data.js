// JoyBor — ma'lumot modeli. Sahifadagi barcha matn va raqamlar shu yerdan olinadi.
// Kvadrat qavsdagi qiymatlar ([MANZIL], [NARX], [N]) — hali noma'lum, o'zingiz to'ldiring.

// Umumiy sozlamalar
const CONFIG = {
  brand: 'JoyBor',
  tagline: 'Bo‘sh turargoh joylarini haydovchilar bilan ulaymiz',
  telegram: '[TELEGRAM]',        // @ belgisisiz, masalan: joybor_operator
  phone: '[TELEFON]',            // masalan: +998901234567
  city: '[SHAHAR]',
  defaultScenarioId: 'tungi',
  currency: 'so‘m',
  // true — sahifada NAMUNA turargohlar ham ko'rsatiladi (DEMO_LOCATIONS). Haqiqiy ishga chiqishda false qiling.
  demo: true,
  // Sutka qismlari: joylar bandligi shu ikki davr uchun alohida yoziladi
  periods: {
    night: { label: 'Tunda', from: '19:00', to: '08:00' },
    day: { label: 'Kunduzi', from: '08:00', to: '19:00' }
  },
  // Xarita: OpenStreetMap plitkalari, kutubxonasiz.
  map: {
    enabled: true,
    center: { lat: 41.3111, lng: 69.2797 }, // turargohlarda koordinata bo'lmasa — shu nuqta (Toshkent markazi)
    zoom: 12,                               // boshlang'ich yaqinlik: 11 — butun shahar, 16 — ko'cha
    minZoom: 5,
    maxZoom: 19,
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    dark: true                              // xaritani qorong'i rangda ko'rsatish
  },
  walkSpeed: 80,   // piyoda yurish tezligi, metr/daqiqa — "≈ N daq piyoda" hisobi uchun
  lowSpots: 2      // bo'sh joy shu sondan oshmasa — "kam qoldi" deb ko'rsatiladi
};

// Ssenariylar. unit: 'soat' | 'kun' | 'oy'.
// timeWindow: {from, to} — "HH:MM"; null bo'lsa vaqt kelishiladi.
// fields: formada ko'rinadigan qo'shimcha maydonlar (startDate, date, timeFrom, timeTo, cars).
// active:false — "tez orada", ariza talab ro'yxatiga yoziladi.
const SCENARIOS = [
  {
    id: 'tungi',
    title: 'Tungi joy',
    subtitle: 'Uyingiz yonida, har kecha. Oylik to‘lov.',
    heroTitle: 'Kechqurun uyga qaytdingiz — mashinangizning joyi tayyor',
    heroText: 'Yaqin atrofdagi idora yoki do‘kon hovlisi kechasi bo‘sh turadi. Biz sizga o‘sha joyni oylik asosda topib beramiz.',
    unit: 'oy',
    timeWindow: { from: '19:00', to: '08:00' },
    fields: ['startDate'],
    active: true
  },
  {
    id: 'kunduzgi',
    title: 'Kunduzgi joy',
    subtitle: 'Ish joyingiz yoki markaz yonida. Kunlik yoki oylik.',
    heroTitle: 'Ishga keldingiz — joy qidirib aylanmaysiz',
    heroText: 'Kunduzi bo‘sh turadigan hovli va turargohlarda sizga doimiy joy ajratamiz.',
    unit: 'kun',
    timeWindow: { from: '08:00', to: '19:00' },
    fields: ['startDate'],
    active: true
  },
  {
    id: 'soatlik',
    title: 'Soatlik joy',
    subtitle: 'Bozor, poliklinika, davlat idorasi yonida — bir necha soatga.',
    heroTitle: 'Bir-ikki soatlik ish uchun — yaqin joy',
    heroText: 'Kerakli manzil va vaqtni yozing, yaqin atrofdan joy topishga harakat qilamiz.',
    unit: 'soat',
    timeWindow: { from: '08:00', to: '20:00' },
    fields: ['date', 'timeFrom', 'timeTo'],
    active: false
  },
  {
    id: 'tadbir',
    title: 'Tadbir uchun',
    subtitle: 'To‘y, yig‘ilish — bir kunga bir nechta joy.',
    heroTitle: 'Mehmonlaringiz mashinasi uchun joy',
    heroText: 'Tadbir sanasi va mashinalar sonini yozing — bir kunlik guruh bandlovini kelishamiz.',
    unit: 'kun',
    timeWindow: null,
    fields: ['date', 'cars'],
    active: false
  }
];

// Lokatsiyalar. price — ssenariy id bo'yicha narx (birligi ssenariydan olinadi).
// lat/lng — xaritadagi nuqta; bilmasangiz null qoldiring.
// rows — joylar sxemasi: har bir qator bitta ro'yxat. Qatorlar orasida yo'lak chiziladi.
// busy — band joylar: { night: [...], day: [...] }. Operator shu ro'yxatni qo'lda yangilaydi.
// updatedAt — bandlik oxirgi marta qachon yangilangani (matn).
const LOCATIONS = [
  {
    id: 'pilot-1',
    title: 'Pilot turargoh',
    address: '[MANZIL]',
    slots: '[N]',
    scenarioIds: ['tungi', 'kunduzgi'],
    price: { tungi: '[NARX]', kunduzgi: '[NARX]' },
    lat: null,
    lng: null,
    rows: null,
    busy: { night: [], day: [] },
    updatedAt: null
  }
];

// NAMUNA turargohlar — faqat CONFIG.demo = true bo'lsa ko'rinadi.
// Sahifada "Namuna" belgisi bilan chiqadi; raqamlar haqiqiy emas, dizaynni ko'rsatish uchun.
const DEMO_LOCATIONS = [
  {
    id: 'demo-idora',
    title: 'Namuna: idora hovlisi',
    address: 'Namuna manzil, 1',
    scenarioIds: ['tungi'],
    price: { tungi: '[NARX]' },
    lat: 41.3065, lng: 69.2685,
    rows: [['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']],
    busy: { night: ['A2', 'A5', 'B1', 'B4'], day: [] },
    updatedAt: 'namuna'
  },
  {
    id: 'demo-dokon',
    title: 'Namuna: do‘kon oldi',
    address: 'Namuna manzil, 2',
    scenarioIds: ['tungi', 'kunduzgi'],
    price: { tungi: '[NARX]', kunduzgi: '[NARX]' },
    lat: 41.2995, lng: 69.2401,
    rows: [['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '10']],
    busy: { night: ['1', '2', '3', '7', '8', '9', '10'], day: ['2', '6'] },
    updatedAt: 'namuna'
  },
  {
    id: 'demo-maktab',
    title: 'Namuna: maktab hovlisi',
    address: 'Namuna manzil, 3',
    scenarioIds: ['kunduzgi', 'tadbir'],
    price: { kunduzgi: '[NARX]', tadbir: '[NARX]' },
    lat: 41.3190, lng: 69.2950,
    rows: [['K1', 'K2', 'K3', 'K4'], ['K5', 'K6', 'K7', 'K8']],
    busy: { night: [], day: ['K1', 'K2', 'K3', 'K5', 'K6', 'K7', 'K8'] },
    updatedAt: 'namuna'
  },
  {
    id: 'demo-bozor',
    title: 'Namuna: bozor yonidagi maydon',
    address: 'Namuna manzil, 4',
    scenarioIds: ['kunduzgi', 'soatlik'],
    price: { kunduzgi: '[NARX]', soatlik: '[NARX]' },
    lat: 41.3262, lng: 69.2355,
    rows: [['M1', 'M2', 'M3', 'M4', 'M5', 'M6'], ['M7', 'M8', 'M9', 'M10', 'M11', 'M12'], ['M13', 'M14', 'M15', 'M16', 'M17', 'M18']],
    busy: { night: [], day: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17', 'M18'] },
    updatedAt: 'namuna'
  },
  {
    id: 'demo-hovli',
    title: 'Namuna: turar-joy hovlisi',
    address: 'Namuna manzil, 5',
    scenarioIds: ['tungi'],
    price: { tungi: '[NARX]' },
    lat: 41.2860, lng: 69.2060,
    rows: [['H1', 'H2', 'H3', 'H4', 'H5'], ['H6', 'H7', 'H8', 'H9', 'H10']],
    busy: { night: ['H1', 'H2', 'H3', 'H5', 'H6', 'H7', 'H8', 'H10'], day: [] },
    updatedAt: 'namuna'
  },
  {
    id: 'demo-biznes',
    title: 'Namuna: biznes markaz',
    address: 'Namuna manzil, 6',
    scenarioIds: ['tungi', 'kunduzgi'],
    price: { tungi: '[NARX]', kunduzgi: '[NARX]' },
    lat: 41.3380, lng: 69.2850,
    rows: [['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'], ['C9', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16']],
    busy: { night: ['C2', 'C9', 'C14'], day: ['C1', 'C2', 'C3', 'C4', 'C6', 'C7', 'C9', 'C10', 'C11', 'C13', 'C14', 'C16'] },
    updatedAt: 'namuna'
  }
];

// Sahifa matnlari
const TEXT = {
  pains: [
    { title: 'Kechki soat 21:00, hovlida joy yo‘q', text: 'Uch marta aylanasiz, oxiri mashinani ko‘chada, yo‘l chetida qoldirasiz.' },
    { title: 'Tong — xavotir bilan', text: 'Birinchi ish — derazadan mashinaga qarash: joyidami, tirnalmadimi, jarima yo‘qmi.' },
    { title: 'Yonginangizda bo‘sh maydon', text: 'Idora yoki do‘kon hovlisi kechasi qulflangan va bo‘m-bo‘sh. Faqat kimdan so‘rashni bilmaysiz.' }
  ],
  steps: [
    { title: 'Ariza qoldirasiz', text: 'Qaysi joy kerakligini va qachon kerakligini yozasiz. Bir daqiqa.' },
    { title: 'Operator bog‘lanadi', text: 'Telegram yoki telefon orqali yaqin atrofdagi bo‘sh joyni taklif qilamiz.' },
    { title: 'Joyingizga qo‘yasiz', text: 'Kelishilgan vaqtda kelasiz, to‘lov — kelishilgan birlikda.' }
  ],
  faq: [
    { q: 'Hozircha qaysi manzillarda ishlaysiz?', a: 'Pilot manzillar xaritada ko‘rsatilgan. Manzilingiz yo‘q bo‘lsa ham ariza qoldiring — talab ko‘p joyda birinchi bo‘lib ochamiz.' },
    { q: 'To‘lov qanday bo‘ladi?', a: 'Narx va to‘lov tartibi operator bilan kelishiladi. Oldindan hech narsa to‘lamaysiz.' },
    { q: '“Tez orada” degani nima?', a: 'Bu turdagi joylar hali ochilmagan. Arizangiz talab ro‘yxatiga yoziladi va ochilganda birinchi bo‘lib xabar beramiz.' }
  ],
  // Kichik yozuvlar
  ui: {
    formActive: 'Ariza Telegram orqali operatorga boradi. Operator siz bilan bog‘lanib, joyni taklif qiladi.',
    formSoon: 'Bu tur hali ochilmagan — arizangiz talab ro‘yxatiga yoziladi. Ochilganda birinchi bo‘lib xabar beramiz.',
    noLocation: 'Bu tur uchun joy hali ochilmagan',
    noLocationNote: 'Ariza qoldiring — talab yig‘ilgan manzilda birinchi ochamiz.',
    timeAgreed: 'Kelishiladi',
    mapEmpty: 'Bu vaqt uchun hozircha joy yo‘q. Ariza qoldiring — yaqin atrofdan qidiramiz.',
    lotNoLayout: 'Bu turargohning joylar sxemasi hali kiritilmagan. Ariza qoldiring — operator bo‘sh joyni aytadi.',
    lotClosed: 'Bu vaqtda turargoh yopiq.',
    lotHint: 'Bo‘sh joyni bosing — u arizaga qo‘shiladi.',
    demoNote: 'Namuna ma’lumot — haqiqiy bandlik emas.',
    demoTag: 'Namuna',

    // Xarita va joylashuv. {nom} — o'rniga qiymat qo'yiladi.
    locate: 'Menga yaqinlari',
    nearIdle: 'O‘zingizga yaqin turargohlarni ko‘rish uchun «Menga yaqinlari» tugmasini bosing.',
    nearLocating: 'Joylashuvingiz aniqlanmoqda…',
    nearFound: 'Eng yaqin bo‘sh joy: {title} — {dist}{walk}. {free} ta joy bo‘sh.',
    nearNone: 'Atrofda hozir bo‘sh joy topilmadi. Ariza qoldiring — operator qidiradi.',
    nearPick: 'Xaritada turgan joyingizni bosing — masofani shunga qarab hisoblaymiz.',
    geoDenied: 'Joylashuvga ruxsat berilmadi.',
    geoFail: 'Joylashuvni aniqlab bo‘lmadi.',
    geoManual: 'Masofa siz belgilagan nuqtadan hisoblangan.',
    pickAgain: 'Joyimni xaritada belgilash',
    show: 'Ko‘rsatish',
    walk: '≈ {min} daq piyoda',
    wheelHint: 'Kattalashtirish: Ctrl + g‘ildirak yoki + / − tugmalari',
    statusFree: '{free} ta bo‘sh / {total}',
    statusLow: 'Kam qoldi: {free} / {total}',
    statusFull: 'Bo‘sh joy yo‘q',
    statusClosed: 'Bu vaqtda yopiq',
    statusUnknown: 'Joylar: {slots}',
    noCoords: 'Xaritada belgilanmagan',
    freeWord: 'bo‘sh',
    factDist: 'Sizdan',
    factHours: 'Ish vaqti',
    hours24: 'Kecha-kunduz',
    factPrice: 'Narx',
    factUpdated: 'Yangilangan',
    route: 'Yo‘l ko‘rsatish:'
  }
};
