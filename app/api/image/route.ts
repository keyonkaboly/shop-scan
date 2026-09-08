import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

const allowedHosts = new Set(["i.ebayimg.com", "media-assets.grailed.com", "img.ssensemedia.com"]);

export async function GET(request: NextRequest) {
  if (isRateLimited(clientIp(request), 120, 60_000)) {
    return new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  }
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return new NextResponse("Missing image URL", { status: 400 });

  let imageUrl: URL;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid image URL", { status: 400 });
  }

  if (imageUrl.protocol !== "https:" || !allowedHosts.has(imageUrl.hostname)) {
    return new NextResponse("Image host not allowed", { status: 403 });
  }

  const response = await fetch(imageUrl, { headers: { Accept: "image/avif,image/webp,image/jpeg,image/*" }, cache: "no-store" });
  if (!response.ok) return new NextResponse("Image unavailable", { status: response.status });

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
