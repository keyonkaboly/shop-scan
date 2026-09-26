import type { Condition, Listing, ScanParams, SourceAdapter } from "./types";
import { ebaySearchUrl } from "../search-links";
import { isGatTitle, MENS_US_OFFSET, resolveItSize } from "../matching";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET env vars");
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  if (!response.ok) throw new Error(`eBay token request failed: ${response.status}`);
  const data = await response.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

function conditionCodes(condition: Condition): string[] {
  if (condition === "new") return ["1000", "1500", "1750"];
  if (condition === "used") return ["3000", "4000", "5000", "6000"];
  return [];
}

function mapCondition(conditionId?: string): Listing["condition"] {
  return conditionId && ["1000", "1500", "1750"].includes(conditionId) ? "new" : conditionId ? "used" : "unknown";
}

interface EbayItem { title?: string; price?: { value?: string; currency?: string }; conditionId?: string; itemWebUrl?: string; image?: { imageUrl?: string }; qualifiedPrograms?: string[]; categories?: { categoryId?: string }[] }

// eBay files every listing under Men's Shoes or Women's Shoes, which is what
// says whether a bare "Size 8" in the title is a men's or women's size.
const MENS_SHOES = "93427";
const WOMENS_SHOES = "3034";

// eBay only reports Authenticity Guarantee eligibility (qualifiedPrograms)
// for a known delivery destination — without one the field is always empty.
// Gat Scan prices for a Canadian buyer, so results are requested for
// delivery to Canada, which also drops listings that won't ship there.
// Eligibility is decided by country: any valid Canadian postal code gives
// the same results.
const DELIVERY_FILTER = "deliveryCountry:CA,deliveryPostalCode:M5V2T6";

const PAGE_SIZE = 200;
const MAX_ITEMS = 1000; // safety cap — this niche runs ~400-500 total, this leaves headroom without risking a runaway number of calls

async function fetchPage(query: URLSearchParams, token: string): Promise<{ items: EbayItem[]; total: number }> {
  const response = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${query}`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!response.ok) return { items: [], total: 0 };
  const data = await response.json();
  return { items: data.itemSummaries ?? [], total: data.total ?? 0 };
}

export const ebayAdapter: SourceAdapter = {
  name: "eBay",
  sourceType: "api",
  async search(params: ScanParams): Promise<Listing[]> {
    const token = await getAccessToken();
    const codes = conditionCodes(params.condition);
    const buildQuery = (offset: number) => {
      const query = new URLSearchParams({ q: "maison margiela replica gat", limit: String(PAGE_SIZE), offset: String(offset), fieldgroups: "EXTENDED" });
      query.set("filter", codes.length ? `conditionIds:{${codes.join("|")}},${DELIVERY_FILTER}` : DELIVERY_FILTER);
      return query;
    };

    const first = await fetchPage(buildQuery(0), token);
    const total = Math.min(first.total, MAX_ITEMS);
    const remainingOffsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) remainingOffsets.push(offset);
    const restPages = await Promise.all(remainingOffsets.map((offset) => fetchPage(buildQuery(offset), token)));
    const items: EbayItem[] = [first.items, ...restPages.map((page) => page.items)].flat();

    return items.flatMap((item) => {
      const title = item.title ?? "";
      const categoryIds = (item.categories ?? []).map((category) => category.categoryId);
      const womens = categoryIds.includes(WOMENS_SHOES);
      if (!womens && !categoryIds.includes(MENS_SHOES)) return [];
      if (!title.toLowerCase().includes("margiela") || !isGatTitle(title)) return [];
      const sizeIT = resolveItSize(title, { womens });
      if (sizeIT !== params.sizeIT) return [];
      const sizeUS = sizeIT - MENS_US_OFFSET;
      const price = item.price?.value ? Number(item.price.value) : NaN;
      if (!Number.isFinite(price)) return [];
      const authenticityGuaranteed = Array.isArray(item.qualifiedPrograms) && item.qualifiedPrograms.some((program) => program === "AUTHENTICITY_GUARANTEE" || program === "AUTHENTICITY_VERIFICATION");
      return [{ marketplace: "eBay", title, price, currency: item.price?.currency ?? "USD", condition: mapCondition(item.conditionId), sizeIT, sizeUS, url: item.itemWebUrl ?? ebaySearchUrl(codes[0] as "1000" | "3000" | undefined), imageUrl: item.image?.imageUrl ?? null, scrapedAt: new Date().toISOString(), sourceType: "api" as const, authenticityGuaranteed }];
    });
  },
};
