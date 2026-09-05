const rateCache = new Map<string, { rate: number; expiresAt: number }>();
const CACHE_MS = 15 * 60 * 1000;

type RateResponse = { rates?: { CAD?: number } };

async function fetchRate(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as RateResponse;
    const rate = data.rates?.CAD;
    return rate && Number.isFinite(rate) ? rate : null;
  } catch {
    return null;
  }
}

export async function getRateToCAD(currency: string): Promise<number | null> {
  const code = currency.toUpperCase();
  if (code === "CAD") return 1;
  const cached = rateCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;
  const rate = await fetchRate(`https://open.er-api.com/v6/latest/${encodeURIComponent(code)}`)
    ?? await fetchRate(`https://api.frankfurter.app/latest?from=${encodeURIComponent(code)}&to=CAD`);
  if (rate !== null) rateCache.set(code, { rate, expiresAt: Date.now() + CACHE_MS });
  return rate;
}

export async function convertToCAD(amount: number, currency: string): Promise<number | null> {
  const rate = await getRateToCAD(currency);
  return rate === null ? null : Number((amount * rate).toFixed(2));
}
