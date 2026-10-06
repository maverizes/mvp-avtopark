// Kiruvchi ma'lumotlarni tekshirish va bir xil ko'rinishga keltirish.

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code    — mashina o'qiydigan kod (frontend shunga qarab ish tutadi)
   * @param {string} message — foydalanuvchiga ko'rsatiladigan matn
   * @param {Record<string,string>} [fields] — maydon bo'yicha xatolar
   */
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** Maydon xatolarini yig'ib, oxirida bitta 422 javob beradi */
export function collector() {
  const fields = {};
  return {
    fail(field, message) {
      if (!fields[field]) fields[field] = message;
    },
    done() {
      if (Object.keys(fields).length) throw new HttpError(422, 'validation', 'Ma’lumotlarda xato bor', fields);
    }
  };
}

/** O'zbekiston raqami: "90 123 45 67", "+998901234567", "998-90-..." -> "+998901234567" */
export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits;
  return /^\d{9}$/.test(local) ? `+998${local}` : null;
}

/** Ism: harflar, bo'sh joy, apostrof va chiziqcha; 2–60 belgi */
export function normalizeName(input) {
  const s = String(input ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 60) return null;
  return /^\p{L}[\p{L}\p{M} .'ʻʼ‘’`-]*$/u.test(s) ? s : null;
}

/** Mashina raqami: "01a234bc" -> "01 A 234 BC", yuridik shaxs: "01234abc" -> "01 234 ABC" */
export function normalizePlate(input) {
  const raw = String(input ?? '').toUpperCase().trim();
  if (!raw) return '';
  const t = raw.replace(/[^0-9A-Z]/g, '');
  let m = t.match(/^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  m = t.match(/^(\d{2})(\d{3})([A-Z]{3})$/);
  if (m) return `${m[1]} ${m[2]} ${m[3]}`;
  return t.length >= 4 && t.length <= 10 ? t : null;
}

/** Erkin matn: bo'sh joylarni siqib, uzunlikni cheklaydi */
export function cleanText(input, max) {
  const s = String(input ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? null : s;
}

export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Turargoh identifikatori (URL'da ishlatiladi) */
export const isSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,47}$/.test(s);

/** Joy nomi sxemada: "A1", "12", "K-3" */
export const isSpotId = (s) => typeof s === 'string' && /^[0-9A-Za-z][0-9A-Za-z-]{0,7}$/.test(s);
