// Mini xarita: kutubxonasiz, OpenStreetMap plitkalari.
// Surish, ikki barmoq/Ctrl+g'ildirak bilan kattalashtirish, markerlar, "siz shu yerdasiz" nuqtasi.
import { h, reducedMotion } from './dom.js';

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

export function createMap(view, opts) {
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
