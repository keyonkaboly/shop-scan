import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
