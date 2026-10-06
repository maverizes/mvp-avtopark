// Vercel funksiyasi: /api/* so'rovlari shu yerga keladi (vercel.json). Sahifa va rasmlarni Vercel o'zi beradi.
// Ilova bir marta yig'iladi va keyingi so'rovlarda qayta ishlatiladi.
import { createRuntime } from '../server/bootstrap.js';
import { ConfigError, loadConfig } from '../server/config.js';
import { sendJson } from '../server/http.js';
import { log } from '../server/log.js';

let runtime = null;

export default async function handler(req, res) {
  try {
    runtime ??= createRuntime(loadConfig(), log);
    const { handler: app } = await runtime;
    return await app(req, res);
  } catch (err) {
    runtime = null;   // keyingi so'rovda qayta urinib ko'ramiz
    log.error('startup_failed', { error: err.message });
    // Sozlama xatosini aniq aytamiz (sir emas); boshqasini — umumiy matn bilan
    const message = err instanceof ConfigError ? err.message : 'Server ishga tushmadi: ma’lumotlar bazasiga ulanib bo‘lmadi. Vercel loglarini tekshiring.';
    if (!res.headersSent) sendJson(res, 503, { error: { code: 'misconfigured', message } });
  }
}
