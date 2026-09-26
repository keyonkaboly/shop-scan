import type { Browser, BrowserContext, Page } from "playwright-core";
import { getCache } from "@vercel/functions";
import type { Listing, ScanParams, SourceAdapter } from "./types";
import { ssenseSearchUrl } from "../search-links";
import { isLowTopReplica, parseEuSize } from "../matching";

// SSENSE embeds a schema.org Product JSON-LD block per result card (meant for
// search-engine rich snippets) — reading that directly is far more reliable
// than parsing the rendered layout, which is Tailwind-class-driven and
// changes often. SSENSE is authorized new-only retail, so condition is
// always "new". Per-size stock isn't in the search grid, so each Replica's
// own product page is read for its embedded `sizes` array (full navigation
// in a real browser — SSENSE's Cloudflare blocks plain HTTP requests).
// Anything that can't be confirmed in stock in that exact size is dropped
// rather than shown as a guess. Uses the Canadian storefront, so prices are
// SSENSE's own CAD prices.
//
// SSENSE's Cloudflare challenges a browser after a few quick product-page
// loads and grows stricter the more it sees, so scans never read product
// pages themselves. Instead:
// - Each product's stock (for every size) lives in Vercel's Runtime Cache,
//   shared by all of the app's servers, and scans answer from it instantly.
// - After responding, a scan starts a background crawl (one at a time app-
//   wide) that reads a few missing or oldest product pages, slowly, and
//   saves them. Stock is re-read about every 3 hours.
// - If Cloudflare challenges the crawler, crawling pauses for 20 minutes.
// That keeps SSENSE's traffic to a handful of page loads an hour in total.
// Outside Vercel the Runtime Cache falls back to process memory.

const USER_AGENT = "Mozilla/5.0 (compatible; MargielaFinder/1.0)";
const SEARCH_TTL_S = 6 * 60 * 60;
const SEARCH_REFRESH_MS = 2 * 60 * 60 * 1000;
const SIZES_TTL_S = 12 * 60 * 60;
const SIZES_REFRESH_MS = 3 * 60 * 60 * 1000;
const COOLDOWN_S = 20 * 60;
const LOCK_S = 120;
const PAGES_PER_CRAWL = 6;
const PAUSE_BETWEEN_PAGES_MS = 3000;

interface SsenseCandidate {
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
}
interface SsenseSizeEntry { name: string; stock: number }
interface StoredSearch { candidates: SsenseCandidate[]; fetchedAt: number }
interface StoredSizes { sizes: SsenseSizeEntry[]; fetchedAt: number }

const store = () => getCache({ namespace: "gatscan-ssense" });
const sizesKey = (url: string) => `sizes:${url.split("/").pop()}`;

// Timeline of the latest SSENSE scan on this server, returned by /api/scan
// only to requests carrying DEBUG_TOKEN (with the latest background crawl's
// log) — the one way to see what happened on Vercel.
export const ssenseTrace: string[] = [];
let traceStartedAt = Date.now();
function trace(step: string) {
  ssenseTrace.push(`${((Date.now() - traceStartedAt) / 1000).toFixed(1)}s ${step}`);
}
export async function lastSsenseCrawl(): Promise<unknown> {
  return store().get("last-crawl").catch(() => null);
}

// How much of SSENSE's Replica range has known sizes, so the page can say
// "6 of 15 checked" instead of implying the rest are out of stock.
export const ssenseCoverage = { checked: 0, total: 0 };

// On Vercel there's no local browser, so the function launches the
// Lambda-sized Chromium build from @sparticuz/chromium (pinned to the same
// Chromium version playwright-core 1.63 drives). BROWSERLESS_API_KEY, if
// set, uses a remote Browserless browser instead. Local dev launches the
// full `playwright` package's browser (a devDependency).
async function launchBrowser(): Promise<Browser> {
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (apiKey) {
    const { chromium } = await import("playwright-core");
    return chromium.connect(`wss://production-sfo.browserless.io/chromium/playwright?token=${apiKey}`);
  }
  if (process.env.VERCEL) {
    const [{ chromium }, { default: serverlessChromium }] = await Promise.all([import("playwright-core"), import("@sparticuz/chromium")]);
    return chromium.launch({ executablePath: await serverlessChromium.executablePath(), args: serverlessChromium.args, headless: true });
  }
  const { chromium: localChromium } = await import("playwright");
  return localChromium.launch({ headless: true });
}

// Cookies from the previous browser session on this server, reused like a
// returning visitor's browser would.
let savedCookies: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

// Pages load as they would for a visitor with an ad blocker: SSENSE's own
// content and images plus Cloudflare's check, third-party ads and analytics
// skipped.
async function withBrowser<T>(log: (step: string) => void, run: (context: BrowserContext) => Promise<T>): Promise<T> {
  log("launching browser");
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ userAgent: USER_AGENT, storageState: savedCookies });
    await context.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      const firstParty = host.endsWith("ssense.com") || host.endsWith("ssensemedia.com") || host.endsWith("cloudflare.com");
      return firstParty ? route.continue() : route.abort();
    });
    const result = await run(context);
    savedCookies = await context.storageState().catch(() => savedCookies);
    return result;
  } finally {
    await browser.close();
  }
}

class CloudflareChallenge extends Error {}

// Cloudflare sometimes answers with its automatic "Just a moment..." check,
// which a normal browser clears by itself within a few seconds before
// redirecting to the real page. Wait briefly for that instead of reading the
// interstitial; if it doesn't clear, stop — pushing on only makes it stricter.
async function waitPastInterstitial(page: Page): Promise<void> {
  if (!/just a moment/i.test(await page.title())) return;
  try {
    await page.waitForFunction(() => !/just a moment/i.test(document.title), null, { timeout: 5000 });
    await page.waitForLoadState("domcontentloaded");
  } catch {
    throw new CloudflareChallenge(`Cloudflare check on ${page.url().split("?")[0]} didn't clear`);
  }
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

async function loadSizes(context: BrowserContext, url: string): Promise<SsenseSizeEntry[]> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    await waitPastInterstitial(page);
    const sizes = extractSizes(await page.content());
    if (!sizes.length) throw new Error(`No size table found on ${url}`);
    return sizes;
  } finally {
    await page.close();
  }
}

async function loadCandidates(context: BrowserContext, log: (step: string) => void): Promise<SsenseCandidate[]> {
  const page = await context.newPage();
  try {
    // The product JSON-LD is server-rendered, so it's there as soon as the
    // HTML is — no need to wait for the page's ad/analytics requests.
    const response = await page.goto(ssenseSearchUrl(), { waitUntil: "domcontentloaded", timeout: 20000 });
    log(`search page: HTTP ${response?.status()}`);
    await waitPastInterstitial(page);
    const products = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      return scripts
        .map((script) => { try { return JSON.parse(script.textContent ?? ""); } catch { return null; } })
        .filter((product) => product && product["@type"] === "Product");
    }) as { name?: string; brand?: { name?: string }; offers?: { price?: number; priceCurrency?: string; url?: string }; url?: string; image?: string }[];
    // This search always has results, so an empty grid means the page was
    // blocked or its layout changed — fail loudly rather than store "none".
    if (!products.length) throw new Error("SSENSE search page returned no products");
    return products.flatMap((product) => {
      const brand = (product.brand?.name ?? "").toLowerCase();
      const name = product.name ?? "";
      if (!brand.includes("margiela") || !isLowTopReplica(name)) return [];
      const price = product.offers?.price;
      const url = product.offers?.url ?? product.url;
      if (!Number.isFinite(price) || !url) return [];
      const filename = product.image?.split("/").pop();
      return [{
        title: `Maison Margiela ${name}`,
        price: price as number,
        currency: product.offers?.priceCurrency ?? "CAD",
        url,
        imageUrl: filename ? `https://img.ssensemedia.com/image/upload/f_auto,c_limit,w_600,q_85/${filename}` : null,
      }];
    }).sort((first, second) => first.price - second.price);
  } finally {
    await page.close();
  }
}

async function fetchSearch(log: (step: string) => void): Promise<StoredSearch> {
  try {
    const search = { candidates: await withBrowser(log, (context) => loadCandidates(context, log)), fetchedAt: Date.now() };
    await store().set("search", search, { ttl: SEARCH_TTL_S });
    return search;
  } catch (error) {
    if (error instanceof CloudflareChallenge) await store().set("cooldown", Date.now(), { ttl: COOLDOWN_S });
    throw error;
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Set synchronously, so two scans finishing at once on the same server can't
// both start a crawl; the shared "lock" entry covers other servers.
let crawling = false;

// Background crawl, run after a scan has responded. Reads up to a few
// product pages — ones never read first, then the oldest past the refresh
// age — one at a time with a pause, and saves each to the shared cache. Only
// one crawl runs app-wide at a time, and a Cloudflare challenge pauses all
// crawling for 20 minutes.
export async function crawlSsense(): Promise<void> {
  if (crawling) return;
  crawling = true;
  try {
    await crawl();
  } finally {
    crawling = false;
  }
}

async function crawl(): Promise<void> {
  const cache = store();
  const startedAt = Date.now();
  const log: string[] = [];
  const note = (step: string) => log.push(`${((Date.now() - startedAt) / 1000).toFixed(1)}s ${step}`);
  if (await cache.get("cooldown") || await cache.get("lock")) return;
  await cache.set("lock", startedAt, { ttl: LOCK_S });
  try {
    let search = await cache.get("search") as StoredSearch | null;
    if (!search || Date.now() - search.fetchedAt > SEARCH_REFRESH_MS) search = await fetchSearch(note);
    const known = await Promise.all(search.candidates.map((candidate) => cache.get(sizesKey(candidate.url)) as Promise<StoredSizes | null>));
    const due = search.candidates
      .map((candidate, index) => ({ candidate, fetchedAt: known[index]?.fetchedAt ?? 0 }))
      .filter(({ fetchedAt }) => Date.now() - fetchedAt > SIZES_REFRESH_MS)
      .sort((first, second) => first.fetchedAt - second.fetchedAt)
      .slice(0, PAGES_PER_CRAWL);
    note(`${due.length} product pages due`);
    if (!due.length) return;
    await withBrowser(note, async (context) => {
      for (const [index, { candidate }] of due.entries()) {
        if (index > 0) await pause(PAUSE_BETWEEN_PAGES_MS);
        try {
          const sizes = await loadSizes(context, candidate.url);
          await cache.set(sizesKey(candidate.url), { sizes, fetchedAt: Date.now() } satisfies StoredSizes, { ttl: SIZES_TTL_S });
          note(`read ${sizesKey(candidate.url)} (${sizes.length} sizes)`);
        } catch (error) {
          note(`${sizesKey(candidate.url)} failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
          if (error instanceof CloudflareChallenge) {
            await cache.set("cooldown", Date.now(), { ttl: COOLDOWN_S });
            note("Cloudflare challenged — crawling paused for 20 minutes");
            return;
          }
        }
      }
    });
  } catch (error) {
    note(`crawl failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
  } finally {
    await cache.delete("lock").catch(() => undefined);
    await cache.set("last-crawl", log, { ttl: 24 * 60 * 60 }).catch(() => undefined);
  }
}

export const ssenseAdapter: SourceAdapter = {
  name: "SSENSE",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    if (params.condition === "used") return [];
    ssenseTrace.length = 0;
    traceStartedAt = Date.now();
    const cache = store();
    let search = await cache.get("search") as StoredSearch | null;
    // The very first scan has no product list yet; SSENSE's search page is
    // one page load and isn't challenged, so it's fetched on the spot.
    if (!search) {
      if (await cache.get("cooldown")) throw new Error("SSENSE crawling is paused after a Cloudflare check");
      search = await fetchSearch(trace);
    }
    const known = await Promise.all(search.candidates.map((candidate) => cache.get(sizesKey(candidate.url)) as Promise<StoredSizes | null>));
    ssenseCoverage.checked = known.filter(Boolean).length;
    ssenseCoverage.total = search.candidates.length;
    const inStock = search.candidates.filter((_, index) => {
      const size = known[index]?.sizes.find((entry) => parseEuSize(entry.name) === params.sizeIT);
      return Boolean(size && size.stock > 0);
    });
    trace(`${ssenseCoverage.checked}/${ssenseCoverage.total} pairs have known sizes, ${inStock.length} in stock in IT ${params.sizeIT}`);
    // Nothing known yet isn't "no stock" — report SSENSE unavailable (with
    // its manual link) until the background crawl has read some pages.
    if (ssenseCoverage.total > 0 && ssenseCoverage.checked === 0) throw new Error("SSENSE sizes haven't been read yet — the background crawl is working through them");
    return inStock.map((candidate) => ({
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
    }));
  },
};
