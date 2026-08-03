import { type NextRequest, NextResponse } from "next/server"
import { isAllowedAmazonUrl } from "@/lib/affiliate"

// Same-origin → Amazon website redirect.
//
// Keeping the FIRST hop on our own domain means the tap is never intercepted by
// the Amazon app (iOS Universal Link / Android App Link). This route then issues
// a server-side 302 to the real Amazon URL, which browsers follow WITHOUT
// handing off to the app — so the tagged Amazon website opens in the user's
// default browser on iPhone, Android, Safari, Chrome, and inside the App Store
// wrapper. The affiliate `tag` in `u` is passed through untouched, and we never
// emit an amazon:// deep link.
//
// The destination is host-allowlisted to supported Amazon marketplaces to
// prevent this endpoint from being abused as an open redirect. Click tracking is
// intentionally left to the existing /api/store/affiliate-click beacon so
// affiliate reporting is unchanged.
export const dynamic = "force-dynamic"

export function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("u") ?? ""

  // Never redirect to an untrusted destination.
  if (!isAllowedAmazonUrl(target)) {
    return NextResponse.redirect(new URL("/app/books", req.nextUrl.origin), 302)
  }

  const res = NextResponse.redirect(target, 302)
  // Redirects are per-URL unique but must never be cached as a permanent hop.
  res.headers.set("Cache-Control", "no-store")
  return res
}
