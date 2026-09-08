// In-memory, per-instance rate limiting. Vercel serverless functions don't
// share memory across instances/cold starts, so this won't stop a
// distributed attacker — it's a best-effort guard against a single client
// hammering the API (accidental retry loops, casual abuse), which is the
// realistic risk for a small tool like this. A durable limit across all
// instances would need an external store (e.g. Upstash Redis).
const buckets = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((time) => now - time < windowMs);
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return false;
}

export function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}
