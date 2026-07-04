import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Admin-only top-level paths that map onto the /admin/* route tree when served
// from the admin subdomain (so URLs stay clean, e.g. admin.voxyfi.com/finance).
const ADMIN_SECTIONS = ["/finance", "/content", "/subscribers"]

function isInternal(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  )
}

export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? ""
  const hostname = host.split(":")[0]
  const { pathname } = req.nextUrl
  const onAdminHost = hostname.startsWith("admin.")

  // On the admin subdomain, serve the /admin route tree at the root.
  if (onAdminHost) {
    if (isInternal(pathname) || pathname.startsWith("/admin")) {
      return NextResponse.next()
    }
    const url = req.nextUrl.clone()
    url.pathname = pathname === "/" ? "/admin" : `/admin${pathname}`
    return NextResponse.rewrite(url)
  }

  // In production, keep the admin panel off the primary domain: bounce any
  // /admin* request over to the admin subdomain with a clean path.
  if (
    process.env.VERCEL_ENV === "production" &&
    (pathname === "/admin" || pathname.startsWith("/admin/"))
  ) {
    const root = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(
      /^https?:\/\//,
      "",
    )
    if (root) {
      const target = req.nextUrl.clone()
      target.host = `admin.${root}`
      target.protocol = "https"
      target.port = ""
      target.pathname = pathname.replace(/^\/admin/, "") || "/"
      return NextResponse.redirect(target)
    }
  }

  // In dev/preview there is no subdomain, so let the clean admin section paths
  // resolve to the /admin route tree for local testing.
  if (
    process.env.VERCEL_ENV !== "production" &&
    ADMIN_SECTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const url = req.nextUrl.clone()
    url.pathname = `/admin${pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
