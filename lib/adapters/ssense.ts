import type { Browser, BrowserContext, Page } from "playwright-core";
import type { Listing, ScanParams, SourceAdapter } from "./types";
import { ssenseSearchUrl } from "../search-links";
import { isLowTopReplica, parseEuSize } from "../matching";
import { cached } from "../cache";

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

// Timeline of the latest SSENSE scan, returned by /api/scan only to requests
// carrying DEBUG_TOKEN — the one way to see what the browser did on Vercel,
// where there's no console to watch.
export const ssenseTrace: string[] = [];
let traceStartedAt = Date.now();
function trace(step: string) {
  ssenseTrace.push(`${((Date.now() - traceStartedAt) / 1000).toFixed(1)}s ${step}`);
}

// Cloudflare sometimes answers with its automatic "Just a moment..." check,
// which a normal browser clears by itself within a few seconds before
// redirecting to the real page. Wait for that instead of reading the
// interstitial; if it never clears, the caller treats the page as unreadable.
async function waitPastInterstitial(page: Page): Promise<void> {
  if (!/just a moment/i.test(await page.title())) return;
  trace(`Cloudflare check on ${page.url()}, waiting`);
  await page.waitForFunction(() => !/just a moment/i.test(document.title), null, { timeout: 5000 });
  await page.waitForLoadState("domcontentloaded");
}

const USER_AGENT = "Mozilla/5.0 (compatible; MargielaFinder/1.0)";

// Longer than the other stores' cache: each product page lists stock for
// every size, and SSENSE's Cloudflare starts challenging after about ten
// rapid page loads, so re-reading pages on every size change is what made
// scans slow and patchy. Stock here can be up to 20 minutes old.
const SSENSE_CACHE_MS = 20 * 60 * 1000;

// SSENSE embeds a schema.org Product JSON-LD block per result card (meant for
// search-engine rich snippets) — reading that directly is far more reliable
// than parsing the rendered layout, which is Tailwind-class-driven and
// changes often. SSENSE is authorized new-only retail, so condition is
// always "new". In-stock-in-your-size comes from SSENSE's own size filter
// (one listing page per size); if that page can't be used, each Replica's
// product page is opened to read its embedded `sizes` array instead (full
// navigation — SSENSE's Cloudflare rules block a plain in-page fetch()).
// Anything that can't be confirmed in stock in that exact size is dropped
// rather than shown as a guess. Uses the Canadian storefront, so prices are
// SSENSE's own CAD prices.

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

// Throws rather than returning an empty table when a page can't be read, so
// a failed load isn't cached as "nothing in stock" for every size.
async function loadSizes(context: BrowserContext, url: string): Promise<SsenseSizeEntry[]> {
  const page = await context.newPage();
  const id = url.split("/").pop();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    await waitPastInterstitial(page);
    const sizes = extractSizes(await page.content());
    trace(`product ${id}: HTTP ${response?.status()} "${await page.title()}" → ${sizes.length} sizes`);
    if (!sizes.length) throw new Error(`No size table found on ${url}`);
    return sizes;
  } catch (error) {
    trace(`product ${id} failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    throw error;
  } finally {
    await page.close();
  }
}

// A product page lists stock for every size, so it's cached per product —
// switching the size picker re-checks from memory instead of reloading
// every page.
async function checkSizeInStock(session: ScanSession, url: string, sizeIT: number): Promise<boolean | null> {
  try {
    const sizes = await cached(`ssense:sizes:${url}`, SSENSE_CACHE_MS, async () => {
      // Once Cloudflare has challenged this scan, more page loads only get
      // challenged too, so the rest are skipped (and not cached) — the next
      // scan picks them up.
      if (session.challenged) throw new Error("skipped: Cloudflare already challenged this scan");
      try {
        return await loadSizes(await session.get(), url);
      } catch (error) {
        if (/waitForFunction|just a moment/i.test(String(error))) session.challenged = true;
        throw error;
      }
    });
    const match = sizes.find((size) => parseEuSize(size.name) === sizeIT);
    return match ? match.stock > 0 : null;
  } catch {
    return null;
  }
}

// Checking every candidate concurrently opens one Chromium tab per candidate
// at once — fine for a handful, but with no cap on candidate count that can
// spike to 20-30+ simultaneous tabs, and the resulting resource contention
// occasionally pushes total time past the adapter's timeout budget, silently
// dropping the whole batch. Processing in small batches keeps peak
// concurrency (and thus timing) predictable.
// Fewer at once on Vercel, where the function has one vCPU and 2 GB.
const CHECK_BATCH_SIZE = process.env.VERCEL ? 3 : 6;

async function checkAllSizes<T extends { url: string }>(session: ScanSession, candidates: T[], sizeIT: number): Promise<(T & { inStock: boolean | null })[]> {
  const results: (T & { inStock: boolean | null })[] = [];
  for (let i = 0; i < candidates.length; i += CHECK_BATCH_SIZE) {
    const batch = candidates.slice(i, i + CHECK_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (candidate) => ({ ...candidate, inStock: await checkSizeInStock(session, candidate.url, sizeIT) })));
    results.push(...batchResults);
  }
  return results;
}

interface SsenseCandidate {
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
}

// SSENSE's own size filter: its Maison Margiela low-top sneaker listing
// filtered to one size lists only pairs in stock in that size, so a single
// page load answers the whole question — instead of one product page per
// candidate, which Cloudflare starts challenging after a handful. (SSENSE
// only applies the size filter with a designer/category in the path; on the
// plain search page it's silently ignored.)
function sizeFilteredUrl(sizeIT: number): string {
  return `https://www.ssense.com/en-ca/men/designers/maison-margiela/low-top-sneakers?sizes=${sizeIT}`;
}

// Reads the product cards' JSON-LD from an SSENSE listing page. With
// `requiredSize`, the page's own filter state must show that size applied —
// otherwise its products aren't size-verified and it throws.
async function loadCandidates(context: BrowserContext, url: string, label: string, requiredSize?: number): Promise<SsenseCandidate[]> {
  const page = await context.newPage();
  try {
    // The product JSON-LD is server-rendered, so it's there as soon as the
    // HTML is — waiting for "networkidle" meant waiting on ~30 ad/analytics
    // requests, which alone could eat most of the time budget on Vercel.
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    trace(`${label}: HTTP ${response?.status()} "${await page.title()}"`);
    await waitPastInterstitial(page);
    if (requiredSize !== undefined) {
      const html = (await page.content()).replace(/\\"/g, '"');
      const applied = html.match(/"searchFilters":\{[\s\S]*?"sizes":\[([^\]]*)\]/)?.[1] ?? "";
      if (!applied.includes(`"${requiredSize}"`)) throw new Error(`${label}: size filter not applied (sizes: [${applied.slice(0, 80)}])`);
    }
    const products = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      return scripts
        .map((script) => { try { return JSON.parse(script.textContent ?? ""); } catch { return null; } })
        .filter((product) => product && product["@type"] === "Product");
    }) as (SsenseProduct & { productID?: string })[];
    // An empty grid can't be told apart from a blocked or changed page, so
    // it's an error rather than a cached "nothing in stock".
    if (!products.length) throw new Error(`${label}: no products on the page`);
    trace(`${label}: ${products.length} products (${products.map((product) => product.productID).join(" ")})`);
    return products.flatMap((product) => {
      const brand = (product.brand?.name ?? "").toLowerCase();
      const name = product.name ?? "";
      if (!brand.includes("margiela") || !isLowTopReplica(name)) return [];
      const price = product.offers?.price;
      const productUrl = product.offers?.url ?? product.url;
      if (!Number.isFinite(price) || !productUrl) return [];
      const filename = product.image?.split("/").pop();
      return [{
        title: `Maison Margiela ${name}`,
        price: price as number,
        currency: product.offers?.priceCurrency ?? "CAD",
        url: productUrl,
        imageUrl: filename ? `https://img.ssensemedia.com/image/upload/f_auto,c_limit,w_600,q_85/${filename}` : null,
      }];
    }).sort((first, second) => first.price - second.price);
  } finally {
    await page.close();
  }
}

// One browser session per scan, shared by every page, so SSENSE sees one
// visitor browsing (keeping its cookies) rather than a fresh visitor per
// product page. Only SSENSE's own documents and scripts plus Cloudflare's
// check are loaded — images, fonts and third-party trackers are skipped,
// since only the page data is read. It's launched only if something
// actually needs loading: when the search grid and every candidate's sizes
// are cached, a scan never starts Chromium at all.
type ScanSession = ReturnType<typeof lazyContext>;

function lazyContext() {
  let launching: Promise<{ browser: Browser; context: BrowserContext }> | null = null;
  const open = async () => {
    trace("launching browser");
    const browser = await launchBrowser();
    trace("browser ready");
    const context = await browser.newContext({ userAgent: USER_AGENT });
    await context.route("**/*", (route) => {
      const request = route.request();
      const host = new URL(request.url()).hostname;
      const firstParty = host.endsWith("ssense.com") || host.endsWith("cloudflare.com");
      const heavy = ["image", "media", "font"].includes(request.resourceType());
      return firstParty && !heavy ? route.continue() : route.abort();
    });
    return { browser, context };
  };
  return {
    challenged: false,
    get: async () => (await (launching ??= open())).context,
    close: async () => { if (launching) await launching.then(({ browser }) => browser.close(), () => undefined); },
  };
}

export const ssenseAdapter: SourceAdapter = {
  name: "SSENSE",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    if (params.condition === "used") return [];
    ssenseTrace.length = 0;
    traceStartedAt = Date.now();
    const session = lazyContext();
    try {
      let inStock: SsenseCandidate[];
      try {
        inStock = await cached(`ssense:size:${params.sizeIT}`, SSENSE_CACHE_MS, async () => loadCandidates(await session.get(), sizeFilteredUrl(params.sizeIT), "size-filtered page", params.sizeIT));
        trace(`done via size filter: ${inStock.length} low-top Replicas in stock in IT ${params.sizeIT}`);
      } catch (error) {
        // Fallback: every Replica from the search page, each confirmed on
        // its own product page.
        trace(`size filter unusable (${error instanceof Error ? error.message.split("\n")[0] : error}), checking product pages`);
        const candidates = await cached("ssense:search", SSENSE_CACHE_MS, async () => loadCandidates(await session.get(), ssenseSearchUrl(), "search page"));
        trace(`${candidates.length} low-top Replica candidates`);
        const checked = await checkAllSizes(session, candidates, params.sizeIT);
        inStock = checked.filter((candidate) => candidate.inStock === true);
        // Nothing confirmed because Cloudflare cut the scan short isn't "no
        // stock" — report SSENSE unavailable so the page offers its link.
        if (!inStock.length && session.challenged) throw new Error("SSENSE's Cloudflare check blocked the scan before any size could be confirmed");
        trace(`done via product pages: ${inStock.length} in stock in IT ${params.sizeIT}`);
      }
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
    } finally {
      await session.close();
    }
  },
};
