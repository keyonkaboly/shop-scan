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

// SSENSE embeds a schema.org Product JSON-LD block per result card (meant for
// search-engine rich snippets) — reading that directly is far more reliable
// than parsing the rendered layout, which is Tailwind-class-driven and
// changes often. SSENSE is authorized new-only retail, so condition is
// always "new". Per-size stock isn't in the search grid, so each Replica's
// own product page is opened to read its embedded `sizes` array (full
// navigation — SSENSE's Cloudflare rules block a plain in-page fetch()).
// Anything that can't be confirmed in stock in that exact size is dropped
// rather than shown as a guess. Uses the Canadian storefront, so prices are
// SSENSE's own CAD prices.
//
// SSENSE's Cloudflare starts challenging after a few quick page loads (and
// grows stricter the more it sees), while listing pages filtered by size are
// challenged outright. So the scraper is deliberately slow and keeps what it
// learns: product pages are opened one at a time with a pause between
// them, each page's stock for every size is kept for 30 minutes, and a scan
// that runs out of time or gets challenged simply stops — the next scan
// (for any size) carries on from where it left off. Scans run in the
// background of the page, so pacing costs the visitor nothing.
const USER_AGENT = "Mozilla/5.0 (compatible; MargielaFinder/1.0)";
const SSENSE_CACHE_MS = 30 * 60 * 1000;
const PAUSE_BETWEEN_PAGES_MS = 2500;
// Leaves room under the route's 55s SSENSE timeout for a page already loading.
const SCAN_BUDGET_MS = 35_000;

// Timeline of the latest SSENSE scan, returned by /api/scan only to requests
// carrying DEBUG_TOKEN — the one way to see what the browser did on Vercel,
// where there's no console to watch.
export const ssenseTrace: string[] = [];
let traceStartedAt = Date.now();
function trace(step: string) {
  ssenseTrace.push(`${((Date.now() - traceStartedAt) / 1000).toFixed(1)}s ${step}`);
}

// How much of SSENSE's Replica range the latest scan could confirm sizes
// for, so the page can say "6 of 15 checked" instead of implying the rest
// are out of stock.
export const ssenseCoverage = { checked: 0, total: 0 };

// Cloudflare sometimes answers with its automatic "Just a moment..." check,
// which a normal browser clears by itself within a few seconds before
// redirecting to the real page. Wait briefly for that instead of reading the
// interstitial; if it doesn't clear, the caller treats the page as unreadable.
async function waitPastInterstitial(page: Page): Promise<void> {
  if (!/just a moment/i.test(await page.title())) return;
  trace(`Cloudflare check on ${page.url().split("?")[0]}, waiting`);
  await page.waitForFunction(() => !/just a moment/i.test(document.title), null, { timeout: 5000 });
  await page.waitForLoadState("domcontentloaded");
}

interface SsenseProduct {
  name: string;
  productID?: string;
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
    trace(`product ${id}: HTTP ${response?.status()} → ${sizes.length} sizes`);
    if (!sizes.length) throw new Error(`No size table found on ${url}`);
    return sizes;
  } catch (error) {
    trace(`product ${id} failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    throw error;
  } finally {
    await page.close();
  }
}

interface SsenseCandidate {
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
}

async function loadCandidates(context: BrowserContext): Promise<SsenseCandidate[]> {
  const page = await context.newPage();
  try {
    // The product JSON-LD is server-rendered, so it's there as soon as the
    // HTML is — no need to wait for the page's ad/analytics requests.
    const response = await page.goto(ssenseSearchUrl(), { waitUntil: "domcontentloaded", timeout: 20000 });
    trace(`search page: HTTP ${response?.status()} "${await page.title()}"`);
    await waitPastInterstitial(page);
    const products = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      return scripts
        .map((script) => { try { return JSON.parse(script.textContent ?? ""); } catch { return null; } })
        .filter((product) => product && product["@type"] === "Product");
    }) as SsenseProduct[];
    // This search always has results, so an empty grid means the page was
    // blocked or its layout changed — fail loudly rather than cache "none".
    if (!products.length) throw new Error("SSENSE search page returned no products");
    trace(`search page: ${products.length} products`);
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

// Cookies from the previous scan, reused like a returning visitor's browser
// would rather than arriving as a stranger every time.
let savedCookies: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

// One browser session per scan, shared by every page. Pages load as they
// would for a visitor with an ad blocker: SSENSE's own content and images
// plus Cloudflare's check, with third-party ads and analytics skipped. The
// browser is only launched if something actually needs loading — when the
// search grid and every candidate's sizes are cached, a scan never starts
// Chromium at all.
type ScanSession = ReturnType<typeof lazySession>;

function lazySession() {
  let launching: Promise<{ browser: Browser; context: BrowserContext }> | null = null;
  const open = async () => {
    trace("launching browser");
    const browser = await launchBrowser();
    trace("browser ready");
    const context = await browser.newContext({ userAgent: USER_AGENT, storageState: savedCookies });
    await context.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      const firstParty = host.endsWith("ssense.com") || host.endsWith("ssensemedia.com") || host.endsWith("cloudflare.com");
      return firstParty ? route.continue() : route.abort();
    });
    return { browser, context };
  };
  return {
    challenged: false,
    get: async () => (await (launching ??= open())).context,
    close: async () => {
      if (!launching) return;
      await launching.then(async ({ browser, context }) => {
        savedCookies = await context.storageState().catch(() => savedCookies);
        await browser.close();
      }, () => undefined);
    },
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Works through the candidates cheapest first, one page at a time. Sizes
// already known (from this or an earlier scan) cost nothing; a page is only
// opened while the scan is within budget and Cloudflare hasn't challenged
// it. Unchecked candidates return null and are picked up by a later scan.
async function checkSizes(session: ScanSession, candidates: SsenseCandidate[], sizeIT: number, startedAt: number): Promise<(SsenseCandidate & { inStock: boolean | null })[]> {
  const results: (SsenseCandidate & { inStock: boolean | null })[] = [];
  let loadedAny = false;
  for (const candidate of candidates) {
    const key = `ssense:sizes:${candidate.url}`;
    let sizes: SsenseSizeEntry[] | null = null;
    try {
      sizes = await cached(key, SSENSE_CACHE_MS, async () => {
        if (session.challenged) throw new Error("skipped: Cloudflare challenged this scan");
        if (Date.now() - startedAt > SCAN_BUDGET_MS) throw new Error("skipped: out of time this scan");
        if (loadedAny) await pause(PAUSE_BETWEEN_PAGES_MS);
        loadedAny = true;
        try {
          return await loadSizes(await session.get(), candidate.url);
        } catch (error) {
          if (/waitForFunction|just a moment/i.test(String(error))) session.challenged = true;
          throw error;
        }
      });
    } catch {
      sizes = null;
    }
    const match = sizes?.find((size) => parseEuSize(size.name) === sizeIT);
    results.push({ ...candidate, inStock: sizes === null ? null : Boolean(match && match.stock > 0) });
  }
  return results;
}

export const ssenseAdapter: SourceAdapter = {
  name: "SSENSE",
  sourceType: "scrape",
  async search(params: ScanParams): Promise<Listing[]> {
    if (params.condition === "used") return [];
    ssenseTrace.length = 0;
    traceStartedAt = Date.now();
    const session = lazySession();
    try {
      const candidates = await cached("ssense:search", SSENSE_CACHE_MS, async () => loadCandidates(await session.get()));
      trace(`${candidates.length} low-top Replica candidates`);
      const checked = await checkSizes(session, candidates, params.sizeIT, traceStartedAt);
      const inStock = checked.filter((candidate) => candidate.inStock === true);
      ssenseCoverage.checked = checked.filter((candidate) => candidate.inStock !== null).length;
      ssenseCoverage.total = checked.length;
      trace(`done: ${ssenseCoverage.checked}/${ssenseCoverage.total} checked, ${inStock.length} in stock in IT ${params.sizeIT}`);
      // Nothing confirmed because Cloudflare cut the scan short isn't "no
      // stock" — report SSENSE unavailable so the page offers its link.
      if (!inStock.length && candidates.length > 0 && ssenseCoverage.checked === 0) throw new Error("SSENSE couldn't confirm any sizes this scan (Cloudflare check)");
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
