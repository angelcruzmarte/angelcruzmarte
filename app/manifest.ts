import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "VOXYFI — Listen to anything",
    short_name: "VOXYFI",
    description:
      "VOXYFI turns any text into natural-sounding speech with word-by-word highlighting, adjustable speed, and multiple voices.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en",
    dir: "ltr",
    categories: ["books", "education", "productivity", "entertainment"],
    background_color: "#f5f2ea",
    theme_color: "#176b43",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    screenshots: [
      {
        src: "/screenshots/mobile-1.png",
        sizes: "1080x2337",
        type: "image/png",
        form_factor: "narrow",
        label: "Turn reading into listening with VOXYFI",
      },
      {
        src: "/screenshots/mobile-2.png",
        sizes: "1080x2337",
        type: "image/png",
        form_factor: "narrow",
        label: "Simple, premium pricing",
      },
      {
        src: "/screenshots/desktop-1.png",
        sizes: "1920x1200",
        type: "image/png",
        form_factor: "wide",
        label: "Listen to anything, anywhere",
      },
    ],
  }
}
