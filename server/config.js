// Muhit o'zgaruvchilaridan sozlamalar. Xato sozlamada ilova ishga tushmaydi va sababini aytadi.
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** Sozlama xatosi: xabari xavfsiz, foydalanuvchiga ko'rsatish mumkin */
export class ConfigError extends Error {}

const bool = (v, fallback) => (v == null || v === '' ? fallback : /^(1|true|yes|on)$/i.test(v));
const int = (v, fallback) => (v == null || v === '' ? fallback : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  // Vercel kabi serverless muhit: fayl tizimi faqat o'qish uchun, jarayon doimiy emas
  const serverless = !!env.VERCEL;

  let adminPassword = env.ADMIN_PASSWORD || '';
  let generatedAdminPassword = false;
  if (!adminPassword) {
    if (production || serverless) throw new ConfigError('ADMIN_PASSWORD o‘rnatilmagan. Vercel: Settings → Environment Variables.');
    adminPassword = randomBytes(9).toString('base64url');
    generatedAdminPassword = true;
  }
  if ((production || serverless) && adminPassword.length < 12) throw new ConfigError('ADMIN_PASSWORD kamida 12 belgi bo‘lsin.');

  const port = int(env.PORT, 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`PORT noto‘g‘ri: ${env.PORT}`);

  const publicOrigin = (env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  if (publicOrigin && !/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new ConfigError(`PUBLIC_ORIGIN noto‘g‘ri: ${publicOrigin}`);

  // Masofaviy baza (Turso / libSQL). Berilmasa — lokal fayl
  const dbUrl = env.TURSO_DATABASE_URL || env.LIBSQL_URL
    || (/^(libsql|https|file):/.test(env.DATABASE_URL || '') ? env.DATABASE_URL : '');
  if (serverless && !dbUrl) {
    throw new ConfigError('Ma’lumotlar bazasi ulanmagan. Vercel’da TURSO_DATABASE_URL va TURSO_AUTH_TOKEN ni o‘rnating (README: “Vercel’ga joylash”).');
  }

  return {
    production,
    serverless,
    port,
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH === ':memory:' ? ':memory:' : path.resolve(env.DB_PATH || 'data/joybor.db'),
    db: { url: dbUrl, authToken: env.TURSO_AUTH_TOKEN || env.LIBSQL_AUTH_TOKEN || '' },
    adminPassword,
    generatedAdminPassword,
    publicOrigin,
    trustProxy: bool(env.TRUST_PROXY, serverless),
    cookieSecure: bool(env.COOKIE_SECURE, production || serverless),
    seedDemo: bool(env.SEED_DEMO, !(production || serverless)),
    // Toshkent: UTC+5, yozgi vaqt yo'q
    tzOffsetMinutes: int(env.TZ_OFFSET_MINUTES, 300),
    telegram: { token: env.TELEGRAM_BOT_TOKEN || '', chatId: env.TELEGRAM_CHAT_ID || '' }
  };
}
