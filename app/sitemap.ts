import type { MetadataRoute } from "next"

const BASE_URL = "https://www.voxyfi.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  // Only genuinely public, indexable pages belong here. Auth and transactional
  // routes (/sign-in, /sign-up, /subscribe) are noindex and intentionally omitted.
  const routes = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/press", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/brand", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/legal/refund", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/legal/affiliate-disclosure", priority: 0.3, changeFrequency: "yearly" as const },
  ]

  return routes.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
