// Kirish nuqtasi: sozlamalar -> baza -> HTTP server. SIGTERM'da toza to'xtaydi.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { loadConfig } from './config.js';
import { openDb, seedIfEmpty } from './db.js';
import { log } from './log.js';
import { createNotifier } from './notify.js';
import { createService } from './service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env bo'lsa — o'qiymiz (Docker'da o'zgaruvchilar tashqaridan beriladi)
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* .env yo'q — muhit o'zgaruvchilari ishlatiladi */
}

let config;
try {
  config = loadConfig();
} catch (err) {
  log.error('config_error', { error: err.message });
  process.exit(1);
}

const db = openDb(config.dbPath);
const seeded = seedIfEmpty(db, { demo: config.seedDemo, seedFile: path.join(ROOT, 'seed/lots.json') });
if (seeded) log.info('seeded', { lots: seeded, demo: config.seedDemo });

const service = createService(db, config);
const auth = createAuth(db, config);
const notifier = createNotifier(config.telegram, log);
const server = http.createServer(createApp({ config, service, auth, notifier, log }));
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, config.host, () => {
  log.info('listening', { port: config.port, production: config.production, telegram: notifier.enabled, db: config.dbPath });
  if (config.generatedAdminPassword) {
    process.stdout.write(`\n  Operator paneli: http://localhost:${config.port}/admin\n`
      + `  Vaqtinchalik parol: ${config.adminPassword}\n`
      + '  (doimiy parol uchun .env faylida ADMIN_PASSWORD ni o‘rnating)\n\n');
  }
});

const purge = setInterval(() => auth.purgeExpired(), 3_600_000);
purge.unref();

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info('shutdown', { signal });
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
