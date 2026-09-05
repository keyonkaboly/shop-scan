import type { SourceAdapter, ScanParams } from "./types";

export function makeRetailStubAdapter(name: string, fallbackSearchUrl: string): SourceAdapter {
  return {
    name,
    sourceType: "search-link-only",
    async search(params: ScanParams) {
      void params;
      void fallbackSearchUrl;
      return [];
    },
  };
}
