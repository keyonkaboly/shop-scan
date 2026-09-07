import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions — Gat Scan",
  description: "The terms that apply to using the Gat Scan price finder.",
};

export default function Terms() {
  return <main className="legal-page">
    <Link className="legal-back" href="/">← Gat Scan</Link>
    <h1>Terms &amp; Conditions</h1>
    <p className="legal-updated">Last updated: September 2026</p>

    <p>By using Gat Scan you agree to the following. If you don&rsquo;t agree, please don&rsquo;t use the site.</p>

    <h2>What this site is</h2>
    <p>Gat Scan is a search and price-comparison tool for one product, the Maison Margiela Replica GAT. We do not sell anything ourselves, hold inventory, process payments, or take orders. Every purchase happens on a third party&rsquo;s site, under that site&rsquo;s own terms.</p>

    <h2>No warranty on listings</h2>
    <p>Prices, sizes, condition, and availability shown on Gat Scan are sourced live from third parties (eBay, Grailed, and retail partners) and can change or be wrong by the time you click through. We don&rsquo;t guarantee accuracy, and a listing appearing here is not a guarantee it is genuine, in stock, or correctly priced on the retailer&rsquo;s site.</p>

    <h2>Acceptable use</h2>
    <p>Don&rsquo;t scrape, rate-limit-abuse, or attempt to disrupt Gat Scan&rsquo;s servers or the third-party APIs it relies on.</p>

    <h2>Limitation of liability</h2>
    <p>Gat Scan is provided &ldquo;as is&rdquo;, without warranty of any kind. We are not liable for any loss arising from a purchase made on a third-party site, or from relying on price or availability information shown here.</p>

    <h2>Changes</h2>
    <p>We may update these terms as the site changes. Continued use after an update means you accept the revised terms.</p>

    <h2>Governing law</h2>
    <p><span className="legal-placeholder">[confirm your governing jurisdiction here]</span>.</p>

    <h2>Contact</h2>
    <p><span className="legal-placeholder">keyonkaboly@gmail.com</span>.</p>
  </main>;
}
