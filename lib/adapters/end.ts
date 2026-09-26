import type { Listing, ScanParams, SourceAdapter } from "./types";
import { isLowTopReplica, parseEuSize } from "../matching";
import { cached, RETAIL_CACHE_MS } from "../cache";

// END.'s own site searches through Algolia with a public, search-only key it
// ships to every visitor (same arrangement as Grailed), served from END.'s
// own Algolia host — the default *.algolia.net host rejects the key. Each
// record carries a `size` list of only the sizes currently in stock (it
// matches the per-SKU stock counts one-for-one) and a price per storefront;
// storefront 7 is END. Canada, priced in CAD. One query returns every size,
// so the result is cached and re-filtered locally when the size changes.
const ALGOLIA_URL = "https://search1web.endclothing.com/1/indexes/Catalog_products_v3_gb_products/query";
const ALGOLIA_APP_ID = "KO4W2GBINK";
const ALGOLIA_SEARCH_KEY = "dfa5df098f8d677dd2105ece472a44f8";
const CANADA_WEBSITE_ID = 7;
const IMAGE_BASE = "https://media.endclothing.com/media/f_auto,q_auto:eco,w_600,h_600/prodmedia/media/catalog/product";

interface EndHit {
  name: string;
  url_key: string;
  size?: string[];
  small_image?: string;
  for_sale_online?: number;
  [price: `final_price_${number}`]: number | undefined;
}

async function loadReplicaHits(): Promise<EndHit[]> {
  const response = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: { "x-algolia-application-id": ALGOLIA_APP_ID, "x-algolia-api-key": ALGOLIA_SEARCH_KEY, "content-type": "application/json", Referer: "https://www.endclothing.com/" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      query: "replica",
      hitsPerPage: 200,
      facetFilters: [[`websites_available_at:${CANADA_WEBSITE_ID}`], ["brand:Maison Margiela"]],
      attributesToRetrieve: ["name", "url_key", "size", "small_image", "for_sale_online", `final_price_${CANADA_WEBSITE_ID}`],
    }),
  });
  if (!response.ok) throw new Error(`END. search failed: ${response.status}`);
  const data = await response.json() as { hits: EndHit[] };
  return data.hits;
}

export const endAdapter: SourceAdapter = {
  name: "END.",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    if (params.condition === "used") return [];
    const hits = await cached("end:replica", RETAIL_CACHE_MS, loadReplicaHits);
    return hits.flatMap((hit) => {
      if (hit.for_sale_online !== 1 || !isLowTopReplica(hit.name)) return [];
      if (!(hit.size ?? []).some((label) => parseEuSize(label) === params.sizeIT)) return [];
      const price = hit[`final_price_${CANADA_WEBSITE_ID}`];
      if (typeof price !== "number" || !Number.isFinite(price)) return [];
      return [{
        marketplace: "END.",
        title: hit.name,
        price,
        currency: "CAD",
        condition: "new" as const,
        sizeIT: params.sizeIT,
        sizeUS: params.sizeUS,
        url: `https://www.endclothing.com/ca/${hit.url_key}.html`,
        imageUrl: hit.small_image && hit.small_image !== "no_selection" ? `${IMAGE_BASE}${hit.small_image}` : null,
        scrapedAt: new Date().toISOString(),
        sourceType: "scrape" as const,
      }];
    });
  },
};
