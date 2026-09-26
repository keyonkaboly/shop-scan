export const QUERY = "maison margiela replica sneaker";

export function ebaySearchUrl(conditionCode?: "1000" | "3000"): string {
  const base = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(QUERY)}`;
  return conditionCode ? `${base}&LH_ItemCondition=${conditionCode}` : base;
}

export function grailedSearchUrl(): string {
  return `https://www.grailed.com/shop?query=${encodeURIComponent(QUERY)}`;
}

export function ssenseSearchUrl(): string {
  return `https://www.ssense.com/en-ca/men?q=${encodeURIComponent(QUERY)}`;
}

export function mytheresaSearchUrl(): string {
  return "https://www.mytheresa.com/ca/en/men/designers/maison-margiela";
}

export function cettireSearchUrl(): string {
  return `https://www.cettire.com/ca/pages/search?q=${encodeURIComponent(QUERY)}`;
}

export function endClothingSearchUrl(): string {
  return "https://www.endclothing.com/ca/brands/maison-margiela";
}
