// So'rovlar sonini cheklash (xotirada, bitta server uchun yetarli).

export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, e] of hits) if (e.reset <= now) hits.delete(key);
  }, windowMs);
  timer.unref();

  return {
    /** @returns {{ ok: boolean, retryAfter: number }} */
    take(key) {
      const now = Date.now();
      let e = hits.get(key);
      if (!e || e.reset <= now) {
        e = { count: 0, reset: now + windowMs };
        hits.set(key, e);
      }
      e.count += 1;
      return { ok: e.count <= max, retryAfter: Math.ceil((e.reset - now) / 1000) };
    },
    reset() {
      hits.clear();
    }
  };
}
