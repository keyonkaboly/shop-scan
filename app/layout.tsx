import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gat Scan — Find your dream pair.",
  description: "Real-time market scan for Maison Margiela Replica GAT sneakers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body>{children}</body></html>;
}
