import type { Listing, ScanParams, SourceAdapter } from "./types";
import { isLowTopReplica, parseEuSize } from "../matching";
import { cached, RETAIL_CACHE_MS } from "../cache";

// Mytheresa's product and listing pages serve a bot page to scripted
// requests (Akamai), but the site's own browser code loads listings from its
// GraphQL API, which answers plain requests. One call for the men's Maison
// Margiela designer page returns every product with per-size stock, so the
// listing is cached and re-filtered locally when the size changes — this
// matters because the API rate-limits listing requests
// (PRODUCT_LISTING_PAGE_TOO_MANY_REQUESTS). Mytheresa's women's Margiela
// range carries no Replicas, so only the men's section is queried. Requests
// use the Canadian storefront; prices come back in CAD cents.
const API_URL = "https://www.mytheresa.com/api";
const DESIGNER_SLUG = "/designers/maison-margiela";
const PAGE_SIZE = 120;
const MAX_PAGES = 3;

const LISTING_QUERY = `query XProductListingPageQuery($filtersQueryParams: String, $page: Int, $size: Int, $slug: String, $sort: String) {
  xProductListingPage: xProductListingPageV2(filtersQueryParams: $filtersQueryParams, page: $page, size: $size, slug: $slug, sort: $sort) {
    pagination { currentPage totalPages }
    products {
      name designer slug displayImages
      variants { size availability { hasStock } price { currencyCode original discount } }
    }
  }
}`;

interface MytheresaPrice { currencyCode: string; original: number; discount: number | null }
interface MytheresaProduct {
  name: string;
  designer: string;
  slug: string;
  displayImages?: string[];
  variants: { size: string; availability: { hasStock: boolean }; price: MytheresaPrice | null }[];
}

async function fetchPage(page: number): Promise<{ products: MytheresaProduct[]; totalPages: number }> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Language": "en",
      "X-Country": "CA",
      "X-Store": "CA",
      "X-Geo": "CA",
      "X-Section": "men",
      "X-Nsu": "false",
      Origin: "https://www.mytheresa.com",
      Referer: "https://www.mytheresa.com/ca/en/men",
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ query: LISTING_QUERY, variables: { filtersQueryParams: "", page, size: PAGE_SIZE, slug: DESIGNER_SLUG, sort: "" } }),
  });
  if (!response.ok) throw new Error(`Mytheresa listing failed: ${response.status}`);
  const data = await response.json() as { data?: { xProductListingPage?: { pagination: { totalPages: number }; products: MytheresaProduct[] } | null }; errors?: { message: string }[] };
  const listing = data.data?.xProductListingPage;
  if (!listing) throw new Error(`Mytheresa listing error: ${data.errors?.map((error) => error.message).join("; ") ?? "empty response"}`);
  return { products: listing.products, totalPages: listing.pagination.totalPages };
}

async function loadMensMargiela(): Promise<MytheresaProduct[]> {
  const first = await fetchPage(1);
  const products = [...first.products];
  for (let page = 2; page <= Math.min(first.totalPages, MAX_PAGES); page++) products.push(...(await fetchPage(page)).products);
  return products;
}

// `discount` is the current selling price (it equals `original` when
// nothing is reduced), not the amount taken off.
function sellingPrice(price: MytheresaPrice): number {
  const cents = price.discount && price.discount > 0 && price.discount <= price.original ? price.discount : price.original;
  return cents / 100;
}

export const mytheresaAdapter: SourceAdapter = {
  name: "Mytheresa",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    if (params.condition === "used") return [];
    const products = await cached("mytheresa:men-margiela", RETAIL_CACHE_MS, loadMensMargiela);
    return products.flatMap((product) => {
      if (!product.designer.toLowerCase().includes("margiela") || !isLowTopReplica(product.name)) return [];
      const variant = product.variants.find((entry) => parseEuSize(entry.size) === params.sizeIT);
      if (!variant?.availability.hasStock || !variant.price) return [];
      return [{
        marketplace: "Mytheresa",
        title: `Maison Margiela ${product.name}`,
        price: sellingPrice(variant.price),
        currency: variant.price.currencyCode,
        condition: "new" as const,
        sizeIT: params.sizeIT,
        sizeUS: params.sizeUS,
        url: `https://www.mytheresa.com/ca/en/men${product.slug}`,
        imageUrl: product.displayImages?.[0] ?? null,
        scrapedAt: new Date().toISOString(),
        sourceType: "scrape" as const,
      }];
    });
  },
};
