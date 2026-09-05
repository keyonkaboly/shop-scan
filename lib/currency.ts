const rateCache = new Map<string, { rate: number; expiresAt: number }>();
const CACHE_MS = 15 * 60 * 1000;

export async function convertToCAD(amount: number, currency: string): Promise<number | null> {
  if (currency === "CAD") return amount;
  const code = currency.toUpperCase();
  const cached = rateCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return Number((amount * cached.rate).toFixed(2));

  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(code)}&to=CAD`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { rates?: { CAD?: number } };
    const rate = data.rates?.CAD;
    if (!rate || !Number.isFinite(rate)) return null;
    rateCache.set(code, { rate, expiresAt: Date.now() + CACHE_MS });
    return Number((amount * rate).toFixed(2));
  } catch {
    return null;
  }
}
