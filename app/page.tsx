"use client";

import { useState } from "react";

const sizes = [
  [38, "5"], [38.5, "5.5"], [39, "6"], [39.5, "6.5"],
  [40, "7"], [40.5, "7.5"], [41, "8"], [41.5, "8.5"],
  [42, "9"], [42.5, "9.5"], [43, "10 / 10.5"], [43.5, "10.5 / 11"],
  [44, "11 / 11.5"], [44.5, "11.5 / 12"], [45, "12"],
] as const;

const marketplaceListings = [
  { shop: "eBay", amount: 298, condition: "New", time: "12 min ago", badge: "Best price", url: "https://www.ebay.com/sch/i.html?_nkw=maison+margiela+replica+gat" },
  { shop: "Grailed", amount: 324, condition: "Used", time: "41 min ago", badge: "Verified seller", url: "https://www.grailed.com/shop?query=maison%20margiela%20replica%20gat" },
  { shop: "Farfetch", amount: 390, condition: "New", time: "2 hrs ago", badge: "Authenticity guarantee", url: "https://www.farfetch.com/shopping/men/search/items.aspx?query=maison%20margiela%20replica%20gat" },
  { shop: "Cettire", amount: 410, condition: "New", time: "3 hrs ago", badge: "Retailer listing", url: "https://www.cettire.com/search?q=maison%20margiela%20replica%20gat" },
  { shop: "MR PORTER", amount: 425, condition: "New", time: "4 hrs ago", badge: "Retailer listing", url: "https://www.mrporter.com/en-us/search?q=maison%20margiela%20replica%20gat" },
  { shop: "SSENSE", amount: 430, condition: "New", time: "5 hrs ago", badge: "Retailer listing", url: "https://www.ssense.com/en-us/men?q=maison%20margiela%20replica%20gat" },
  { shop: "END.", amount: 440, condition: "New", time: "6 hrs ago", badge: "Retailer listing", url: "https://www.endclothing.com/us/catalogsearch/result/?q=maison%20margiela%20replica%20gat" },
  { shop: "Mytheresa", amount: 450, condition: "New", time: "7 hrs ago", badge: "Retailer listing", url: "https://www.mytheresa.com/us/en/search?query=maison%20margiela%20replica%20gat" },
];

export default function Home() {
  const [condition, setCondition] = useState("Either");
  const [sizeIndex, setSizeIndex] = useState(8);
  const size = sizes[sizeIndex];
  const matchingListings = marketplaceListings.filter((listing) => condition === "Either" || listing.condition === condition);
  const lowestPrice = matchingListings.length ? Math.min(...matchingListings.map((listing) => listing.amount)) : null;
  const getListingUrl = (listing: (typeof marketplaceListings)[number]) => `${listing.url}&size=${encodeURIComponent(`US ${size[1]}`)}&condition=${encodeURIComponent(condition)}`;
  const emailBody = matchingListings.map((listing) => `${listing.shop} · ${listing.condition} · IT ${size[0]} / US ${size[1]} · $${listing.amount}\n${getListingUrl(listing)}`).join("\n\n");
  const emailHref = `mailto:?subject=${encodeURIComponent(`Margiela Finder results · IT ${size[0]} / US ${size[1]}`)}&body=${encodeURIComponent(`Margiela Finder marketplace results for IT ${size[0]} / US ${size[1]} · ${condition}\n\n${emailBody}`)}`;

  return (
    <main className="site-shell">
      <nav className="topbar">
        <a className="wordmark" href="#top" aria-label="Margiela Finder home">
          <span className="wordmark-mark" aria-hidden="true"><i /></span>MARGIELA FINDER
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#dashboard">Dashboard</a>
          <button className="nav-login" type="button">Log in <span>↗</span></button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> PRICE SCAN / 01</p>
          <h1>Find the pair.<br /><em>Keep the change.</em></h1>
          <p className="hero-intro">Margiela Finder tracks every credible listing of the Maison Margiela Replica GAT, so you only see the right shoe at the right price.</p>
          <a className="primary-button" href="#dashboard">Start a scan <span>↓</span></a>
          <p className="hero-note">One product. Every marketplace. Checked daily.</p>
        </div>
        <div className="hero-art" role="img" aria-label="Margiela Finder product scan visualization">
          <div className="hero-photo" role="img" aria-label="Maison Margiela Replica GAT product photograph" />
          <div className="art-tag">GAT<br /><span>FINDER 01</span></div>
          <div className="art-caption">Replica / GAT<br /><span>German Army Trainer</span></div>
          <div className="art-index">01 <span>/ 04</span></div>
        </div>
      </section>

      <section className="watch-section" id="dashboard">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> YOUR SCAN</p>
            <h2>Set the parameters.</h2>
          </div>
          <p className="section-aside">We&apos;ll scan the market every morning<br />and bring the best find to you.</p>
        </div>

        <div className="preferences-grid">
          <div className="preference-block">
            <div className="label-row"><span>Condition</span><span className="step">01 / 02</span></div>
            <div className="condition-toggle" role="group" aria-label="Condition">
              {["New", "Used", "Either"].map((item) => (
                <button key={item} type="button" className={condition === item ? "selected" : ""} onClick={() => setCondition(item)}>{item}</button>
              ))}
            </div>
          </div>

          <div className="preference-block size-block">
            <div className="label-row"><span>Size <small>IT / US</small></span><span className="step">02 / 02</span></div>
            <div className="size-display"><strong>IT {size[0]}</strong><span>·</span><strong>US {size[1]}</strong></div>
            <input className="size-range" type="range" min="0" max={sizes.length - 1} value={sizeIndex} onChange={(event) => setSizeIndex(Number(event.target.value))} aria-label="Italian and US shoe size" />
            <div className="range-labels"><span>US 5</span><span>US 7</span><span>US 9</span><span>US 10 / 10.5</span><span>US 12</span></div>
            <p className="size-note">15 half-size steps · US 5 through US 12</p>
          </div>
        </div>
      </section>

      <section className="results-section" id="how-it-works">
        <div className="results-topline"><div><p className="eyebrow"><span className="eyebrow-line" /> MARKET RESULTS / {condition.toUpperCase()}</p><h2>Cheapest today.</h2></div><div className="price-lockup"><span>from</span><strong>{lowestPrice ? `$${lowestPrice}` : "—"}</strong><span>USD</span></div></div>
        <div className="listings-list">
          {matchingListings.map((listing, index) => (
            <a className="listing-row" href={getListingUrl(listing)} target="_blank" rel="noopener noreferrer" key={listing.shop}>
              <span className="listing-rank">0{index + 1}</span>
              <span className="listing-image" aria-hidden="true"><span /></span>
              <span className="listing-info"><strong>{listing.shop}</strong><span>{listing.condition} · IT {size[0]}</span></span>
              <span className="listing-badge">{listing.badge}</span>
              <span className="listing-time">{listing.time}</span>
              <strong className="listing-price">${listing.amount}</strong><span className="listing-arrow">↗</span>
            </a>
          ))}
        </div>
        <div className="results-footer"><span>{matchingListings.length} listings matching your scan · demo data</span><span>API not connected <i /></span><a className="email-button" href={emailHref}>Email these links <span>↗</span></a></div>
      </section>

      <footer><span className="wordmark"><span className="wordmark-mark" aria-hidden="true"><i /></span>MARGIELA FINDER</span><span>MAISON MARGIELA REPLICA GAT / 2026</span><span>Built for the considered purchase.</span></footer>
    </main>
  );
}
