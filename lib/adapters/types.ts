export type Condition = "new" | "used" | "either";

export interface ScanParams {
  sizeUS: number;
  sizeIT: number;
  condition: Condition;
}

export interface Listing {
  marketplace: string;
  title: string;
  price: number;
  currency: string;
  condition: "new" | "used" | "unknown";
  sizeUS: number | null;
  sizeIT: number | null;
  url: string;
  imageUrl: string | null;
  scrapedAt: string;
  sourceType: "api" | "scrape" | "affiliate-feed" | "search-link-only";
}

export interface SourceAdapter {
  name: string;
  sourceType: Listing["sourceType"];
  search(params: ScanParams): Promise<Listing[]>;
}
