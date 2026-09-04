"use client";

import { useState } from "react";

const sizes = [
  [39, "6", "7.5"],
  [40, "7", "8.5"],
  [41, "8", "9.5"],
  [42, "9", "10.5"],
  [43, "10", "11.5"],
  [44, "11", "12.5"],
  [45, "12", "13.5"],
  [46, "13", "—"],
] as const;

const listings = [
  { shop: "eBay", price: "$298", detail: "New · IT 42", time: "12 min ago", badge: "Best price" },
  { shop: "Grailed", price: "$324", detail: "Used · IT 42", time: "41 min ago", badge: "Verified seller" },
  { shop: "Farfetch", price: "$390", detail: "New · IT 42", time: "2 hrs ago", badge: "Authenticity guarantee" },
];

export default function Home() {
  const [condition, setCondition] = useState("Either");
  const [sizeIndex, setSizeIndex] = useState(3);
  const size = sizes[sizeIndex];

  return (
    <main className="site-shell">
      <nav className="topbar">
        <a className="wordmark" href="#top" aria-label="GAT Watch home">
          <span className="wordmark-mark">G</span>AT WATCH
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#dashboard">Dashboard</a>
          <button className="nav-login" type="button">Log in <span>↗</span></button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> PRICE WATCH / 01</p>
          <h1>Find the pair.<br /><em>Keep the change.</em></h1>
          <p className="hero-intro">GAT Watch tracks every credible listing of the Maison Margiela Replica GAT, so you only see the right shoe at the right price.</p>
          <a className="primary-button" href="#dashboard">Set your watch <span>↓</span></a>
          <p className="hero-note">One product. Every marketplace. Checked daily.</p>
        </div>
        <div className="hero-art" role="img" aria-label="Maison Margiela GAT sneakers photographed on a concrete surface">
          <div className="art-tag">0—23<br /><span>MM</span></div>
          <div className="art-caption">Replica / GAT<br /><span>German Army Trainer</span></div>
          <div className="art-index">01 <span>/ 04</span></div>
        </div>
      </section>

      <section className="watch-section" id="dashboard">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> YOUR WATCH</p>
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
            <div className="label-row"><span>Size <small>IT / US M / US W</small></span><span className="step">02 / 02</span></div>
            <div className="size-display"><strong>IT {size[0]}</strong><span>·</span><strong>US {size[1]}</strong><span className="women-size">/ {size[2]}</span></div>
            <input className="size-range" type="range" min="0" max="7" value={sizeIndex} onChange={(event) => setSizeIndex(Number(event.target.value))} aria-label="Italian shoe size" />
            <div className="range-labels"><span>39</span><span>40</span><span>41</span><span>42</span><span>43</span><span>44</span><span>45</span><span>46</span></div>
          </div>
        </div>
      </section>

      <section className="results-section" id="how-it-works">
        <div className="results-topline"><div><p className="eyebrow"><span className="eyebrow-line" /> LIVE MARKET / {condition.toUpperCase()}</p><h2>Cheapest today.</h2></div><div className="price-lockup"><span>from</span><strong>$298</strong><span>USD</span></div></div>
        <div className="listings-list">
          {listings.map((listing, index) => (
            <a className="listing-row" href="#" key={listing.shop}>
              <span className="listing-rank">0{index + 1}</span>
              <span className="listing-image" aria-hidden="true"><span /></span>
              <span className="listing-info"><strong>{listing.shop}</strong><span>{listing.detail}</span></span>
              <span className="listing-badge">{listing.badge}</span>
              <span className="listing-time">{listing.time}</span>
              <strong className="listing-price">{listing.price}</strong><span className="listing-arrow">↗</span>
            </a>
          ))}
        </div>
        <div className="results-footer"><span>3 listings matching your watch</span><span>Last scan today at 06:00 UTC <i /></span></div>
      </section>

      <footer><span className="wordmark"><span className="wordmark-mark">G</span>AT WATCH</span><span>MAISON MARGIELA REPLICA GAT / 2026</span><span>Built for the considered purchase.</span></footer>
    </main>
  );
}
