import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { openDb, seedIfEmpty } from '../server/db.js';
import { silentLog } from '../server/log.js';
import { createService } from '../server/service.js';
import { addMonths, endDateFor, localNow, periodDate } from '../server/time.js';
import { normalizeName, normalizePhone, normalizePlate } from '../server/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Qotirilgan vaqt: 2026-10-06, Toshkentda 10:00 (kunduzgi davr)
const CLOCK = Date.parse('2026-10-06T05:00:00Z');
const ADMIN_PASSWORD = 'test-admin-password';

async function startApp() {
  const db = openDb(':memory:');
  seedIfEmpty(db, { demo: true, seedFile: path.join(ROOT, 'seed/lots.json') });
  const config = { adminPassword: ADMIN_PASSWORD, publicOrigin: '', trustProxy: false, cookieSecure: false };
  const service = createService(db, { tzOffsetMinutes: 300, clock: () => CLOCK });
  const auth = createAuth(db, config);
  const sent = [];
  const notifier = { enabled: true, send: async (text) => sent.push(text) };
  const server = http.createServer(createApp({ config, service, auth, notifier, log: silentLog }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { db, sent, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

/** Cookie'larni eslab qoladigan oddiy mijoz */
function client(base) {
  const jar = {};
  return async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    for (const c of res.headers.getSetCookie()) {
      const [k, v] = c.split(';')[0].split('=');
      if (v) jar[k] = v;
      else delete jar[k];
    }
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
  };
}

describe('yordamchilar', () => {
  test('telefon raqami bir xil ko‘rinishga keladi', () => {
    assert.equal(normalizePhone('90 123 45 67'), '+998901234567');
    assert.equal(normalizePhone('+998 (90) 123-45-67'), '+998901234567');
    assert.equal(normalizePhone('998901234567'), '+998901234567');
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone('+7 901 234 56 78'), null);
  });

  test('ism tekshiruvi', () => {
    assert.equal(normalizeName('  Ali   Valiyev '), 'Ali Valiyev');
    assert.equal(normalizeName('G‘ayrat'), 'G‘ayrat');
    assert.equal(normalizeName('Олим'), 'Олим');
    assert.equal(normalizeName('A'), null);
    assert.equal(normalizeName('<script>'), null);
  });

  test('mashina raqami formati', () => {
    assert.equal(normalizePlate('01a234bc'), '01 A 234 BC');
    assert.equal(normalizePlate('01234abc'), '01 234 ABC');
    assert.equal(normalizePlate(''), '');
    assert.equal(normalizePlate('x'), null);
  });

  test('sanalar: oy qo‘shish va bron oxiri', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(endDateFor('2026-10-06', 'oy', 1), '2026-11-05');
    assert.equal(endDateFor('2026-10-06', 'kun', 3), '2026-10-08');
  });

  test('yarim tundan keyingi tun kechagi sanaga tegishli', () => {
    const at2am = localNow(300, Date.parse('2026-10-06T21:00:00Z'));   // 07-oktabr, 02:00
    assert.equal(at2am.date, '2026-10-07');
    assert.equal(at2am.period, 'night');
    assert.equal(periodDate('night', at2am), '2026-10-06');
    assert.equal(periodDate('day', at2am), '2026-10-07');
  });
});

describe('API', () => {
  let app;
  before(async () => {
    app = await startApp();
  });
  after(() => app.close());

  test('turargohlar va bandlik', async () => {
    const { status, data } = await client(app.base)('GET', '/api/lots');
    assert.equal(status, 200);
    assert.equal(data.now.period, 'day');
    assert.ok(!data.lots.some((l) => l.id === 'pilot-1'), 'yashirin pilot ko‘rinmaydi');
    const idora = data.lots.find((l) => l.id === 'demo-idora');
    assert.deepEqual(idora.busy.night.sort(), ['A2', 'A5', 'B1', 'B4']);
  });

  test('ro‘yxatdan o‘tish: faqat ism va telefon', async () => {
    const call = client(app.base);
    const bad = await call('POST', '/api/auth/register', { name: 'A', phone: '123' });
    assert.equal(bad.status, 422);
    assert.ok(bad.data.error.fields.name && bad.data.error.fields.phone);

    const ok = await call('POST', '/api/auth/register', { name: 'Ali', phone: '90 123 45 67' });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.user.phone, '+998901234567');
    assert.match(ok.headers.get('set-cookie'), /jb_sid=.+HttpOnly; SameSite=Lax/);

    const me = await call('GET', '/api/me');
    assert.equal(me.data.user.name, 'Ali');

    // Sessiya bor — yangi hisob ochilmaydi, ma'lumot yangilanadi
    const again = await call('POST', '/api/auth/register', { name: 'Ali Valiyev', phone: '901234567' });
    assert.equal(again.status, 200);
    assert.equal(again.data.user.id, ok.data.user.id);
  });

  test('bron: joy ushlanadi, ikkinchi kishiga berilmaydi, bekor qilinsa bo‘shaydi', async () => {
    const ali = client(app.base);
    const vali = client(app.base);
    assert.equal((await ali('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-idora', spot: 'A1' })).status, 401);
    await ali('POST', '/api/auth/register', { name: 'Ali', phone: '901111111' });
    await vali('POST', '/api/auth/register', { name: 'Vali', phone: '902222222' });

    const b1 = await ali('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-idora', spot: 'A1', qty: 2, plate: '01a234bc' });
    assert.equal(b1.status, 201);
    assert.equal(b1.data.booking.status, 'pending');
    assert.equal(b1.data.booking.period, 'night');
    assert.equal(b1.data.booking.endDate, '2026-12-05');
    assert.equal(b1.data.booking.plate, '01 A 234 BC');
    assert.ok(app.sent.at(-1).includes('#ssenariy_tungi') && app.sent.at(-1).includes('joy A1'));

    const clash = await vali('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-idora', spot: 'A1', startDate: '2026-11-01' });
    assert.equal(clash.status, 409);
    assert.equal(clash.data.error.code, 'spot_taken');

    const blocked = await vali('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-idora', spot: 'A2' });
    assert.equal(blocked.status, 409, 'operator belgilagan joy');

    // Boshqa kishining broni ko'rinmaydi va bekor qilinmaydi
    assert.equal((await vali('POST', `/api/bookings/${b1.data.booking.id}/cancel`, {})).status, 404);

    let lots = (await ali('GET', '/api/lots')).data.lots;
    assert.ok(lots.find((l) => l.id === 'demo-idora').busy.night.includes('A1'));

    const cancelled = await ali('POST', `/api/bookings/${b1.data.booking.id}/cancel`, {});
    assert.equal(cancelled.data.booking.status, 'cancelled');
    assert.equal((await ali('POST', `/api/bookings/${b1.data.booking.id}/cancel`, {})).status, 200, 'qayta bosish xato emas');
    lots = (await ali('GET', '/api/lots')).data.lots;
    assert.ok(!lots.find((l) => l.id === 'demo-idora').busy.night.includes('A1'));

    const mine = await ali('GET', '/api/bookings');
    assert.equal(mine.data.bookings.length, 1);
    assert.equal((await vali('GET', '/api/bookings')).data.bookings.length, 0);
  });

  test('joy tanlanmasa — birinchi bo‘sh joy beriladi', async () => {
    const call = client(app.base);
    await call('POST', '/api/auth/register', { name: 'Sardor', phone: '903333333' });
    const r = await call('POST', '/api/bookings', { scenarioId: 'kunduzgi', lotId: 'demo-dokon' });
    assert.equal(r.status, 201);
    assert.equal(r.data.booking.spot, '1', '2 va 6 band, 1 bo‘sh');
  });

  test('noto‘g‘ri ma’lumotlar rad etiladi', async () => {
    const call = client(app.base);
    await call('POST', '/api/auth/register', { name: 'Test', phone: '904444444' });
    const past = await call('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-idora', spot: 'B2', startDate: '2026-10-01' });
    assert.equal(past.status, 422);
    assert.ok(past.data.error.fields.startDate);
    const qty = await call('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-idora', spot: 'B2', qty: 13 });
    assert.ok(qty.data.error.fields.qty);
    const ghost = await call('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-idora', spot: 'Z9' });
    assert.ok(ghost.data.error.fields.spot);
    const wrongType = await call('POST', '/api/bookings', { scenarioId: 'kunduzgi', lotId: 'demo-idora' });
    assert.ok(wrongType.data.error.fields.scenarioId, 'idora hovlisi faqat tunda');
    assert.equal((await call('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'yoq-lot' })).status, 404);
  });

  test('“tez orada” turi — umumiy so‘rov, joy ushlanmaydi', async () => {
    const call = client(app.base);
    await call('POST', '/api/auth/register', { name: 'Dilnoza', phone: '905555555' });
    const r = await call('POST', '/api/bookings', { scenarioId: 'soatlik', date: '2026-10-10', timeFrom: '10:00', timeTo: '12:00', address: 'Chorsu' });
    assert.equal(r.status, 201);
    assert.equal(r.data.booking.lotId, null);
    assert.equal(r.data.booking.period, null);
    assert.ok(app.sent.at(-1).startsWith('Yangi so‘rov'));
    const bad = await call('POST', '/api/bookings', { scenarioId: 'soatlik', timeFrom: '12:00', timeTo: '10:00' });
    assert.ok(bad.data.error.fields.timeTo);
  });

  test('bir kishida 5 tadan ortiq faol bron bo‘lmaydi', async () => {
    const call = client(app.base);
    await call('POST', '/api/auth/register', { name: 'Ko‘p', phone: '906666666' });
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/bookings', { scenarioId: 'tadbir' })).status, 201);
    const sixth = await call('POST', '/api/bookings', { scenarioId: 'tadbir' });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.data.error.code, 'too_many');
  });

  test('CSRF: boshqa sayt va JSON bo‘lmagan so‘rov rad etiladi', async () => {
    const call = client(app.base);
    const evil = await call('POST', '/api/auth/register', { name: 'X', phone: '901234567' }, { origin: 'https://evil.example' });
    assert.equal(evil.status, 403);
    const form = await call('POST', '/api/auth/register', 'name=X', { 'content-type': 'application/x-www-form-urlencoded' });
    assert.equal(form.status, 415);
    const same = await call('POST', '/api/auth/register', { name: 'Ok', phone: '907777777' }, { origin: app.base });
    assert.equal(same.status, 201);
  });

  test('operator paneli', async () => {
    const admin = client(app.base);
    assert.equal((await admin('GET', '/api/admin/bookings')).status, 401);
    assert.equal((await admin('POST', '/api/admin/login', { password: 'xato' })).status, 401);
    const login = await admin('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /jb_admin=.+SameSite=Strict/);

    // Mijoz bron qiladi, operator tasdiqlaydi
    const driver = client(app.base);
    await driver('POST', '/api/auth/register', { name: 'Bek', phone: '908888888' });
    const { data } = await driver('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'demo-biznes', spot: 'C1' });
    const list = await admin('GET', '/api/admin/bookings?status=pending');
    const row = list.data.bookings.find((b) => b.id === data.booking.id);
    assert.equal(row.userPhone, '+998908888888');
    const confirmed = await admin('POST', `/api/admin/bookings/${row.id}/status`, { status: 'confirmed' });
    assert.equal(confirmed.data.booking.status, 'confirmed');

    // Sxemadan faol bronli joyni olib tashlab bo'lmaydi
    const lots = (await admin('GET', '/api/admin/lots')).data.lots;
    const biznes = lots.find((l) => l.id === 'demo-biznes');
    assert.equal(biznes.booked.night.C1, row.id);
    const shrink = await admin('PUT', '/api/admin/lots/demo-biznes', { ...biznes, rows: [['C2', 'C3']] });
    assert.equal(shrink.status, 409);

    // Yangi turargoh va operator belgisi
    const created = await admin('PUT', '/api/admin/lots/yangi-hovli', {
      title: 'Yangi hovli', address: 'Chilonzor', lat: 41.3, lng: 69.2, scenarioIds: ['tungi'],
      prices: { tungi: 300000 }, rows: [['A1', 'A2']], isActive: true
    });
    assert.equal(created.status, 200);
    assert.equal((await admin('POST', '/api/admin/lots/yangi-hovli/blocks', { spot: 'A2', period: 'night', blocked: true })).status, 200);
    const pub = (await driver('GET', '/api/lots')).data.lots.find((l) => l.id === 'yangi-hovli');
    assert.deepEqual(pub.busy.night, ['A2']);
    assert.equal(pub.prices.tungi, 300000);

    const priced = await driver('POST', '/api/bookings', { scenarioId: 'tungi', lotId: 'yangi-hovli', qty: 3 });
    assert.equal(priced.data.booking.spot, 'A1');
    assert.equal(priced.data.booking.price, 900000);

    const stats = await admin('GET', '/api/admin/stats');
    assert.ok(stats.data.scenarios.find((s) => s.id === 'tungi').total >= 2);

    // Mijoz cookie'si bilan operator API'siga kirib bo'lmaydi
    assert.equal((await driver('GET', '/api/admin/stats')).status, 401);
  });

  test('statik fayllar va himoya sarlavhalari', async () => {
    const call = client(app.base);
    const home = await call('GET', '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await call('GET', '/shared/scenarios.js')).status, 200);
    assert.equal((await call('GET', '/admin')).status, 200);
    assert.equal((await call('GET', '/admin/')).status, 200);
    for (const evil of ['/../server/config.js', '/%2e%2e/server/config.js', '/shared/../server/config.js', '/..%2fpackage.json']) {
      assert.equal((await call('GET', evil)).status, 404, evil);
    }
    assert.equal((await call('GET', '/api/yoq')).status, 404);
    assert.equal((await call('DELETE', '/api/lots')).status, 405);
  });
});
