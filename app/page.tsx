"use client";

import { useEffect, useState } from "react";
import { cettireSearchUrl, endClothingSearchUrl, farfetchSearchUrl, mrPorterSearchUrl, mytheresaSearchUrl, ssenseSearchUrl } from "@/lib/search-links";

const sizes = [
  [38, 5], [38.5, 5.5], [39, 6], [39.5, 6.5], [40, 7], [40.5, 7.5],
  [41, 8], [41.5, 8.5], [42, 9], [42.5, 9.5], [43, 10], [43.5, 10.5],
  [44, 11], [44.5, 11.5], [45, 12],
] as const;

type Condition = "new" | "used" | "either";
type Listing = { marketplace: string; title: string; price: number; currency: string; condition: "new" | "used" | "unknown"; sizeUS: number | null; sizeIT: number | null; url: string; imageUrl: string | null; sourceType: "api" | "scrape" | "affiliate-feed" | "search-link-only" };
type ScanResponse = { listings: Listing[]; unavailableSources: string[]; scannedAt: string };

const manualSources = [
  ["Farfetch", farfetchSearchUrl()], ["SSENSE", ssenseSearchUrl()], ["Mytheresa", mytheresaSearchUrl()],
  ["Cettire", cettireSearchUrl()], ["MR PORTER", mrPorterSearchUrl()], ["END.", endClothingSearchUrl()],
] as const;

export default function Home() {
  const [condition, setCondition] = useState<Condition>("either");
  const [sizeIndex, setSizeIndex] = useState(8);
  const [scan, setScan] = useState<ScanResponse>({ listings: [], unavailableSources: ["eBay", "Grailed", ...manualSources.map(([name]) => name)], scannedAt: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const size = sizes[sizeIndex];
  const unavailable = new Set(scan.unavailableSources);
  const liveListings = scan.listings;
  const lowestPrice = liveListings.length ? liveListings[0].price : null;
  const emailBody = [...liveListings.map((listing) => `${listing.marketplace} · ${listing.condition} · IT ${listing.sizeIT ?? size[0]} / US ${listing.sizeUS ?? size[1]} · ${listing.currency} ${listing.price}\n${listing.url}`), ...manualSources.filter(([name]) => unavailable.has(name)).map(([name, url]) => `${name} · Search manually\n${url}`)].join("\n\n");
  const emailHref = `mailto:?subject=${encodeURIComponent(`Margiela Finder results · IT ${size[0]} / US ${size[1]}`)}&body=${encodeURIComponent(`Margiela Finder results for IT ${size[0]} / US ${size[1]} · ${condition}\n\n${emailBody}`)}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/scan?sizeIT=${size[0]}&condition=${condition}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Scan request failed");
        setScan(await response.json() as ScanResponse);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError("The scan could not complete. Manual search links are still available.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [condition, size]);

  return (
    <main className="site-shell">
      <nav className="topbar"><a className="wordmark" href="#top" aria-label="Margiela Finder home"><span className="wordmark-mark" aria-hidden="true"><i /></span>MARGIELA FINDER</a><div className="nav-links"><a href="#how-it-works">How it works</a><a href="#dashboard">Dashboard</a></div></nav>
      <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><span className="eyebrow-line" /> PRICE SCAN / 01</p><h1>Find the pair.<br /><em>Keep the change.</em></h1><p className="hero-intro">Margiela Finder checks credible listings for the Maison Margiela Replica GAT, so you can compare the right shoe at the right price.</p><a className="primary-button" href="#dashboard">Start a scan <span>↓</span></a><p className="hero-note">Choose a size and condition. Results refresh after a short scan.</p></div><div className="hero-art" role="img" aria-label="Margiela Finder product scan visualization"><div className="hero-photo" role="img" aria-label="Maison Margiela Replica GAT product photograph" /><div className="art-tag">GAT<br /><span>FINDER 01</span></div><div className="art-caption">Replica / GAT<br /><span>German Army Trainer</span></div><div className="art-index">01 <span>/ 04</span></div></div></section>
      <section className="watch-section" id="dashboard"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> YOUR FINDER</p><h2>Set the parameters.</h2></div><p className="section-aside">We scan after your selection settles<br />and bring the best find to you.</p></div><div className="preferences-grid"><div className="preference-block"><div className="label-row"><span>Condition</span><span className="step">01 / 02</span></div><div className="condition-toggle" role="group" aria-label="Condition">{(["new", "used", "either"] as const).map((item) => <button key={item} type="button" className={condition === item ? "selected" : ""} onClick={() => setCondition(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div><div className="preference-block size-block"><div className="label-row"><span>Size <small>IT / US M</small></span><span className="step">02 / 02</span></div><div className="size-display"><strong>IT {size[0]}</strong><span>·</span><strong>US {size[1]}</strong></div><input className="size-range" type="range" min="0" max={sizes.length - 1} value={sizeIndex} onChange={(event) => setSizeIndex(Number(event.target.value))} aria-label="Italian and US men's shoe size" /><div className="range-labels"><span>US 5</span><span>US 7</span><span>US 9</span><span>US 10</span><span>US 12</span></div><p className="size-note">15 half-size steps · US 5 through US 12</p></div></div></section>
      <section className="results-section" id="results"><div className="results-topline"><div><p className="eyebrow"><span className="eyebrow-line" /> MARKET RESULTS / {condition.toUpperCase()}</p><h2>{isLoading ? "Scanning the market." : "Cheapest today."}</h2></div><div className="price-lockup"><span>from</span><strong>{lowestPrice ? `${liveListings[0].currency} ${lowestPrice}` : "—"}</strong></div></div>{error && <p className="scan-error">{error}</p>}<div className="listings-list">{isLoading && <div className="scan-status">Checking eBay and Grailed for IT {size[0]} / US {size[1]}...</div>}{!isLoading && liveListings.map((listing, index) => <a className="listing-row" href={listing.url} target="_blank" rel="noopener noreferrer" key={`${listing.marketplace}-${listing.url}`}><span className="listing-rank">{String(index + 1).padStart(2, "0")}</span><span className="listing-image" aria-hidden="true"><span /></span><span className="listing-info"><strong>{listing.marketplace}</strong><span>{listing.title}</span></span><span className="listing-badge">{listing.sourceType === "api" ? "Live API" : "Live scan"}</span><span className="listing-price">{listing.currency} {listing.price}</span><span className="listing-arrow">↗</span></a>)}{!isLoading && liveListings.length === 0 && <div className="scan-status">No verified live listings found for this selection.</div>}{!isLoading && manualSources.filter(([name]) => unavailable.has(name)).map(([name, url], index) => <a className="listing-row manual-row" href={url} target="_blank" rel="noopener noreferrer" key={name}><span className="listing-rank">M{String(index + 1).padStart(2, "0")}</span><span className="listing-image manual-image" aria-hidden="true">↗</span><span className="listing-info"><strong>{name}</strong><span>Affiliate feed not connected</span></span><span className="listing-badge">Search manually</span><span className="listing-price">—</span><span className="listing-arrow">↗</span></a>)}</div><div className="results-footer"><span>{isLoading ? "Scan in progress" : `${liveListings.length} verified listings · ${manualSources.filter(([name]) => unavailable.has(name)).length} manual searches`}</span><span>{scan.scannedAt ? `Checked ${new Date(scan.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for scan"} <i /></span><a className="email-button" href={emailHref}>Email these links <span>↗</span></a></div></section>
      <section className="how-section" id="how-it-works"><p className="eyebrow"><span className="eyebrow-line" /> HOW IT WORKS</p><h2>A clearer route to the right pair.</h2><div className="how-grid"><p><strong>01 / eBay</strong><br />We check eBay through its official Browse API when credentials are configured, returning live listing prices and direct product pages.</p><p><strong>02 / Grailed</strong><br />Grailed is checked through a scheduled server-side scan. It is best effort and pauses when the marketplace presents a bot challenge.</p><p><strong>03 / Retail</strong><br />Farfetch, SSENSE, Mytheresa, Cettire, MR PORTER, and END. are labeled <em>Search manually</em> until affiliate product feeds are approved. No prices are invented.</p><p><strong>04 / Refresh</strong><br />Results refresh automatically after you stop moving the size slider or change condition. A short delay lets the scan finish.</p></div></section>
      <footer><span className="wordmark"><span className="wordmark-mark" aria-hidden="true"><i /></span>MARGIELA FINDER</span><span>MAISON MARGIELA REPLICA GAT / 2026</span><span>Built for the considered purchase.</span></footer>
    </main>
  );
}
