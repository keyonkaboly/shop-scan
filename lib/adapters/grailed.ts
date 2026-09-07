import type { Condition, Listing, ScanParams, SourceAdapter } from "./types";
import { QUERY } from "../search-links";

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
      body: JSON.stringify({ query: QUERY, hitsPerPage: 50, ...(filters ? { filters } : {}) }),
    });
    if (!response.ok) throw new Error(`Grailed search failed: ${response.status}`);
    const data = await response.json() as { hits: GrailedHit[] };

    return data.hits.flatMap((hit) => {
      if (hit.sold) return [];
      const title = hit.title ?? "";
      const lowerTitle = title.toLowerCase();
      const isDesignerMatch = (hit.designer_names ?? "").toLowerCase().includes("margiela") || lowerTitle.includes("margiela");
      const isModelMatch = lowerTitle.includes("gat") || lowerTitle.includes("replica") || lowerTitle.includes("german army");
      if (!isDesignerMatch || !isModelMatch) return [];
      const sizeUS = Number(hit.size);
      if (Number.isFinite(sizeUS) && sizeUS !== params.sizeUS) return [];
      const condition = conditionMap[hit.condition] ?? "unknown";
      if (params.condition !== "either" && condition !== params.condition) return [];
      return [{
        marketplace: "Grailed",
        title,
        price: hit.price,
        currency: "USD",
        condition,
        sizeIT: params.sizeIT,
        sizeUS: Number.isFinite(sizeUS) ? sizeUS : params.sizeUS,
        url: `https://www.grailed.com/listings/${hit.id}`,
        imageUrl: hit.cover_photo?.url ?? null,
        scrapedAt: new Date().toISOString(),
        sourceType: "scrape" as const,
      }];
    });
  },
};
