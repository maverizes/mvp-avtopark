// Ma'lumotlar bazasi: lokal SQLite (Node ichida, fayl) yoki Turso (libSQL — serverless, masalan Vercel).
// Ikkalasida SQL bir xil, interfeys ham bir xil va asinxron:
//   get(sql, args) -> qator | undefined     all(sql, args) -> qatorlar
//   run(sql, args) -> { changes, lastInsertRowid }
//   exec(sql)      — bir nechta buyruq (migratsiya)
//   tx(async (t) => ...) — yozish tranzaksiyasi; t ham shu interfeysga ega
import fs from 'node:fs';
import path from 'node:path';

// Faqat oxiriga qo'shiladi — mavjud migratsiyani o'zgartirmang.
const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS users_phone ON users (phone);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('user', 'admin')),
    user_id    INTEGER REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);

  CREATE TABLE IF NOT EXISTS lots (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    address      TEXT NOT NULL DEFAULT '',
    lat          REAL,
    lng          REAL,
    scenario_ids TEXT NOT NULL DEFAULT '[]',
    prices       TEXT NOT NULL DEFAULT '{}',
    rows         TEXT,
    slots        INTEGER,
    is_active    INTEGER NOT NULL DEFAULT 1,
    is_demo      INTEGER NOT NULL DEFAULT 0,
    sort         INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Operator qo'lda band deb belgilagan joylar (doimiy ijarachi va h.k.)
  CREATE TABLE IF NOT EXISTS blocks (
    lot_id     TEXT NOT NULL REFERENCES lots (id) ON DELETE CASCADE,
    spot       TEXT NOT NULL,
    period     TEXT NOT NULL CHECK (period IN ('night', 'day')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (lot_id, spot, period)
  );

  -- Bron (lot_id va period bor) yoki umumiy so'rov (period NULL)
  CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    scenario_id TEXT NOT NULL,
    lot_id      TEXT REFERENCES lots (id),
    spot        TEXT,
    period      TEXT CHECK (period IN ('night', 'day')),
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    qty         INTEGER NOT NULL DEFAULT 1,
    time_from   TEXT,
    time_to     TEXT,
    cars        INTEGER,
    plate       TEXT NOT NULL DEFAULT '',
    address     TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    price       INTEGER,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS bookings_occupancy ON bookings (lot_id, period, status, start_date, end_date);
  CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id, created_at);
  CREATE INDEX IF NOT EXISTS bookings_status ON bookings (status, created_at);
  `
];

/** config.db.url bo'lsa — Turso/libSQL, aks holda lokal fayl (config.dbPath) */
export async function openDb(config) {
  const db = config.db?.url ? await openLibsql(config.db) : await openLocal(config.dbPath);
  await migrate(db);
  return db;
}

// ---------- Lokal: Node ichidagi SQLite ----------

async function openLocal(file) {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  const api = {
    kind: 'sqlite',
    get: async (sql, args = []) => stmt(sql).get(...args),
    all: async (sql, args = []) => stmt(sql).all(...args),
    run: async (sql, args = []) => {
      const r = stmt(sql).run(...args);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    exec: async (sql) => raw.exec(sql),
    close: async () => raw.close()
  };

  // Bu SQLite sinxron: tranzaksiya ichida faqat baza chaqiruvlari kutiladi (tarmoq yoki taymer yo'q),
  // shuning uchun boshqa so'rovlar orasiga kira olmaydi. Tranzaksiyalar navbat bilan bajariladi.
  let chain = Promise.resolve();
  api.tx = (fn) => {
    const run = async () => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(api);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  };
  return api;
}

// ---------- Turso / libSQL ----------

async function openLibsql({ url, authToken }) {
  const isFile = url.startsWith('file:');
  // Masofaviy baza — sof JS (fetch) mijozi; serverless uchun HTTP (libsql:// -> https://)
  const { createClient } = await import(isFile ? '@libsql/client' : '@libsql/client/web');
  const client = createClient({ url: isFile ? url : url.replace(/^libsql:\/\//, 'https://'), authToken: authToken || undefined });

  const wrap = (execute) => ({
    get: async (sql, args = []) => (await execute({ sql, args })).rows[0],
    all: async (sql, args = []) => (await execute({ sql, args })).rows,
    run: async (sql, args = []) => {
      const r = await execute({ sql, args });
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid == null ? 0 : Number(r.lastInsertRowid) };
    }
  });

  return {
    kind: isFile ? 'libsql-file' : 'turso',
    ...wrap((s) => client.execute(s)),
    exec: (sql) => client.executeMultiple(sql),
    async tx(fn) {
      const t = await client.transaction('write');
      try {
        const result = await fn({ ...wrap((s) => t.execute(s)), exec: (sql) => t.executeMultiple(sql) });
        await t.commit();
        return result;
      } catch (err) {
        if (!t.closed) await t.rollback().catch(() => {});
        throw err;
      } finally {
        t.close();
      }
    },
    close: async () => client.close()
  };
}

// ---------- Migratsiyalar ----------

async function migrate(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  // Yozish tranzaksiyasi: bir vaqtda ishga tushgan bir nechta nusxa migratsiyani ikki marta bajarmaydi
  await db.tx(async (t) => {
    const now = new Date().toISOString();
    let done = (await t.get('SELECT COALESCE(MAX(version), 0) AS v FROM _migrations')).v;
    if (done === 0 && db.kind === 'sqlite') {
      // Avvalgi lokal baza: versiya PRAGMA user_version da saqlangan edi
      const legacy = (await t.get('PRAGMA user_version')).user_version;
      for (let v = 1; v <= legacy; v++) await t.run('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)', [v, now]);
      done = legacy;
    }
    for (let v = done; v < MIGRATIONS.length; v++) {
      await t.exec(MIGRATIONS[v]);
      await t.run('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)', [v + 1, now]);
    }
  });
}

/** Bazadagi qatorni API ko'rinishiga o'tkazish */
export function lotFromRow(r) {
  return {
    id: r.id,
    title: r.title,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    scenarioIds: JSON.parse(r.scenario_ids),
    prices: JSON.parse(r.prices),
    rows: r.rows ? JSON.parse(r.rows) : null,
    slots: r.slots,
    isActive: !!r.is_active,
    isDemo: !!r.is_demo,
    sort: r.sort
  };
}

/**
 * Bo'sh bazaga boshlang'ich turargohlar: pilot (yashirin, operator to'ldiradi)
 * va ixtiyoriy namunalar (bandligi operator belgisi sifatida yoziladi).
 */
export async function seedIfEmpty(db, { demo, lots }) {
  return db.tx(async (t) => {
    if ((await t.get('SELECT COUNT(*) AS n FROM lots')).n > 0) return 0;
    const list = lots.filter((l) => demo || !l.isDemo);
    for (const [i, l] of list.entries()) {
      await t.run(`
        INSERT INTO lots (id, title, address, lat, lng, scenario_ids, prices, rows, slots, is_active, is_demo, sort)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [l.id, l.title, l.address ?? '', l.lat ?? null, l.lng ?? null, JSON.stringify(l.scenarioIds),
        JSON.stringify(l.prices ?? {}), l.rows ? JSON.stringify(l.rows) : null, l.slots ?? null,
        l.isActive === false ? 0 : 1, l.isDemo ? 1 : 0, i]);
      for (const [period, spots] of Object.entries(l.busy ?? {})) {
        for (const spot of spots) await t.run('INSERT INTO blocks (lot_id, spot, period) VALUES (?, ?, ?)', [l.id, spot, period]);
      }
    }
    return list.length;
  });
}
