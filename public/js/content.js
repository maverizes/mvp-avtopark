// Sayt matnlari va sozlamalari.
// Turargohlar, narxlar va bandlik operator panelida (/admin) boshqariladi — bu yerda emas.
// Joy turlari: shared/scenarios.js

export const CONFIG = {
  brand: 'JoyBor',
  tagline: 'Bo‘sh turargoh joylarini haydovchilar bilan ulaymiz',
  telegram: 'maverizes',        // @ belgisisiz, masalan: joybor_operator. To'ldirilmasa havola yashiriladi
  phone: '+998990770826',            // masalan: +998901234567. To'ldirilmasa tugma yashiriladi
  defaultScenarioId: 'tungi',
  currency: 'so‘m',
  refreshSeconds: 30,            // bandlik har necha soniyada yangilanadi
  map: {
    enabled: true,
    center: { lat: 41.3111, lng: 69.2797 }, // turargohlar bo'lmasa — shu nuqta (Toshkent markazi)
    zoom: 12,
    minZoom: 5,
    maxZoom: 19,
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    dark: true
  },
  walkSpeed: 80,   // piyoda yurish tezligi, metr/daqiqa
  lowSpots: 2      // bo'sh joy shu sondan oshmasa — "kam qoldi"
};

export const TEXT = {
  pains: [
    { title: 'Kechki soat 21:00, hovlida joy yo‘q', text: 'Uch marta aylanasiz, oxiri mashinani ko‘chada, yo‘l chetida qoldirasiz.' },
    { title: 'Tong — xavotir bilan', text: 'Birinchi ish — derazadan mashinaga qarash: joyidami, tirnalmadimi, jarima yo‘qmi.' },
    { title: 'Yonginangizda bo‘sh maydon', text: 'Idora yoki do‘kon hovlisi kechasi qulflangan va bo‘m-bo‘sh. Faqat kimdan so‘rashni bilmaysiz.' }
  ],
  steps: [
    { title: 'Joyni tanlaysiz', text: 'Xaritada qaysi turargohda nechta joy bo‘shligi ko‘rinadi. Bo‘sh joyni bosasiz.' },
    { title: 'Ism va telefon', text: 'Ro‘yxatdan o‘tish — ikki maydon. Joy darhol siz uchun ushlab turiladi.' },
    { title: 'Operator tasdiqlaydi', text: 'Qo‘ng‘iroq qilib, to‘lov va kirishni kelishadi. Oldindan hech narsa to‘lamaysiz.' }
  ],
  faq: [
    { q: 'Hozircha qaysi manzillarda ishlaysiz?', a: 'Ochiq turargohlar xaritada ko‘rsatilgan. Manzilingiz yo‘q bo‘lsa ham so‘rov qoldiring — talab ko‘p joyda birinchi bo‘lib ochamiz.' },
    { q: 'To‘lov qanday bo‘ladi?', a: 'Bron qilganingizdan keyin operator qo‘ng‘iroq qilib, narx va to‘lov tartibini kelishadi. Oldindan hech narsa to‘lamaysiz.' },
    { q: 'Bronni bekor qilsam bo‘ladimi?', a: 'Ha. «Bronlarim» bo‘limida istalgan vaqtda bekor qilasiz — joy boshqalarga bo‘shaydi.' }
  ],
  ui: {
    // Bosh qism va narx
    heroCard: 'Ochiq turargoh',
    noLocation: 'Bu tur uchun joy hali ochilmagan',
    noLocationNote: 'So‘rov qoldiring — talab yig‘ilgan manzilda birinchi ochamiz.',
    showOnMap: 'Xaritada ko‘rish',
    timeAgreed: 'Kelishiladi',
    priceAgreed: 'Kelishiladi',
    perUnit: '1 {unit} uchun',

    // Xarita va ro'yxat
    loading: 'Turargohlar yuklanmoqda…',
    loadError: 'Ma’lumot yuklanmadi. Internetni tekshirib, qayta urinib ko‘ring.',
    retry: 'Qayta urinish',
    noLots: 'Hozircha ochiq turargoh yo‘q. So‘rov qoldiring — operator yaqin atrofdan topib beradi.',
    mapEmpty: 'Bu vaqt uchun hozircha joy yo‘q. So‘rov qoldiring — yaqin atrofdan qidiramiz.',
    lotNoLayout: 'Bu turargohning joylar sxemasi kiritilmagan — operator bo‘sh joyni o‘zi beradi.',
    lotClosed: 'Bu vaqtda turargoh yopiq.',
    lotHint: 'Bo‘sh joyni bosing — keyin «Band qilish».',
    demoNote: 'Namuna ma’lumot — haqiqiy bandlik emas.',
    demoTag: 'Namuna',
    live: 'Jonli · {time}',

    locate: 'Menga yaqinlari',
    nearIdle: 'O‘zingizga yaqin turargohlarni ko‘rish uchun «Menga yaqinlari» tugmasini bosing.',
    nearLocating: 'Joylashuvingiz aniqlanmoqda…',
    nearFound: 'Eng yaqin bo‘sh joy: {title} — {dist}{walk}. {free} ta joy bo‘sh.',
    nearNone: 'Atrofda hozir bo‘sh joy topilmadi. So‘rov qoldiring — operator qidiradi.',
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
    factPrice: 'Narx',
    factUpdated: 'Holat',
    hours24: 'Kecha-kunduz',
    route: 'Yo‘l ko‘rsatish:',
    spotPicked: 'Joy {spot} tanlandi.',
    anySpot: 'Istalgan bo‘sh joy',
    bookSpot: 'Band qilish',

    // Bron oynasi
    bookTitle: 'Joyni band qilish',
    requestTitle: 'So‘rov qoldirish',
    requestNote: 'Manzil va vaqtni yozing — operator yaqin atrofdan joy topib, qo‘ng‘iroq qiladi.',
    soonNote: 'Bu tur hali ochilmagan — so‘rovingiz talab ro‘yxatiga yoziladi. Ochilganda birinchi bo‘lib xabar beramiz.',
    qtyOption: '{n} {unit}',
    total: 'Jami: {sum} {currency}',
    totalAgreed: 'Narxni operator qo‘ng‘iroqda aytadi.',
    submitBooking: 'Band qilish',
    submitRequest: 'So‘rovni yuborish',
    sending: 'Yuborilmoqda…',
    doneBooking: 'Bron #{id} qabul qilindi',
    doneRequest: 'So‘rov #{id} qabul qilindi',
    doneTextBooking: '{lot}, joy {spot} siz uchun ushlab turiladi ({period}, {from}). Operator tez orada {phone} raqamiga qo‘ng‘iroq qilib tasdiqlaydi.',
    doneTextRequest: 'Operator tez orada {phone} raqamiga qo‘ng‘iroq qiladi.',
    spotGone: 'Bu joyni hozirgina boshqa kishi band qildi. Xaritadan boshqa joyni tanlang.',

    // Bronlarim
    myTitle: 'Bronlarim',
    myEmpty: 'Hali bron yo‘q. Xaritadan bo‘sh joyni tanlang.',
    myDevice: 'Bronlar shu qurilmada saqlanadi.',
    cancel: 'Bekor qilish',
    cancelConfirm: 'Bronni bekor qilasizmi? Joy boshqalarga bo‘shaydi.',
    logoutConfirm: 'Chiqsangiz, bu qurilmada bronlaringiz ko‘rinmaydi (operatorda saqlanadi). Davom etasizmi?',
    request: 'So‘rov',
    status: { pending: 'Kutilmoqda', confirmed: 'Tasdiqlangan', cancelled: 'Bekor qilingan', rejected: 'Rad etilgan' }
  }
};
