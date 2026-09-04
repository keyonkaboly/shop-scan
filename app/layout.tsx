import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Margiela Finder — Find the pair. Keep the change.",
  description: "A daily market scan for Maison Margiela Replica GAT sneakers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body>{children}</body></html>;
}
