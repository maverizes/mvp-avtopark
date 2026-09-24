// JoyBor — sahifa mantiqi. Hamma ma'lumot data.js'dan olinadi.
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isPlaceholder = (v) => v == null || v === '' || /^\[.*\]$/.test(String(v).trim());
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Kichik DOM yordamchisi: h('div', {class: 'x'}, 'matn', child)
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  // Holat
  const state = {
    scenarioId: null,
    mapFilter: 'all',
    mapLocationId: null
  };

  const byId = (id) => SCENARIOS.find((s) => s.id === id);
  const current = () => byId(state.scenarioId) || SCENARIOS[0];

  // --- Vaqt oralig'i ---
  const toMin = (t) => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
  function inWindow(win, minutes) {
    if (!win) return false;
    const a = toMin(win.from), b = toMin(win.to);
    return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
  }
  const timeText = (s) => (s.timeWindow ? `${s.timeWindow.from}–${s.timeWindow.to}` : TEXT.ui.timeAgreed);
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const locScenarios = (loc) => loc.scenarioIds.map(byId).filter(Boolean);
  const locOpenAt = (loc, m) => locScenarios(loc).some((s) => inWindow(s.timeWindow, m));

  // Narx matni: "[NARX] so'm / oy"
  const priceText = (loc, s) => {
    const p = loc && loc.price ? loc.price[s.id] : null;
    return `${p == null ? '[NARX]' : p} ${CONFIG.currency} / ${s.unit}`;
  };

  // --- Konfiguratsiya (data-cfg) ---
  function telHref() {
    return isPlaceholder(CONFIG.phone) ? '#ariza' : 'tel:' + String(CONFIG.phone).replace(/[^\d+]/g, '');
  }
  function tgHref() {
    return isPlaceholder(CONFIG.telegram) ? '#ariza' : 'https://t.me/' + String(CONFIG.telegram).replace(/^@/, '');
  }
  function renderConfig() {
    document.title = `${CONFIG.brand} — turargoh joyi`;
    $$('[data-cfg]').forEach((el) => { el.textContent = CONFIG[el.dataset.cfg] ?? ''; });
    $$('[data-cfg-href]').forEach((el) => {
      el.href = el.dataset.cfgHref === 'tel' ? telHref() : tgHref();
      if (el.href.startsWith('https://t.me/')) { el.target = '_blank'; el.rel = 'noopener'; }
    });
  }

  // --- Statik bloklar: og'riqlar, qadamlar, FAQ ---
  function renderStatic() {
    $('#pains').replaceChildren(...TEXT.pains.map((p) =>
      h('article', { class: 'card' }, h('h3', {}, p.title), h('p', {}, p.text))));

    $('#steps').replaceChildren(...TEXT.steps.map((p) =>
      h('li', { class: 'card' }, h('h3', {}, p.title), h('p', {}, p.text))));

    $('#faq').replaceChildren(...TEXT.faq.map((f, i) => {
      const panelId = `faq-a-${i}`;
      const btn = h('button', {
        class: 'faq__q', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId,
        onclick: () => {
          const open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!open));
          panel.hidden = open;
        }
      }, h('span', {}, f.q), h('span', { class: 'faq__icon', 'aria-hidden': 'true' }));
      const panel = h('div', { class: 'faq__a', id: panelId, hidden: true }, h('p', {}, f.a));
      return h('div', { class: 'faq__item' }, h('h3', { style: 'margin:0;font:inherit' }, btn), panel);
    }));
  }

  // --- Ssenariy tanlagichi ---
  function renderTabs() {
    const wrap = $('#scenario-tabs');
    wrap.replaceChildren(...SCENARIOS.map((s) => h('button', {
      class: 'tab', type: 'button', role: 'radio', 'data-id': s.id,
      onclick: () => setScenario(s.id),
      onkeydown: onTabKey
    },
      h('span', { class: 'tab__top' },
        h('span', { class: 'tab__title' }, s.title),
        s.active ? h('span', { class: 'tab__check', 'aria-hidden': 'true' }) : h('span', { class: 'badge' }, 'tez orada')),
      h('p', { class: 'tab__sub' }, s.subtitle),
      h('p', { class: 'tab__meta' }, `${timeText(s)} · ${s.unit}lik to‘lov`)
    )));

    // Formadagi select
    $('#f-scenario').replaceChildren(...SCENARIOS.map((s) =>
      h('option', { value: s.id }, s.active ? s.title : `${s.title} (tez orada)`)));
    $('#f-scenario').addEventListener('change', (e) => setScenario(e.target.value));
  }

  // Strelkalar bilan tanlash (radiogroup)
  function onTabKey(e) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = SCENARIOS.findIndex((s) => s.id === state.scenarioId);
    const next = SCENARIOS[(i + keys[e.key] + SCENARIOS.length) % SCENARIOS.length];
    setScenario(next.id);
    $(`.tab[data-id="${next.id}"]`).focus();
  }

  // --- Ssenariy almashganda yangilanadigan qismlar ---
  function setScenario(id, opts = {}) {
    if (!byId(id)) id = CONFIG.defaultScenarioId;
    if (!byId(id)) id = SCENARIOS[0].id;
    state.scenarioId = id;
    const s = current();

    // Tablar
    $$('.tab').forEach((t) => {
      const on = t.dataset.id === id;
      t.setAttribute('aria-checked', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $('#f-scenario').value = id;

    // Hero va pilot kartasi
    const loc = LOCATIONS.find((l) => l.scenarioIds.includes(id));
    const binds = {
      'scenario.title': s.title,
      'scenario.heroTitle': s.heroTitle,
      'scenario.heroText': s.heroText,
      'scenario.time': timeText(s),
      'scenario.unit': s.unit,
      'location.title': loc ? loc.title : TEXT.ui.noLocation,
      'location.address': loc ? loc.address : '—',
      'location.slots': loc ? loc.slots : '—',
      'location.priceText': priceText(loc, s),
      'location.note': loc ? '' : TEXT.ui.noLocationNote,
      'form.note': s.active ? TEXT.ui.formActive : TEXT.ui.formSoon
    };
    $$('[data-bind]').forEach((el) => { el.textContent = binds[el.dataset.bind] ?? ''; });
    $$('[data-show="scenario.soon"]').forEach((el) => { el.hidden = s.active; });

    renderPrices(s);
    updateFormFields(s);

    // URL'ga yozish
    if (!opts.skipUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('ssenariy', id);
      try { history.replaceState(null, '', url); } catch (_) { /* file:// da ba'zan ishlamaydi */ }
    }
  }

  // --- Narx bloki ---
  function renderPrices(s) {
    const locs = LOCATIONS.filter((l) => l.scenarioIds.includes(s.id));
    const cards = locs.length
      ? locs.map((l) => h('article', { class: 'card' },
          h('h3', {}, l.title),
          h('p', {}, l.address),
          h('p', { class: 'price__value' }, `${l.price && l.price[s.id] != null ? l.price[s.id] : '[NARX]'} ${CONFIG.currency}`),
          h('p', { class: 'price__unit' }, `1 ${s.unit} uchun · ${timeText(s)}`)))
      : [h('article', { class: 'card' },
          h('h3', {}, TEXT.ui.noLocation),
          h('p', { class: 'price__value' }, `[NARX] ${CONFIG.currency}`),
          h('p', { class: 'price__unit' }, `1 ${s.unit} uchun`))];
    $('#prices').replaceChildren(...cards);
  }

  // --- Xarita ---
  const FILTERS = [
    { id: 'all', label: 'Hammasi', test: () => true },
    { id: 'night', label: 'Tunda', test: (l) => locOpenAt(l, toMin('23:00')) },
    { id: 'day', label: 'Kunduzi', test: (l) => locOpenAt(l, toMin('13:00')) },
    { id: 'now', label: 'Hozir ochiq', test: (l) => locOpenAt(l, nowMin()) }
  ];

  function renderMap() {
    const section = $('#xarita');
    if (!CONFIG.map || !CONFIG.map.enabled) { section.hidden = true; return; }

    $('#map-filters').replaceChildren(...FILTERS.map((f) => h('button', {
      class: 'chip', type: 'button', 'data-id': f.id,
      'aria-pressed': String(f.id === state.mapFilter),
      onclick: () => { state.mapFilter = f.id; renderMapList(); }
    }, f.label)));
    renderMapList();
  }

  function renderMapList() {
    const f = FILTERS.find((x) => x.id === state.mapFilter);
    $$('#map-filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === f.id)));

    const list = LOCATIONS.filter(f.test);
    const now = nowMin();
    if (!list.some((l) => l.id === state.mapLocationId)) state.mapLocationId = list[0] ? list[0].id : null;

    $('#map-list').replaceChildren(...(list.length ? list.map((l) => h('li', {},
      h('button', {
        class: 'loc', type: 'button',
        'aria-current': String(l.id === state.mapLocationId),
        onclick: () => { state.mapLocationId = l.id; renderMapList(); }
      },
        h('span', { class: 'loc__title' }, l.title),
        h('span', { class: 'loc__addr' }, l.address),
        h('span', { class: 'loc__tags' },
          locOpenAt(l, now) ? h('span', { class: 'tag tag--open' }, 'Hozir ochiq') : null,
          ...locScenarios(l).map((s) => h('span', { class: 'tag' }, `${s.title}: ${timeText(s)}`)))
      ))) : [h('li', { class: 'map__empty' }, TEXT.ui.mapEmpty)]));

    showOnMap(LOCATIONS.find((l) => l.id === state.mapLocationId));
  }

  // OpenStreetMap iframe: nuqta bo'lsa marker bilan, bo'lmasa shahar markazi
  function showOnMap(loc) {
    const hasPoint = loc && typeof loc.lat === 'number' && typeof loc.lng === 'number';
    const c = hasPoint ? { lat: loc.lat, lng: loc.lng } : CONFIG.map.center;
    const d = hasPoint ? CONFIG.map.zoom / 3 : CONFIG.map.zoom * 3;
    const bbox = [c.lng - d, c.lat - d * 0.6, c.lng + d, c.lat + d * 0.6].map((n) => n.toFixed(5)).join(',');
    let src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
    if (hasPoint) src += `&marker=${c.lat},${c.lng}`;
    const iframe = $('#map-iframe');
    if (iframe.getAttribute('src') !== src) iframe.src = src;

    const hint = $('#map-hint');
    hint.replaceChildren();
    if (!loc) return;
    if (hasPoint) {
      hint.append(`${loc.title} — ${loc.address}. `,
        h('a', { href: `https://yandex.uz/maps/?pt=${loc.lng},${loc.lat}&z=17&l=map`, target: '_blank', rel: 'noopener' }, 'Yo‘l topish (Yandex)'));
    } else {
      hint.append(TEXT.ui.mapNoCoords + loc.address);
    }
  }

  // --- Forma ---
  const FIELD_IDS = ['startDate', 'date', 'timeFrom', 'timeTo', 'cars'];
  const FIELD_LABELS = { startDate: 'Qachondan', date: 'Sana', timeFrom: 'Soat nechidan', timeTo: 'Soat nechigacha', cars: 'Mashinalar soni' };

  function updateFormFields(s) {
    FIELD_IDS.forEach((f) => {
      const box = $(`[data-field="${f}"]`);
      const on = s.fields.includes(f);
      box.hidden = !on;
      const input = $('input', box);
      input.required = on;
      if (!on) clearError(f);
    });
  }

  const form = $('#form');
  const val = (name) => (form.elements[name].value || '').trim();

  function setError(name, msg) {
    const input = form.elements[name];
    input.setAttribute('aria-invalid', 'true');
    const err = $(`[data-error="${name}"]`);
    err.id = `err-${name}`;
    err.textContent = msg;
    input.setAttribute('aria-describedby', err.id);
  }
  function clearError(name) {
    const input = form.elements[name];
    if (!input) return;
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    const err = $(`[data-error="${name}"]`);
    if (err) err.textContent = '';
  }

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function validate() {
    const s = current();
    const errors = {};
    const phone = val('phone').replace(/\D/g, '');
    const plate = val('plate').replace(/[\s-]/g, '');

    if (val('name').length < 2) errors.name = 'Ismingizni yozing.';
    if (!(phone.length === 9 || (phone.length === 12 && phone.startsWith('998')))) errors.phone = 'Telefon raqamini to‘liq yozing, masalan +998 90 123 45 67.';
    if (!/^[0-9A-Za-z]{5,10}$/.test(plate)) errors.plate = 'Mashina raqamini yozing, masalan 01 A 123 BC.';
    if (val('address').length < 3) errors.address = 'Qaysi manzil yonida joy kerakligini yozing.';

    if (s.fields.includes('startDate')) {
      if (!val('startDate')) errors.startDate = 'Sanani tanlang.';
      else if (val('startDate') < todayStr()) errors.startDate = 'O‘tib ketgan sana tanlangan.';
    }
    if (s.fields.includes('date')) {
      if (!val('date')) errors.date = 'Sanani tanlang.';
      else if (val('date') < todayStr()) errors.date = 'O‘tib ketgan sana tanlangan.';
    }
    if (s.fields.includes('timeFrom') && !val('timeFrom')) errors.timeFrom = 'Vaqtni tanlang.';
    if (s.fields.includes('timeTo')) {
      if (!val('timeTo')) errors.timeTo = 'Vaqtni tanlang.';
      else if (val('timeFrom') && val('timeTo') <= val('timeFrom')) errors.timeTo = 'Tugash vaqti boshlanishidan keyin bo‘lsin.';
    }
    if (s.fields.includes('cars') && !(Number(val('cars')) >= 1)) errors.cars = 'Nechta mashina ekanini yozing.';

    ['name', 'phone', 'plate', 'address', ...FIELD_IDS].forEach(clearError);
    Object.entries(errors).forEach(([k, m]) => setError(k, m));
    const first = Object.keys(errors)[0];
    if (first) form.elements[first].focus();
    return !first;
  }

  // Telegram xabari matni. #ssenariy_<id> — keyin qidirib sanash uchun.
  function buildMessage() {
    const s = current();
    const lines = [
      `Yangi ariza — ${CONFIG.brand}`,
      `Ssenariy: ${s.title}${s.active ? '' : ' (talab ro‘yxati)'}`,
      `#ssenariy_${s.id}`,
      '',
      `Ism: ${val('name')}`,
      `Telefon: ${val('phone')}`,
      `Mashina raqami: ${val('plate').toUpperCase()}`,
      `Manzil: ${val('address')}`
    ];
    s.fields.forEach((f) => lines.push(`${FIELD_LABELS[f]}: ${val(f)}`));
    lines.push(`Vaqt oralig‘i: ${timeText(s)}`, `To‘lov birligi: ${s.unit}`);
    return lines.join('\n');
  }

  function setStatus(msg, kind, link) {
    const el = $('#form-status');
    el.className = 'status' + (kind ? ` status--${kind}` : '');
    el.replaceChildren(msg);
    if (link) el.append(' ', h('a', { href: link, target: '_blank', rel: 'noopener' }, 'Telegramni ochish'));
  }

  function showFallback(text) {
    const ta = $('#fallback');
    ta.value = text;
    ta.hidden = false;
    ta.focus();
    ta.select();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) { setStatus('Ba’zi maydonlar to‘ldirilmagan.', 'warn'); return; }
    const text = buildMessage();

    if (isPlaceholder(CONFIG.telegram)) {
      setStatus('Telegram manzili hali sozlanmagan. Matnni nusxalab, operatorga yuboring.', 'warn');
      showFallback(text);
      return;
    }
    const url = `${tgHref()}?text=${encodeURIComponent(text)}`;
    const w = window.open(url, '_blank');
    if (w) { w.opener = null; setStatus('Telegram ochildi — xabarni yuboring. Rahmat!', 'ok'); }
    else setStatus('Brauzer yangi oynani to‘sib qo‘ydi.', 'warn', url);
  });

  $('#copy-btn').addEventListener('click', async () => {
    if (!validate()) { setStatus('Avval maydonlarni to‘ldiring.', 'warn'); return; }
    const text = buildMessage();
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      setStatus('Matn nusxalandi. Uni Telegramda operatorga yuboring.', 'ok', isPlaceholder(CONFIG.telegram) ? null : tgHref());
    } catch (_) {
      setStatus('Nusxalab bo‘lmadi — matnni pastdan belgilab oling.', 'warn');
      showFallback(text);
    }
  });

  // Silliq aylantirish faqat harakat cheklanmagan bo'lsa
  if (reducedMotion) document.documentElement.style.scrollBehavior = 'auto';

  // --- Ishga tushirish ---
  renderConfig();
  renderStatic();
  renderTabs();
  const fromUrl = new URLSearchParams(window.location.search).get('ssenariy');
  setScenario(fromUrl || CONFIG.defaultScenarioId, { skipUrl: !fromUrl });
  renderMap();
})();
