// HTTP ilova: API marshrutlari + statik fayllar. Testlarda ham shu funksiya ishlatiladi.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERIODS, scenarioById } from '../shared/scenarios.js';
import { createRouter, parseCookies, readJson, securityHeaders, sendJson, serveStatic } from './http.js';
import { rateLimiter } from './ratelimit.js';
import { HttpError } from './validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/', path.join(ROOT, 'public')]
];
const PAGES = { '/': '/index.html', '/admin': '/admin.html', '/admin/': '/admin.html' };

/** Operatorga yuboriladigan matn (oddiy matn — formatlash belgilari xavfsiz) */
function bookingMessage(b, user, origin) {
  const s = scenarioById(b.scenarioId);
  const period = b.period ? PERIODS[b.period] : null;
  const lines = [
    `${period ? 'Yangi bron' : 'Yangi so‘rov'} #${b.id}`,
    `${s.title}${s.active ? '' : ' (talab ro‘yxati)'} · #ssenariy_${s.id}`
  ];
  if (b.lotTitle) lines.push(`Turargoh: ${b.lotTitle}${b.spot ? `, joy ${b.spot}` : ''}`);
  if (period) lines.push(`Muddat: ${b.startDate} — ${b.endDate} (${period.label.toLowerCase()} ${period.from}–${period.to})`);
  else lines.push(`Sana: ${b.startDate}${b.timeFrom ? `, ${b.timeFrom}–${b.timeTo ?? ''}` : ''}`);
  if (b.cars) lines.push(`Mashinalar: ${b.cars}`);
  if (b.address) lines.push(`Manzil: ${b.address}`);
  if (b.price != null) lines.push(`Narx: ${b.price.toLocaleString('ru-RU')} so‘m`);
  lines.push('', `Ism: ${user.name}`, `Telefon: ${user.phone}`);
  if (b.plate) lines.push(`Mashina: ${b.plate}`);
  if (b.note) lines.push(`Izoh: ${b.note}`);
  lines.push('', `Panel: ${origin}/admin`);
  return lines.join('\n');
}

export function createApp({ config, service, auth, notifier, log }) {
  const router = createRouter();
  const limits = {
    api: rateLimiter({ windowMs: 60_000, max: 300 }),
    register: rateLimiter({ windowMs: 3_600_000, max: 20 }),
    booking: rateLimiter({ windowMs: 3_600_000, max: 30 }),
    adminLogin: rateLimiter({ windowMs: 15 * 60_000, max: 10 })
  };

  const limit = (name, ctx) => {
    const r = limits[name].take(`${name}:${ctx.ip}`);
    if (r.ok) return;
    ctx.res.setHeader('Retry-After', String(r.retryAfter));
    throw new HttpError(429, 'rate_limited', `Juda ko‘p urinish. ${Math.max(1, Math.ceil(r.retryAfter / 60))} daqiqadan keyin qayta urinib ko‘ring.`);
  };
  const requireUser = (ctx) => {
    const user = auth.user(ctx);
    if (!user) throw new HttpError(401, 'auth_required', 'Avval ism va telefon raqamingizni kiriting.');
    return user;
  };
  const requireAdmin = (ctx) => {
    if (!auth.isAdmin(ctx)) throw new HttpError(401, 'admin_required', 'Operator sifatida kiring.');
  };
  const idParam = (v) => (/^\d{1,10}$/.test(v) ? Number(v) : NaN);

  // ---------- Ommaviy ----------
  router.get('/api/health', () => ({ ok: true }));
  router.get('/api/lots', () => service.listLots());

  // ---------- Haydovchi ----------
  // Ro'yxatdan o'tish: faqat ism va telefon. Sessiya bo'lsa — ma'lumot yangilanadi.
  router.post('/api/auth/register', async (ctx) => {
    limit('register', ctx);
    const body = await ctx.body();
    const current = auth.user(ctx);
    if (current) return { user: service.updateUser(current.id, body) };
    const user = service.createUser(body);
    auth.start(ctx, 'user', user.id);
    ctx.status = 201;
    return { user };
  });
  router.get('/api/me', (ctx) => ({ user: auth.user(ctx) }));
  router.patch('/api/me', async (ctx) => ({ user: service.updateUser(requireUser(ctx).id, await ctx.body()) }));
  router.post('/api/auth/logout', async (ctx) => {
    await ctx.body();
    auth.end(ctx, 'user');
    return { ok: true };
  });

  router.get('/api/bookings', (ctx) => ({ bookings: service.bookingsOf(requireUser(ctx).id) }));
  router.post('/api/bookings', async (ctx) => {
    const user = requireUser(ctx);
    limit('booking', ctx);
    const booking = service.createBooking(user, await ctx.body());
    void notifier.send(bookingMessage(booking, user, ctx.origin));
    ctx.status = 201;
    return { booking };
  });
  router.post('/api/bookings/:id/cancel', async (ctx) => {
    const user = requireUser(ctx);
    await ctx.body();
    const { booking, changed } = service.cancelBooking(user.id, idParam(ctx.params.id));
    if (changed) void notifier.send(`Bron #${booking.id} mijoz tomonidan bekor qilindi.\n${user.name}, ${user.phone}`);
    return { booking };
  });

  // ---------- Operator ----------
  router.post('/api/admin/login', async (ctx) => {
    limit('adminLogin', ctx);
    const { password } = await ctx.body();
    if (!auth.checkAdminPassword(password)) throw new HttpError(401, 'bad_password', 'Parol noto‘g‘ri.');
    auth.start(ctx, 'admin');
    return { ok: true };
  });
  router.post('/api/admin/logout', async (ctx) => {
    await ctx.body();
    auth.end(ctx, 'admin');
    return { ok: true };
  });
  router.get('/api/admin/me', (ctx) => ({ admin: auth.isAdmin(ctx) }));
  router.get('/api/admin/bookings', (ctx) => {
    requireAdmin(ctx);
    return { bookings: service.adminBookings({ status: ctx.query.get('status') }) };
  });
  router.post('/api/admin/bookings/:id/status', async (ctx) => {
    requireAdmin(ctx);
    const { status } = await ctx.body();
    return { booking: service.setBookingStatus(idParam(ctx.params.id), status) };
  });
  router.get('/api/admin/lots', (ctx) => {
    requireAdmin(ctx);
    return { lots: service.adminLots(), now: service.now() };
  });
  router.put('/api/admin/lots/:id', async (ctx) => {
    requireAdmin(ctx);
    return { lot: service.upsertLot(ctx.params.id, await ctx.body()) };
  });
  router.post('/api/admin/lots/:id/blocks', async (ctx) => {
    requireAdmin(ctx);
    return service.setBlock(ctx.params.id, await ctx.body());
  });
  router.get('/api/admin/stats', (ctx) => {
    requireAdmin(ctx);
    return service.stats();
  });

  // ---------- So'rovni qayta ishlash ----------

  const clientIp = (req) => {
    if (config.trustProxy) {
      // Oxirgi qiymatni ishonchli proksi qo'shgan; chapdagilarni mijoz soxtalashtirishi mumkin
      const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (xff.length) return xff[xff.length - 1];
    }
    return req.socket.remoteAddress || 'unknown';
  };

  // CSRF: o'zgartiruvchi so'rov faqat o'z saytimizdan (Origin) va faqat JSON (readJson tekshiradi)
  const checkOrigin = (ctx) => {
    const { origin, host } = ctx.req.headers;
    if (origin) {
      const allowed = new Set([`http://${host}`, `https://${host}`]);
      if (config.publicOrigin) allowed.add(config.publicOrigin);
      const fwdHost = config.trustProxy && ctx.req.headers['x-forwarded-host'];
      if (fwdHost) allowed.add(`https://${String(fwdHost).split(',')[0].trim()}`);
      if (!allowed.has(origin)) throw new HttpError(403, 'bad_origin', 'So‘rov boshqa saytdan keldi.');
      return;
    }
    const site = ctx.req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'bad_origin', 'So‘rov boshqa saytdan keldi.');
  };

  async function handleApi(ctx) {
    limit('api', ctx);
    const { req, res } = ctx;
    if (req.method !== 'GET' && req.method !== 'HEAD') checkOrigin(ctx);
    const m = router.match(req.method, ctx.url.pathname);
    if (!m) throw new HttpError(404, 'not_found', 'Topilmadi.');
    if (m.allowed) {
      res.setHeader('Allow', m.allowed.join(', '));
      throw new HttpError(405, 'method_not_allowed', 'Bu usul qo‘llanmaydi.');
    }
    ctx.params = m.params;
    const data = await m.handler(ctx);
    if (ctx.cookiesOut.length) res.setHeader('Set-Cookie', ctx.cookiesOut);
    sendJson(res, ctx.status, data);
  }

  return async function handle(req, res) {
    const started = performance.now();
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const proto = config.trustProxy ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
    const isHttps = !!req.socket.encrypted || proto === 'https';
    const ctx = {
      req,
      res,
      url,
      query: url.searchParams,
      params: {},
      ip: clientIp(req),
      secure: config.cookieSecure || isHttps,
      origin: config.publicOrigin || `${isHttps ? 'https' : 'http'}://${req.headers.host}`,
      cookies: parseCookies(req.headers.cookie),
      status: 200,
      cookiesOut: [],
      setCookie(c) {
        this.cookiesOut.push(c);
      },
      _body: null,
      body() {
        this._body ??= readJson(req);
        return this._body;
      }
    };
    securityHeaders(res, { secure: isHttps });

    const isApi = url.pathname.startsWith('/api/');
    try {
      if (isApi) {
        await handleApi(ctx);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        const file = PAGES[url.pathname] ?? url.pathname;
        if (!serveStatic(req, res, file, MOUNTS)) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><meta charset="utf-8"><title>Topilmadi</title><p>Sahifa topilmadi. <a href="/">Bosh sahifa</a></p>');
        }
      } else {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      }
    } catch (err) {
      if (res.headersSent) {
        res.destroy(err);
      } else if (err instanceof HttpError) {
        sendJson(res, err.status, { error: { code: err.code, message: err.message, fields: err.fields } });
      } else {
        log.error('unhandled', { path: url.pathname, error: err.message, stack: err.stack });
        sendJson(res, 500, { error: { code: 'internal', message: 'Serverda xato. Birozdan keyin qayta urinib ko‘ring.' } });
      }
    } finally {
      if (isApi) {
        log.info('request', { method: req.method, path: url.pathname, status: res.statusCode, ms: Math.round(performance.now() - started) });
      }
    }
  };
}
