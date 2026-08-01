import type { MetadataRoute } from "next"

const BASE_URL = "https://www.voxyfi.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private, authenticated, and transactional areas out of the index.
      disallow: ["/app/", "/admin/", "/api/", "/account/", "/onboarding/", "/reset-password/", "/verify-email/", "/offline"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
