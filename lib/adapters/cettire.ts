import type { Listing, ScanParams, SourceAdapter } from "./types";
import { isLowTopReplica, parseEuSize } from "../matching";
import { cached, RETAIL_CACHE_MS } from "../cache";

// www.cettire.com is behind DataDome (plain requests and headless browsers
// both get a CAPTCHA wall), but the site's own browser code doesn't read
// product data from there: search goes to a separate search service using a
// public, search-only key shipped to every visitor (same arrangement as
// Grailed's Algolia key), and live per-size stock comes from Cettire's
// public GraphQL API. Calling both directly returns structured data with no
// page scraping. Everything is requested from the Canadian storefront, so
// prices are Cettire's own CAD prices. Cettire prices each size separately
// (stock comes from different boutiques), so the price shown is the one for
// the requested size, not the product's headline price.
const SEARCH_URL = "https://search.cettire.com/search-ai/pro-search/api/aiRecommendForProduct";
const SEARCH_KEY = "Vh7tW03Y9qLJ5udg1oTNsAmQcXr2vZbK";
const GRAPHQL_URL = "https://api.cettire.com/graphql";
// The narrow query returns exactly the Replica line; the broader one is a
// safety net in case Cettire's ranking ever drops a pair from the first.
const QUERIES = ["maison margiela replica", "maison margiela replica sneaker"];
const HEADERS = { "Content-Type": "application/json", Origin: "https://www.cettire.com", "User-Agent": "Mozilla/5.0 (compatible; GatScan/1.0)" };

interface SearchHit {
  price?: number;
  variantData?: {
    title?: string;
    handle?: string;
    vendor?: string;
    Size?: string;
    inventory_quantity?: number;
    ca_cad_price_f?: number;
    largeImage?: string;
    product_images?: string[];
  };
}

interface SearchCandidate {
  title: string;
  handle: string;
  indexPrice: number;
  indexInStock: boolean;
  imageUrl: string | null;
}

async function searchSize(query: string, sizeIT: number): Promise<SearchHit[]> {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { ...HEADERS, "x-api-key": SEARCH_KEY },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      userId: "", userVipLevel: "", countryCode: "CA", regionCode: "ca", currencyCode: "CAD", requestId: `gatscan-${Date.now()}`, langCode: "en",
      productQueryInfo: {
        query, rankingType: "rank_score", department: "", catQuery: "", subCatQuery: "", cat3Query: "", designNumberQuery: "",
        tagQuery: [], seasonQuery: [], vendorQuery: ["Maison Margiela"], colorQuery: [],
        // Cettire labels Margiela sizes inconsistently ("IT42" on some
        // listings, "EU42" on others) — for this brand they're the same size.
        sizeQuery: [`IT${sizeIT}`, `EU${sizeIT}`],
        comparePriceQuery: false, pageSize: 120, rollbackRequest: false, returnCat3Facets: false, returnHMFacet: false, currentPage: 0,
      },
      blockProductRules: [],
    }),
  });
  if (!response.ok) throw new Error(`Cettire search failed: ${response.status}`);
  const data = await response.json() as { products?: SearchHit[]; errorCode?: number; errorMessage?: string };
  if (data.errorCode) throw new Error(`Cettire search error ${data.errorCode}: ${data.errorMessage}`);
  return data.products ?? [];
}

async function findCandidates(sizeIT: number): Promise<SearchCandidate[]> {
  const results = await Promise.all(QUERIES.map((query) => searchSize(query, sizeIT)));
  const byHandle = new Map<string, SearchCandidate>();
  for (const hit of results.flat()) {
    const variant = hit.variantData;
    const title = variant?.title ?? "";
    const handle = variant?.handle;
    if (!handle || byHandle.has(handle)) continue;
    // The handle is checked too — Cettire sometimes gives a high-top or
    // collab a generic title like "Replica Lace-Up Sneakers".
    if (!(variant?.vendor ?? "").toLowerCase().includes("margiela") || !isLowTopReplica(title) || !isLowTopReplica(`${title} ${handle.replace(/-/g, " ")}`)) continue;
    if (parseEuSize(variant?.Size ?? "") !== sizeIT) continue;
    byHandle.set(handle, {
      title,
      handle,
      indexPrice: variant?.ca_cad_price_f ?? hit.price ?? NaN,
      indexInStock: (variant?.inventory_quantity ?? 0) > 0,
      imageUrl: variant?.largeImage ?? variant?.product_images?.[0] ?? null,
    });
  }
  return [...byHandle.values()];
}

interface ProductVariant {
  variantId: string;
  size: string | null;
  isSoldOut: boolean;
  inventoryAvailableToSell: number | null;
  currencyPrices: { price: number; currencyCode: string; regionCode: string }[] | null;
}

const PRODUCT_QUERY = `query catalogItemProductQuery($slugOrId: String!, $userPrefer: UserPreferInput) {
  catalogItemProduct(slugOrId: $slugOrId, userPrefer: $userPrefer) {
    product { variants { variantId size isSoldOut inventoryAvailableToSell currencyPrices { price currencyCode regionCode } } }
  }
}`;

// Every size's live stock and CAD price for one product, cached across
// sizes so flipping the size picker doesn't re-query the same product.
function loadVariants(handle: string): Promise<ProductVariant[]> {
  return cached(`cettire:variants:${handle}`, RETAIL_CACHE_MS, async () => {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ query: PRODUCT_QUERY, variables: { slugOrId: handle, userPrefer: { currencyCode: "CAD", countryCode: "CA", regionCode: "ca" } } }),
    });
    if (!response.ok) throw new Error(`Cettire product lookup failed: ${response.status}`);
    const data = await response.json() as { data?: { catalogItemProduct?: { product?: { variants?: ProductVariant[] } } } };
    const variants = data.data?.catalogItemProduct?.product?.variants;
    if (!variants) throw new Error(`Cettire product lookup returned no variants for ${handle}`);
    return variants;
  });
}

type Verified = { inStock: boolean; price: number; variantId: string | null };

// The search index can lag real stock, so each candidate is re-checked
// against the live product API. If that lookup itself fails (network, API
// change), the index's own per-size stock for this exact size is used rather
// than dropping a real listing — it's still exact-size data, just less fresh.
async function verify(candidate: SearchCandidate, sizeIT: number): Promise<Verified> {
  try {
    const variants = await loadVariants(candidate.handle);
    const variant = variants.find((entry) => parseEuSize(entry.size ?? "") === sizeIT);
    if (!variant) return { inStock: false, price: NaN, variantId: null };
    const cadPrice = variant.currencyPrices?.find((price) => price.regionCode === "ca" && price.currencyCode === "CAD")?.price;
    return {
      inStock: !variant.isSoldOut && (variant.inventoryAvailableToSell ?? 0) > 0,
      price: cadPrice ?? candidate.indexPrice,
      variantId: variant.variantId,
    };
  } catch (error) {
    console.warn(`[cettire] live stock check failed for ${candidate.handle}, using search index`, error);
    return { inStock: candidate.indexInStock, price: candidate.indexPrice, variantId: null };
  }
}

// Linking straight to the size variant preselects it on Cettire's product
// page. Variant IDs are base64, so they're only put in the path when they
// contain nothing that would need escaping in a URL segment.
function productUrl(handle: string, variantId: string | null): string {
  const base = `https://www.cettire.com/ca/products/${handle}`;
  return variantId && /^[A-Za-z0-9=]+$/.test(variantId) ? `${base}/${variantId}` : base;
}

export const cettireAdapter: SourceAdapter = {
  name: "Cettire",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    if (params.condition === "used") return [];
    const candidates = await cached(`cettire:search:${params.sizeIT}`, RETAIL_CACHE_MS, () => findCandidates(params.sizeIT));
    const verified = await Promise.all(candidates.map(async (candidate) => ({ candidate, result: await verify(candidate, params.sizeIT) })));
    return verified.flatMap(({ candidate, result }) => {
      if (!result.inStock || !Number.isFinite(result.price)) return [];
      return [{
        marketplace: "Cettire",
        title: candidate.title,
        price: result.price,
        currency: "CAD",
        condition: "new" as const,
        sizeIT: params.sizeIT,
        sizeUS: params.sizeUS,
        url: productUrl(candidate.handle, result.variantId),
        imageUrl: candidate.imageUrl,
        scrapedAt: new Date().toISOString(),
        sourceType: "scrape" as const,
      }];
    });
  },
};
