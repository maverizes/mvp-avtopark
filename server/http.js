// Kichik HTTP qatlami: marshrutlash, JSON, cookie, statik fayllar, xavfsizlik sarlavhalari.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './validate.js';

const MAX_BODY = 16 * 1024;

export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    routes.push({ method, re: new RegExp(`^${source}/?$`), keys, handler });
  };
  return {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    patch: add('PATCH'),
    delete: add('DELETE'),
    /** { handler, params } | { allowed: [...] } (405) | null (404) */
    match(method, pathname) {
      const allowed = new Set();
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) {
          allowed.add(r.method);
          continue;
        }
        let params;
        try {
          params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        } catch {
          return null;
        }
        return { handler: r.handler, params };
      }
      return allowed.size ? { allowed: [...allowed] } : null;
    }
  };
}

/** JSON tanani o'qish: faqat application/json, hajmi cheklangan */
export async function readJson(req) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'unsupported_media_type', 'So‘rov JSON formatida bo‘lishi kerak');
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) throw new HttpError(413, 'too_large', 'So‘rov juda katta');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'too_large', 'So‘rov juda katta');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON o‘qib bo‘lmadi');
  }
}

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    if (key in out) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* buzilgan cookie — e'tiborsiz */
    }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure, sameSite = 'Lax', path: p = '/' } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${p}; HttpOnly; SameSite=${sameSite}`;
  if (maxAge != null) s += `; Max-Age=${Math.floor(maxAge)}`;
  if (secure) s += '; Secure';
  return s;
}

export function sendJson(res, status, data, headers = {}) {
  const body = status === 204 ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

/** Har bir javobga: CSP va boshqa himoya sarlavhalari */
export function securityHeaders(res, { secure }) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    // Xarita plitkalari tashqi serverdan keladi
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

/**
 * Statik fayl: mounts = [[urlPrefix, dir], ...]. Katalogdan tashqariga chiqib bo'lmaydi.
 * Kesh: ETag bilan qayta tekshirish (deploydan keyin eski fayl qolmaydi).
 * @returns {boolean} fayl topildimi
 */
export function serveStatic(req, res, pathname, mounts) {
  for (const [prefix, dir] of mounts) {
    if (!pathname.startsWith(prefix)) continue;
    let rel;
    try {
      rel = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      return false;
    }
    if (rel.includes('\0')) return false;
    const file = path.resolve(dir, `.${path.posix.normalize(`/${rel}`)}`);
    if (file !== dir && !file.startsWith(dir + path.sep)) continue;
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString()
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  }
  return false;
}
