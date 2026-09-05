import { NextRequest, NextResponse } from "next/server";
import { cettireSearchUrl, endClothingSearchUrl, farfetchSearchUrl, mrPorterSearchUrl, mytheresaSearchUrl, ssenseSearchUrl } from "@/lib/search-links";
import { euToUS } from "@/lib/sizing";
import { ebayAdapter } from "@/lib/adapters/ebay";
import { grailedAdapter } from "@/lib/adapters/grailed";
import { makeRetailStubAdapter } from "@/lib/adapters/retail-affiliate-stub";
import type { Condition, Listing } from "@/lib/adapters/types";

export const runtime = "nodejs";

const retailStubs = [
  makeRetailStubAdapter("Farfetch", farfetchSearchUrl()),
  makeRetailStubAdapter("SSENSE", ssenseSearchUrl()),
  makeRetailStubAdapter("Mytheresa", mytheresaSearchUrl()),
  makeRetailStubAdapter("Cettire", cettireSearchUrl()),
  makeRetailStubAdapter("MR PORTER", mrPorterSearchUrl()),
  makeRetailStubAdapter("END.", endClothingSearchUrl()),
];

const conditionValues: Condition[] = ["new", "used", "either"];

async function searchWithTimeout(adapter: (typeof retailStubs)[number] | typeof ebayAdapter | typeof grailedAdapter, params: { sizeIT: number; sizeUS: number; condition: Condition }, timeoutMs: number) {
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
  const params = new URL(request.url).searchParams;
  const requestedIT = Number(params.get("sizeIT") ?? 42);
  const sizeIT = Number.isFinite(requestedIT) ? requestedIT : 42;
  const requestedCondition = params.get("condition") ?? "either";
  const condition = conditionValues.includes(requestedCondition as Condition) ? requestedCondition as Condition : "either";
  const sizeUS = euToUS(sizeIT)?.usMens ?? 9;
  const adapters = [ebayAdapter, grailedAdapter, ...retailStubs];
  const settled = await Promise.allSettled(adapters.map((adapter) => searchWithTimeout(adapter, { sizeIT, sizeUS, condition }, adapter.name === "eBay" ? 8000 : 4000)));
  const listings: Listing[] = [];
  const failures: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") listings.push(...result.value);
    else failures.push(adapters[index].name);
  });

  listings.sort((first, second) => first.price - second.price);
  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    params: { sizeIT, sizeUS, condition },
    listings,
    liveSourceCount: new Set(listings.map((listing) => listing.marketplace)).size,
    unavailableSources: [...failures, ...retailStubs.map((adapter) => adapter.name)],
  });
}
