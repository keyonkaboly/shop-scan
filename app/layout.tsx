import type { Metadata } from "next";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import { getBaseUrl } from "@/lib/site";

const title = "Gat Scan — Find your dream pair.";
const description = "Real-time market scan for Maison Margiela Replica GAT sneakers across eBay, Grailed, and top luxury retailers.";

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
  return <html lang="en"><body>{children}<CookieConsent /></body></html>;
}
