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

  // Lokatsiyalar: haqiqiylari + (demo rejimda) namunalar
  const DEMO = CONFIG.demo && typeof DEMO_LOCATIONS !== 'undefined' ? DEMO_LOCATIONS : [];
  const DEMO_IDS = new Set(DEMO.map((l) => l.id));
  const LOCS = LOCATIONS.concat(DEMO);

  // Holat
  const state = {
    scenarioId: null,
    period: 'now',       // 'now' | 'night' | 'day'
    onlyFree: false,     // faqat bo'sh joyi borlar
    mapLocationId: null,
    picked: null,        // {locId, spot, period}
    me: null,            // {lat, lng, acc, manual}
    geo: 'off',          // 'off' | 'locating' | 'on' | 'manual' | 'error'
    geoMsg: '',
    pickMode: false,     // xaritani bosib joyni belgilash rejimi
    lastKey: null,
    shown: null          // ro'yxatda ko'rinayotgan turargohlar
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
    const loc = LOCS.find((l) => l.scenarioIds.includes(id));
    const binds = {
      'scenario.title': s.title,
      'scenario.heroTitle': s.heroTitle,
      'scenario.heroText': s.heroText,
      'scenario.time': timeText(s),
      'scenario.unit': s.unit,
      'location.title': loc ? loc.title : TEXT.ui.noLocation,
      'location.address': loc ? loc.address : '—',
      'location.slots': loc ? (loc.rows ? loc.rows.flat().length : loc.slots) : '—',
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
    const locs = LOCS.filter((l) => l.scenarioIds.includes(s.id));
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

  // --- Davrlar va bandlik ---
  // Davr tanlovi: 'now' — hozirgi vaqtga qarab tun yoki kun
  const PERIOD_FILTERS = [
    { id: 'now', label: 'Hozir' },
    ...Object.entries(CONFIG.periods).map(([id, p]) => ({ id, label: p.label }))
  ];
  const periodKey = () => (state.period !== 'now' ? state.period
    : (Object.keys(CONFIG.periods).find((k) => inWindow(CONFIG.periods[k], nowMin())) || 'day'));

  // Davr o'rtasidagi daqiqa — lokatsiya shu paytda ochiqmi, tekshirish uchun
  function periodMid(k) {
    const w = CONFIG.periods[k], a = toMin(w.from), b = toMin(w.to);
    return (a + ((b - a + 1440) % 1440) / 2) % 1440;
  }
  const locOpenIn = (loc, k) => locOpenAt(loc, periodMid(k));

  // Joylar statistikasi: jami, band, bo'sh
  function lotStats(loc, k) {
    const spots = loc.rows ? loc.rows.flat() : null;
    if (!spots) return null;
    const open = locOpenIn(loc, k);
    const busy = new Set(open ? ((loc.busy && loc.busy[k]) || []) : spots);
    return { spots, busy, open, total: spots.length, free: spots.filter((x) => !busy.has(x)).length };
  }

  // Matn shabloni: '{free} ta' -> '3 ta'. fmtParts — qiymat o'rnida DOM element ham bo'lishi mumkin
  const fmt = (str, o) => str.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
  const fmtParts = (str, o) => str.split(/(\{\w+\})/).map((p) => {
    const m = p.match(/^\{(\w+)\}$/);
    return m ? (o[m[1]] ?? '') : p;
  });

  // Turargoh holati: ok | low | full | closed | unknown
  function lotStatus(loc, k) {
    const u = TEXT.ui, st = lotStats(loc, k);
    if (!locOpenIn(loc, k)) return { kind: 'closed', text: u.statusClosed, short: '' };
    if (!st) return { kind: 'unknown', text: fmt(u.statusUnknown, { slots: loc.slots ?? '[N]' }), short: '' };
    if (!st.free) return { kind: 'full', text: u.statusFull, short: '0' };
    if (st.free <= CONFIG.lowSpots) return { kind: 'low', text: fmt(u.statusLow, st), short: String(st.free) };
    return { kind: 'ok', text: fmt(u.statusFree, st), short: String(st.free) };
  }

  // --- Masofa ---
  const hasPoint = (l) => !!l && typeof l.lat === 'number' && typeof l.lng === 'number';
  function distM(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(q));
  }
  const locDist = (l) => (state.me && hasPoint(l) ? distM(state.me, l) : null);
  function fmtDist(m) {
    if (m < 995) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
  }
  // Piyoda vaqt faqat 2 km gacha ko'rsatiladi
  const walkText = (m) => (m <= 2000 ? fmt(TEXT.ui.walk, { min: Math.max(1, Math.round(m / CONFIG.walkSpeed)) }) : '');

  // --- Mini xarita: kutubxonasiz, OpenStreetMap plitkalari ---
  // Web Mercator: kenglik/uzunlik <-> piksel. z kasr bo'lishi mumkin (silliq kattalashtirish uchun)
  const TILE = 256;
  function project(lat, lng, z) {
    const size = TILE * 2 ** z;
    const sn = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
    return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * size };
  }
  function unproject(x, y, z) {
    const size = TILE * 2 ** z, n = Math.PI - (2 * Math.PI * y) / size;
    return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / size) * 360 - 180 };
  }

  function createMap(view, opts) {
    const clampZ = (v) => Math.max(opts.minZoom, Math.min(opts.maxZoom, v));
    const tilesEl = h('div', { class: 'mv__tiles' + (opts.dark ? ' mv__tiles--dark' : '') });
    const meEl = h('div', { class: 'me', hidden: true }, h('div', { class: 'me__acc' }), h('div', { class: 'me__dot' }));
    const mkEl = h('div', { class: 'mv__markers' });
    view.append(tilesEl, h('div', { class: 'mv__over' }, meEl), mkEl);

    let W = 0, H = 0, z = opts.zoom, center = { lat: opts.center.lat, lng: opts.center.lng };
    let cur = null, back = null;      // plitka qatlamlari: joriy va eski (yangisi yuklanguncha ko'rinib turadi)
    let markers = [], me = null, started = false, positioned = false, raf = 0, anim = 0;

    const measure = () => { W = view.clientWidth; H = view.clientHeight; };
    const cpx = () => project(center.lat, center.lng, z);
    // Konteyner nuqtasi <-> geografik nuqta
    function toLatLng(p) { const c = cpx(); return unproject(c.x + p.x - W / 2, c.y + p.y - H / 2, z); }
    function toPoint(ll) { const c = cpx(), q = project(ll.lat, ll.lng, z); return { x: q.x - c.x + W / 2, y: q.y - c.y + H / 2 }; }

    const isReady = (L) => [...L.tiles.values()].every((i) => i.classList.contains('is-ready'));
    function settle() { if (back && cur && isReady(cur)) { back.el.remove(); back = null; } }

    // Qatlam plitkalarini joylash. addNew=false — faqat mavjudlarini suramiz (eski qatlam)
    function placeLayer(L, addNew) {
      const scale = 2 ** (z - L.tz), n = 2 ** L.tz;
      const c = project(center.lat, center.lng, L.tz);
      const left = c.x - W / 2 / scale, top = c.y - H / 2 / scale;
      if (addNew) {
        const need = new Set();
        const x0 = Math.floor(left / TILE), x1 = Math.floor((left + W / scale) / TILE);
        const y0 = Math.max(0, Math.floor(top / TILE)), y1 = Math.min(n - 1, Math.floor((top + H / scale) / TILE));
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            const key = tx + ':' + ty;
            need.add(key);
            if (L.tiles.has(key)) continue;
            const img = document.createElement('img');
            img.alt = '';
            img.draggable = false;
            img.className = 'mv__tile';
            img.dataset.tx = tx;
            img.dataset.ty = ty;
            img.onload = () => { img.classList.add('is-ready'); settle(); };
            img.onerror = () => { img.classList.add('is-ready', 'is-failed'); settle(); };
            img.src = opts.tileUrl.replace('{z}', L.tz).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty);
            L.tiles.set(key, img);
            L.el.append(img);
          }
        }
        for (const [key, img] of L.tiles) if (!need.has(key)) { img.remove(); L.tiles.delete(key); }
      }
      // Qo'shni plitkalar chegarasi bir xil yaxlitlanadi — orada tirqish qolmaydi
      for (const img of L.tiles.values()) {
        const tx = +img.dataset.tx, ty = +img.dataset.ty;
        const ax = Math.round((tx * TILE - left) * scale), ay = Math.round((ty * TILE - top) * scale);
        const bx = Math.round(((tx + 1) * TILE - left) * scale), by = Math.round(((ty + 1) * TILE - top) * scale);
        img.style.transform = `translate(${ax}px, ${ay}px)`;
        img.style.width = bx - ax + 'px';
        img.style.height = by - ay + 'px';
      }
    }

    function draw() {
      raf = 0;
      if (!started) return;
      if (!W || !H) measure();
      if (!W || !H) return;
      const tz = Math.round(clampZ(z));
      if (!cur || cur.tz !== tz) {
        // Zoom darajasi o'zgardi: yaxshi yuklangan qatlam orqa fon bo'lib qoladi
        if (cur) {
          const ready = [...cur.tiles.values()].filter((i) => i.classList.contains('is-ready')).length;
          if (!back || ready >= cur.tiles.size / 2) { if (back) back.el.remove(); back = cur; }
          else cur.el.remove();
        }
        const el = h('div', { class: 'mv__layer' });
        tilesEl.append(el);
        cur = { tz, el, tiles: new Map() };
      }
      if (back) placeLayer(back, false);
      placeLayer(cur, true);
      settle();

      for (const m of markers) {
        const p = toPoint(m);
        m.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      }
      meEl.hidden = !me;
      if (me) {
        const p = toPoint(me), acc = meEl.firstChild;
        meEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
        const mpp = (156543.03392 * Math.cos((me.lat * Math.PI) / 180)) / 2 ** z;   // metr / piksel
        const r = Math.min(3000, (me.acc || 0) / mpp);
        acc.hidden = r < 14;
        acc.style.width = acc.style.height = Math.round(r * 2) + 'px';
      }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

    // Nuqta f (konteyner pikseli) joyida qolgan holda zoomni o'zgartirish
    function zoomAround(nz, f) {
      const ll = toLatLng(f);
      z = clampZ(nz);
      const q = project(ll.lat, ll.lng, z);
      center = unproject(q.x - f.x + W / 2, q.y - f.y + H / 2, z);
    }
    function animate(fn, dur) {
      cancelAnimationFrame(anim);
      if (reducedMotion) { fn(1); draw(); return; }
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        fn(1 - (1 - k) ** 3);
        draw();
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    function zoomTo(target, f) {
      f = f || { x: W / 2, y: H / 2 };
      const z0 = z, t = clampZ(target);
      animate((e) => zoomAround(z0 + (t - z0) * e, f), 220);
    }

    // Sichqoncha va barmoqlar: surish, ikki barmoq bilan kattalashtirish, bosish
    const pts = new Map();
    let g = null;
    const rel = (e) => { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function begin() {
      const p = [...pts.values()];
      if (p.length === 1) g = { kind: 'pan', last: p[0], moved: 0 };
      else if (p.length >= 2) {
        const [a, b] = p, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        g = { kind: 'pinch', z0: z, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, ll: toLatLng(m) };
      }
    }
    view.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.mk')) return;          // marker — o'z tugmasi
      cancelAnimationFrame(anim);
      try { view.setPointerCapture(e.pointerId); } catch (_) { /* eski brauzer */ }
      pts.set(e.pointerId, rel(e));
      begin();
    });
    view.addEventListener('pointermove', (e) => {
      if (!g || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, rel(e));
      const p = [...pts.values()];
      if (g.kind === 'pan') {
        const dx = p[0].x - g.last.x, dy = p[0].y - g.last.y;
        g.last = p[0];
        g.moved += Math.abs(dx) + Math.abs(dy);
        if (g.moved > 5) { view.classList.add('is-dragging'); positioned = true; }
        const c = cpx();
        center = unproject(c.x - dx, c.y - dy, z);
      } else {
        const [a, b] = p, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        z = clampZ(g.z0 + Math.log2(Math.hypot(a.x - b.x, a.y - b.y) / g.d0));
        const q = project(g.ll.lat, g.ll.lng, z);
        center = unproject(q.x - m.x + W / 2, q.y - m.y + H / 2, z);
      }
      schedule();
    });
    function end(e) {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId);
      const wasPinch = g && g.kind === 'pinch';
      const tap = g && g.kind === 'pan' && g.moved <= 5 && e.type === 'pointerup';
      pts.delete(e.pointerId);
      view.classList.remove('is-dragging');
      if (tap && opts.onTap) opts.onTap(toLatLng(p));
      if (pts.size) { begin(); if (g.kind === 'pan') g.moved = 99; }   // qolgan barmoq bilan surish davom etadi
      else g = null;
      if (wasPinch) zoomTo(Math.round(z), p);                          // plitkalar tiniq bo'lishi uchun
    }
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
    view.addEventListener('dblclick', (e) => { e.preventDefault(); zoomTo(Math.round(z) + 1, rel(e)); });

    // G'ildirak: Ctrl/Cmd bilan (va noutbuk paneli) — kattalashtirish; oddiy g'ildirak sahifani suradi
    let wheelSnap = 0;
    view.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) { if (opts.onWheelHint) opts.onWheelHint(); return; }
      e.preventDefault();
      cancelAnimationFrame(anim);
      const dy = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
      const f = rel(e);
      zoomAround(z - Math.max(-1, Math.min(1, dy / 100)), f);
      schedule();
      clearTimeout(wheelSnap);
      wheelSnap = setTimeout(() => zoomTo(Math.round(z), f), 250);
    }, { passive: false });

    // Klaviatura: strelkalar — surish, + / − — kattalashtirish
    view.addEventListener('keydown', (e) => {
      const moves = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
      if (moves[e.key]) {
        e.preventDefault();
        const c = cpx();
        center = unproject(c.x + moves[e.key][0], c.y + moves[e.key][1], z);
        schedule();
      } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(Math.round(z) + 1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(Math.round(z) - 1); }
    });

    if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); schedule(); }).observe(view);
    else window.addEventListener('resize', () => { measure(); schedule(); });

    return {
      start() { started = true; measure(); draw(); },
      positioned: () => positioned,
      setMarkers(list) { markers = list; mkEl.replaceChildren(...list.map((m) => m.el)); schedule(); },
      setMe(m) { me = m; schedule(); },
      zoomBy(d) { zoomTo(Math.round(z) + d); },
      setView(ll, zz) {
        cancelAnimationFrame(anim);
        positioned = true;
        center = { lat: ll.lat, lng: ll.lng };
        if (zz != null) z = clampZ(zz);
        schedule();
      },
      // Silliq surish; zoom kamida minZ bo'ladi
      panTo(ll, minZ) {
        positioned = true;
        const c0 = { ...center }, z0 = z, z1 = clampZ(Math.max(Math.round(z), minZ || 0));
        animate((e) => {
          center = { lat: c0.lat + (ll.lat - c0.lat) * e, lng: c0.lng + (ll.lng - c0.lng) * e };
          z = z0 + (z1 - z0) * e;
        }, 350);
      },
      // Hamma nuqtalar sig'adigan eng yaqin zoom (markerlar tepaga chiqishini hisobga olib)
      fit(points, maxZ) {
        if (!points.length) return;
        cancelAnimationFrame(anim);
        positioned = true;
        measure();
        // Chetlardan bo'sh joy: tepada — marker balandligi, o'ngda — tugmalar
        const pad = 36, padTop = 72, padRight = 68;
        let best = opts.minZoom;
        for (let zz = Math.floor(clampZ(maxZ || opts.maxZoom)); zz >= opts.minZoom; zz--) {
          const ps = points.map((p) => project(p.lat, p.lng, zz));
          const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
          const hh = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
          if (w <= W - pad - padRight && hh <= H - pad - padTop) { best = zz; break; }
        }
        const ps = points.map((p) => project(p.lat, p.lng, best));
        const cx = (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2;
        const cy = (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2;
        z = best;
        center = unproject(cx + (padRight - pad) / 2, cy - (padTop - pad) / 2, best);
        schedule();
      }
    };
  }

  // --- Turargoh qidiruvchi: xarita, ro'yxat, tanlangan turargoh ---
  let map = null;
  const shownLocs = () => state.shown || LOCS;

  // Qayta chizishda klaviatura fokusini yo'qotmaslik uchun
  const focusKey = () => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focusKey : null);
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

  function renderMap() {
    $('#map-filters').replaceChildren(...PERIOD_FILTERS.map((f) => h('button', {
      class: 'chip', type: 'button', 'data-id': f.id, 'data-focus-key': 'period:' + f.id,
      onclick: () => { state.period = f.id; renderMapList(); }
    }, f.label)));
    $('#only-free').addEventListener('click', () => { state.onlyFree = !state.onlyFree; renderMapList(); });
    $('#locate').addEventListener('click', () => (state.geo === 'off' ? startLocate() : stopLocate()));
    initMap();
    renderMapList();
    updateLocateBtn();
    // "Hozir" rejimida tun va kun almashganda qayta chizamiz
    setInterval(() => { if (state.period === 'now' && periodKey() !== state.lastKey) renderMapList(); }, 60000);
  }

  function initMap() {
    const cfg = CONFIG.map, card = $('#map-card');
    if (!cfg || !cfg.enabled) { card.hidden = true; return; }
    const attr = $('#map-attr');
    attr.textContent = cfg.attribution;
    attr.href = cfg.attributionUrl;
    map = createMap($('#mapview'), {
      center: cfg.center, zoom: cfg.zoom, minZoom: cfg.minZoom, maxZoom: cfg.maxZoom,
      tileUrl: cfg.tileUrl, dark: cfg.dark,
      onTap: onMapTap,
      onWheelHint: () => toast(TEXT.ui.wheelHint)
    });
    $('#zoom-in').addEventListener('click', () => map.zoomBy(1));
    $('#zoom-out').addEventListener('click', () => map.zoomBy(-1));
    $('#zoom-fit').addEventListener('click', fitAll);

    // Plitkalar xarita ko'rinishga yaqinlashgandagina yuklanadi
    const start = () => { map.start(); if (!map.positioned()) fitAll(); };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
      }, { rootMargin: '300px' });
      io.observe(card);
    } else start();
  }

  function fitAll() {
    if (!map) return;
    const pts = shownLocs().filter(hasPoint);
    if (state.me) pts.push(state.me);
    if (pts.length) map.fit(pts, 15);
    else map.setView(CONFIG.map.center, CONFIG.map.zoom);
  }

  function renderMapList() {
    const fk = focusKey();
    const k = periodKey();
    state.lastKey = k;
    $$('#map-filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === state.period)));
    $('#only-free').setAttribute('aria-pressed', String(state.onlyFree));

    let list = LOCS.map((l) => ({ l, s: lotStatus(l, k), st: lotStats(l, k), d: locDist(l) }));
    if (state.onlyFree) list = list.filter((x) => x.s.kind === 'ok' || x.s.kind === 'low');
    // Tartib: bo'sh joyi borlar, bandligi noma'lumlar, to'lalar, yopiqlar; har birida eng yaqini birinchi
    const rank = (x) => ({ unknown: 1, full: 2, closed: 3 }[x.s.kind] || 0);
    list.sort((a, b) => rank(a) - rank(b) || (a.d ?? 1e12) - (b.d ?? 1e12));
    state.shown = list.map((x) => x.l);

    if (!list.some((x) => x.l.id === state.mapLocationId)) {
      // Birinchi bo'lib sxemasi bor va ochiq turargohni ko'rsatamiz
      const first = list.find((x) => x.st && x.s.kind !== 'closed') || list[0];
      state.mapLocationId = first ? first.l.id : null;
    }

    $('#map-list').replaceChildren(...(list.length ? list.map(listItem) : [h('li', { class: 'map__empty' }, TEXT.ui.mapEmpty)]));
    if (map) map.setMarkers(list.filter((x) => hasPoint(x.l)).map((x) => ({ lat: x.l.lat, lng: x.l.lng, el: markerEl(x) })));
    renderLot(LOCS.find((l) => l.id === state.mapLocationId), k);
    renderNear();
    restoreFocus(fk);
  }

  // Xaritadagi marker: "P" belgisi va bo'sh joylar soni
  function markerEl({ l, s, d }) {
    const sel = l.id === state.mapLocationId;
    return h('button', {
      class: `mk mk--${s.kind}` + (sel ? ' is-selected' : ''), type: 'button',
      'data-focus-key': 'mk:' + l.id, 'aria-pressed': String(sel),
      'aria-label': `${l.title}: ${s.text}` + (d != null ? `, ${fmtDist(d)}` : ''),
      onclick: () => selectLot(l.id, 'map')
    }, h('span', { class: 'mk__pill' },
      h('span', { class: 'mk__p', 'aria-hidden': 'true' }, 'P'),
      s.short ? h('span', { class: 'mk__n', 'aria-hidden': 'true' }, s.short) : null));
  }

  function listItem({ l, s, st, d }) {
    return h('li', { 'data-id': l.id },
      h('button', {
        class: 'loc' + (s.kind === 'closed' ? ' loc--closed' : ''), type: 'button',
        'aria-current': String(l.id === state.mapLocationId), 'data-focus-key': 'loc:' + l.id,
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
          hasPoint(l) ? null : h('span', { class: 'tag' }, TEXT.ui.noCoords),
          DEMO_IDS.has(l.id) ? h('span', { class: 'tag tag--demo' }, TEXT.ui.demoTag) : null)));
  }

  function selectLot(id, from) {
    state.mapLocationId = id;
    renderMapList();
    const l = LOCS.find((x) => x.id === id);
    if (from === 'list' && map && hasPoint(l)) map.panTo(l, 14);
    if (from === 'map') scrollListTo(id);
  }

  // Mobil lentada tanlangan kartani o'rtaga suramiz (sahifa o'zi siljimaydi)
  function scrollListTo(id) {
    const list = $('#map-list'), li = $$('#map-list > li').find((x) => x.dataset.id === id);
    if (!li || list.scrollWidth <= list.clientWidth + 2) return;
    list.scrollTo({ left: li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  // --- Joylashuv ---
  let watchId = null, lastMe = null;

  function nearestFree(k) {
    if (!state.me) return null;
    return LOCS.filter(hasPoint)
      .map((l) => ({ l, st: lotStats(l, k), d: distM(state.me, l) }))
      .filter((x) => x.st && x.st.open && x.st.free > 0)
      .sort((a, b) => a.d - b.d)[0] || null;
  }

  // Eng yaqin bo'sh turargohni tanlab, xaritada siz bilan birga ko'rsatamiz
  function focusNearest() {
    const n = nearestFree(periodKey());
    if (n) state.mapLocationId = n.l.id;
    if (!map) return;
    if (n) map.fit([state.me, n.l], 16);
    else map.setView(state.me, 15);
  }

  function startLocate() {
    if (!('geolocation' in navigator)) { geoFail(TEXT.ui.geoFail); return; }
    state.geo = 'locating';
    state.pickMode = false;
    renderNear();
    updateLocateBtn();
    watchId = navigator.geolocation.watchPosition(onPos, onGeoError, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  }

  function stopLocate() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    lastMe = null;
    Object.assign(state, { me: null, geo: 'off', geoMsg: '', pickMode: false });
    if (map) map.setMe(null);
    renderMapList();
    updateLocateBtn();
  }

  function onPos(pos) {
    const first = state.geo !== 'on';
    state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, manual: false };
    state.geo = 'on';
    state.pickMode = false;
    if (map) map.setMe(state.me);
    // Ro'yxatni faqat sezilarli siljishda qayta tartiblaymiz
    if (first || !lastMe || distM(lastMe, state.me) > 25) {
      lastMe = { ...state.me };
      if (first) focusNearest();
      renderMapList();
    }
    updateLocateBtn();
  }

  function onGeoError(err) {
    if (state.geo === 'on' && err.code !== 1) return;   // vaqtincha uzilish — oxirgi nuqta qoladi
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    geoFail(err.code === 1 ? TEXT.ui.geoDenied : TEXT.ui.geoFail);
  }

  function geoFail(msg) {
    Object.assign(state, { geo: 'error', geoMsg: msg, pickMode: !!map });
    renderNear();
    updateLocateBtn();
  }

  // Joylashuv aniqlanmasa — foydalanuvchi xaritani bosib o'z joyini belgilaydi
  function onMapTap(ll) {
    if (!state.pickMode) return;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    Object.assign(state, { me: { lat: ll.lat, lng: ll.lng, acc: 0, manual: true }, geo: 'manual', pickMode: false });
    lastMe = { ...state.me };
    map.setMe(state.me);
    focusNearest();
    renderMapList();
    updateLocateBtn();
  }

  function enterPick() {
    state.pickMode = true;
    renderNear();
    $('#mapview').focus({ preventScroll: true });
  }

  // Yoqib-o'chiriladigan tugma: matni o'zgarmaydi, holatni aria-pressed bildiradi
  function updateLocateBtn() {
    $('#locate').setAttribute('aria-pressed', String(state.geo !== 'off'));
    $('#locate-label').textContent = TEXT.ui.locate;
  }

  // Xarita ustidagi holat qatori
  function renderNear() {
    const u = TEXT.ui, out = [];
    if (state.geo === 'locating') out.push(h('span', {}, u.nearLocating));
    else if (state.geo === 'error') out.push(h('span', {}, state.geoMsg + (state.pickMode ? ' ' + u.nearPick : '')));
    else if (state.pickMode) out.push(h('span', {}, u.nearPick));
    else if (state.me) {
      const n = nearestFree(periodKey());
      if (n) {
        const walk = walkText(n.d);
        out.push(h('span', {}, ...fmtParts(u.nearFound, {
          title: h('strong', {}, n.l.title), dist: fmtDist(n.d), walk: walk ? ', ' + walk : '', free: n.st.free
        })));
        if (n.l.id !== state.mapLocationId) {
          out.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => selectLot(n.l.id, 'list') }, u.show));
        }
      } else out.push(h('span', {}, u.nearNone));
      if (state.me.manual) out.push(h('span', { class: 'muted' }, u.geoManual));
    } else out.push(h('span', {}, u.nearIdle));
    if (map && (state.me || state.geo === 'error') && !state.pickMode) {
      out.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: enterPick }, u.pickAgain));
    }
    $('#near').replaceChildren(...out);
    $('#mapview').classList.toggle('is-picking', state.pickMode);
  }

  // Yuqoridan ko'rinishdagi mashina (SVG)
  function carSvg() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 40');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'car');
    svg.innerHTML = '<rect x="2" y="2" width="20" height="36" rx="6" class="car__body"/>' +
      '<rect x="5" y="9" width="14" height="7" rx="2" class="car__glass"/>' +
      '<rect x="5" y="27" width="14" height="5" rx="2" class="car__glass"/>';
    return svg;
  }

  // Tanlangan turargoh: ma'lumot, yo'l ko'rsatish va joylar sxemasi
  function renderLot(loc, k) {
    const box = $('#lot'), u = TEXT.ui;
    if (!loc) { box.replaceChildren(h('p', { class: 'lot__empty' }, u.mapEmpty)); return; }
    const st = lotStats(loc, k), s = lotStatus(loc, k), d = locDist(loc);
    const isDemo = DEMO_IDS.has(loc.id);
    const sc = locScenarios(loc).find((x) => inWindow(x.timeWindow, periodMid(k)));
    const wins = locScenarios(loc).filter((x) => x.timeWindow);
    // Oynalar butun sutkani qoplasa — "Kecha-kunduz"
    const allDay = wins.length && Array.from({ length: 48 }, (_, i) => i * 30).every((m) => wins.some((x) => inWindow(x.timeWindow, m)));
    const hours = allDay ? u.hours24 : [...new Set(wins.map(timeText))].join(', ');

    const head = h('div', { class: 'lot__head' },
      h('div', {},
        h('h3', { class: 'lot__title' }, loc.title),
        h('p', { class: 'lot__addr' }, loc.address)),
      st && st.open ? h('p', { class: `lot__count lot__count--${s.kind}` }, h('strong', {}, String(st.free)), ` / ${st.total} ${u.freeWord}`) : null);

    const fact = (label, value) => h('li', {}, h('span', {}, label), h('strong', {}, value));
    const facts = h('ul', { class: 'lot__facts' },
      d != null ? fact(u.factDist, fmtDist(d) + (walkText(d) ? ` · ${walkText(d)}` : '')) : null,
      hours ? fact(u.factHours, hours) : null,
      sc ? fact(u.factPrice, priceText(loc, sc)) : null,
      loc.updatedAt && !isDemo ? fact(u.factUpdated, loc.updatedAt) : null);

    // Yo'l ko'rsatish: boshlang'ich nuqtani ilovaning o'zi aniqlaydi (joylashuvingiz havolaga qo'shilmaydi)
    const routes = hasPoint(loc) ? h('div', { class: 'lot__routes' },
      h('span', { class: 'small muted' }, u.route),
      h('a', { class: 'btn btn--ghost btn--sm', href: `https://yandex.uz/maps/?rtext=~${loc.lat},${loc.lng}&rtt=auto`, target: '_blank', rel: 'noopener' }, 'Yandex'),
      h('a', { class: 'btn btn--ghost btn--sm', href: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`, target: '_blank', rel: 'noopener' }, 'Google')) : null;

    const demo = isDemo ? h('p', { class: 'lot__demo small' }, u.demoNote) : null;

    if (!st) { box.replaceChildren(head, facts, routes || '', demo || '', h('p', { class: 'lot__empty' }, u.lotNoLayout)); return; }

    const picked = state.picked && state.picked.locId === loc.id && state.picked.period === k ? state.picked.spot : null;

    // Qatorlar va ular orasidagi yo'lak
    const grid = h('div', { class: 'lot__grid' + (st.open ? '' : ' lot__grid--closed') });
    loc.rows.forEach((row, i) => {
      if (i > 0) grid.append(h('div', { class: 'lot__lane', 'aria-hidden': 'true' }, h('span', {}, 'yo‘lak')));
      grid.append(h('div', { class: 'lot__row', style: `--n:${row.length}` }, ...row.map((id) => {
        const busy = st.busy.has(id);
        const isPicked = id === picked;
        const stateName = !st.open ? 'closed' : busy ? 'busy' : isPicked ? 'picked' : 'free';
        const label = { closed: 'yopiq', busy: 'band', picked: 'tanlangan', free: 'bo‘sh' }[stateName];
        return h('button', {
          class: 'spot', type: 'button', 'data-state': stateName, 'data-focus-key': `spot:${loc.id}:${id}`,
          'aria-label': `Joy ${id} — ${label}`, 'aria-pressed': stateName === 'free' || isPicked ? String(isPicked) : null,
          disabled: busy || !st.open,
          onclick: () => pickSpot(loc, id, k)
        }, busy ? carSvg() : null, h('span', { class: 'spot__id' }, id));
      })));
    });

    const legend = h('ul', { class: 'legend small', 'aria-label': 'Belgilar' },
      h('li', {}, h('span', { class: 'legend__sw legend__sw--free' }), 'Bo‘sh'),
      h('li', {}, h('span', { class: 'legend__sw legend__sw--busy' }), 'Band'),
      h('li', {}, h('span', { class: 'legend__sw legend__sw--picked' }), 'Tanlangan'));

    const foot = st.open
      ? h('div', { class: 'lot__foot' },
          h('p', { class: 'small muted' }, picked ? `Joy ${picked} tanlandi.` : (st.free ? u.lotHint : u.mapEmpty)),
          picked ? h('a', { class: 'btn', href: '#ariza', onclick: goToForm }, 'Arizaga o‘tish') : null)
      : h('p', { class: 'lot__empty' }, u.lotClosed);

    box.replaceChildren(...[head, facts, routes, demo, legend, h('div', { class: 'lot__scroll' }, grid), foot].filter(Boolean));
  }

  // Bo'sh joyni tanlash: ssenariy va forma shunga moslashadi
  function pickSpot(loc, spot, k) {
    const same = state.picked && state.picked.locId === loc.id && state.picked.spot === spot && state.picked.period === k;
    state.picked = same ? null : { locId: loc.id, spot, period: k };
    if (state.picked) {
      const fits = loc.scenarioIds.map(byId).filter(Boolean);
      const inPeriod = fits.find((s) => inWindow(s.timeWindow, periodMid(k)));
      if (!loc.scenarioIds.includes(state.scenarioId) || (inPeriod && !inWindow(current().timeWindow, periodMid(k)))) {
        if (inPeriod || fits[0]) setScenario((inPeriod || fits[0]).id);
      }
      if (!val('address') && !isPlaceholder(loc.address) && !DEMO_IDS.has(loc.id)) form.elements.address.value = loc.address;
    }
    renderPicked();
    renderLot(loc, k);
    restoreFocus(`spot:${loc.id}:${spot}`);
  }

  function pickedText() {
    const p = state.picked;
    if (!p) return '';
    const loc = LOCS.find((l) => l.id === p.locId);
    return `${loc.title}, joy ${p.spot} (${CONFIG.periods[p.period].label.toLowerCase()})`;
  }

  function renderPicked() {
    $('#picked').hidden = !state.picked;
    $('#picked-text').textContent = pickedText();
  }

  function goToForm(e) {
    e.preventDefault();
    $('#ariza').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    const first = ['name', 'phone', 'plate', 'address'].find((n) => !val(n)) || 'name';
    setTimeout(() => form.elements[first].focus({ preventScroll: true }), reducedMotion ? 0 : 400);
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

  // Mashina raqami: "01a234bc" -> "01 A 234 BC", yuridik shaxs: "01234abc" -> "01 234 ABC"
  function formatPlate(v) {
    const t = v.toUpperCase().replace(/[^0-9A-Z]/g, '');
    let m = t.match(/^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/);
    if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
    m = t.match(/^(\d{2})(\d{3})([A-Z]{3})$/);
    if (m) return `${m[1]} ${m[2]} ${m[3]}`;
    return v.trim().toUpperCase();
  }
  form.elements.plate.addEventListener('blur', (e) => { e.target.value = formatPlate(e.target.value); });

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
      `Mashina raqami: ${formatPlate(val('plate'))}`,
      `Manzil: ${val('address')}`
    ];
    if (state.picked) lines.push(`Tanlangan joy: ${pickedText()}`);
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

  $('#picked-clear').addEventListener('click', () => {
    state.picked = null;
    renderPicked();
    renderMapList();
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
