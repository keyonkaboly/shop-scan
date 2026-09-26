import type { Condition, Listing, ScanParams, SourceAdapter } from "./types";
import { QUERY } from "../search-links";
import { isGatTitle, MENS_US_OFFSET, resolveItSize } from "../matching";

// Grailed's own site ships this public, search-only Algolia key to every
// visitor's browser (Application ID + read-only search key) to run search
// client-side. Calling it directly is faster and far less brittle than
// scraping rendered HTML, and gives structured fields (condition, price,
// size) instead of parsed text.
const ALGOLIA_APP_ID = "MNRWEFSS2Q";
const ALGOLIA_SEARCH_KEY = "c89dbaddf15fe70e1941a109bf7c2a3d";
const ALGOLIA_INDEX = "Listing_by_listing_quality_production";

const conditionMap: Record<string, Listing["condition"]> = {
  is_new: "new",
  is_gently_used: "used",
  is_used: "used",
  is_worn: "used",
  is_not_specified: "used",
};

function algoliaConditionFilter(condition: Condition): string | undefined {
  if (condition === "new") return "condition:is_new";
  if (condition === "used") return "(condition:is_gently_used OR condition:is_used OR condition:is_worn OR condition:is_not_specified)";
  return undefined;
}

interface GrailedHit {
  id: number;
  title: string;
  price: number;
  size: string;
  condition: string;
  sold: boolean;
  designer_names?: string;
  department?: string;
  category_path?: string;
  cover_photo?: { url?: string };
}

export const grailedAdapter: SourceAdapter = {
  name: "Grailed",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    const filters = algoliaConditionFilter(params.condition);
    const response = await fetch(`https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`, {
      method: "POST",
      headers: {
        "x-algolia-api-key": ALGOLIA_SEARCH_KEY,
        "x-algolia-application-id": ALGOLIA_APP_ID,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: QUERY, hitsPerPage: 1000, ...(filters ? { filters } : {}) }),
    });
    if (!response.ok) throw new Error(`Grailed search failed: ${response.status}`);
    const data = await response.json() as { hits: GrailedHit[] };

    return data.hits.flatMap((hit) => {
      if (hit.sold) return [];
      const title = hit.title ?? "";
      const lowerTitle = title.toLowerCase();
      const isDesignerMatch = (hit.designer_names ?? "").toLowerCase().includes("margiela") || lowerTitle.includes("margiela");
      // Grailed's own category separates low-tops from high-tops, flats and
      // mules; the title check catches other Replica-line models.
      if (!isDesignerMatch || !hit.category_path?.endsWith("lowtop_sneakers") || !isGatTitle(title)) return [];
      // Grailed's size field is a US size — men's on menswear listings,
      // women's on womenswear ones — so it's converted before comparing.
      const sizeIT = resolveItSize(title, { usSize: hit.size, womens: hit.department === "womenswear" });
      if (sizeIT !== params.sizeIT) return [];
      const condition = conditionMap[hit.condition] ?? "unknown";
      if (params.condition !== "either" && condition !== params.condition) return [];
      return [{
        marketplace: "Grailed",
        title,
        price: hit.price,
        currency: "USD",
        condition,
        sizeIT,
        sizeUS: sizeIT - MENS_US_OFFSET,
        url: `https://www.grailed.com/listings/${hit.id}`,
        imageUrl: hit.cover_photo?.url ?? null,
        scrapedAt: new Date().toISOString(),
        sourceType: "scrape" as const,
      }];
    });
  },
};
