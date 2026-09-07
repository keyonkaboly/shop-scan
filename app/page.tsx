"use client";

import { useEffect, useState } from "react";
import { cettireSearchUrl, endClothingSearchUrl, ebaySearchUrl, farfetchSearchUrl, mrPorterSearchUrl, mytheresaSearchUrl, ssenseSearchUrl } from "@/lib/search-links";
import IntroScene from "@/components/IntroScene";
import Link from "next/link";
import Image from "next/image";

const sizes = [[38, 5], [38.5, 5.5], [39, 6], [39.5, 6.5], [40, 7], [40.5, 7.5], [41, 8], [41.5, 8.5], [42, 9], [42.5, 9.5], [43, 10], [43.5, 10.5], [44, 11], [44.5, 11.5], [45, 12]] as const;
type Condition = "new" | "used" | "either";
type Listing = { marketplace: string; title: string; price: number; currency: string; cadPrice?: number | null; condition: "new" | "used" | "unknown"; sizeUS: number | null; sizeIT: number | null; url: string; imageUrl: string | null; sourceType: "api" | "scrape" | "affiliate-feed" | "search-link-only" };
type ScanResponse = { listings: Listing[]; unavailableSources: string[]; scannedAt: string; sourceStatus?: { eBay?: string }; fallbackSearches?: { eBay?: string } };
type ResultRow = { type: "live"; listing: Listing } | { type: "manual"; name: string; url: string; status?: string };
const manualSources = [["Farfetch", farfetchSearchUrl()], ["SSENSE", ssenseSearchUrl()], ["Mytheresa", mytheresaSearchUrl()], ["Cettire", cettireSearchUrl()], ["MR PORTER", mrPorterSearchUrl()], ["END.", endClothingSearchUrl()]] as const;

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

export default function Home() {
  const [condition, setCondition] = useState<Condition>("either");
  const [sizeIndex, setSizeIndex] = useState(8);
  const [resultPage, setResultPage] = useState(0);
  const [scan, setScan] = useState<ScanResponse>({ listings: [], unavailableSources: ["eBay", "Grailed", ...manualSources.map(([name]) => name)], scannedAt: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const sizeIT = sizes[sizeIndex][0];
  const sizeUS = sizes[sizeIndex][1];
  const unavailable = new Set(scan.unavailableSources);
  const liveListings = scan.listings;
  const ebayHasListing = liveListings.some((listing) => listing.marketplace === "eBay");
  const ebayFallback: ResultRow[] = !ebayHasListing && !isLoading ? [{ type: "manual", name: "eBay", url: scan.fallbackSearches?.eBay ?? ebaySearchUrl(condition === "new" ? "1000" : condition === "used" ? "3000" : undefined), status: scan.sourceStatus?.eBay === "unavailable" ? "API unavailable" : "Live API checked · no verified match" }] : [];
  const resultRows: ResultRow[] = [...liveListings.map((listing) => ({ type: "live" as const, listing })), ...ebayFallback, ...manualSources.filter(([name]) => unavailable.has(name)).map(([name, url]) => ({ type: "manual" as const, name, url }))];
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(resultRows.length / pageSize));
  const visibleRows = resultRows.slice(resultPage * pageSize, (resultPage + 1) * pageSize);
  const lowestPrice = liveListings[0]?.price;

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const deadline = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10000);
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/scan?sizeIT=${sizeIT}&condition=${condition}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Scan request failed");
        setScan(await response.json() as ScanResponse);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          if (timedOut) setError("This scan timed out. Showing manual marketplace links instead.");
          return;
        }
        setError("The scan could not complete. Manual search links are still available.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
        if (timedOut) setIsLoading(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); window.clearTimeout(deadline); controller.abort(); };
  }, [condition, sizeIT]);

  const selectCondition = (next: Condition) => { setResultPage(0); setCondition(next); };
  const selectSize = (next: number) => {
    setResultPage(0);
    setSizeIndex(next);
  };
  const renderRow = (row: ResultRow, index: number) => {
    if (row.type === "manual") return <a className="listing-row manual-row" href={row.url} target="_blank" rel={row.name === "eBay" ? "noopener noreferrer" : "sponsored noopener noreferrer"} key={row.name}><span className="listing-rank">M{index + 1}</span><span className="listing-image manual-image" aria-hidden="true">↗</span><span className="listing-info"><strong>{row.name}</strong><span>{row.status ?? "Affiliate feed not connected"}</span></span><span className="listing-badge">{row.name === "eBay" ? "Check search" : "Search manually"}</span><span className="listing-price">—</span><span className="listing-arrow">↗</span></a>;
    const listing = row.listing;
    const originalPrice = formatMoney(listing.price, listing.currency);
    const cadPrice = listing.cadPrice == null ? "CAD unavailable" : `(${formatMoney(listing.cadPrice, "CAD")})`;
    const thumbnailUrl = listing.imageUrl ? `/api/image?url=${encodeURIComponent(listing.imageUrl)}` : "";
    return <a className="listing-row" href={listing.url} target="_blank" rel="noopener noreferrer" key={`${listing.marketplace}-${listing.url}`}><span className="listing-rank">{String(resultPage * pageSize + index + 1).padStart(2, "0")}</span><span className="listing-image">{thumbnailUrl ? <Image src={thumbnailUrl} alt={`${listing.marketplace} listing: ${listing.title}`} fill sizes="72px" loading="lazy" /> : <span aria-hidden="true" />}</span><span className="listing-info"><strong>{listing.marketplace}</strong><span>{listing.title}</span></span><span className="listing-badge">{listing.sourceType === "api" ? "Live API" : "Live scan"}</span><span className="listing-price">{originalPrice} <small>{cadPrice}</small></span><span className="listing-arrow">↗</span></a>;
  };

  return <>
    <IntroScene />
    <main className="site-shell">
    <nav className="topbar"><a className="wordmark" href="#top" aria-label="Gat Scan home"><span className="wordmark-mark" aria-hidden="true"><i /></span>GAT SCAN</a><div className="nav-links"><a href="#how-it-works">How it works</a><a href="#dashboard">Dashboard</a></div></nav>
    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><span className="eyebrow-line" /> PRICE SCAN / 01</p><h1>Find the pair.<br /><em>Keep the change.</em></h1><p className="hero-intro">Gat Scan checks credible listings for the Maison Margiela Replica GAT, so you can compare the right shoe at the right price.</p><a className="primary-button" href="#dashboard">Start a scan <span>↓</span></a><p className="hero-note">Choose a size and condition. Results refresh after a short scan.</p></div><div className="hero-art"><Image className="hero-photo" src="/images/gat-reference.png" alt="Brown Maison Margiela Replica GAT sneaker" fill sizes="(max-width: 760px) 100vw, 54vw" preload unoptimized /></div></section>
    <section className="watch-section" id="dashboard"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> YOUR FINDER</p><h2>Set the parameters.</h2></div><p className="section-aside">We scan after your selection settles<br />and bring the best find to you.</p></div><div className="preferences-grid"><div className="preference-block"><div className="label-row"><span>Condition</span><span className="step">01 / 02</span></div><div className="condition-toggle" role="group" aria-label="Condition">{(["new", "used", "either"] as const).map((item) => <button key={item} type="button" className={condition === item ? "selected" : ""} onClick={() => selectCondition(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div><div className="preference-block size-block"><div className="label-row"><span>Size <small>IT / US M</small></span><span className="step">02 / 02</span></div><div className="size-display"><strong>IT {sizeIT}</strong><span>·</span><strong>US {sizeUS}</strong></div><select className="size-select" value={String(sizeIndex)} onInput={(event) => selectSize(Number(event.currentTarget.value))} onChange={(event) => selectSize(Number(event.currentTarget.value))} aria-label="Choose Italian and US men's shoe size">{sizes.map(([italian, american], index) => <option value={String(index)} key={`${italian}-${american}`}>IT {italian} / US {american}</option>)}</select><p className="size-note">Selected: IT {sizeIT} / US {sizeUS} · 15 choices</p></div></div></section>
    <section className="results-section" id="results"><div className="results-topline"><div><p className="eyebrow"><span className="eyebrow-line" /> MARKET RESULTS / {condition.toUpperCase()}</p><h2>{isLoading ? "Scanning the market." : "Cheapest today."}</h2></div><div className="price-lockup"><span>from</span><strong>{lowestPrice ? `${liveListings[0].currency} ${lowestPrice}` : "—"}</strong></div></div>{error && <p className="scan-error">{error}</p>}{!isLoading && !unavailable.has("eBay") && liveListings.every((listing) => listing.marketplace !== "eBay") && <p className="source-note">eBay live API checked · no verified listing matched this size and condition.</p>}<div className="listings-list">{isLoading && <div className="scan-status">Checking eBay and some luxury retailers for IT {sizeIT} / US {sizeUS}...</div>}{!isLoading && visibleRows.map(renderRow)}{!isLoading && resultRows.length === 0 && <div className="scan-status">No verified live listings found for this selection.</div>}</div>{!isLoading && pageCount > 1 && <div className="pagination" aria-label="Marketplace result pages"><button type="button" onClick={() => setResultPage((page) => Math.max(0, page - 1))} disabled={resultPage === 0}>Previous</button><span>{resultPage * pageSize + 1}–{Math.min((resultPage + 1) * pageSize, resultRows.length)} of {resultRows.length}</span><button type="button" onClick={() => setResultPage((page) => Math.min(pageCount - 1, page + 1))} disabled={resultPage === pageCount - 1}>Next</button></div>}<div className="results-footer"><span>{isLoading ? "Scan in progress" : `${liveListings.length} verified listings · ${manualSources.filter(([name]) => unavailable.has(name)).length} manual searches`}</span><span>{scan.scannedAt ? `Checked ${new Date(scan.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for scan"} <i /></span></div></section>
    <section className="how-section" id="how-it-works"><p className="eyebrow"><span className="eyebrow-line" /> HOW IT WORKS</p><h2>A clearer route to the right pair.</h2><div className="how-grid"><p><strong>01 / eBay</strong><br />We check eBay through its official Browse API when credentials are configured, returning live listing prices and direct product pages. We also check other sites like Cettire through similiar means.</p><p><strong>02 / Grailed</strong><br />Grailed is checked through a scheduled server-side scan. It is best effort and pauses when the marketplace presents a bot challenge.</p><p><strong>03 / Retail</strong><br />Farfetch, SSENSE, Mytheresa, Cettire, MR PORTER, and END. are labeled <em>Search manually</em> until affiliate product feeds are approved. No prices are invented.</p><p><strong>04 / Refresh</strong><br />Results refresh automatically after you stop moving the size slider or change condition. A short delay lets the scan finish.</p></div></section>
    <footer><span className="wordmark"><span className="wordmark-mark" aria-hidden="true"><i /></span>GAT SCAN</span><span>GAT SCAN 2026</span><span className="footer-disclosure">Some links are affiliate links · we may earn a commission at no extra cost to you</span><span className="footer-links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></span></footer>
    </main>
  </>;
}
