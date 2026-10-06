// Sessiyalar: tasodifiy token cookie'da, bazada faqat uning SHA-256 xeshi.
//
// Telefon tasdiqlanmaydi, shuning uchun telefon — bu aloqa ma'lumoti, kirish kaliti emas:
// hisob qurilmadagi sessiyaga bog'langan. Begona raqamni yozib, birovning bronlarini ko'rib bo'lmaydi.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { serializeCookie } from './http.js';

const KINDS = {
  user: { cookie: 'jb_sid', ttlMs: 180 * 86_400_000, sameSite: 'Lax' },
  admin: { cookie: 'jb_admin', ttlMs: 12 * 3_600_000, sameSite: 'Strict' }
};

const sha256 = (s) => createHash('sha256').update(s).digest();
const hashToken = (t) => sha256(t).toString('hex');

export function createAuth(db, config) {
  const insert = db.prepare('INSERT INTO sessions (token_hash, kind, user_id, expires_at) VALUES (?, ?, ?, ?)');
  const select = db.prepare(`
    SELECT s.user_id AS userId, u.name, u.phone
    FROM sessions s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.kind = ? AND s.expires_at > ?`);
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  const adminHash = sha256(config.adminPassword);

  const tokenFrom = (ctx, kind) => {
    const t = ctx.cookies[KINDS[kind].cookie];
    return typeof t === 'string' && /^[\w-]{43}$/.test(t) ? t : null;
  };

  return {
    /** Yangi sessiya; cookie javobga qo'shiladi */
    start(ctx, kind, userId = null) {
      const { cookie, ttlMs, sameSite } = KINDS[kind];
      const token = randomBytes(32).toString('base64url');
      insert.run(hashToken(token), kind, userId, new Date(Date.now() + ttlMs).toISOString());
      ctx.setCookie(serializeCookie(cookie, token, { maxAge: ttlMs / 1000, secure: ctx.secure, sameSite }));
    },

    /** Foydalanuvchi sessiyasi: { id, name, phone } | null */
    user(ctx) {
      const token = tokenFrom(ctx, 'user');
      if (!token) return null;
      const row = select.get(hashToken(token), 'user', new Date().toISOString());
      return row && row.userId ? { id: row.userId, name: row.name, phone: row.phone } : null;
    },

    isAdmin(ctx) {
      const token = tokenFrom(ctx, 'admin');
      return !!token && !!select.get(hashToken(token), 'admin', new Date().toISOString());
    },

    end(ctx, kind) {
      const token = tokenFrom(ctx, kind);
      if (token) remove.run(hashToken(token));
      const { cookie, sameSite } = KINDS[kind];
      ctx.setCookie(serializeCookie(cookie, '', { maxAge: 0, secure: ctx.secure, sameSite }));
    },

    /** Parolni doimiy vaqtda solishtirish (vaqt bo'yicha taxmin qilib bo'lmaydi) */
    checkAdminPassword(input) {
      return typeof input === 'string' && input.length <= 200 && timingSafeEqual(sha256(input), adminHash);
    },

    purgeExpired() {
      return purge.run(new Date().toISOString()).changes;
    }
  };
}
