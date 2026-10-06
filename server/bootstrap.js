// Ilovani yig'ish: baza -> boshlang'ich ma'lumot -> servislar -> HTTP handler.
// Lokal server (server/index.js) ham, Vercel funksiyasi (api/index.js) ham shuni ishlatadi.
import fs from 'node:fs';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { openDb, seedIfEmpty } from './db.js';
import { createNotifier } from './notify.js';
import { createService } from './service.js';

export async function createRuntime(config, log) {
  const db = await openDb(config);
  // new URL(..., import.meta.url) — Vercel faylni funksiya paketiga o'zi qo'shadi
  const seedLots = JSON.parse(fs.readFileSync(new URL('../seed/lots.json', import.meta.url), 'utf8'));
  const seeded = await seedIfEmpty(db, { demo: config.seedDemo, lots: seedLots });
  if (seeded) log.info('seeded', { lots: seeded, demo: config.seedDemo });

  const service = createService(db, config);
  const auth = createAuth(db, config);
  const notifier = createNotifier(config.telegram, log, config.serverless ? { attempts: 1, timeoutMs: 4000 } : {});
  const handler = createApp({ config, service, auth, notifier, log, dbKind: db.kind });
  return { db, auth, notifier, handler };
}
