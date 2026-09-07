import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Gat Scan",
  description: "How Gat Scan handles data, cookies, and third-party affiliate links.",
};

export default function PrivacyPolicy() {
  return <main className="legal-page">
    <Link className="legal-back" href="/">← Gat Scan</Link>
    <h1>Privacy Policy</h1>
    <p className="legal-updated">Last updated: September 2026</p>

    <p>Gat Scan (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a price-comparison tool for the Maison Margiela Replica GAT. This page explains what we collect and why.</p>

    <h2>What we collect</h2>
    <p>Gat Scan has no accounts and no sign-up. When you use the size and condition selectors, your browser sends that selection to our server so we can run a live search — it is not stored or logged against you. We do not collect names, emails, or payment details on this site.</p>

    <h2>Cookies and local storage</h2>
    <p>We use your browser&rsquo;s local storage only to remember that you dismissed the cookie notice. We do not set first-party tracking or advertising cookies ourselves. If you click through to a retailer (eBay, Grailed, Farfetch, SSENSE, Mytheresa, Cettire, MR PORTER, END., or others), that retailer or its affiliate network may set its own cookie to attribute the visit — that is governed by their privacy policy, not ours.</p>

    <h2>Affiliate disclosure</h2>
    <p>Some outbound links on Gat Scan are, or will become, affiliate links. If you follow one and make a purchase, we may earn a commission at no extra cost to you. This never affects which listing we show first — ranking is based on live price only.</p>

    <h2>Third-party data sources</h2>
    <p>Listing data is fetched live from eBay&rsquo;s Browse API and, best-effort, from Grailed. Listing thumbnails are proxied through our own server from eBay/Grailed image hosts so your browser never contacts those hosts directly. Currency conversion uses a third-party exchange-rate provider.</p>

    <h2>Analytics</h2>
    <p>We do not currently run any analytics or advertising tracking on this site. If that changes, this page will be updated first.</p>

    <h2>Contact</h2>
    <p>Questions about this policy: <span className="legal-placeholder">keyonkaboly@gmail.com</span>.</p>
  </main>;
}
