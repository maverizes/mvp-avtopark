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
  // Xarita: OpenStreetMap iframe. center — lokatsiyada koordinata bo'lmasa ko'rsatiladigan nuqta.
  map: {
    enabled: true,
    center: { lat: 41.3111, lng: 69.2797 }, // Toshkent markazi — o'z shahringizga almashtiring
    zoom: 0.03                              // ko'rinish kengligi (gradus); kichik = yaqinroq
  }
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
const LOCATIONS = [
  {
    id: 'pilot-1',
    title: 'Pilot turargoh',
    address: '[MANZIL]',
    slots: '[N]',
    scenarioIds: ['tungi', 'kunduzgi'],
    price: { tungi: '[NARX]', kunduzgi: '[NARX]' },
    lat: null,
    lng: null
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
    mapNoCoords: 'Aniq nuqta hali belgilanmagan. Manzil: ',
    mapEmpty: 'Bu vaqt uchun hozircha joy yo‘q. Ariza qoldiring — yaqin atrofdan qidiramiz.'
  }
};
