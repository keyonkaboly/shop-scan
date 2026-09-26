// Per-instance, in-memory memo for upstream responses that already cover
// every size at once (a retailer's whole Replica listing, one product's
// size/stock table). Switching size or condition re-runs a scan within
// seconds, and re-fetching identical data each time is slow (SSENSE loads a
// real page per product) and trips retailer rate limits (Mytheresa answers
// PRODUCT_LISTING_PAGE_TOO_MANY_REQUESTS after a handful of rapid calls).
// Concurrent callers share one in-flight request, and failures are evicted
// immediately so the next scan retries instead of replaying the error.
const entries = new Map<string, { value: Promise<unknown>; expiresAt: number }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;
  for (const [entryKey, entry] of entries) if (entry.expiresAt <= now) entries.delete(entryKey);
  const value = load();
  entries.set(key, { value, expiresAt: now + ttlMs });
  value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
  return value;
}

// Short enough that "in stock" stays trustworthy, long enough to cover a
// user clicking through sizes.
export const RETAIL_CACHE_MS = 3 * 60 * 1000;
