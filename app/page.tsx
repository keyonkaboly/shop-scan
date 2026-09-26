"use client";

import { useEffect, useState } from "react";
import { cettireSearchUrl, endClothingSearchUrl, ebaySearchUrl, mytheresaSearchUrl, ssenseSearchUrl } from "@/lib/search-links";
import IntroScene from "@/components/IntroScene";
import Link from "next/link";
import Image from "next/image";

const sizes = [[38, 5], [38.5, 5.5], [39, 6], [39.5, 6.5], [40, 7], [40.5, 7.5], [41, 8], [41.5, 8.5], [42, 9], [42.5, 9.5], [43, 10], [43.5, 10.5], [44, 11], [44.5, 11.5], [45, 12]] as const;
type Condition = "new" | "used" | "either";
type Sort = "price-asc" | "price-desc";
type Listing = { marketplace: string; title: string; price: number; currency: string; cadPrice?: number | null; condition: "new" | "used" | "unknown"; sizeUS: number | null; sizeIT: number | null; url: string; imageUrl: string | null; sourceType: "api" | "scrape" | "affiliate-feed"; authenticityGuaranteed?: boolean };
type ScanResponse = { listings: Listing[]; unavailableSources: string[]; scannedAt: string; sourceStatus?: Record<string, string>; fallbackSearches?: { eBay?: string }; coverage?: Record<string, { checked: number; total: number }> };
type ManualLink = { name: string; url: string; note: string };
const conditions: [Condition, string][] = [["new", "New"], ["used", "Used"], ["either", "Either"]];
// Fallback links, shown only when that store's live scan fails.
const manualSources = [["SSENSE", ssenseSearchUrl()], ["Mytheresa", mytheresaSearchUrl()], ["Cettire", cettireSearchUrl()], ["END.", endClothingSearchUrl()]] as const;
const liveSourceNames = "eBay, Grailed, SSENSE, Cettire, Mytheresa and END.";
const PAGE_SIZE = 24;
// SSENSE needs a real browser (its first scan loads a page before it can
// answer), so it's fetched as its own request: every other store shows up
// in seconds and SSENSE's pairs merge in when they arrive.
const FAST_SOURCES = ["eBay", "Grailed", "Cettire", "Mytheresa", "END."];
const SLOW_SOURCES = ["SSENSE"];
const emptyScan: ScanResponse = { listings: [], unavailableSources: [], scannedAt: "" };

async function fetchScan(query: string, sources: string[], signal: AbortSignal, timeoutMs: number): Promise<ScanResponse> {
  const response = await fetch(`/api/scan?${query}&sources=${encodeURIComponent(sources.join(","))}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]), cache: "no-store" });
  if (!response.ok) throw new Error(`Scan request failed: ${response.status}`);
  return await response.json() as ScanResponse;
}

// Canadian formatting, SSENSE-style: whole amounts drop the cents, and CAD
// reads as a plain "$" while other currencies keep their prefix ("US$").
function formatMoney(amount: number, currency: string): string {
  const cents = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, minimumFractionDigits: cents, maximumFractionDigits: 2 }).format(amount);
}

export default function Home() {
  const [condition, setCondition] = useState<Condition>("either");
  const [sizeIndex, setSizeIndex] = useState(8);
  const [resultPage, setResultPage] = useState(0);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("price-asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // On by default: eBay is the one source where fakes turn up, and its
  // Authenticity Guarantee is the only verification it offers.
  const [ebayVerifiedOnly, setEbayVerifiedOnly] = useState(true);
  const [scan, setScan] = useState<ScanResponse>(emptyScan);
  const [slowScan, setSlowScan] = useState<ScanResponse>(emptyScan);
  const [isLoading, setIsLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(true);
  const [error, setError] = useState("");
  const sizeIT = sizes[sizeIndex][0];
  const sizeUS = sizes[sizeIndex][1];
  const priceOf = (listing: Listing) => listing.cadPrice ?? listing.price;
  // Cheapest first, listings without a CAD price last — the same order the
  // API returns, re-applied because SSENSE's results arrive separately.
  const allListings = [...scan.listings, ...slowScan.listings].sort((first, second) => (first.cadPrice ?? Number.POSITIVE_INFINITY) - (second.cadPrice ?? Number.POSITIVE_INFINITY));
  const verifiedListings = ebayVerifiedOnly ? allListings.filter((listing) => listing.marketplace !== "eBay" || listing.authenticityGuaranteed) : allListings;
  const hiddenUnverified = allListings.length - verifiedListings.length;
  const ssensePending = slowLoading && condition !== "used";
  // SSENSE's sizes are read a few pairs at a time in the background (its
  // Cloudflare limits how fast pages can be read), so say how many are
  // known instead of letting unchecked pairs look sold out.
  const ssenseCoverage = slowScan.coverage?.SSENSE;
  const ssensePartial = !slowLoading && ssenseCoverage && ssenseCoverage.checked < ssenseCoverage.total ? `SSENSE: ${ssenseCoverage.checked} of ${ssenseCoverage.total} pairs checked so far` : null;
  const priceFilteredListings = verifiedListings.filter((listing) => (minPrice == null || priceOf(listing) >= minPrice) && (maxPrice == null || priceOf(listing) <= maxPrice));
  const storeCounts = new Map<string, number>();
  priceFilteredListings.forEach((listing) => storeCounts.set(listing.marketplace, (storeCounts.get(listing.marketplace) ?? 0) + 1));
  const stores = [...storeCounts.keys()].sort((first, second) => first.localeCompare(second));
  const filteredListings = sourceFilter ? priceFilteredListings.filter((listing) => listing.marketplace === sourceFilter) : priceFilteredListings;
  const sortedListings = sort === "price-asc" ? filteredListings : [...filteredListings].sort((first, second) => (second.cadPrice ?? Number.NEGATIVE_INFINITY) - (first.cadPrice ?? Number.NEGATIVE_INFINITY));
  const pageCount = Math.max(1, Math.ceil(sortedListings.length / PAGE_SIZE));
  const visibleListings = sortedListings.slice(resultPage * PAGE_SIZE, (resultPage + 1) * PAGE_SIZE);
  const cheapest = filteredListings.reduce<Listing | null>((best, listing) => (best === null || priceOf(listing) < priceOf(best) ? listing : best), null);
  const hiddenByPrice = verifiedListings.length - priceFilteredListings.length;

  const unavailable = new Set([...scan.unavailableSources, ...slowScan.unavailableSources]);
  const scanFinished = !isLoading && Boolean(scan.scannedAt);
  const manualLinks: ManualLink[] = [
    ...(scanFinished && !scan.listings.some((listing) => listing.marketplace === "eBay") ? [{ name: "eBay", url: scan.fallbackSearches?.eBay ?? ebaySearchUrl(condition === "new" ? "1000" : condition === "used" ? "3000" : undefined), note: scan.sourceStatus?.eBay === "unavailable" ? "API unavailable" : "API checked · no verified match" }] : []),
    ...(scanFinished ? manualSources.filter(([name]) => unavailable.has(name)).map(([name, url]) => ({ name, url, note: "Live scan unavailable" })) : []),
  ];

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = `sizeIT=${sizeIT}&condition=${condition}`;
      setIsLoading(true);
      setError("");
      // Cleared up front so the previous size's SSENSE pairs never mix into
      // this size's results while its own SSENSE request is still running.
      setSlowScan(emptyScan);
      fetchScan(query, FAST_SOURCES, controller.signal, 25000)
        .then(setScan)
        .catch(() => { if (!controller.signal.aborted) setError("The scan could not complete. Manual search links are listed on the right."); })
        .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
      // SSENSE only sells new pairs, so a Used scan skips it entirely.
      if (condition === "used") {
        setSlowLoading(false);
        return;
      }
      setSlowLoading(true);
      fetchScan(query, SLOW_SOURCES, controller.signal, 30000)
        .then(setSlowScan)
        .catch(() => { if (!controller.signal.aborted) setSlowScan({ ...emptyScan, unavailableSources: SLOW_SOURCES }); })
        .finally(() => { if (!controller.signal.aborted) setSlowLoading(false); });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [condition, sizeIT]);

  const selectCondition = (next: Condition) => { setResultPage(0); setCondition(next); };
  const selectSize = (next: number) => { setResultPage(0); setSizeIndex(next); };
  const selectStore = (next: string | null) => { setResultPage(0); setSourceFilter(next); };
  const selectSort = (next: Sort) => { setResultPage(0); setSort(next); };
  const goToPage = (next: number) => {
    setResultPage(next);
    document.getElementById("scan")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const parsePrice = (value: string) => (value === "" ? null : Number(value));

  const renderCard = (listing: Listing) => {
    const thumbnailUrl = listing.imageUrl ? `/api/image?url=${encodeURIComponent(listing.imageUrl)}` : "";
    // The store line already says where it's from and every result is
    // Margiela, so the brand prefix (and any "Maison Margiela - " separator
    // marketplace sellers add) is dropped, as SSENSE does under its brand line.
    const name = listing.title.replace(/^maison margiela\s*[-–—:|]?\s*/i, "") || listing.title;
    const conditionLabel = listing.condition === "new" ? "New" : listing.condition === "used" ? "Used" : "Condition n/a";
    return <li key={`${listing.marketplace}-${listing.url}`}>
      <a className="product-card" href={listing.url} target="_blank" rel="noopener noreferrer">
        <span className="product-image">{thumbnailUrl ? <Image src={thumbnailUrl} alt={`${listing.marketplace} listing: ${listing.title}`} fill sizes="(max-width: 760px) 50vw, (max-width: 1100px) 30vw, 20vw" loading="lazy" /> : <span className="product-image-empty">No image</span>}</span>
        <span className="product-store">{listing.marketplace}</span>
        <span className="product-name">{name}</span>
        <span className="product-price">
          {listing.cadPrice == null ? formatMoney(listing.price, listing.currency) : formatMoney(listing.cadPrice, "CAD")}
          {listing.cadPrice != null && listing.currency !== "CAD" && <span className="product-original">{formatMoney(listing.price, listing.currency)}</span>}
        </span>
        <span className="product-meta">{conditionLabel}{listing.authenticityGuaranteed && " · Authenticity Guarantee"}</span>
      </a>
    </li>;
  };

  return <>
    <IntroScene />
    <div className="site">
      <header className="masthead">
        <nav className="masthead-links" aria-label="Sections"><a href="#scan">Scan</a></nav>
        <a className="wordmark" href="#top" aria-label="Gat Scan home">GAT SCAN</a>
        <nav className="masthead-links masthead-links-end" aria-label="Site"><span>CAD</span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
      </header>

      <main>
        <section className="hero" id="top">
          <div className="hero-image"><Image src="/images/gat-reference.png" alt="Brown Maison Margiela Replica GAT sneaker" fill sizes="(max-width: 1140px) 94vw, 1100px" preload loading="eager" unoptimized /></div>
          <div className="hero-caption">
            <div>
              <p className="kicker">Maison Margiela — Replica GAT</p>
              <h1>Find the pair for <em>you.</em></h1>
            </div>
            <div className="hero-aside">
              <p>Live prices from {liveSourceNames} — your exact size, cheapest first.</p>
              <a className="text-link" href="#scan">Start a scan</a>
            </div>
          </div>
        </section>

        <section className={`browse${filtersOpen ? " filters-open" : ""}`} id="scan" aria-label="Scan">
          {/* Mobile only: filters collapse behind one bar, as on SSENSE's mobile site. */}
          <button type="button" className="filter-toggle" aria-expanded={filtersOpen} aria-controls="scan-filters scan-sort" onClick={() => setFiltersOpen((open) => !open)}><span>Filter &amp; sort</span><span aria-hidden="true">{filtersOpen ? "−" : "+"}</span></button>
          <aside className="filter-column" id="scan-filters" aria-label="Filters">
            <div className="filter-group">
              <label className="filter-check"><input type="checkbox" checked={ebayVerifiedOnly} onChange={(event) => { setResultPage(0); setEbayVerifiedOnly(event.currentTarget.checked); }} /><span>eBay: Authenticity Guarantee only</span></label>
              <p className="filter-note">{!ebayVerifiedOnly ? "Showing every eBay listing" : hiddenUnverified > 0 ? `${hiddenUnverified} unverified eBay ${hiddenUnverified === 1 ? "listing" : "listings"} hidden` : "Unverified eBay listings hidden"}</p>
            </div>
            <div className="filter-group">
              <h2 className="filter-heading">Condition</h2>
              <ul className="filter-list">{conditions.map(([value, label]) => <li key={value}><button type="button" className={condition === value ? "is-selected" : ""} aria-pressed={condition === value} onClick={() => selectCondition(value)}>{label}</button></li>)}</ul>
            </div>
            <div className="filter-group">
              <h2 className="filter-heading">Size <span>IT / US</span></h2>
              <ul className="filter-list size-list">{sizes.map(([italian, american], index) => <li key={italian}><button type="button" className={sizeIndex === index ? "is-selected" : ""} aria-pressed={sizeIndex === index} aria-label={`IT ${italian}, US ${american}`} onClick={() => selectSize(index)}>IT {italian}<span>US {american}</span></button></li>)}</ul>
            </div>
            <div className="filter-group">
              <h2 className="filter-heading">Price <span>CAD</span></h2>
              <div className="price-inputs">
                <input type="number" inputMode="numeric" min="0" placeholder="Min" value={minPrice ?? ""} onChange={(event) => { setResultPage(0); setMinPrice(parsePrice(event.currentTarget.value)); }} aria-label="Minimum price in CAD" />
                <input type="number" inputMode="numeric" min="0" placeholder="Max" value={maxPrice ?? ""} onChange={(event) => { setResultPage(0); setMaxPrice(parsePrice(event.currentTarget.value)); }} aria-label="Maximum price in CAD" />
              </div>
              <p className="filter-note">{minPrice != null || maxPrice != null ? `${minPrice ?? 0}–${maxPrice ?? "∞"} CAD${hiddenByPrice > 0 ? ` · ${hiddenByPrice} hidden` : ""}` : "No price limit"}</p>
            </div>
          </aside>

          <div className="results">
            <div className="results-head">
              <p className="results-title">Showing results for ‘Replica GAT’ — IT {sizeIT} / US {sizeUS} · {condition}</p>
              <p className="results-meta" aria-live="polite">{isLoading ? "Scanning…" : `${sortedListings.length} ${sortedListings.length === 1 ? "listing" : "listings"}${cheapest ? ` · from ${formatMoney(priceOf(cheapest), cheapest.cadPrice == null ? cheapest.currency : "CAD")}` : ""}${scan.scannedAt ? ` · checked ${new Date(scan.scannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}${ssensePending ? " · SSENSE still checking…" : ""}`}</p>
            </div>
            {error && <p className="scan-error" role="alert">{error}</p>}
            {isLoading
              ? <p className="scan-status">Checking {liveSourceNames} for IT {sizeIT} / US {sizeUS}…</p>
              : sortedListings.length === 0
                ? <p className="scan-status">{ssensePending ? "Checking SSENSE…" : "No verified live listings for this selection."}</p>
                : <ul className="product-grid">{visibleListings.map(renderCard)}</ul>}
            {!isLoading && pageCount > 1 && <nav className="pagination" aria-label="Result pages">
              <button type="button" onClick={() => goToPage(Math.max(0, resultPage - 1))} disabled={resultPage === 0}>Previous</button>
              <span>{resultPage + 1} / {pageCount}</span>
              <button type="button" onClick={() => goToPage(Math.min(pageCount - 1, resultPage + 1))} disabled={resultPage === pageCount - 1}>Next</button>
            </nav>}
          </div>

          <aside className="sort-column" id="scan-sort" aria-label="Sort and stores">
            <div className="filter-group">
              <h2 className="filter-heading">Sort</h2>
              <ul className="filter-list">
                <li><button type="button" className={sort === "price-asc" ? "is-selected" : ""} aria-pressed={sort === "price-asc"} onClick={() => selectSort("price-asc")}>Price: Low to high</button></li>
                <li><button type="button" className={sort === "price-desc" ? "is-selected" : ""} aria-pressed={sort === "price-desc"} onClick={() => selectSort("price-desc")}>Price: High to low</button></li>
              </ul>
            </div>
            <div className="filter-group">
              <h2 className="filter-heading">Stores</h2>
              <ul className="filter-list">
                <li><button type="button" className={sourceFilter === null ? "is-selected" : ""} aria-pressed={sourceFilter === null} onClick={() => selectStore(null)}>All stores{!isLoading && ` (${priceFilteredListings.length})`}</button></li>
                {!isLoading && stores.map((name) => <li key={name}><button type="button" className={sourceFilter === name ? "is-selected" : ""} aria-pressed={sourceFilter === name} onClick={() => selectStore(name)}>{name} ({storeCounts.get(name)})</button></li>)}
                {!isLoading && ssensePending && <li className="filter-pending">SSENSE (checking…)</li>}
                {!isLoading && ssensePartial && <li className="filter-pending">{ssensePartial}</li>}
              </ul>
            </div>
            {manualLinks.length > 0 && <div className="filter-group">
              <h2 className="filter-heading">Search manually</h2>
              <ul className="filter-list manual-list">{manualLinks.map((link) => <li key={link.name}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.name} ↗</a><span>{link.note}</span></li>)}</ul>
            </div>}
          </aside>
        </section>
      </main>

      <footer className="site-footer">
        <span>© 2026 Gat Scan</span>
        <nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
      </footer>
    </div>
  </>;
}
