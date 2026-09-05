import type { Listing, ScanParams, SourceAdapter } from "./types";
import { grailedSearchUrl } from "../search-links";

export const grailedAdapter: SourceAdapter = {
  name: "Grailed",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; MargielaFinder/1.0)" });
      await page.goto(grailedSearchUrl(), { waitUntil: "networkidle", timeout: 20000 });
      if (await page.locator("text=/verify you are human/i").count()) return [];
      const cards = await page.locator('[data-testid="listing-card"]').all();
      const listings: Listing[] = [];
      for (const card of cards) {
        const title = await card.locator('[data-testid="listing-title"]').innerText().catch(() => "");
        const priceText = await card.locator('[data-testid="listing-price"]').innerText().catch(() => "");
        const href = await card.locator("a").first().getAttribute("href").catch(() => null);
        const price = Number(priceText.replace(/[^0-9.]/g, ""));
        const euMatch = title.match(/\b(3[8-9](?:\.5)?|4[0-5](?:\.5)?)\b/);
        const sizeIT = euMatch ? Number(euMatch[1]) : null;
        if (!title.toLowerCase().includes("margiela") || !Number.isFinite(price) || (sizeIT !== null && sizeIT !== params.sizeIT)) continue;
        listings.push({ marketplace: "Grailed", title, price, currency: "USD", condition: "used", sizeIT, sizeUS: params.sizeUS, url: href ? `https://www.grailed.com${href}` : grailedSearchUrl(), imageUrl: null, scrapedAt: new Date().toISOString(), sourceType: "scrape" });
      }
      return listings;
    } finally {
      await browser.close();
    }
  },
};
