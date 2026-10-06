// Muhit o'zgaruvchilaridan sozlamalar. Xato sozlamada server ishga tushmaydi.
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const bool = (v, fallback) => (v == null || v === '' ? fallback : /^(1|true|yes|on)$/i.test(v));
const int = (v, fallback) => (v == null || v === '' ? fallback : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';

  let adminPassword = env.ADMIN_PASSWORD || '';
  let generatedAdminPassword = false;
  if (!adminPassword) {
    if (production) throw new Error('ADMIN_PASSWORD o‘rnatilmagan');
    adminPassword = randomBytes(9).toString('base64url');
    generatedAdminPassword = true;
  }
  if (production && adminPassword.length < 12) throw new Error('ADMIN_PASSWORD kamida 12 belgi bo‘lsin');

  const port = int(env.PORT, 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT noto‘g‘ri: ${env.PORT}`);

  const publicOrigin = (env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  if (publicOrigin && !/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new Error(`PUBLIC_ORIGIN noto‘g‘ri: ${publicOrigin}`);

  return {
    production,
    port,
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH === ':memory:' ? ':memory:' : path.resolve(env.DB_PATH || 'data/joybor.db'),
    adminPassword,
    generatedAdminPassword,
    publicOrigin,
    trustProxy: bool(env.TRUST_PROXY, false),
    cookieSecure: bool(env.COOKIE_SECURE, production),
    seedDemo: bool(env.SEED_DEMO, !production),
    // Toshkent: UTC+5, yozgi vaqt yo'q
    tzOffsetMinutes: int(env.TZ_OFFSET_MINUTES, 300),
    telegram: { token: env.TELEGRAM_BOT_TOKEN || '', chatId: env.TELEGRAM_CHAT_ID || '' }
  };
}
