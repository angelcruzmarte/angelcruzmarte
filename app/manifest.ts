import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VOXYFI — Listen to anything",
    short_name: "VOXYFI",
    description:
      "VOXYFI turns any text into natural-sounding speech with word-by-word highlighting, adjustable speed, and multiple voices.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fc",
    theme_color: "#4f5bf5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }
}
