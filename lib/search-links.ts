const QUERY = "maison margiela replica gat";

export function ebaySearchUrl(conditionCode?: "1000" | "3000"): string {
  const base = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(QUERY)}`;
  return conditionCode ? `${base}&LH_ItemCondition=${conditionCode}` : base;
}

export function grailedSearchUrl(): string {
  return `https://www.grailed.com/shop?query=${encodeURIComponent(QUERY)}`;
}

export function farfetchSearchUrl(): string {
  return `https://www.farfetch.com/shopping/search/items.aspx?q=${encodeURIComponent(QUERY)}`;
}

export function ssenseSearchUrl(): string {
  return `https://www.ssense.com/en-us/men?q=${encodeURIComponent(QUERY)}`;
}

export function mytheresaSearchUrl(): string {
  return `https://www.mytheresa.com/us/en/search?q=${encodeURIComponent(QUERY)}`;
}

export function cettireSearchUrl(): string {
  return `https://www.cettire.com/search?q=${encodeURIComponent(QUERY)}`;
}

export function mrPorterSearchUrl(): string {
  return `https://www.mrporter.com/en-us/search/?keywords=${encodeURIComponent(QUERY)}`;
}

export function endClothingSearchUrl(): string {
  return `https://www.endclothing.com/us/catalogsearch/result/?q=${encodeURIComponent(QUERY)}`;
}
