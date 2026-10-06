// Biznes-mantiq: turargohlar, bandlik, bronlar, operator amallari.
import { PERIODS, SCENARIOS, scenarioById } from '../shared/scenarios.js';
import { lotFromRow, tx } from './db.js';
import { addDays, endDateFor, isDate, localNow, periodDate } from './time.js';
import {
  HttpError, cleanText, collector, isSlug, isSpotId, isTime, normalizeName, normalizePhone, normalizePlate
} from './validate.js';

const ACTIVE_STATUSES = ['pending', 'confirmed'];
const STATUSES = ['pending', 'confirmed', 'cancelled', 'rejected'];
const MAX_ACTIVE_PER_USER = 5;
const MAX_ADVANCE_DAYS = 60;
const MAX_REQUEST_ADVANCE_DAYS = 180;
const MAX_SPOTS = 300;

const isActiveStatus = (s) => ACTIVE_STATUSES.includes(s);
const flatSpots = (lot) => (lot.rows ? lot.rows.flat() : []);

function bookingDto(r) {
  return {
    id: r.id,
    status: r.status,
    scenarioId: r.scenario_id,
    lotId: r.lot_id,
    lotTitle: r.lot_title ?? null,
    lotAddress: r.lot_address ?? null,
    lat: r.lot_lat ?? null,
    lng: r.lot_lng ?? null,
    spot: r.spot,
    period: r.period,
    startDate: r.start_date,
    endDate: r.end_date,
    qty: r.qty,
    timeFrom: r.time_from,
    timeTo: r.time_to,
    cars: r.cars,
    plate: r.plate,
    address: r.address,
    note: r.note,
    price: r.price,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

const BOOKING_SELECT = `
  SELECT b.*, l.title AS lot_title, l.address AS lot_address, l.lat AS lot_lat, l.lng AS lot_lng,
         u.name AS user_name, u.phone AS user_phone
  FROM bookings b
  LEFT JOIN lots l ON l.id = b.lot_id
  JOIN users u ON u.id = b.user_id`;

export function createService(db, { tzOffsetMinutes, clock = () => Date.now() }) {
  const now = () => localNow(tzOffsetMinutes, clock());
  const nowIso = () => new Date(clock()).toISOString();

  const q = {
    lotsActive: db.prepare('SELECT * FROM lots WHERE is_active = 1 ORDER BY sort, title'),
    lotsAll: db.prepare('SELECT * FROM lots ORDER BY sort, title'),
    lot: db.prepare('SELECT * FROM lots WHERE id = ?'),
    blocksAll: db.prepare('SELECT lot_id, spot, period FROM blocks'),
    blocksFor: db.prepare('SELECT spot FROM blocks WHERE lot_id = ? AND period = ?'),
    // Shu sanani qamrab olgan faol bronlar
    activeOn: db.prepare(`
      SELECT id, lot_id, spot, period FROM bookings
      WHERE status IN ('pending', 'confirmed') AND lot_id IS NOT NULL
        AND period = ? AND start_date <= ? AND end_date >= ?`),
    // Muddati kesishgan faol bronlar: (start <= yangi_end) va (end >= yangi_start)
    overlapping: db.prepare(`
      SELECT id, spot FROM bookings
      WHERE lot_id = ? AND period = ? AND status IN ('pending', 'confirmed')
        AND start_date <= ? AND end_date >= ? AND id != ?`),
    userActiveCount: db.prepare(`
      SELECT COUNT(*) AS n FROM bookings
      WHERE user_id = ? AND status IN ('pending', 'confirmed') AND end_date >= ?`),
    insertBooking: db.prepare(`
      INSERT INTO bookings (user_id, scenario_id, lot_id, spot, period, start_date, end_date, qty,
                            time_from, time_to, cars, plate, address, note, price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    bookingById: db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`),
    bookingsOfUser: db.prepare(`${BOOKING_SELECT} WHERE b.user_id = ? ORDER BY b.id DESC LIMIT 50`),
    setStatus: db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (name, phone) VALUES (?, ?)'),
    updateUser: db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?'),
    userById: db.prepare('SELECT id, name, phone FROM users WHERE id = ?')
  };

  const getLot = (id) => {
    const row = isSlug(id) ? q.lot.get(id) : null;
    return row ? lotFromRow(row) : null;
  };

  /** Davr bo'yicha band joylar va joysiz bronlar soni: Map<lotId, {busy:{night,day}, taken:{night,day}}> */
  function occupancy(at) {
    const map = new Map();
    const entry = (id) => {
      if (!map.has(id)) map.set(id, { busy: { night: new Set(), day: new Set() }, taken: { night: 0, day: 0 } });
      return map.get(id);
    };
    for (const period of Object.keys(PERIODS)) {
      const date = periodDate(period, at);
      for (const b of q.activeOn.all(period, date, date)) {
        if (b.spot) entry(b.lot_id).busy[period].add(b.spot);
        else entry(b.lot_id).taken[period] += 1;
      }
    }
    for (const b of q.blocksAll.all()) entry(b.lot_id).busy[b.period].add(b.spot);
    return map;
  }

  function publicLot(lot, occ) {
    const o = occ.get(lot.id);
    const valid = new Set(flatSpots(lot));
    const busy = (p) => (o ? [...o.busy[p]].filter((s) => valid.has(s)) : []);
    return {
      id: lot.id,
      title: lot.title,
      address: lot.address,
      lat: lot.lat,
      lng: lot.lng,
      scenarioIds: lot.scenarioIds,
      prices: lot.prices,
      rows: lot.rows,
      slots: lot.slots,
      isDemo: lot.isDemo,
      busy: { night: busy('night'), day: busy('day') },
      taken: o ? o.taken : { night: 0, day: 0 }
    };
  }

  // ---------- Foydalanuvchi ----------

  function validateProfile(input) {
    const c = collector();
    const name = normalizeName(input.name);
    const phone = normalizePhone(input.phone);
    if (!name) c.fail('name', 'Ismingizni yozing (2–60 harf).');
    if (!phone) c.fail('phone', 'Telefon raqamini to‘liq yozing: 90 123 45 67.');
    c.done();
    return { name, phone };
  }

  function createUser(input) {
    const { name, phone } = validateProfile(input);
    const { lastInsertRowid } = q.insertUser.run(name, phone);
    return q.userById.get(Number(lastInsertRowid));
  }

  function updateUser(userId, input) {
    const { name, phone } = validateProfile(input);
    q.updateUser.run(name, phone, userId);
    return q.userById.get(userId);
  }

  // ---------- Bronlar ----------

  /** Muddat ichida band joylar (bronlar + operator belgilari) */
  function takenSpots(lotId, period, start, end, exceptId = 0) {
    const rows = q.overlapping.all(lotId, period, end, start, exceptId);
    const spots = new Set(rows.filter((r) => r.spot).map((r) => r.spot));
    for (const b of q.blocksFor.all(lotId, period)) spots.add(b.spot);
    return { spots, unassigned: rows.filter((r) => !r.spot).length };
  }

  function createBooking(user, input) {
    const c = collector();
    const scenario = scenarioById(input.scenarioId);
    if (!scenario) throw new HttpError(422, 'validation', 'Joy turini tanlang', { scenarioId: 'Joy turini tanlang.' });

    const today = now().date;
    const plate = normalizePlate(input.plate);
    if (plate === null) c.fail('plate', 'Mashina raqamini tekshiring: 01 A 234 BC.');
    const note = cleanText(input.note, 300);
    if (note === null) c.fail('note', 'Izoh 300 belgidan oshmasin.');
    const address = cleanText(input.address, 200);
    if (address === null) c.fail('address', 'Manzil 200 belgidan oshmasin.');

    let lot = null;
    if (input.lotId != null && input.lotId !== '') {
      lot = getLot(input.lotId);
      if (!lot || !lot.isActive) throw new HttpError(404, 'lot_not_found', 'Turargoh topilmadi yoki yopilgan.');
    }

    // Faol tur + turargoh — aniq joy ushlab turiladi; aks holda umumiy so'rov
    const isSpotBooking = !!lot && scenario.active && !!scenario.period;

    if (q.userActiveCount.get(user.id, today).n >= MAX_ACTIVE_PER_USER) {
      throw new HttpError(409, 'too_many', `Bir vaqtda ${MAX_ACTIVE_PER_USER} tadan ortiq faol bron bo‘lmaydi. Keraksizini bekor qiling.`);
    }

    if (isSpotBooking) {
      if (!lot.scenarioIds.includes(scenario.id)) c.fail('scenarioId', 'Bu turargohda bunday joy yo‘q.');
      const start = input.startDate || today;
      if (!isDate(start) || start < today || start > addDays(today, MAX_ADVANCE_DAYS)) {
        c.fail('startDate', `Boshlanish sanasi bugundan ${MAX_ADVANCE_DAYS} kungacha bo‘lsin.`);
      }
      const qty = input.qty == null || input.qty === '' ? 1 : Number(input.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > scenario.maxQty) c.fail('qty', `Muddat 1–${scenario.maxQty} ${scenario.unit}.`);
      const spots = flatSpots(lot);
      const wanted = input.spot == null || input.spot === '' ? null : input.spot;
      if (wanted !== null && (!isSpotId(wanted) || !spots.includes(wanted))) c.fail('spot', 'Bunday joy yo‘q.');
      c.done();

      const end = endDateFor(start, scenario.unit, qty);
      const unitPrice = lot.prices?.[scenario.id];
      const price = Number.isInteger(unitPrice) ? unitPrice * qty : null;

      const id = tx(db, () => {
        const taken = takenSpots(lot.id, scenario.period, start, end);
        let spot = null;
        if (spots.length) {
          spot = wanted ?? spots.find((s) => !taken.spots.has(s)) ?? null;
          if (!spot) throw new HttpError(409, 'lot_full', 'Bu muddatga bo‘sh joy qolmagan. Boshqa turargohni tanlang.');
          if (taken.spots.has(spot)) throw new HttpError(409, 'spot_taken', 'Bu joy tanlangan muddatda band. Boshqa joyni tanlang.');
        } else if (Number.isInteger(lot.slots) && taken.unassigned >= lot.slots) {
          throw new HttpError(409, 'lot_full', 'Bu muddatga bo‘sh joy qolmagan. Boshqa turargohni tanlang.');
        }
        return Number(q.insertBooking.run(user.id, scenario.id, lot.id, spot, scenario.period, start, end, qty,
          null, null, null, plate, address, note, price).lastInsertRowid);
      });
      return bookingDto(q.bookingById.get(id));
    }

    // Umumiy so'rov: hamma maydonlar ixtiyoriy, faqat formati tekshiriladi
    const date = input.date || input.startDate || '';
    if (date && (!isDate(date) || date < today || date > addDays(today, MAX_REQUEST_ADVANCE_DAYS))) {
      c.fail(input.date ? 'date' : 'startDate', 'Sanani tekshiring: bugundan keyingi sana bo‘lsin.');
    }
    const timeFrom = input.timeFrom || null;
    const timeTo = input.timeTo || null;
    if (timeFrom && !isTime(timeFrom)) c.fail('timeFrom', 'Vaqtni tekshiring.');
    if (timeTo && !isTime(timeTo)) c.fail('timeTo', 'Vaqtni tekshiring.');
    if (timeFrom && timeTo && isTime(timeFrom) && isTime(timeTo) && timeTo <= timeFrom) {
      c.fail('timeTo', 'Tugash vaqti boshlanishidan keyin bo‘lsin.');
    }
    const cars = input.cars == null || input.cars === '' ? null : Number(input.cars);
    if (cars !== null && (!Number.isInteger(cars) || cars < 1 || cars > 500)) c.fail('cars', 'Mashinalar soni 1–500.');
    c.done();

    // period = NULL: so'rov joy ushlab turmaydi va sig'imni egallamaydi
    const start = date || today;
    const id = Number(q.insertBooking.run(user.id, scenario.id, lot?.id ?? null, null, null,
      start, start, 1, timeFrom, timeTo, cars, plate, address, note, null).lastInsertRowid);
    return bookingDto(q.bookingById.get(id));
  }

  function bookingsOf(userId) {
    return q.bookingsOfUser.all(userId).map(bookingDto);
  }

  /** @returns {{ booking, changed: boolean }} — qayta bosilsa ham xato bermaydi */
  function cancelBooking(userId, id) {
    const row = Number.isInteger(id) ? q.bookingById.get(id) : null;
    if (!row || row.user_id !== userId) throw new HttpError(404, 'not_found', 'Bron topilmadi.');
    const changed = isActiveStatus(row.status);
    if (changed) q.setStatus.run('cancelled', nowIso(), id);
    return { booking: bookingDto(q.bookingById.get(id)), changed };
  }

  // ---------- Operator ----------

  function adminBookings({ status, limit = 300 }) {
    const where = STATUSES.includes(status) ? 'WHERE b.status = ?' : '';
    const stmt = db.prepare(`${BOOKING_SELECT} ${where} ORDER BY b.id DESC LIMIT ?`);
    const rows = where ? stmt.all(status, limit) : stmt.all(limit);
    return rows.map((r) => ({ ...bookingDto(r), userName: r.user_name, userPhone: r.user_phone }));
  }

  function setBookingStatus(id, status) {
    if (!STATUSES.includes(status)) throw new HttpError(422, 'validation', 'Holat noto‘g‘ri.');
    return tx(db, () => {
      const row = Number.isInteger(id) ? q.bookingById.get(id) : null;
      if (!row) throw new HttpError(404, 'not_found', 'Bron topilmadi.');
      // Bekor qilingan bronni qayta faollashtirishda joy hali bo'shmi, tekshiramiz
      if (isActiveStatus(status) && !isActiveStatus(row.status) && row.spot) {
        const taken = takenSpots(row.lot_id, row.period, row.start_date, row.end_date, row.id);
        if (taken.spots.has(row.spot)) throw new HttpError(409, 'spot_taken', 'Bu joy shu muddatda boshqa bronga berilgan.');
      }
      q.setStatus.run(status, nowIso(), id);
      const updated = q.bookingById.get(id);
      return { ...bookingDto(updated), userName: updated.user_name, userPhone: updated.user_phone };
    });
  }

  function adminLots() {
    const at = now();
    const occ = occupancy(at);
    const booked = { night: new Map(), day: new Map() };
    for (const period of Object.keys(PERIODS)) {
      const date = periodDate(period, at);
      for (const b of q.activeOn.all(period, date, date)) {
        if (b.spot) booked[period].set(`${b.lot_id}/${b.spot}`, b.id);
      }
    }
    const blocks = q.blocksAll.all();
    return q.lotsAll.all().map(lotFromRow).map((lot) => ({
      ...lot,
      blocks: {
        night: blocks.filter((b) => b.lot_id === lot.id && b.period === 'night').map((b) => b.spot),
        day: blocks.filter((b) => b.lot_id === lot.id && b.period === 'day').map((b) => b.spot)
      },
      booked: Object.fromEntries(Object.keys(PERIODS).map((p) => [p,
        Object.fromEntries(flatSpots(lot).filter((s) => booked[p].has(`${lot.id}/${s}`)).map((s) => [s, booked[p].get(`${lot.id}/${s}`)]))
      ])),
      taken: occ.get(lot.id)?.taken ?? { night: 0, day: 0 }
    }));
  }

  function validateLot(id, input) {
    const c = collector();
    if (!isSlug(id)) c.fail('id', 'ID: kichik lotin harflar, raqam va chiziqcha (2–48).');
    const title = cleanText(input.title, 80);
    if (!title || title.length < 2) c.fail('title', 'Nomini yozing (2–80 belgi).');
    const address = cleanText(input.address, 200);
    if (address === null) c.fail('address', 'Manzil 200 belgidan oshmasin.');

    const num = (v) => (v === '' || v == null ? null : Number(v));
    const lat = num(input.lat);
    const lng = num(input.lng);
    if ((lat === null) !== (lng === null)) c.fail('lat', 'Kenglik va uzunlik birga kiritiladi.');
    if (lat !== null && !(Number.isFinite(lat) && lat >= -90 && lat <= 90)) c.fail('lat', 'Kenglik −90…90.');
    if (lng !== null && !(Number.isFinite(lng) && lng >= -180 && lng <= 180)) c.fail('lng', 'Uzunlik −180…180.');

    const scenarioIds = Array.isArray(input.scenarioIds) ? [...new Set(input.scenarioIds)] : [];
    if (!scenarioIds.length || scenarioIds.some((s) => !scenarioById(s))) c.fail('scenarioIds', 'Kamida bitta joy turini belgilang.');

    const prices = {};
    for (const [k, v] of Object.entries(input.prices && typeof input.prices === 'object' ? input.prices : {})) {
      if (v === '' || v == null) continue;
      const n = Number(v);
      if (!scenarioById(k) || !Number.isInteger(n) || n < 0 || n > 100_000_000) c.fail(`price_${k}`, 'Narx — butun son (so‘m).');
      else prices[k] = n;
    }

    let rows = null;
    if (input.rows != null && input.rows !== '') {
      const ok = Array.isArray(input.rows) && input.rows.every((r) => Array.isArray(r) && r.length && r.length <= 40 && r.every(isSpotId));
      const flat = ok ? input.rows.flat() : [];
      if (!ok || !flat.length) c.fail('rows', 'Sxema: har qatorda joy nomlari (A1, A2 …).');
      else if (new Set(flat).size !== flat.length) c.fail('rows', 'Joy nomlari takrorlanmasin.');
      else if (flat.length > MAX_SPOTS) c.fail('rows', `Ko‘pi bilan ${MAX_SPOTS} ta joy.`);
      else rows = input.rows;
    }
    const slots = num(input.slots);
    if (slots !== null && !(Number.isInteger(slots) && slots >= 1 && slots <= 5000)) c.fail('slots', 'Joylar soni — musbat butun son.');
    c.done();

    return {
      title, address, lat, lng, scenarioIds, prices, rows, slots: rows ? null : slots,
      isActive: input.isActive !== false,
      isDemo: typeof input.isDemo === 'boolean' ? input.isDemo : null,
      sort: Number.isInteger(input.sort) ? input.sort : null
    };
  }

  function upsertLot(id, input) {
    const v = validateLot(id, input);
    return tx(db, () => {
      const existing = getLot(id);
      if (existing && existing.rows) {
        // Sxemadan olib tashlanayotgan joyda faol bron bo'lsa — ruxsat yo'q
        const keep = new Set(v.rows ? v.rows.flat() : []);
        const removed = flatSpots(existing).filter((s) => !keep.has(s));
        if (removed.length) {
          const marks = removed.map(() => '?').join(',');
          const busy = db.prepare(`
            SELECT DISTINCT spot FROM bookings
            WHERE lot_id = ? AND status IN ('pending', 'confirmed') AND end_date >= ? AND spot IN (${marks})`)
            .all(id, now().date, ...removed).map((r) => r.spot);
          if (busy.length) throw new HttpError(409, 'spot_has_bookings', `Bu joylarda faol bron bor: ${busy.join(', ')}. Avval bronlarni yakunlang.`);
          db.prepare(`DELETE FROM blocks WHERE lot_id = ? AND spot IN (${marks})`).run(id, ...removed);
        }
      }
      // Berilmagan bo'lsa — tartib va namuna belgisi o'zgarmaydi
      const sort = v.sort ?? existing?.sort ?? db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM lots').get().n;
      const isDemo = v.isDemo ?? existing?.isDemo ?? false;
      db.prepare(`
        INSERT INTO lots (id, title, address, lat, lng, scenario_ids, prices, rows, slots, is_active, is_demo, sort, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          title = excluded.title, address = excluded.address, lat = excluded.lat, lng = excluded.lng,
          scenario_ids = excluded.scenario_ids, prices = excluded.prices, rows = excluded.rows,
          slots = excluded.slots, is_active = excluded.is_active, is_demo = excluded.is_demo,
          sort = excluded.sort, updated_at = excluded.updated_at`)
        .run(id, v.title, v.address, v.lat, v.lng, JSON.stringify(v.scenarioIds), JSON.stringify(v.prices),
          v.rows ? JSON.stringify(v.rows) : null, v.slots, v.isActive ? 1 : 0, isDemo ? 1 : 0, sort, nowIso());
      return getLot(id);
    });
  }

  function setBlock(lotId, { spot, period, blocked }) {
    const lot = getLot(lotId);
    if (!lot) throw new HttpError(404, 'lot_not_found', 'Turargoh topilmadi.');
    if (!PERIODS[period]) throw new HttpError(422, 'validation', 'Davr noto‘g‘ri.');
    if (!isSpotId(spot) || !flatSpots(lot).includes(spot)) throw new HttpError(422, 'validation', 'Bunday joy yo‘q.');
    if (blocked) db.prepare('INSERT OR IGNORE INTO blocks (lot_id, spot, period) VALUES (?, ?, ?)').run(lotId, spot, period);
    else db.prepare('DELETE FROM blocks WHERE lot_id = ? AND spot = ? AND period = ?').run(lotId, spot, period);
    return { spot, period, blocked: !!blocked };
  }

  function stats() {
    const since = (days) => new Date(clock() - days * 86_400_000).toISOString();
    const counts = db.prepare('SELECT scenario_id, status, COUNT(*) AS n FROM bookings GROUP BY scenario_id, status').all();
    const scenarios = SCENARIOS.map((s) => {
      const row = { id: s.id, title: s.title, active: s.active, total: 0 };
      for (const st of STATUSES) row[st] = 0;
      for (const cnt of counts.filter((x) => x.scenario_id === s.id)) {
        row[cnt.status] = cnt.n;
        row.total += cnt.n;
      }
      return row;
    });
    const count = (sql, ...args) => db.prepare(sql).get(...args).n;
    return {
      scenarios,
      last7: count('SELECT COUNT(*) AS n FROM bookings WHERE created_at >= ?', since(7)),
      last30: count('SELECT COUNT(*) AS n FROM bookings WHERE created_at >= ?', since(30)),
      users: count('SELECT COUNT(*) AS n FROM users'),
      pending: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending'")
    };
  }

  return {
    now,
    listLots() {
      const at = now();
      const occ = occupancy(at);
      return { now: { date: at.date, time: at.time, period: at.period }, lots: q.lotsActive.all().map(lotFromRow).map((l) => publicLot(l, occ)) };
    },
    createUser,
    updateUser,
    createBooking,
    bookingsOf,
    cancelBooking,
    adminBookings,
    setBookingStatus,
    adminLots,
    upsertLot,
    setBlock,
    stats
  };
}
