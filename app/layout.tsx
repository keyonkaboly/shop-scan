import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { getBaseUrl } from "@/lib/site";

// SSENSE's own UI runs on Inter; its editorial headlines use a thin
// Times-style serif, which Newsreader's light weights stand in for.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", style: ["normal", "italic"] });

const title = "Gat Scan — Find the pair for you.";
const description = "Real-time market scan for Maison Margiela Replica GAT sneakers across eBay, Grailed, SSENSE, Cettire, Mytheresa and END.";

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: title, template: "%s · Gat Scan" },
  description,
  applicationName: "Gat Scan",
  openGraph: { title, description, siteName: "Gat Scan", type: "website" },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className={`${sans.variable} ${serif.variable}`}><body>{children}</body></html>;
}
