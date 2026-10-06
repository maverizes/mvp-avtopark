// JoyBor — bosh sahifa: joy turlari, xarita va jonli bandlik, bron, "Bronlarim".
import { PERIODS, SCENARIOS, inWindow, lotOpenIn, periodAt, scenarioById } from '/shared/scenarios.js';
import { api } from './api.js';
import { CONFIG, TEXT } from './content.js';
import {
  $, $$, fmt, fmtDate, fmtMoney, fmtParts, fmtPhone, formatPlate, h, isPlaceholder, maskPhone, reducedMotion
} from './dom.js';
import { createMap } from './map.js';

const u = TEXT.ui;

// ================= Holat =================

const state = {
  scenarioId: null,
  period: 'now',          // 'now' | 'night' | 'day'
  onlyFree: false,
  lots: [],
  lotsStatus: 'loading',  // 'loading' | 'ready' | 'error'
  lotsSig: '',
  serverNow: null,        // { date, time, period } — Toshkent vaqti
  mapLocationId: null,
  picked: null,           // { lotId, spot, period }
  me: null,               // { lat, lng, acc, manual }
  geo: 'off',             // 'off' | 'locating' | 'on' | 'manual' | 'error'
  geoMsg: '',
  pickMode: false,
  lastKey: null,
  shown: null,
  user: null,             // { id, name, phone }
  bookings: []
};

const current = () => scenarioById(state.scenarioId) || SCENARIOS[0];
const lotById = (id) => state.lots.find((l) => l.id === id) || null;
const locScenarios = (lot) => lot.scenarioIds.map(scenarioById).filter(Boolean);
/** Turargohda shu davrda bron qilinadigan (faol) tur */
const scenarioFor = (lot, period) => locScenarios(lot).find((s) => s.active && s.period === period) || null;
const timeText = (win) => (win ? `${win.from}–${win.to}` : u.timeAgreed);
const today = () => state.serverNow?.date || new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function priceText(lot, s) {
  const p = lot?.prices?.[s.id];
  return Number.isInteger(p) ? `${fmtMoney(p)} ${CONFIG.currency} / ${s.unit}` : u.priceAgreed;
}

/** 'now' bo'lsa — server (Toshkent) vaqti bo'yicha davr */
const periodKey = () => (state.period !== 'now' ? state.period
  : state.serverNow?.period || periodAt(new Date().getHours() * 60 + new Date().getMinutes()));

// ================= Bandlik =================

/** Joylar statistikasi. Sxemasiz turargohda — sig'im (slots) bo'yicha */
function lotStats(lot, k) {
  const open = lotOpenIn(lot.scenarioIds, k);
  if (lot.rows) {
    const spots = lot.rows.flat();
    const busy = new Set(open ? lot.busy[k] : spots);
    return { spots, busy, open, total: spots.length, free: spots.filter((x) => !busy.has(x)).length };
  }
  if (Number.isInteger(lot.slots)) {
    return { spots: null, busy: new Set(), open, total: lot.slots, free: open ? Math.max(0, lot.slots - (lot.taken?.[k] || 0)) : 0 };
  }
  return null;
}

/** Holat: ok | low | full | closed | unknown */
function lotStatus(lot, k) {
  const st = lotStats(lot, k);
  if (!lotOpenIn(lot.scenarioIds, k)) return { kind: 'closed', text: u.statusClosed, short: '' };
  if (!st) return { kind: 'unknown', text: fmt(u.statusUnknown, { slots: '—' }), short: '' };
  if (!st.free) return { kind: 'full', text: u.statusFull, short: '0' };
  if (st.free <= CONFIG.lowSpots) return { kind: 'low', text: fmt(u.statusLow, st), short: String(st.free) };
  return { kind: 'ok', text: fmt(u.statusFree, st), short: String(st.free) };
}

// ================= Masofa =================

const hasPoint = (l) => !!l && typeof l.lat === 'number' && typeof l.lng === 'number';
function distM(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(q));
}
const locDist = (l) => (state.me && hasPoint(l) ? distM(state.me, l) : null);
function fmtDist(m) {
  if (m < 995) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}
const walkText = (m) => (m <= 2000 ? fmt(u.walk, { min: Math.max(1, Math.round(m / CONFIG.walkSpeed)) }) : '');

// ================= Sozlamalar va statik bloklar =================

function renderConfig() {
  document.title = `${CONFIG.brand} — turargoh joyi`;
  $$('[data-cfg]').forEach((el) => {
    el.textContent = CONFIG[el.dataset.cfg] ?? '';
  });
  // To'ldirilmagan aloqa havolalari ko'rsatilmaydi
  $$('[data-cfg-href]').forEach((el) => {
    const tel = el.dataset.cfgHref === 'tel';
    const value = tel ? CONFIG.phone : CONFIG.telegram;
    if (isPlaceholder(value)) {
      el.hidden = true;
      return;
    }
    el.href = tel ? `tel:${String(value).replace(/[^\d+]/g, '')}` : `https://t.me/${String(value).replace(/^@/, '')}`;
    if (!tel) {
      el.target = '_blank';
      el.rel = 'noopener';
    }
  });
}

function renderStatic() {
  $('#pains').replaceChildren(...TEXT.pains.map((p) => h('article', { class: 'card' }, h('h3', {}, p.title), h('p', {}, p.text))));
  $('#steps').replaceChildren(...TEXT.steps.map((p) => h('li', { class: 'card' }, h('h3', {}, p.title), h('p', {}, p.text))));
  $('#faq').replaceChildren(...TEXT.faq.map((f, i) => {
    const panelId = `faq-a-${i}`;
    const panel = h('div', { class: 'faq__a', id: panelId, hidden: true }, h('p', {}, f.a));
    const btn = h('button', {
      class: 'faq__q', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId,
      onclick: () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        panel.hidden = open;
      }
    }, h('span', {}, f.q), h('span', { class: 'faq__icon', 'aria-hidden': 'true' }));
    return h('div', { class: 'faq__item' }, h('h3', { class: 'faq__h' }, btn), panel);
  }));
}

// ================= Joy turlari =================

function renderTabs() {
  $('#scenario-tabs').replaceChildren(...SCENARIOS.map((s) => h('button', {
    class: 'tab', type: 'button', role: 'radio', 'data-id': s.id,
    onclick: () => setScenario(s.id, { fromUser: true }),
    onkeydown: onTabKey
  },
    h('span', { class: 'tab__top' },
      h('span', { class: 'tab__title' }, s.title),
      s.active ? h('span', { class: 'tab__check', 'aria-hidden': 'true' }) : h('span', { class: 'badge' }, 'tez orada')),
    h('p', { class: 'tab__sub' }, s.subtitle),
    h('p', { class: 'tab__meta' }, `${timeText(s.timeWindow)} · ${s.unit}lik to‘lov`))));
}

function onTabKey(e) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in keys)) return;
  e.preventDefault();
  const i = SCENARIOS.findIndex((s) => s.id === state.scenarioId);
  const next = SCENARIOS[(i + keys[e.key] + SCENARIOS.length) % SCENARIOS.length];
  setScenario(next.id, { fromUser: true });
  $(`.tab[data-id="${next.id}"]`).focus();
}

/** Tur tanlanganda: bosh qism, narx, URL; foydalanuvchi tanlasa — xarita davri ham */
function setScenario(id, { skipUrl = false, fromUser = false } = {}) {
  if (!scenarioById(id)) id = scenarioById(CONFIG.defaultScenarioId) ? CONFIG.defaultScenarioId : SCENARIOS[0].id;
  state.scenarioId = id;
  const s = current();
  $$('.tab').forEach((t) => {
    const on = t.dataset.id === id;
    t.setAttribute('aria-checked', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  renderHero();
  renderPrices();
  if (fromUser && s.period && state.period !== s.period) {
    state.period = s.period;
    renderFinder();
  }
  if (!skipUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('ssenariy', id);
    history.replaceState(null, '', url);
  }
}

/** Bosh qismdagi karta: shu tur uchun eng ko'p bo'sh joyi bor turargoh */
function heroLot(s) {
  const period = s.period || 'night';
  return state.lots
    .filter((l) => l.scenarioIds.includes(s.id))
    .map((l) => ({ l, st: lotStats(l, period) }))
    .sort((a, b) => (b.st?.free ?? -1) - (a.st?.free ?? -1))[0]?.l || null;
}

function renderHero() {
  const s = current();
  const lot = heroLot(s);
  const st = lot ? lotStats(lot, s.period || 'night') : null;
  const binds = {
    'scenario.title': s.title,
    'scenario.heroTitle': s.heroTitle,
    'scenario.heroText': s.heroText,
    'scenario.time': timeText(s.timeWindow),
    'scenario.unit': s.unit,
    'location.label': u.heroCard,
    'location.title': lot ? lot.title : (state.lotsStatus === 'loading' ? '…' : u.noLocation),
    'location.address': lot ? lot.address || '—' : '—',
    // Davrsiz turda (tadbir) bo'sh joy emas, umumiy sig'im ko'rsatiladi
    'location.slots': st ? (s.period ? `${st.free} / ${st.total} ${u.freeWord}` : String(st.total)) : '—',
    'location.priceText': lot ? priceText(lot, s) : u.priceAgreed,
    'location.note': lot || state.lotsStatus === 'loading' ? '' : u.noLocationNote
  };
  $$('[data-bind]').forEach((el) => {
    el.textContent = binds[el.dataset.bind] ?? '';
  });
  $$('[data-show="scenario.soon"]').forEach((el) => {
    el.hidden = s.active;
  });
  const btn = $('#hero-show');
  btn.hidden = !lot;
  btn.onclick = lot ? () => {
    if (s.period) state.period = s.period;
    selectLot(lot.id, 'list');
    $('#xarita').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  } : null;
}

function renderPrices() {
  const s = current();
  const lots = state.lots.filter((l) => l.scenarioIds.includes(s.id));
  const unitLine = fmt(u.perUnit, { unit: s.unit });
  $('#prices').replaceChildren(...(lots.length
    ? lots.map((l) => {
      const p = l.prices?.[s.id];
      return h('article', { class: 'card' },
        h('h3', {}, l.title),
        h('p', {}, l.address),
        h('p', { class: 'price__value' }, Number.isInteger(p) ? `${fmtMoney(p)} ${CONFIG.currency}` : u.priceAgreed),
        h('p', { class: 'price__unit' }, `${unitLine} · ${timeText(s.timeWindow)}`));
    })
    : [h('article', { class: 'card' },
      h('h3', {}, u.noLocation),
      h('p', { class: 'price__value' }, u.priceAgreed),
      h('p', { class: 'price__unit' }, unitLine))]));
}

// ================= Turargohlar: yuklash =================

async function loadLots({ quiet = false } = {}) {
  try {
    const data = await api.get('/api/lots');
    const sig = JSON.stringify(data.lots);
    const changed = sig !== state.lotsSig || data.now.period !== state.serverNow?.period || state.lotsStatus !== 'ready';
    state.serverNow = data.now;
    state.lots = data.lots;
    state.lotsSig = sig;
    state.lotsStatus = 'ready';
    // Tanlangan joyni boshqa kishi band qilgan bo'lsa — tanlov bekor
    if (state.picked) {
      const lot = lotById(state.picked.lotId);
      if (!lot || lot.busy[state.picked.period]?.includes(state.picked.spot)) state.picked = null;
    }
    if (changed) {
      renderFinder();
      renderHero();
      renderPrices();
    } else {
      const live = $('.lot__live');
      if (live) live.textContent = fmt(u.live, { time: data.now.time });
    }
  } catch {
    if (quiet && state.lots.length) return;   // fon yangilanishi — eski ma'lumot qoladi
    state.lotsStatus = 'error';
    renderFinder();
    renderHero();
  }
}

function startPolling() {
  let last = Date.now();
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    last = Date.now();
    loadLots({ quiet: true });
  };
  setInterval(tick, CONFIG.refreshSeconds * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > CONFIG.refreshSeconds * 1000) tick();
  });
}

// ================= Xarita, ro'yxat, tanlangan turargoh =================

let map = null;
const PERIOD_FILTERS = [{ id: 'now', label: 'Hozir' }, ...Object.entries(PERIODS).map(([id, p]) => ({ id, label: p.label }))];

const focusKey = () => document.activeElement?.dataset?.focusKey || null;
function restoreFocus(key) {
  if (!key) return;
  const el = $$('[data-focus-key]').find((x) => x.dataset.focusKey === key);
  if (el && el !== document.activeElement) el.focus({ preventScroll: true });
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#map-toast');
  if (t.classList.contains('is-on')) return;
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 1800);
}

function initFinder() {
  $('#map-filters').replaceChildren(...PERIOD_FILTERS.map((f) => h('button', {
    class: 'chip', type: 'button', 'data-id': f.id, 'data-focus-key': `period:${f.id}`,
    onclick: () => setPeriod(f.id)
  }, f.label)));
  $('#only-free').addEventListener('click', () => {
    state.onlyFree = !state.onlyFree;
    renderFinder();
  });
  $('#locate').addEventListener('click', () => (state.geo === 'off' ? startLocate() : stopLocate()));
  $('#locate-label').textContent = u.locate;
  initMap();
  renderFinder();
  // "Hozir" rejimida tun va kun almashganda
  setInterval(() => {
    if (state.period === 'now' && periodKey() !== state.lastKey) renderFinder();
  }, 60_000);
}

/** Davr tanlansa — shu davrga mos joy turi ham tanlanadi */
function setPeriod(id) {
  state.period = id;
  if (id !== 'now' && current().period !== id) {
    const s = SCENARIOS.find((x) => x.active && x.period === id);
    if (s) setScenario(s.id);
  }
  renderFinder();
}

function initMap() {
  const cfg = CONFIG.map;
  const card = $('#map-card');
  if (!cfg?.enabled) {
    card.hidden = true;
    return;
  }
  const attr = $('#map-attr');
  attr.textContent = cfg.attribution;
  attr.href = cfg.attributionUrl;
  map = createMap($('#mapview'), {
    center: cfg.center, zoom: cfg.zoom, minZoom: cfg.minZoom, maxZoom: cfg.maxZoom, tileUrl: cfg.tileUrl, dark: cfg.dark,
    onTap: onMapTap,
    onWheelHint: () => toast(u.wheelHint)
  });
  $('#zoom-in').addEventListener('click', () => map.zoomBy(1));
  $('#zoom-out').addEventListener('click', () => map.zoomBy(-1));
  $('#zoom-fit').addEventListener('click', fitAll);

  // Plitkalar xarita ko'rinishga yaqinlashgandagina yuklanadi
  const start = () => {
    map.start();
    if (!map.positioned() && state.lotsStatus === 'ready') fitAll();
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        start();
      }
    }, { rootMargin: '300px' });
    io.observe(card);
  } else start();
}

function fitAll() {
  if (!map) return;
  const pts = (state.shown || state.lots).filter(hasPoint);
  if (state.me) pts.push(state.me);
  if (pts.length) map.fit(pts, 15);
  else map.setView(CONFIG.map.center, CONFIG.map.zoom);
}

function renderFinder() {
  const fk = focusKey();
  const k = periodKey();
  state.lastKey = k;
  $$('#map-filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === state.period)));
  $('#only-free').setAttribute('aria-pressed', String(state.onlyFree));
  const listEl = $('#map-list');

  if (state.lotsStatus !== 'ready') {
    listEl.replaceChildren(state.lotsStatus === 'loading'
      ? h('li', { class: 'map__empty' }, u.loading)
      : h('li', { class: 'map__empty' }, u.loadError, ' ',
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { state.lotsStatus = 'loading'; renderFinder(); loadLots(); } }, u.retry)));
    $('#lot').replaceChildren();
    $('#lot').hidden = true;
    renderNear();
    return;
  }

  let list = state.lots.map((l) => ({ l, s: lotStatus(l, k), st: lotStats(l, k), d: locDist(l) }));
  if (state.onlyFree) list = list.filter((x) => x.s.kind === 'ok' || x.s.kind === 'low');
  // Tartib: bo'sh joyi borlar, noma'lumlar, to'lalar, yopiqlar; har birida eng yaqini birinchi
  const rank = (x) => ({ unknown: 1, full: 2, closed: 3 }[x.s.kind] || 0);
  list.sort((a, b) => rank(a) - rank(b) || (a.d ?? 1e12) - (b.d ?? 1e12));
  const firstRender = !state.shown;
  state.shown = list.map((x) => x.l);

  if (!list.some((x) => x.l.id === state.mapLocationId)) {
    const first = list.find((x) => x.st && x.s.kind !== 'closed') || list[0];
    state.mapLocationId = first ? first.l.id : null;
  }

  listEl.replaceChildren(...(list.length
    ? list.map(listItem)
    : [h('li', { class: 'map__empty' }, state.lots.length ? u.mapEmpty : u.noLots, ' ',
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => openBooking({ mode: 'request' }) }, u.requestTitle))]));
  if (map) {
    map.setMarkers(list.filter((x) => hasPoint(x.l)).map((x) => ({ lat: x.l.lat, lng: x.l.lng, el: markerEl(x) })));
    if (firstRender && !map.positioned()) fitAll();
  }
  renderLot(lotById(state.mapLocationId), k);
  renderNear();
  restoreFocus(fk);
}

function markerEl({ l, s, d }) {
  const sel = l.id === state.mapLocationId;
  return h('button', {
    class: `mk mk--${s.kind}${sel ? ' is-selected' : ''}`, type: 'button',
    'data-focus-key': `mk:${l.id}`, 'aria-pressed': String(sel),
    'aria-label': `${l.title}: ${s.text}${d != null ? `, ${fmtDist(d)}` : ''}`,
    onclick: () => selectLot(l.id, 'map')
  }, h('span', { class: 'mk__pill' },
    h('span', { class: 'mk__p', 'aria-hidden': 'true' }, 'P'),
    s.short ? h('span', { class: 'mk__n', 'aria-hidden': 'true' }, s.short) : null));
}

function listItem({ l, s, st, d }) {
  return h('li', { 'data-id': l.id },
    h('button', {
      class: `loc${s.kind === 'closed' ? ' loc--closed' : ''}`, type: 'button',
      'aria-current': String(l.id === state.mapLocationId), 'data-focus-key': `loc:${l.id}`,
      onclick: () => selectLot(l.id, 'list')
    },
      h('span', { class: 'loc__top' },
        h('span', { class: 'loc__title' }, l.title),
        d != null ? h('span', { class: 'loc__dist' }, fmtDist(d)) : null),
      h('span', { class: 'loc__addr' }, l.address),
      st && s.kind !== 'closed' ? h('span', { class: 'meter', 'aria-hidden': 'true' },
        h('span', { class: `meter__fill meter__fill--${s.kind}`, style: `width:${Math.round((st.free / st.total) * 100)}%` })) : null,
      h('span', { class: 'loc__tags' },
        h('span', { class: `tag tag--${s.kind}` }, s.text),
        hasPoint(l) ? null : h('span', { class: 'tag' }, u.noCoords),
        l.isDemo ? h('span', { class: 'tag tag--demo' }, u.demoTag) : null)));
}

function selectLot(id, from) {
  state.mapLocationId = id;
  renderFinder();
  const l = lotById(id);
  if (from === 'list' && map && hasPoint(l)) map.panTo(l, 14);
  if (from === 'map') scrollListTo(id);
}

function scrollListTo(id) {
  const list = $('#map-list');
  const li = $$('#map-list > li').find((x) => x.dataset.id === id);
  if (!li || list.scrollWidth <= list.clientWidth + 2) return;
  list.scrollTo({ left: li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });
}

function carSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 40');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'car');
  svg.innerHTML = '<rect x="2" y="2" width="20" height="36" rx="6" class="car__body"/>'
    + '<rect x="5" y="9" width="14" height="7" rx="2" class="car__glass"/>'
    + '<rect x="5" y="27" width="14" height="5" rx="2" class="car__glass"/>';
  return svg;
}

function renderLot(lot, k) {
  const box = $('#lot');
  box.hidden = !lot;
  if (!lot) {
    box.replaceChildren();
    return;
  }
  const st = lotStats(lot, k);
  const s = lotStatus(lot, k);
  const d = locDist(lot);
  const sc = scenarioFor(lot, k);
  const wins = locScenarios(lot).filter((x) => x.timeWindow);
  const allDay = wins.length && Array.from({ length: 48 }, (_, i) => i * 30).every((m) => wins.some((x) => inWindow(x.timeWindow, m)));
  const hours = allDay ? u.hours24 : [...new Set(wins.map((x) => timeText(x.timeWindow)))].join(', ');

  const head = h('div', { class: 'lot__head' },
    h('div', {}, h('h3', { class: 'lot__title' }, lot.title), h('p', { class: 'lot__addr' }, lot.address)),
    st && st.open ? h('p', { class: `lot__count lot__count--${s.kind}` }, h('strong', {}, String(st.free)), ` / ${st.total} ${u.freeWord}`) : null);

  const fact = (label, value, cls) => h('li', {}, h('span', {}, label), h('strong', { class: cls }, value));
  const facts = h('ul', { class: 'lot__facts' },
    d != null ? fact(u.factDist, `${fmtDist(d)}${walkText(d) ? ` · ${walkText(d)}` : ''}`) : null,
    hours ? fact(u.factHours, hours) : null,
    sc ? fact(u.factPrice, priceText(lot, sc)) : null,
    lot.isDemo ? null : fact(u.factUpdated, fmt(u.live, { time: state.serverNow?.time || '' }), 'lot__live'));

  // Yo'l ko'rsatish: joylashuvingiz havolaga qo'shilmaydi
  const routes = hasPoint(lot) ? h('div', { class: 'lot__routes' },
    h('span', { class: 'small muted' }, u.route),
    h('a', { class: 'btn btn--ghost btn--sm', href: `https://yandex.uz/maps/?rtext=~${lot.lat},${lot.lng}&rtt=auto`, target: '_blank', rel: 'noopener' }, 'Yandex'),
    h('a', { class: 'btn btn--ghost btn--sm', href: `https://www.google.com/maps/dir/?api=1&destination=${lot.lat},${lot.lng}`, target: '_blank', rel: 'noopener' }, 'Google')) : null;
  const demo = lot.isDemo ? h('p', { class: 'lot__demo small' }, u.demoNote) : null;

  const bookBtn = (label, spot, ghost) => h('button', {
    class: `btn${ghost ? ' btn--ghost' : ''}`, type: 'button',
    onclick: () => openBooking({ mode: 'spot', lotId: lot.id, spot, period: k })
  }, label);

  // Sxemasiz turargoh: joyni operator beradi
  if (!st?.spots) {
    const canBook = sc && (!st || st.free > 0);
    box.replaceChildren(...[head, facts, routes, demo,
      h('p', { class: 'lot__empty' }, lotOpenIn(lot.scenarioIds, k) ? u.lotNoLayout : u.lotClosed),
      canBook ? h('div', { class: 'lot__foot' }, bookBtn(u.bookSpot, null)) : null].filter(Boolean));
    return;
  }

  const picked = state.picked && state.picked.lotId === lot.id && state.picked.period === k ? state.picked.spot : null;
  const grid = h('div', { class: `lot__grid${st.open ? '' : ' lot__grid--closed'}` });
  lot.rows.forEach((row, i) => {
    if (i > 0) grid.append(h('div', { class: 'lot__lane', 'aria-hidden': 'true' }, h('span', {}, 'yo‘lak')));
    grid.append(h('div', { class: 'lot__row', style: `--n:${row.length}` }, ...row.map((id) => {
      const busy = st.busy.has(id);
      const isPicked = id === picked;
      const stateName = !st.open ? 'closed' : busy ? 'busy' : isPicked ? 'picked' : 'free';
      const label = { closed: 'yopiq', busy: 'band', picked: 'tanlangan', free: 'bo‘sh' }[stateName];
      return h('button', {
        class: 'spot', type: 'button', 'data-state': stateName, 'data-focus-key': `spot:${lot.id}:${id}`,
        'aria-label': `Joy ${id} — ${label}`,
        'aria-pressed': stateName === 'free' || isPicked ? String(isPicked) : null,
        disabled: busy || !st.open || !sc,
        onclick: () => pickSpot(lot, id, k)
      }, busy ? carSvg() : null, h('span', { class: 'spot__id' }, id));
    })));
  });

  const legend = h('ul', { class: 'legend small', 'aria-label': 'Belgilar' },
    h('li', {}, h('span', { class: 'legend__sw legend__sw--free' }), 'Bo‘sh'),
    h('li', {}, h('span', { class: 'legend__sw legend__sw--busy' }), 'Band'),
    h('li', {}, h('span', { class: 'legend__sw legend__sw--picked' }), 'Tanlangan'));

  let foot;
  if (!st.open) foot = h('p', { class: 'lot__empty' }, u.lotClosed);
  else if (picked) foot = h('div', { class: 'lot__foot' }, h('p', { class: 'small muted' }, fmt(u.spotPicked, { spot: picked })), bookBtn(u.bookSpot, picked));
  else if (st.free && sc) foot = h('div', { class: 'lot__foot' }, h('p', { class: 'small muted' }, u.lotHint), bookBtn(u.anySpot, null, true));
  else foot = h('p', { class: 'small muted lot__foot' }, st.free ? u.soonNote : u.mapEmpty);

  box.replaceChildren(...[head, facts, routes, demo, legend, h('div', { class: 'lot__scroll' }, grid), foot].filter(Boolean));
}

function pickSpot(lot, spot, k) {
  const same = state.picked && state.picked.lotId === lot.id && state.picked.spot === spot && state.picked.period === k;
  state.picked = same ? null : { lotId: lot.id, spot, period: k };
  const sc = scenarioFor(lot, k);
  if (state.picked && sc && sc.id !== state.scenarioId) setScenario(sc.id);
  renderLot(lot, k);
  restoreFocus(`spot:${lot.id}:${spot}`);
}

// ================= Joylashuv =================

let watchId = null;
let lastMe = null;

function nearestFree(k) {
  if (!state.me) return null;
  return state.lots.filter(hasPoint)
    .map((l) => ({ l, st: lotStats(l, k), d: distM(state.me, l) }))
    .filter((x) => x.st && x.st.open && x.st.free > 0 && scenarioFor(x.l, k))
    .sort((a, b) => a.d - b.d)[0] || null;
}

function focusNearest() {
  const n = nearestFree(periodKey());
  if (n) state.mapLocationId = n.l.id;
  if (!map) return;
  if (n) map.fit([state.me, n.l], 16);
  else map.setView(state.me, 15);
}

function startLocate() {
  if (!('geolocation' in navigator)) {
    geoFail(u.geoFail);
    return;
  }
  Object.assign(state, { geo: 'locating', pickMode: false });
  renderNear();
  updateLocateBtn();
  watchId = navigator.geolocation.watchPosition(onPos, onGeoError, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 });
}

function stopLocate() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  lastMe = null;
  Object.assign(state, { me: null, geo: 'off', geoMsg: '', pickMode: false });
  map?.setMe(null);
  renderFinder();
  updateLocateBtn();
}

function onPos(pos) {
  const first = state.geo !== 'on';
  state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, manual: false };
  Object.assign(state, { geo: 'on', pickMode: false });
  map?.setMe(state.me);
  // Ro'yxat faqat sezilarli siljishda qayta tartiblanadi
  if (first || !lastMe || distM(lastMe, state.me) > 25) {
    lastMe = { ...state.me };
    if (first) focusNearest();
    renderFinder();
  }
  updateLocateBtn();
}

function onGeoError(err) {
  if (state.geo === 'on' && err.code !== 1) return;
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  geoFail(err.code === 1 ? u.geoDenied : u.geoFail);
}

function geoFail(msg) {
  Object.assign(state, { geo: 'error', geoMsg: msg, pickMode: !!map });
  renderNear();
  updateLocateBtn();
}

function onMapTap(ll) {
  if (!state.pickMode) return;
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  Object.assign(state, { me: { lat: ll.lat, lng: ll.lng, acc: 0, manual: true }, geo: 'manual', pickMode: false });
  lastMe = { ...state.me };
  map.setMe(state.me);
  focusNearest();
  renderFinder();
  updateLocateBtn();
}

function enterPick() {
  state.pickMode = true;
  renderNear();
  $('#mapview').focus({ preventScroll: true });
}

function updateLocateBtn() {
  $('#locate').setAttribute('aria-pressed', String(state.geo !== 'off'));
}

function renderNear() {
  const out = [];
  if (state.geo === 'locating') out.push(h('span', {}, u.nearLocating));
  else if (state.geo === 'error') out.push(h('span', {}, state.geoMsg + (state.pickMode ? ` ${u.nearPick}` : '')));
  else if (state.pickMode) out.push(h('span', {}, u.nearPick));
  else if (state.me && state.lotsStatus === 'ready') {
    const n = nearestFree(periodKey());
    if (n) {
      const walk = walkText(n.d);
      out.push(h('span', {}, ...fmtParts(u.nearFound, { title: h('strong', {}, n.l.title), dist: fmtDist(n.d), walk: walk ? `, ${walk}` : '', free: n.st.free })));
      if (n.l.id !== state.mapLocationId) out.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => selectLot(n.l.id, 'list') }, u.show));
    } else out.push(h('span', {}, u.nearNone));
    if (state.me.manual) out.push(h('span', { class: 'muted' }, u.geoManual));
  } else out.push(h('span', {}, u.nearIdle));
  if (map && (state.me || state.geo === 'error') && !state.pickMode) {
    out.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: enterPick }, u.pickAgain));
  }
  $('#near').replaceChildren(...out);
  $('#mapview').classList.toggle('is-picking', state.pickMode);
}

// ================= Foydalanuvchi =================

function setUser(user) {
  state.user = user;
  if (!user) state.bookings = [];
  updateMyButton();
}

const isLive = (b) => (b.status === 'pending' || b.status === 'confirmed') && b.endDate >= today();

function updateMyButton() {
  const btn = $('#my-btn');
  btn.hidden = !state.user;
  const n = state.bookings.filter(isLive).length;
  const count = $('#my-count');
  count.hidden = !n;
  count.textContent = String(n);
}

async function loadMe() {
  try {
    const { user } = await api.get('/api/me');
    setUser(user);
    if (user) state.bookings = (await api.get('/api/bookings')).bookings;
    updateMyButton();
  } catch {
    /* tarmoq xatosi — keyinroq bron paytida qayta so'raladi */
  }
}

// ================= Forma yordamchilari =================

function clearErrors(form) {
  $$('[data-error]', form).forEach((el) => {
    el.textContent = '';
  });
  $$('[aria-invalid]', form).forEach((el) => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
}

/** Maydon xatosini ko'rsatadi; maydon ko'rinmasa — false (umumiy xabarga qo'shiladi) */
function setError(form, name, message) {
  const err = $(`[data-error="${name}"]`, form);
  const input = form.elements[name];
  if (!err || !input || input.closest('[hidden]')) return false;
  err.id = `${form.id}-err-${name}`;
  err.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', err.id);
  return true;
}

function focusFirstError(form) {
  const el = $('[aria-invalid="true"]', form);
  if (!el) return;
  el.closest('details')?.setAttribute('open', '');
  el.focus();
}

/** Server xatosini formaga tushirish */
function showApiError(form, statusEl, err) {
  const leftovers = [];
  for (const [field, msg] of Object.entries(err.fields || {})) {
    if (!setError(form, field, msg)) leftovers.push(msg);
  }
  statusEl.textContent = leftovers.length ? leftovers.join(' ') : Object.keys(err.fields || {}).length ? '' : err.message;
  focusFirstError(form);
}

function bindPhoneMask(input) {
  input.addEventListener('input', () => {
    const atEnd = input.selectionStart === input.value.length;
    input.value = maskPhone(input.value);
    if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
}

function checkIdentity(form) {
  let ok = true;
  if (form.elements.name.value.trim().length < 2) {
    setError(form, 'name', 'Ismingizni yozing.');
    ok = false;
  }
  if (form.elements.phone.value.replace(/\D/g, '').length !== 9) {
    setError(form, 'phone', 'Raqamni to‘liq yozing: 90 123 45 67.');
    ok = false;
  }
  return ok;
}

// ================= Bron oynasi =================

const book = { mode: 'spot', lotId: null, spot: null, period: null, editIdentity: false, sending: false };

function initBookingDialog() {
  const dialog = $('#book');
  const form = $('#book-form');
  $('#bf-scenario').replaceChildren(...SCENARIOS.map((s) => h('option', { value: s.id }, s.active ? s.title : `${s.title} (tez orada)`)));
  $('#bf-scenario').addEventListener('change', () => renderBookingForm());
  $('#bf-qty').addEventListener('change', renderTotal);
  $('#bf-who-edit').addEventListener('click', () => {
    book.editIdentity = true;
    renderBookingForm();
    $('#bf-name').focus();
  });
  $('#done-my').addEventListener('click', () => {
    dialog.close();
    openMy();
  });
  $('#bf-plate').addEventListener('blur', (e) => {
    e.target.value = formatPlate(e.target.value);
  });
  bindPhoneMask($('#bf-phone'));
  form.addEventListener('submit', submitBooking);
  wireDialog(dialog);
}

/** Yopish tugmalari va fonni bosish */
function wireDialog(dialog) {
  $$('[data-close]', dialog).forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

/** opts: { mode: 'spot', lotId, spot, period } | { mode: 'request' } */
function openBooking(opts) {
  Object.assign(book, { mode: 'spot', lotId: null, spot: null, period: null, editIdentity: false }, opts);
  const form = $('#book-form');
  form.reset();
  clearErrors(form);
  $('#bf-status').textContent = '';
  $('#bf-scenario').value = state.scenarioId;
  form.hidden = false;
  $('#book-done').hidden = true;
  renderBookingForm();
  $('#book').showModal();
  (state.user ? $('#bf-submit') : $('#bf-name')).focus();
}

function bookingScenario() {
  if (book.mode === 'spot') {
    const lot = lotById(book.lotId);
    return (lot && scenarioFor(lot, book.period)) || current();
  }
  return scenarioById($('#bf-scenario').value) || current();
}

function renderBookingForm() {
  const isSpot = book.mode === 'spot';
  const s = bookingScenario();
  const lot = isSpot ? lotById(book.lotId) : null;
  const period = isSpot ? PERIODS[book.period] : null;

  $('#book-title').textContent = isSpot ? u.bookTitle : u.requestTitle;
  $('#bf-submit').textContent = isSpot ? u.submitBooking : u.submitRequest;
  $('#bf-note').textContent = isSpot ? '' : s.active ? u.requestNote : u.soonNote;
  $('#bf-note').hidden = isSpot;
  $('#bf-scenario-wrap').hidden = isSpot;

  // Qisqacha: qaysi turargoh, qaysi joy, qachon, narx
  $('#bf-summary').hidden = !isSpot;
  if (isSpot && lot) {
    const row = (label, value) => h('div', { class: 'summary__row' }, h('span', {}, label), h('strong', {}, value));
    $('#bf-summary').replaceChildren(
      h('p', { class: 'summary__title' }, lot.title),
      lot.address ? h('p', { class: 'summary__addr' }, lot.address) : '',
      row('Joy', book.spot || u.anySpot),
      row(period.label, `${period.from}–${period.to}`),
      row(u.factPrice, priceText(lot, s)));
  }

  // Kim: ro'yxatdan o'tgan bo'lsa — faqat ism va raqam ko'rinadi
  const showIdentity = !state.user || book.editIdentity;
  $('#bf-who').hidden = showIdentity;
  $('#bf-identity').hidden = !showIdentity;
  if (state.user) {
    $('#bf-who-text').textContent = `${state.user.name} · ${fmtPhone(state.user.phone)}`;
    if (book.editIdentity && !$('#bf-name').value) {
      $('#bf-name').value = state.user.name;
      $('#bf-phone').value = maskPhone(state.user.phone);
    }
  }

  // Muddat (faqat joy bronida)
  $('#bf-when').hidden = !isSpot;
  if (isSpot) {
    const start = $('#bf-start');
    start.min = today();
    start.max = addDays(today(), 60);
    if (!start.value) start.value = today();
    const qty = $('#bf-qty');
    const prev = qty.value || '1';
    qty.replaceChildren(...Array.from({ length: s.maxQty }, (_, i) => h('option', { value: String(i + 1) }, fmt(u.qtyOption, { n: i + 1, unit: s.unit }))));
    qty.value = Number(prev) <= s.maxQty ? prev : '1';
  }

  // So'rov maydonlari: joy turiga qarab
  $('#bf-request').hidden = isSpot;
  if (!isSpot) {
    const needsDate = s.fields.includes('date') || s.fields.includes('startDate');
    $('[data-rf="date"]').hidden = !needsDate;
    $('[data-rf="date"] label').firstChild.textContent = s.fields.includes('startDate') ? 'Qachondan ' : 'Sana ';
    $('#bf-date').min = today();
    $('[data-rf="time"]').hidden = !s.fields.includes('timeFrom');
    $('[data-rf="cars"]').hidden = !s.fields.includes('cars');
  }
  renderTotal();
}

function renderTotal() {
  const el = $('#bf-total');
  if (book.mode !== 'spot') {
    el.hidden = true;
    return;
  }
  const lot = lotById(book.lotId);
  const s = bookingScenario();
  const p = lot?.prices?.[s.id];
  el.hidden = false;
  el.textContent = Number.isInteger(p)
    ? fmt(u.total, { sum: fmtMoney(p * Number($('#bf-qty').value || 1)), currency: CONFIG.currency })
    : u.totalAgreed;
}

async function submitBooking(e) {
  e.preventDefault();
  if (book.sending) return;
  const form = e.currentTarget;
  const statusEl = $('#bf-status');
  clearErrors(form);
  statusEl.textContent = '';

  const needIdentity = !state.user || book.editIdentity;
  if (needIdentity && !checkIdentity(form)) {
    focusFirstError(form);
    return;
  }

  const v = (name) => form.elements[name].value.trim();
  const s = bookingScenario();
  const payload = book.mode === 'spot'
    ? { scenarioId: s.id, lotId: book.lotId, spot: book.spot, startDate: v('startDate'), qty: Number(v('qty')) }
    : {
      scenarioId: s.id,
      address: v('address'),
      [s.fields.includes('startDate') ? 'startDate' : 'date']: $('[data-rf="date"]').hidden ? '' : v('date'),
      timeFrom: s.fields.includes('timeFrom') ? v('timeFrom') : '',
      timeTo: s.fields.includes('timeTo') ? v('timeTo') : '',
      cars: s.fields.includes('cars') ? v('cars') : ''
    };
  payload.plate = v('plate');
  payload.note = v('note');

  setSending(true);
  try {
    if (needIdentity) {
      const phone = `+998${v('phone').replace(/\D/g, '')}`;
      if (!state.user || state.user.name !== v('name') || state.user.phone !== phone) {
        const { user } = await api.post('/api/auth/register', { name: v('name'), phone });
        setUser(user);
      }
      book.editIdentity = false;
    }
    const { booking } = await api.post('/api/bookings', payload);
    state.bookings.unshift(booking);
    updateMyButton();
    state.picked = null;
    showDone(booking);
    loadLots({ quiet: true });
  } catch (err) {
    if (err.status === 401) {
      setUser(null);
      renderBookingForm();
    }
    if (err.code === 'spot_taken' || err.code === 'lot_full') {
      statusEl.textContent = err.code === 'spot_taken' ? u.spotGone : err.message;
      state.picked = null;
      loadLots({ quiet: true });
    } else {
      showApiError(form, statusEl, err);
    }
  } finally {
    setSending(false);
  }
}

function setSending(on) {
  book.sending = on;
  const btn = $('#bf-submit');
  btn.disabled = on;
  btn.setAttribute('aria-busy', String(on));
  if (on) btn.textContent = u.sending;
  else btn.textContent = book.mode === 'spot' ? u.submitBooking : u.submitRequest;
}

function showDone(b) {
  const isBooking = !!b.period;
  $('#book-form').hidden = true;
  $('#book-done').hidden = false;
  $('#done-title').textContent = fmt(isBooking ? u.doneBooking : u.doneRequest, { id: b.id });
  $('#done-text').textContent = isBooking
    ? fmt(u.doneTextBooking, {
      lot: b.lotTitle, spot: b.spot || u.anySpot, period: PERIODS[b.period].label.toLowerCase(),
      from: fmtDate(b.startDate), phone: fmtPhone(state.user.phone)
    })
    : fmt(u.doneTextRequest, { phone: fmtPhone(state.user.phone) });
  $('#done-title').focus();
}

// ================= Bronlarim =================

function initMyDialog() {
  const dialog = $('#my');
  wireDialog(dialog);
  $('#my-btn').addEventListener('click', openMy);
  $('#my-device').textContent = u.myDevice;
  $('#my-edit').addEventListener('click', () => {
    const f = $('#my-profile');
    f.hidden = false;
    $('#my-who').hidden = true;
    f.elements.name.value = state.user.name;
    f.elements.phone.value = maskPhone(state.user.phone);
    f.elements.name.focus();
  });
  $('#mp-cancel').addEventListener('click', closeProfile);
  bindPhoneMask($('#mp-phone'));
  $('#my-profile').addEventListener('submit', saveProfile);
  $('#my-logout').addEventListener('click', logout);
}

function closeProfile() {
  $('#my-profile').hidden = true;
  $('#my-who').hidden = false;
  clearErrors($('#my-profile'));
}

async function openMy() {
  if (!state.user) return;
  closeProfile();
  $('#my-status').textContent = '';
  $('#my-who-text').textContent = `${state.user.name} · ${fmtPhone(state.user.phone)}`;
  renderMyList();
  const dialog = $('#my');
  if (!dialog.open) dialog.showModal();
  try {
    state.bookings = (await api.get('/api/bookings')).bookings;
    renderMyList();
    updateMyButton();
  } catch (err) {
    $('#my-status').textContent = err.message;
  }
}

function renderMyList() {
  const list = $('#my-list');
  if (!state.bookings.length) {
    list.replaceChildren(h('li', { class: 'bookings__empty' }, u.myEmpty));
    return;
  }
  list.replaceChildren(...state.bookings.map((b) => {
    const s = scenarioById(b.scenarioId);
    const period = b.period ? PERIODS[b.period] : null;
    const when = period
      ? `${fmtDate(b.startDate)} — ${fmtDate(b.endDate)} · ${period.label.toLowerCase()} ${period.from}–${period.to}`
      : `${fmtDate(b.startDate)}${b.timeFrom ? `, ${b.timeFrom}–${b.timeTo || ''}` : ''}`;
    const active = b.status === 'pending' || b.status === 'confirmed';
    return h('li', { class: `bk bk--${b.status}` },
      h('div', { class: 'bk__top' },
        h('strong', { class: 'bk__title' }, b.lotTitle ? `${b.lotTitle}${b.spot ? ` · joy ${b.spot}` : ''}` : `${u.request}: ${s?.title || ''}`),
        h('span', { class: `pill pill--${b.status}` }, u.status[b.status])),
      h('p', { class: 'bk__meta' }, when),
      h('p', { class: 'bk__meta' }, `#${b.id} · ${s?.title || ''}${b.price != null ? ` · ${fmtMoney(b.price)} ${CONFIG.currency}` : ''}`),
      h('div', { class: 'bk__actions' },
        active && hasPoint({ lat: b.lat, lng: b.lng })
          ? h('a', { class: 'btn btn--ghost btn--sm', href: `https://yandex.uz/maps/?rtext=~${b.lat},${b.lng}&rtt=auto`, target: '_blank', rel: 'noopener' }, 'Yo‘l ko‘rsatish')
          : null,
        active ? h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: (e) => cancelBooking(b, e.currentTarget) }, u.cancel) : null));
  }));
}

async function cancelBooking(b, btn) {
  if (!window.confirm(u.cancelConfirm)) return;
  btn.disabled = true;
  try {
    const { booking } = await api.post(`/api/bookings/${b.id}/cancel`);
    state.bookings = state.bookings.map((x) => (x.id === booking.id ? booking : x));
    renderMyList();
    updateMyButton();
    loadLots({ quiet: true });
  } catch (err) {
    $('#my-status').textContent = err.message;
    btn.disabled = false;
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearErrors(form);
  if (!checkIdentity(form)) {
    focusFirstError(form);
    return;
  }
  try {
    const { user } = await api.patch('/api/me', { name: form.elements.name.value.trim(), phone: `+998${form.elements.phone.value.replace(/\D/g, '')}` });
    setUser(user);
    $('#my-who-text').textContent = `${user.name} · ${fmtPhone(user.phone)}`;
    closeProfile();
  } catch (err) {
    showApiError(form, $('#my-status'), err);
  }
}

async function logout() {
  if (!window.confirm(u.logoutConfirm)) return;
  try {
    await api.post('/api/auth/logout');
  } finally {
    setUser(null);
    $('#my').close();
  }
}

// ================= Ishga tushirish =================

renderConfig();
renderStatic();
renderTabs();
initBookingDialog();
initMyDialog();
$$('[data-open-request]').forEach((b) => b.addEventListener('click', () => openBooking({ mode: 'request' })));

const fromUrl = new URLSearchParams(window.location.search).get('ssenariy');
setScenario(fromUrl || CONFIG.defaultScenarioId, { skipUrl: !fromUrl });
if (fromUrl && current().period) state.period = current().period;

initFinder();
loadMe();
loadLots();
startPolling();
