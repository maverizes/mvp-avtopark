// DOM va matn yordamchilari.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Element yaratish: h('div', { class: 'x', onclick: fn }, 'matn', child).
 * style — CSSOM orqali (CSP inline style atributini taqiqlaydi).
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

/** Shablon: fmt('{n} ta', { n: 3 }) -> '3 ta' */
export const fmt = (str, o) => str.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));

/** Shablon bo'laklari: qiymat o'rnida DOM element ham bo'lishi mumkin */
export const fmtParts = (str, o) => str.split(/(\{\w+\})/).map((p) => {
  const m = p.match(/^\{(\w+)\}$/);
  return m ? (o[m[1]] ?? '') : p;
});

/** [TELEFON] kabi to'ldirilmagan qiymat */
export const isPlaceholder = (v) => v == null || v === '' || /^\[.*\]$/.test(String(v).trim());

/** 300000 -> "300 000" */
export const fmtMoney = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** "+998901234567" -> "+998 90 123 45 67" */
export function fmtPhone(e164) {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164 || '');
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164 || '';
}

/** Kiritilayotgan raqam: "901234567" -> "90 123 45 67" (998 boshi olib tashlanadi) */
export function maskPhone(value) {
  let d = String(value).replace(/\D/g, '');
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

/** "2026-10-06" -> "6-oktabr" */
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])}-${MONTHS[Number(m[2]) - 1]}` : iso || '';
}

/** Mashina raqami: "01a234bc" -> "01 A 234 BC" (server ham shunday qiladi) */
export function formatPlate(v) {
  const t = v.toUpperCase().replace(/[^0-9A-Z]/g, '');
  let m = t.match(/^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  m = t.match(/^(\d{2})(\d{3})([A-Z]{3})$/);
  if (m) return `${m[1]} ${m[2]} ${m[3]}`;
  return v.trim().toUpperCase();
}
