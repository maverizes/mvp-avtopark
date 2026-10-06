// Server bilan aloqa. Xatolar ApiError bo'lib keladi: status, code va maydon xatolari bilan.

export class ApiError extends Error {
  constructor(status, error = {}) {
    super(error.message || 'Xatolik yuz berdi. Qayta urinib ko‘ring.');
    this.status = status;
    this.code = error.code || 'unknown';
    this.fields = error.fields || {};
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      // O'zgartiruvchi so'rovlar doim JSON — server shuni talab qiladi (CSRF himoyasi)
      headers: method === 'GET' ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
    });
  } catch {
    throw new ApiError(0, { code: 'network', message: 'Internet aloqasini tekshiring va qayta urinib ko‘ring.' });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body)
};
