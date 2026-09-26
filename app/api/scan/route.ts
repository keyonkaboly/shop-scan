import { NextRequest, NextResponse } from "next/server";
import { ebaySearchUrl } from "@/lib/search-links";
import { euToUS } from "@/lib/sizing";
import { ebayAdapter } from "@/lib/adapters/ebay";
import { grailedAdapter } from "@/lib/adapters/grailed";
import { ssenseAdapter, ssenseTrace } from "@/lib/adapters/ssense";
import { cettireAdapter } from "@/lib/adapters/cettire";
import { mytheresaAdapter } from "@/lib/adapters/mytheresa";
import { endAdapter } from "@/lib/adapters/end";
import { getRateToCAD } from "@/lib/currency";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import type { Condition, Listing, SourceAdapter } from "@/lib/adapters/types";

export const runtime = "nodejs";

const liveAdapters = [ebayAdapter, grailedAdapter, ssenseAdapter, cettireAdapter, mytheresaAdapter, endAdapter];
// SSENSE drives a real browser per product; Cettire makes one live stock
// call per candidate; the rest are single API calls.
const adapterTimeouts: Record<string, number> = { eBay: 8000, Grailed: 5000, SSENSE: 40000, Cettire: 15000, Mytheresa: 10000, "END.": 8000 };

const conditionValues: Condition[] = ["new", "used", "either"];

async function searchWithTimeout(adapter: SourceAdapter, params: { sizeIT: number; sizeUS: number; condition: Condition }, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${adapter.name} scan timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([adapter.search(params), timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export async function GET(request: NextRequest) {
  if (isRateLimited(clientIp(request), 10, 60_000)) {
    return NextResponse.json({ error: "Too many scans — please wait a moment and try again." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const params = new URL(request.url).searchParams;
  const requestedIT = Number(params.get("sizeIT") ?? 42);
  const sizeIT = Number.isFinite(requestedIT) ? requestedIT : 42;
  const requestedCondition = params.get("condition") ?? "either";
  const condition = conditionValues.includes(requestedCondition as Condition) ? requestedCondition as Condition : "either";
  const sizeUS = euToUS(sizeIT)?.usMens ?? 9;
  const adapters = liveAdapters;
  const settled = await Promise.allSettled(adapters.map((adapter) => searchWithTimeout(adapter, { sizeIT, sizeUS, condition }, adapterTimeouts[adapter.name] ?? 4000)));
  const listings: Listing[] = [];
  const failures: string[] = [];
  // Only returned in the response when the caller supplies DEBUG_TOKEN as a
  // query param — without it, errors are logged server-side only (Vercel's
  // private function logs), never handed to a public caller.
  const debugAuthorized = Boolean(process.env.DEBUG_TOKEN) && params.get("debugToken") === process.env.DEBUG_TOKEN;
  const sourceErrors: Record<string, string> = {};

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") listings.push(...result.value);
    else {
      failures.push(adapters[index].name);
      console.error(`[scan] ${adapters[index].name} failed:`, result.reason);
      if (debugAuthorized) sourceErrors[adapters[index].name] = result.reason instanceof Error ? (result.reason.stack ?? result.reason.message) : String(result.reason);
    }
  });

  const currencies = [...new Set(listings.map((listing) => listing.currency))];
  const rates = new Map(await Promise.all(currencies.map(async (currency) => [currency, await getRateToCAD(currency)] as const)));
  const listingsWithCAD = listings.map((listing) => {
    const rate = rates.get(listing.currency);
    return { ...listing, cadPrice: rate === null || rate === undefined ? null : Number((listing.price * rate).toFixed(2)) };
  });
  listingsWithCAD.sort((first, second) => (first.cadPrice ?? Number.POSITIVE_INFINITY) - (second.cadPrice ?? Number.POSITIVE_INFINITY));
  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    params: { sizeIT, sizeUS, condition },
    listings: listingsWithCAD,
    liveSourceCount: new Set(listingsWithCAD.map((listing) => listing.marketplace)).size,
    unavailableSources: failures,
    ...(debugAuthorized ? { sourceErrors, ssenseTrace } : {}),
    sourceStatus: {
      ...Object.fromEntries(liveAdapters.map(({ name }) => [name, failures.includes(name) ? "unavailable" : listings.some((listing) => listing.marketplace === name) ? "live" : "checked-no-match"])),
    },
    fallbackSearches: {
      eBay: ebaySearchUrl(condition === "new" ? "1000" : condition === "used" ? "3000" : undefined),
    },
  });
}
