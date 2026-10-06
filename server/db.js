// SQLite (Node ichida). Sxema migratsiyalar bilan; versiya PRAGMA user_version da saqlanadi.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Faqat oxiriga qo'shiladi — mavjud migratsiyani o'zgartirmang.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX users_phone ON users (phone);

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('user', 'admin')),
    user_id    INTEGER REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX sessions_expires ON sessions (expires_at);

  CREATE TABLE lots (
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
  CREATE TABLE blocks (
    lot_id     TEXT NOT NULL REFERENCES lots (id) ON DELETE CASCADE,
    spot       TEXT NOT NULL,
    period     TEXT NOT NULL CHECK (period IN ('night', 'day')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (lot_id, spot, period)
  );

  -- Bron (lot_id bor) yoki umumiy so'rov (lot_id NULL)
  CREATE TABLE bookings (
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
  CREATE INDEX bookings_occupancy ON bookings (lot_id, period, status, start_date, end_date);
  CREATE INDEX bookings_user ON bookings (user_id, created_at);
  CREATE INDEX bookings_status ON bookings (status, created_at);
  `
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(db);
  return db;
}

function migrate(db) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get();
  for (let v = current; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Tranzaksiya: yozish qulfi darhol olinadi, xatoda hammasi bekor qilinadi */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
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
 * va ixtiyoriy namunalar (bandlik operator belgisi sifatida yoziladi).
 */
export function seedIfEmpty(db, { demo, seedFile }) {
  if (db.prepare('SELECT COUNT(*) AS n FROM lots').get().n > 0) return 0;
  const lots = JSON.parse(fs.readFileSync(seedFile, 'utf8')).filter((l) => demo || !l.isDemo);
  const insLot = db.prepare(`
    INSERT INTO lots (id, title, address, lat, lng, scenario_ids, prices, rows, slots, is_active, is_demo, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insBlock = db.prepare('INSERT INTO blocks (lot_id, spot, period) VALUES (?, ?, ?)');
  tx(db, () => {
    lots.forEach((l, i) => {
      insLot.run(l.id, l.title, l.address ?? '', l.lat ?? null, l.lng ?? null, JSON.stringify(l.scenarioIds),
        JSON.stringify(l.prices ?? {}), l.rows ? JSON.stringify(l.rows) : null, l.slots ?? null,
        l.isActive === false ? 0 : 1, l.isDemo ? 1 : 0, i);
      for (const [period, spots] of Object.entries(l.busy ?? {})) {
        for (const spot of spots) insBlock.run(l.id, spot, period);
      }
    });
  });
  return lots.length;
}
