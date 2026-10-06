// Operator paneli: bronlar, turargohlar (sxema va qo'lda bandlik), statistika.
import { PERIODS, SCENARIOS, scenarioById } from '/shared/scenarios.js';
import { api } from './api.js';
import { $, $$, fmtDate, fmtMoney, fmtPhone, h } from './dom.js';

const STATUS = { pending: 'Kutilmoqda', confirmed: 'Tasdiqlangan', cancelled: 'Bekor qilingan', rejected: 'Rad etilgan' };
const FILTERS = [
  { id: 'pending', label: 'Yangi' },
  { id: 'confirmed', label: 'Tasdiqlangan' },
  { id: 'cancelled', label: 'Bekor qilingan' },
  { id: 'rejected', label: 'Rad etilgan' },
  { id: 'all', label: 'Hammasi' }
];
const REFRESH_MS = 20_000;

const state = {
  tab: 'bookings',
  filter: 'pending',
  bookings: [],
  lots: [],
  lotId: null,       // tahrirlanayotgan turargoh; '' — yangi
  period: 'night'
};

// ---------- Umumiy ----------

let toastTimer = 0;
function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast toast--${kind} is-on`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 3200);
}

/** Panelda 401 kelsa — sessiya tugagan, kirish oynasiga qaytamiz */
async function call(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 401) showLogin();
    else toast(err.message, 'error');
    throw err;
  }
}

/** Toshkent vaqti (UTC+5): "6-oktabr, 11:07" — brauzer lokaliga bog'liq emas */
function fmtTime(iso) {
  const d = new Date(Date.parse(iso) + 5 * 3_600_000).toISOString();
  return `${fmtDate(d.slice(0, 10))}, ${d.slice(11, 16)}`;
}

// ---------- Kirish ----------

function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#lg-pass').value = '';
  $('#lg-pass').focus();
}

async function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  await loadBookings();
  loadStatsBadge();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('#login-status');
  status.textContent = '';
  try {
    await api.post('/api/admin/login', { password: $('#lg-pass').value });
    showApp();
  } catch (err) {
    status.textContent = err.message;
    $('#lg-pass').select();
  }
});

$('#logout').addEventListener('click', async () => {
  await api.post('/api/admin/logout').catch(() => {});
  showLogin();
});

// ---------- Bo'limlar ----------

const TABS = ['bookings', 'lots', 'stats'];
function setTab(tab, focus = false) {
  state.tab = tab;
  for (const t of TABS) {
    const btn = $(`#tab-${t}`);
    btn.setAttribute('aria-selected', String(t === tab));
    btn.tabIndex = t === tab ? 0 : -1;
    $(`#panel-${t}`).hidden = t !== tab;
  }
  if (focus) $(`#tab-${tab}`).focus();
  if (tab === 'bookings') loadBookings();
  if (tab === 'lots') loadLots();
  if (tab === 'stats') loadStats();
}
for (const t of TABS) $(`#tab-${t}`).addEventListener('click', () => setTab(t));
$('.admin-tabs').addEventListener('keydown', (e) => {
  const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (!d) return;
  e.preventDefault();
  setTab(TABS[(TABS.indexOf(state.tab) + d + TABS.length) % TABS.length], true);
});

// ---------- Bronlar ----------

function renderFilters() {
  $('#bk-filters').replaceChildren(...FILTERS.map((f) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(f.id === state.filter),
    onclick: () => {
      state.filter = f.id;
      renderFilters();
      loadBookings();
    }
  }, f.label)));
}

async function loadBookings() {
  const { bookings } = await call(() => api.get(`/api/admin/bookings?status=${state.filter}`));
  state.bookings = bookings;
  renderBookings();
  $('#bk-updated').textContent = `Yangilandi: ${new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}`;
  if (state.filter === 'pending') setPendingCount(bookings.length);
}

function setPendingCount(n) {
  const badge = $('#pending-count');
  badge.hidden = !n;
  badge.textContent = String(n);
  document.title = `${n ? `(${n}) ` : ''}JoyBor — operator paneli`;
}

async function loadStatsBadge() {
  const s = await api.get('/api/admin/stats').catch(() => null);
  if (s) setPendingCount(s.pending);
}

function renderBookings() {
  const list = $('#bk-list');
  if (!state.bookings.length) {
    list.replaceChildren(h('p', { class: 'muted admin-empty' }, state.filter === 'pending' ? 'Yangi bron yo‘q.' : 'Bu bo‘limda bron yo‘q.'));
    return;
  }
  list.replaceChildren(...state.bookings.map(bookingCard));
}

function bookingCard(b) {
  const s = scenarioById(b.scenarioId);
  const period = b.period ? PERIODS[b.period] : null;
  const item = (label, value) => (value ? h('div', { class: 'abk__item' }, h('span', {}, label), h('strong', {}, value)) : null);
  const when = period
    ? `${fmtDate(b.startDate)} — ${fmtDate(b.endDate)} · ${period.label.toLowerCase()} ${period.from}–${period.to}`
    : `${fmtDate(b.startDate)}${b.timeFrom ? `, ${b.timeFrom}–${b.timeTo || ''}` : ''}`;

  const action = (label, status, cls = '') => h('button', {
    class: `btn btn--sm ${cls}`, type: 'button',
    onclick: async (e) => {
      if (status !== 'confirmed' && !window.confirm(`Bron #${b.id}: «${STATUS[status]}» holatiga o‘tkazilsinmi?`)) return;
      e.currentTarget.disabled = true;
      try {
        await call(() => api.post(`/api/admin/bookings/${b.id}/status`, { status }));
        toast(`#${b.id}: ${STATUS[status]}`);
        await loadBookings();
        loadStatsBadge();
      } catch {
        e.currentTarget.disabled = false;
      }
    }
  }, label);

  const actions = {
    pending: [action('Tasdiqlash', 'confirmed'), action('Rad etish', 'rejected', 'btn--ghost btn--danger')],
    confirmed: [action('Bekor qilish', 'cancelled', 'btn--ghost btn--danger')],
    cancelled: [action('Qayta tiklash', 'pending', 'btn--ghost')],
    rejected: [action('Qayta tiklash', 'pending', 'btn--ghost')]
  }[b.status];

  return h('article', { class: `abk abk--${b.status}` },
    h('header', { class: 'abk__head' },
      h('strong', {}, `#${b.id} · ${s?.title || b.scenarioId}${period ? '' : ' · so‘rov'}`),
      h('span', { class: 'muted small' }, fmtTime(b.createdAt)),
      h('span', { class: `pill pill--${b.status}` }, STATUS[b.status])),
    h('div', { class: 'abk__grid' },
      h('div', { class: 'abk__item' }, h('span', {}, 'Mijoz'), h('strong', {}, b.userName),
        h('a', { href: `tel:${b.userPhone}` }, fmtPhone(b.userPhone))),
      item('Turargoh', b.lotTitle ? `${b.lotTitle}${b.spot ? ` · joy ${b.spot}` : ''}` : null),
      item(period ? 'Muddat' : 'Sana', when),
      item('Narx', b.price != null ? `${fmtMoney(b.price)} so‘m` : null),
      item('Mashina', b.plate),
      item('Manzil', b.address),
      item('Mashinalar', b.cars ? String(b.cars) : null),
      item('Izoh', b.note)),
    h('footer', { class: 'abk__actions' }, ...actions));
}

// ---------- Turargohlar ----------

async function loadLots() {
  const { lots } = await call(() => api.get('/api/admin/lots'));
  state.lots = lots;
  if (state.lotId === null && lots.length) state.lotId = lots[0].id;
  renderLotList();
  renderLotEditor();
}

function lotSummary(lot) {
  const total = lot.rows ? lot.rows.flat().length : lot.slots;
  const night = lot.rows ? lot.blocks.night.length + Object.keys(lot.booked.night).length : lot.taken.night;
  const day = lot.rows ? lot.blocks.day.length + Object.keys(lot.booked.day).length : lot.taken.day;
  return total ? `Joylar: ${total} · band: tun ${night}, kun ${day}` : 'Joylar soni kiritilmagan';
}

function renderLotList() {
  $('#lot-list').replaceChildren(...state.lots.map((lot) => h('li', {},
    h('button', {
      class: 'lot-list__btn', type: 'button', 'aria-current': String(lot.id === state.lotId),
      onclick: () => {
        state.lotId = lot.id;
        renderLotList();
        renderLotEditor();
      }
    },
      h('span', { class: 'lot-list__title' }, lot.title),
      h('span', { class: 'muted small' }, lotSummary(lot)),
      h('span', { class: 'loc__tags' },
        lot.isActive ? h('span', { class: 'tag tag--ok' }, 'Saytda') : h('span', { class: 'tag' }, 'Yashirin'),
        lot.isDemo ? h('span', { class: 'tag tag--demo' }, 'Namuna') : null)))));
}

$('#lot-new').addEventListener('click', () => {
  state.lotId = '';
  renderLotList();
  renderLotEditor();
  $('#le-id').focus();
});

/** Sxema matni: har qator — bitta qator, joylar bo'sh joy bilan */
const rowsToText = (rows) => (rows ? rows.map((r) => r.join(' ')).join('\n') : '');
const textToRows = (text) => text.split('\n').map((line) => line.trim().split(/[\s,;]+/).filter(Boolean)).filter((r) => r.length);

function renderLotEditor() {
  const box = $('#lot-edit');
  const isNew = state.lotId === '';
  const lot = isNew ? null : state.lots.find((l) => l.id === state.lotId);
  if (!isNew && !lot) {
    box.replaceChildren(h('p', { class: 'muted' }, 'Turargoh tanlang yoki yangisini qo‘shing.'));
    return;
  }
  const v = lot || { id: '', title: '', address: '', lat: null, lng: null, scenarioIds: ['tungi'], prices: {}, rows: null, slots: null, isActive: true };

  const field = (id, label, input, hint) => h('div', { class: 'field' },
    h('label', { for: id }, label), input, hint ? h('p', { class: 'hint' }, hint) : null, h('p', { class: 'error', 'data-error': id.replace('le-', '') }));
  const input = (id, name, value, extra = {}) => h('input', { id, name, value: value ?? '', ...extra });

  const scenarios = h('fieldset', { class: 'le-scenarios' },
    h('legend', {}, 'Joy turlari va narx (so‘m, bir birlik uchun)'),
    ...SCENARIOS.map((s) => h('div', { class: 'le-scenario' },
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', name: 'scenarioIds', value: s.id, checked: v.scenarioIds.includes(s.id) }),
        `${s.title}${s.active ? '' : ' (tez orada)'}`),
      h('input', {
        type: 'number', name: `price_${s.id}`, min: '0', step: '1000', inputmode: 'numeric',
        placeholder: `Narx / ${s.unit}`, value: v.prices[s.id] ?? '', 'aria-label': `${s.title} narxi, so‘m / ${s.unit}`
      }))),
    h('p', { class: 'error', 'data-error': 'scenarioIds' }));

  const form = h('form', { class: 'le-form', novalidate: true, onsubmit: saveLot },
    h('div', { class: 'le-head' },
      h('h2', { class: 'le-title' }, isNew ? 'Yangi turargoh' : v.title),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'isActive', checked: v.isActive }), 'Saytda ko‘rinadi')),
    isNew ? field('le-id', 'ID (havola uchun)', input('le-id', 'id', '', { required: true, pattern: '[a-z0-9-]+', placeholder: 'chilonzor-maktab-1' }), 'Kichik lotin harflar, raqam va chiziqcha. Keyin o‘zgarmaydi.') : null,
    field('le-title', 'Nomi', input('le-title', 'title', v.title, { required: true, maxlength: '80' })),
    field('le-address', 'Manzil', input('le-address', 'address', v.address, { maxlength: '200' })),
    h('div', { class: 'row2' },
      field('le-lat', 'Kenglik (lat)', input('le-lat', 'lat', v.lat, { inputmode: 'decimal', placeholder: '41.3111' })),
      field('le-lng', 'Uzunlik (lng)', input('le-lng', 'lng', v.lng, { inputmode: 'decimal', placeholder: '69.2797' }))),
    h('p', { class: 'hint' }, 'Koordinata: Yandex yoki Google xaritada nuqtani bosing — chiqqan ikki raqamni kiriting.'),
    scenarios,
    field('le-rows', 'Joylar sxemasi', h('textarea', { id: 'le-rows', name: 'rows', rows: '4', placeholder: 'A1 A2 A3 A4\nB1 B2 B3 B4' }, rowsToText(v.rows)),
      'Har bir qator — turargohdagi bitta qator. Qatorlar orasida sayt «yo‘lak» chizadi. Sxema bo‘lmasa, pastda joylar sonini yozing.'),
    field('le-slots', 'Joylar soni (sxema bo‘lmasa)', input('le-slots', 'slots', v.slots, { type: 'number', min: '1', inputmode: 'numeric' })),
    h('p', { class: 'status status--warn', id: 'le-status', role: 'alert' }),
    h('div', { class: 'le-actions' },
      h('button', { class: 'btn', type: 'submit' }, isNew ? 'Qo‘shish' : 'Saqlash'),
      !isNew && v.lat != null ? h('a', { class: 'btn btn--ghost', href: `https://yandex.uz/maps/?pt=${v.lng},${v.lat}&z=17&l=map`, target: '_blank', rel: 'noopener' }, 'Xaritada tekshirish') : null));

  box.replaceChildren(form, lot && lot.rows ? spotManager(lot) : '');
}

async function saveLot(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const isNew = state.lotId === '';
  const id = isNew ? f.elements.id.value.trim() : state.lotId;
  $$('.error', f).forEach((x) => { x.textContent = ''; });
  $('#le-status').textContent = '';

  const scenarioIds = $$('input[name="scenarioIds"]:checked', f).map((x) => x.value);
  const prices = Object.fromEntries(SCENARIOS.map((s) => [s.id, f.elements[`price_${s.id}`].value]).filter(([k, val]) => val !== '' && scenarioIds.includes(k)).map(([k, val]) => [k, Number(val)]));
  const rowsText = f.elements.rows.value.trim();
  const body = {
    title: f.elements.title.value,
    address: f.elements.address.value,
    lat: f.elements.lat.value.trim().replace(',', '.'),
    lng: f.elements.lng.value.trim().replace(',', '.'),
    scenarioIds,
    prices,
    rows: rowsText ? textToRows(rowsText) : null,
    slots: f.elements.slots.value,
    isActive: f.elements.isActive.checked
  };
  try {
    const { lot } = await api.put(`/api/admin/lots/${encodeURIComponent(id)}`, body);
    toast(isNew ? 'Turargoh qo‘shildi' : 'Saqlandi');
    state.lotId = lot.id;
    await loadLots();
  } catch (err) {
    if (err.status === 401) return showLogin();
    const left = [];
    for (const [k, msg] of Object.entries(err.fields || {})) {
      const el = $(`[data-error="${k.startsWith('price_') ? 'scenarioIds' : k}"]`, f);
      if (el) el.textContent = msg;
      else left.push(msg);
    }
    $('#le-status').textContent = left.join(' ') || (Object.keys(err.fields || {}).length ? '' : err.message);
  }
}

/** Joylar: bosib "band" (doimiy ijarachi va h.k.) deb belgilash; bron qilinganlari o'zgarmaydi */
function spotManager(lot) {
  const wrap = h('section', { class: 'spots-admin' });
  const render = () => {
    const p = state.period;
    const blocked = new Set(lot.blocks[p]);
    const booked = lot.booked[p];
    const grid = h('div', { class: 'lot__grid' });
    lot.rows.forEach((row, i) => {
      if (i > 0) grid.append(h('div', { class: 'lot__lane', 'aria-hidden': 'true' }, h('span', {}, 'yo‘lak')));
      grid.append(h('div', { class: 'lot__row', style: `--n:${row.length}` }, ...row.map((spot) => {
        const bookingId = booked[spot];
        const isBlocked = blocked.has(spot);
        const st = bookingId ? 'booked' : isBlocked ? 'blocked' : 'free';
        return h('button', {
          class: 'spot', type: 'button', 'data-state': st === 'free' ? 'free' : 'busy',
          'aria-pressed': bookingId ? null : String(isBlocked),
          'aria-label': `Joy ${spot}: ${bookingId ? `bron #${bookingId}` : isBlocked ? 'band (operator)' : 'bo‘sh'}`,
          disabled: !!bookingId,
          title: bookingId ? `Bron #${bookingId}` : isBlocked ? 'Bosing — bo‘shatish' : 'Bosing — band deb belgilash',
          onclick: async () => {
            try {
              await call(() => api.post(`/api/admin/lots/${lot.id}/blocks`, { spot, period: p, blocked: !isBlocked }));
              if (isBlocked) lot.blocks[p] = lot.blocks[p].filter((x) => x !== spot);
              else lot.blocks[p] = [...lot.blocks[p], spot];
              render();
              renderLotList();
            } catch { /* toast ko'rsatildi */ }
          }
        }, h('span', { class: 'spot__id' }, bookingId ? `#${bookingId}` : spot));
      })));
    });
    wrap.replaceChildren(
      h('h3', { class: 'le-subtitle' }, 'Bandlik'),
      h('p', { class: 'hint' }, 'Bo‘sh joyni bosing — saytda band bo‘lib ko‘rinadi (masalan, doimiy ijarachi). Bron qilingan joylar raqami bilan ko‘rsatiladi.'),
      h('div', { class: 'filters' }, ...Object.entries(PERIODS).map(([id, per]) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(id === p),
        onclick: () => {
          state.period = id;
          render();
        }
      }, `${per.label} (${per.from}–${per.to})`))),
      h('div', { class: 'lot__scroll' }, grid));
  };
  render();
  return wrap;
}

// ---------- Statistika ----------

async function loadStats() {
  const s = await call(() => api.get('/api/admin/stats'));
  setPendingCount(s.pending);
  const tile = (label, value) => h('div', { class: 'card stat' }, h('span', { class: 'stat__value' }, String(value)), h('span', { class: 'muted' }, label));
  $('#stats').replaceChildren(
    h('div', { class: 'stats-grid' },
      tile('Kutilayotgan', s.pending),
      tile('So‘rov va bronlar, 7 kun', s.last7),
      tile('30 kun', s.last30),
      tile('Ro‘yxatdan o‘tganlar', s.users)),
    h('h2', { class: 'h2 stats-title' }, 'Joy turlari bo‘yicha talab'),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ...['Tur', 'Jami', 'Kutilmoqda', 'Tasdiqlangan', 'Bekor', 'Rad etilgan'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, ...s.scenarios.map((r) => h('tr', {},
          h('th', { scope: 'row' }, r.title, r.active ? '' : h('span', { class: 'badge' }, 'tez orada')),
          ...[r.total, r.pending, r.confirmed, r.cancelled, r.rejected].map((n) => h('td', {}, String(n)))))))),
    h('p', { class: 'hint' }, '«Tez orada» turlariga kelgan so‘rovlar — qaysi xizmatni birinchi ochish kerakligini ko‘rsatadi.'));
}

// ---------- Ishga tushirish ----------

renderFilters();
setInterval(() => {
  if (!$('#app-view').hidden && state.tab === 'bookings' && document.visibilityState === 'visible') loadBookings().catch(() => {});
}, REFRESH_MS);

api.get('/api/admin/me')
  .then(({ admin }) => (admin ? showApp() : showLogin()))
  .catch(showLogin);
