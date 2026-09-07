import type { Browser } from "playwright";
import type { Listing, ScanParams, SourceAdapter } from "./types";
import { ssenseSearchUrl } from "../search-links";

// SSENSE embeds a schema.org Product JSON-LD block per result card (meant for
// search-engine rich snippets) — reading that directly is far more reliable
// than parsing the rendered layout, which is Tailwind-class-driven and
// changes often. SSENSE is authorized new-only retail, so condition is
// always "new". Per-size stock isn't in the search grid, so every
// candidate's own product page is opened (full navigation — SSENSE's
// Cloudflare rules block a plain in-page fetch() even with a warmed-up
// session, so a real page load per product is the only reliable way in) to
// read its embedded `sizes` array and confirm the requested IT size is
// actually in stock. Anything that can't be confirmed in-stock in that exact
// size is dropped rather than shown as a guess. No cap on how many
// candidates get checked — every match is verified.

interface SsenseProduct {
  name: string;
  brand?: { name?: string };
  offers?: { price?: number; priceCurrency?: string; url?: string };
  url?: string;
  image?: string;
}

interface SsenseSizeEntry {
  name: string;
  stock: number;
}

function extractSizes(html: string): SsenseSizeEntry[] {
  // The page embeds several unrelated "sizes":"NxN" strings (favicon link
  // metadata, widget icons) before the real "sizes":[{"id":...,"stock":...}]
  // array, so scan forward past any occurrence that isn't actually an array
  // of size/stock objects.
  const marker = '\\"sizes\\":';
  let searchFrom = 0;
  while (true) {
    const start = html.indexOf(marker, searchFrom);
    if (start === -1) return [];
    const afterMarker = start + marker.length;
    if (html[afterMarker] !== "[") { searchFrom = afterMarker; continue; }
    let depth = 0;
    let arrayEnd = -1;
    for (let i = afterMarker; i < html.length; i++) {
      if (html[i] === "[") depth++;
      else if (html[i] === "]") { depth--; if (depth === 0) { arrayEnd = i; break; } }
    }
    if (arrayEnd === -1) return [];
    try {
      const parsed = JSON.parse(html.slice(afterMarker, arrayEnd + 1).replace(/\\"/g, '"'));
      if (Array.isArray(parsed) && parsed.length && parsed[0] && typeof parsed[0] === "object" && "stock" in parsed[0]) return parsed;
      searchFrom = arrayEnd + 1;
    } catch {
      searchFrom = afterMarker + 1;
    }
  }
}

async function checkSizeInStock(browser: Browser, url: string, sizeIT: number): Promise<boolean | null> {
  const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; MargielaFinder/1.0)" });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    const html = await page.content();
    const sizes = extractSizes(html);
    const match = sizes.find((size) => size.name === `IT ${sizeIT}`);
    return match ? match.stock > 0 : null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

// Checking every candidate concurrently opens one Chromium tab per candidate
// at once — fine for a handful, but with no cap on candidate count that can
// spike to 20-30+ simultaneous tabs, and the resulting resource contention
// occasionally pushes total time past the adapter's timeout budget, silently
// dropping the whole batch. Processing in small batches keeps peak
// concurrency (and thus timing) predictable.
const CHECK_BATCH_SIZE = 6;

async function checkAllSizes<T extends { url: string }>(browser: Browser, candidates: T[], sizeIT: number): Promise<(T & { inStock: boolean | null })[]> {
  const results: (T & { inStock: boolean | null })[] = [];
  for (let i = 0; i < candidates.length; i += CHECK_BATCH_SIZE) {
    const batch = candidates.slice(i, i + CHECK_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (candidate) => ({ ...candidate, inStock: await checkSizeInStock(browser, candidate.url, sizeIT) })));
    results.push(...batchResults);
  }
  return results;
}

export const ssenseAdapter: SourceAdapter = {
  name: "SSENSE",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    if (params.condition === "used") return [];
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; MargielaFinder/1.0)" });
      await page.goto(ssenseSearchUrl(), { waitUntil: "networkidle", timeout: 20000 });
      const products = await page.evaluate(() => {
        const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
        return scripts
          .map((script) => { try { return JSON.parse(script.textContent ?? ""); } catch { return null; } })
          .filter((product) => product && product["@type"] === "Product");
      }) as SsenseProduct[];
      await page.close();

      const candidates = products.flatMap((product) => {
        const brand = (product.brand?.name ?? "").toLowerCase();
        const name = product.name ?? "";
        if (!brand.includes("margiela") || !name.toLowerCase().includes("replica")) return [];
        const price = product.offers?.price;
        const url = product.offers?.url ?? product.url;
        if (!Number.isFinite(price) || !url) return [];
        const filename = product.image?.split("/").pop();
        return [{
          title: `Maison Margiela ${name}`,
          price: price as number,
          currency: product.offers?.priceCurrency ?? "USD",
          url,
          imageUrl: filename ? `https://img.ssensemedia.com/image/upload/f_auto,c_limit,w_400,q_85/${filename}` : null,
        }];
      }).sort((first, second) => first.price - second.price);

      const checked = await checkAllSizes(browser, candidates, params.sizeIT);

      return checked.flatMap((candidate) => {
        if (candidate.inStock !== true) return [];
        return [{
          marketplace: "SSENSE",
          title: candidate.title,
          price: candidate.price,
          currency: candidate.currency,
          condition: "new" as const,
          sizeIT: params.sizeIT,
          sizeUS: params.sizeUS,
          url: candidate.url,
          imageUrl: candidate.imageUrl,
          scrapedAt: new Date().toISOString(),
          sourceType: "scrape" as const,
        }];
      });
    } finally {
      await browser.close();
    }
  },
};
