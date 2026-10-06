// Joy turlari va sutka davrlari — server ham, brauzer ham shu fayldan foydalanadi.

/** Sutka davrlari: bandlik har biri uchun alohida yuritiladi. */
export const PERIODS = {
  night: { label: 'Tunda', from: '19:00', to: '08:00' },
  day: { label: 'Kunduzi', from: '08:00', to: '19:00' }
};

/**
 * Joy turlari.
 * unit       — to'lov birligi: 'soat' | 'kun' | 'oy'
 * period     — joy qaysi davrda band qilinadi (null — vaqt kelishiladi)
 * timeWindow — {from, to}; null — vaqt kelishiladi
 * fields     — so'rov formasida chiqadigan qo'shimcha maydonlar (hammasi ixtiyoriy)
 * maxQty     — bir bronda nechta birlik olish mumkin
 * active     — false: "tez orada", ariza talab ro'yxatiga yoziladi, joy ushlab turilmaydi
 */
export const SCENARIOS = [
  {
    id: 'tungi',
    title: 'Tungi joy',
    subtitle: 'Uyingiz yonida, har kecha. Oylik to‘lov.',
    heroTitle: 'Kechqurun uyga qaytdingiz — mashinangizning joyi tayyor',
    heroText: 'Yaqin atrofdagi idora yoki do‘kon hovlisi kechasi bo‘sh turadi. Biz sizga o‘sha joyni oylik asosda topib beramiz.',
    unit: 'oy',
    period: 'night',
    timeWindow: { from: '19:00', to: '08:00' },
    fields: ['startDate'],
    maxQty: 12,
    active: true
  },
  {
    id: 'kunduzgi',
    title: 'Kunduzgi joy',
    subtitle: 'Ish joyingiz yoki markaz yonida. Kunlik yoki oylik.',
    heroTitle: 'Ishga keldingiz — joy qidirib aylanmaysiz',
    heroText: 'Kunduzi bo‘sh turadigan hovli va turargohlarda sizga doimiy joy ajratamiz.',
    unit: 'kun',
    period: 'day',
    timeWindow: { from: '08:00', to: '19:00' },
    fields: ['startDate'],
    maxQty: 31,
    active: true
  },
  {
    id: 'soatlik',
    title: 'Soatlik joy',
    subtitle: 'Bozor, poliklinika, davlat idorasi yonida — bir necha soatga.',
    heroTitle: 'Bir-ikki soatlik ish uchun — yaqin joy',
    heroText: 'Kerakli manzil va vaqtni yozing, yaqin atrofdan joy topishga harakat qilamiz.',
    unit: 'soat',
    period: 'day',
    timeWindow: { from: '08:00', to: '20:00' },
    fields: ['date', 'timeFrom', 'timeTo'],
    maxQty: 1,
    active: false
  },
  {
    id: 'tadbir',
    title: 'Tadbir uchun',
    subtitle: 'To‘y, yig‘ilish — bir kunga bir nechta joy.',
    heroTitle: 'Mehmonlaringiz mashinasi uchun joy',
    heroText: 'Tadbir sanasi va mashinalar sonini yozing — bir kunlik guruh bandlovini kelishamiz.',
    unit: 'kun',
    period: null,
    timeWindow: null,
    fields: ['date', 'cars'],
    maxQty: 1,
    active: false
  }
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) || null;

/** "19:30" -> 1170 */
export const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

/** Daqiqa vaqt oralig'idami. Oraliq yarim tundan o'tishi mumkin (19:00–08:00). */
export function inWindow(win, minutes) {
  if (!win) return false;
  const a = toMin(win.from);
  const b = toMin(win.to);
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

/** Daqiqaga mos davr: 'night' | 'day' */
export const periodAt = (minutes) => (inWindow(PERIODS.night, minutes) ? 'night' : 'day');

/** Davr o'rtasidagi daqiqa — turargoh shu davrda ochiqmi, tekshirish uchun */
export function periodMid(period) {
  const w = PERIODS[period];
  const a = toMin(w.from);
  const b = toMin(w.to);
  return (a + ((b - a + 1440) % 1440) / 2) % 1440;
}

/** Turargoh shu davrda ishlaydimi: biror ssenariysi davr o'rtasini qamrab olsa */
export function lotOpenIn(scenarioIds, period) {
  const mid = periodMid(period);
  return scenarioIds.some((id) => inWindow(scenarioById(id)?.timeWindow, mid));
}
