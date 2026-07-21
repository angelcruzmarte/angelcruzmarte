import type { MetadataRoute } from "next"

const BASE_URL = "https://www.voxyfi.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/sign-up", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/sign-in", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/subscribe", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/legal/refund", priority: 0.3, changeFrequency: "yearly" as const },
  ]

  return routes.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
