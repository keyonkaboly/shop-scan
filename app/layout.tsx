import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GAT Watch — Find the pair. Keep the change.",
  description: "A daily price watch for Maison Margiela Replica GAT sneakers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body>{children}</body></html>;
}
