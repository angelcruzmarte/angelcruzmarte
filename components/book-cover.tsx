"use client"

import { useState } from "react"
import type { Book } from "@/lib/db/schema"

export type CoverBook = Pick<
  Book,
  "title" | "author" | "coverColor" | "accentColor" | "coverImageUrl"
>

// Every stored cover is the full-size Open Library "-L" JPEG (often 500-1000px,
// 50-200KB) — far larger than the ~130px cards that render them. Downloading
// and decoding hundreds of oversized images is what makes scrolling the catalog
// freeze. Rewrite the URL to the size the card actually needs:
//   -S ≈ small thumb, -M ≈ ~180px (perfect for cards), -L ≈ full.
// Only Open Library URLs follow this scheme; anything else is left untouched.
function sizedCoverUrl(
  url: string | null | undefined,
  size: "S" | "M" | "L",
): string | null {
  if (!url) return null
  return url.replace(
    /(covers\.openlibrary\.org\/b\/(?:id|olid|isbn)\/[^/]+)-[SML]\.jpg/i,
    `$1-${size}.jpg`,
  )
}

// Pick a readable foreground (dark vs light) for an arbitrary hex background so
// the branded placeholder always meets contrast, whatever palette a book got.
function readableInk(hex: string | null | undefined): {
  fg: string
  sub: string
  shadow: string
} {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim())
  if (m) {
    const int = Number.parseInt(m[1], 16)
    const r = (int >> 16) & 255
    const g = (int >> 8) & 255
    const b = int & 255
    // Perceived luminance (sRGB weights).
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    if (lum > 0.6) {
      return {
        fg: "rgba(15,23,42,0.92)",
        sub: "rgba(15,23,42,0.65)",
        shadow: "none",
      }
    }
  }
  return {
    fg: "rgba(255,255,255,0.96)",
    sub: "rgba(255,255,255,0.75)",
    shadow: "0 1px 2px rgba(0,0,0,0.35)",
  }
}

/** Clean, on-brand placeholder used when no real cover art is available (or a
 *  real cover URL fails to load at runtime). */
function BrandedCard({
  book,
  className,
}: {
  book: CoverBook
  className: string
}) {
  const ink = readableInk(book.coverColor)
  return (
    <div
      className={`relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-lg p-3 shadow-md ${className}`}
      style={{ backgroundColor: book.coverColor || "#1f2937" }}
    >
      {/* Subtle spine + accent so the card reads as a book, not a color swatch. */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: book.accentColor, opacity: 0.6 }}
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <span
          className="h-1.5 w-8 rounded-full"
          style={{ backgroundColor: book.accentColor }}
          aria-hidden
        />
        <span
          className="text-[0.6rem] font-semibold uppercase tracking-widest"
          style={{ color: ink.sub }}
          aria-hidden
        >
          VOXYFI
        </span>
      </div>
      <div>
        <p
          className="line-clamp-4 text-pretty text-[0.95rem] font-bold leading-tight"
          style={{ color: ink.fg, textShadow: ink.shadow }}
        >
          {book.title}
        </p>
        <p
          className="mt-1 line-clamp-1 text-[0.7rem] font-medium uppercase tracking-wide"
          style={{ color: ink.sub }}
        >
          {book.author}
        </p>
      </div>
    </div>
  )
}

export function BookCover({
  book,
  className = "",
  size = "M",
}: {
  book: CoverBook
  className?: string
  // Which Open Library size variant to request. Default "M" (~180px) suits the
  // small cards/rows that dominate the app; pass "L" only for large views like
  // the admin lightbox.
  size?: "S" | "M" | "L"
}) {
  const [failed, setFailed] = useState(false)
  const src = sizedCoverUrl(book.coverImageUrl, size)

  // Prefer real cover art; if it fails to load, gracefully fall back to the
  // branded card instead of showing a broken image.
  if (src && !failed) {
    return (
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-lg shadow-md ${className}`}
        style={{ backgroundColor: book.coverColor }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Cover of ${book.title} by ${book.author}`}
          loading="lazy"
          // Decode off the main thread and de-prioritize network so a shelf's
          // ~dozen covers arriving mid-scroll don't block scrolling.
          decoding="async"
          fetchPriority="low"
          crossOrigin="anonymous"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return <BrandedCard book={book} className={className} />
}
