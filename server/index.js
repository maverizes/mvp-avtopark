// Lokal/VPS server: sozlamalar -> ilova -> HTTP. SIGTERM'da toza to'xtaydi.
// Vercel'da bu fayl ishlatilmaydi — u yerda api/index.js.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from './bootstrap.js';
import { loadConfig } from './config.js';
import { log } from './log.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env bo'lsa — o'qiymiz (tashqaridan berilgan o'zgaruvchilar ustun)
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* .env yo'q — muhit o'zgaruvchilari ishlatiladi */
}

let config;
let runtime;
try {
  config = loadConfig();
  runtime = await createRuntime(config, log);
} catch (err) {
  log.error('startup_failed', { error: err.message });
  process.exit(1);
}

const server = http.createServer(runtime.handler);
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, config.host, () => {
  log.info('listening', {
    port: config.port, production: config.production, db: runtime.db.kind, telegram: runtime.notifier.enabled
  });
  if (config.generatedAdminPassword) {
    process.stdout.write(`\n  Operator paneli: http://localhost:${config.port}/admin\n`
      + `  Vaqtinchalik parol: ${config.adminPassword}\n`
      + '  (doimiy parol uchun .env faylida ADMIN_PASSWORD ni o‘rnating)\n\n');
  }
});

const purge = setInterval(() => runtime.auth.purgeExpired().catch(() => {}), 3_600_000);
purge.unref();

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info('shutdown', { signal });
  server.close(async () => {
    await runtime.db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
