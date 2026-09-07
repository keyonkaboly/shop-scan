import type { Condition, Listing, ScanParams, SourceAdapter } from "./types";
import { ebaySearchUrl } from "../search-links";

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

function parseSize(value: string): number {
  return Number(value.replace(/\s+1\/2$/, ".5"));
}

export const ebayAdapter: SourceAdapter = {
  name: "eBay",
  sourceType: "api",
  async search(params: ScanParams): Promise<Listing[]> {
    const token = await getAccessToken();
    const codes = conditionCodes(params.condition);
    const query = new URLSearchParams({ q: "maison margiela replica gat", limit: "200", fieldgroups: "EXTENDED" });
    if (codes.length) query.set("filter", `conditionIds:{${codes.join("|")}}`);
    const response = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${query}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.itemSummaries ?? []).flatMap((item: { title?: string; price?: { value?: string; currency?: string }; conditionId?: string; itemWebUrl?: string; image?: { imageUrl?: string }; qualifiedPrograms?: string[] }) => {
      const title = item.title ?? "";
      const lowerTitle = title.toLowerCase();
      if (!lowerTitle.includes("margiela") || (!lowerTitle.includes("gat") && !lowerTitle.includes("german army"))) return [];
      const euMatch = lowerTitle.match(/\b(?:eu|it|size)\s*(3[8-9](?:\.5|\s+1\/2)?|4[0-5](?:\.5|\s+1\/2)?)\b/);
      const usMatch = lowerTitle.match(/\bus\s*(5(?:\.5|\s+1\/2)?|6(?:\.5|\s+1\/2)?|7(?:\.5|\s+1\/2)?|8(?:\.5|\s+1\/2)?|9(?:\.5|\s+1\/2)?|10(?:\.5|\s+1\/2)?|11(?:\.5|\s+1\/2)?|12)\b/);
      const sizeIT = euMatch ? parseSize(euMatch[1]) : null;
      const sizeUS = usMatch ? parseSize(usMatch[1]) : null;
      const hasRequestedSize = sizeIT !== null && sizeUS !== null
        ? sizeIT === params.sizeIT && sizeUS === params.sizeUS
        : (sizeIT !== null && sizeIT === params.sizeIT) || (sizeUS !== null && sizeUS === params.sizeUS);
      if (!hasRequestedSize) return [];
      const price = item.price?.value ? Number(item.price.value) : NaN;
      if (!Number.isFinite(price)) return [];
      const authenticityGuaranteed = Array.isArray(item.qualifiedPrograms) && item.qualifiedPrograms.some((program) => program === "AUTHENTICITY_GUARANTEE" || program === "AUTHENTICITY_VERIFICATION");
      return [{ marketplace: "eBay", title, price, currency: item.price?.currency ?? "USD", condition: mapCondition(item.conditionId), sizeIT, sizeUS, url: item.itemWebUrl ?? ebaySearchUrl(codes[0] as "1000" | "3000" | undefined), imageUrl: item.image?.imageUrl ?? null, scrapedAt: new Date().toISOString(), sourceType: "api" as const, authenticityGuaranteed }];
    });
  },
};
