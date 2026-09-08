import type { NextConfig } from "next";

// Next.js's own app-router hydration relies on inline <script> tags with no
// nonce wired up here, so script-src needs 'unsafe-inline' to avoid breaking
// the site — a nonce-based CSP would close that gap but needs middleware
// support this app doesn't have yet. Everything else here is a real,
// meaningful restriction: no third-party scripts/frames/embeds, no
// cross-origin fetch/XHR targets beyond this origin.
// 'unsafe-eval' is added in development only — React's dev-mode debugging
// tools use eval() to reconstruct stack traces, but React never uses eval()
// in a production build, so the stricter policy ships to Vercel.
const scriptSrc = process.env.NODE_ENV === "production" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The SSENSE adapter connects to a remote Browserless.io browser via
  // playwright-core (no local Chromium binary needed in production). It's on
  // Next.js's auto-external list, but Turbopack's production trace was still
  // missing its non-JS asset files (e.g. browsers.json) from the deployed
  // function — forcing its full contents into the /api/scan trace fixes that.
  outputFileTracingIncludes: {
    "/api/scan": ["./node_modules/playwright-core/**/*"],
  },
  images: {
    // /api/image?url=... proxies remote thumbnails; the route itself already
    // restricts `url` to an allowlisted set of image hosts, so the query
    // string is left open here rather than pinned to one exact value.
    localPatterns: [
      { pathname: "/api/image" },
      { pathname: "/images/gat-reference.png" },
    ],
  },
};

export default nextConfig;
