"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import {
  BookMarked,
  BookOpen,
  Check,
  Headphones,
  Loader2,
  Play,
  Plus,
  ShoppingCart,
} from "lucide-react"
import { BookCover, type CoverBook } from "@/components/book-cover"
import { browserAmazonLink } from "@/lib/affiliate"
import { languageLabel } from "@/lib/languages"
import { formatPrice } from "@/lib/plans"
import { cn } from "@/lib/utils"

/**
 * A single, premium book card used across the whole store — native (Stripe)
 * titles, Amazon affiliate titles, Project Gutenberg public-domain titles, and
 * any future provider. The visual shell (cover, favorite, badge, title,
 * author + language) is identical for every provider; only the primary
 * `action` changes (Add / Buy on Amazon / Read free / Listen / Sample /
 * Borrow). This is what makes an affiliate card look and feel exactly as
 * polished as a native VOXYFI card.
 */

// A curated set of on-brand cover palettes (bg + accent) used to give books
// with no real artwork a distinct, attractive branded placeholder instead of a
// generic gray box. Deterministic per-title so a book always looks the same.
const COVER_PALETTES: Array<{ coverColor: string; accentColor: string }> = [
  { coverColor: "#1f3a2e", accentColor: "#8fd6b4" },
  { coverColor: "#2f3e9e", accentColor: "#f4b740" },
  { coverColor: "#7c2d12", accentColor: "#fbbf24" },
  { coverColor: "#134e4a", accentColor: "#5eead4" },
  { coverColor: "#3b2f63", accentColor: "#f0abfc" },
  { coverColor: "#831843", accentColor: "#fda4af" },
  { coverColor: "#1e3a5f", accentColor: "#7dd3fc" },
  { coverColor: "#3f2d1c", accentColor: "#fcd34d" },
]

/** Stable palette for a title, so provider results get a consistent branded
 *  cover fallback even without stored `coverColor`/`accentColor`. */
export function paletteForTitle(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length]
}

/** Builds a CoverBook (for `BookCover`) from partial provider data, filling in
 *  a deterministic branded palette when real colors are missing. */
export function coverFrom(input: {
  title: string
  author: string | null
  coverImageUrl?: string | null
  coverColor?: string | null
  accentColor?: string | null
}): CoverBook {
  const pal = paletteForTitle(input.title || "book")
  return {
    title: input.title,
    author: input.author ?? "",
    coverImageUrl: input.coverImageUrl ?? null,
    coverColor: input.coverColor || pal.coverColor,
    accentColor: input.accentColor || pal.accentColor,
  }
}

export type BookCardBadge =
  | { kind: "owned" }
  | { kind: "price"; priceInCents: number }
  | { kind: "free" }
  | { kind: "listen" }
  | { kind: "sample" }
  // Purchase format for affiliate titles, e.g. "Kindle eBook".
  | { kind: "format"; label: string }
  | null

export type BookCardAction =
  // Owned title → open the full in-app listen experience.
  | { kind: "listen"; href: string }
  // Affiliate catalog title → free in-app sample (detail page).
  | { kind: "sample"; href: string }
  // Native purchasable title → add to / remove from cart.
  | {
      kind: "add"
      priceInCents: number
      inCart: boolean
      onAdd: () => void
      onRemove: () => void
    }
  // Public-domain (Project Gutenberg) → add to library & listen for free.
  | { kind: "read-free"; onClick: () => void; pending?: boolean }
  // Commercial title → buy on Amazon (affiliate out-link).
  | {
      kind: "buy"
      href: string
      label?: string
      pending?: boolean
      onClick?: () => void
    }
  // Future provider (e.g. library loan).
  | { kind: "borrow"; href: string }

// Shared button shell — one source of truth for size, radius, typography, and
// touch target so every action across the store looks identical.
const ACTION_BASE =
  "flex h-9 w-full items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
const ACTION_PRIMARY =
  "bg-primary text-primary-foreground hover:bg-primary/90"
const ACTION_SECONDARY =
  "bg-secondary text-secondary-foreground hover:bg-secondary/80"
const ACTION_OUTLINE_PRIMARY =
  "border border-primary bg-primary/10 text-primary hover:bg-primary/15"

function ActionButton({ action }: { action: BookCardAction }) {
  switch (action.kind) {
    case "listen":
      return (
        <Link href={action.href} className={cn(ACTION_BASE, ACTION_SECONDARY)}>
          <Headphones className="h-3.5 w-3.5" />
          Listen
        </Link>
      )
    case "sample":
      return (
        <Link href={action.href} className={cn(ACTION_BASE, ACTION_SECONDARY)}>
          <Headphones className="h-3.5 w-3.5" />
          Sample
        </Link>
      )
    case "read-free":
      return (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.pending}
          className={cn(ACTION_BASE, ACTION_PRIMARY, "disabled:opacity-70")}
        >
          {action.pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Read free
        </button>
      )
    case "buy":
      return (
        <a
          href={browserAmazonLink(action.href)}
          target="_blank"
          rel="noopener noreferrer sponsored nofollow"
          onClick={action.onClick}
          aria-disabled={action.pending}
          className={cn(ACTION_BASE, ACTION_SECONDARY)}
        >
          {action.pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShoppingCart className="h-3.5 w-3.5" />
          )}
          {action.label ?? "Buy on Amazon"}
        </a>
      )
    case "borrow":
      return (
        <Link href={action.href} className={cn(ACTION_BASE, ACTION_SECONDARY)}>
          <BookMarked className="h-3.5 w-3.5" />
          Borrow
        </Link>
      )
    case "add":
      return action.inCart ? (
        <button
          type="button"
          onClick={action.onRemove}
          className={cn(ACTION_BASE, ACTION_OUTLINE_PRIMARY)}
        >
          <Check className="h-3.5 w-3.5" />
          In cart
        </button>
      ) : (
        <button
          type="button"
          onClick={action.onAdd}
          className={cn(ACTION_BASE, ACTION_PRIMARY)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add · {formatPrice(action.priceInCents)}
        </button>
      )
  }
}

function Badge({ badge }: { badge: BookCardBadge }) {
  if (!badge) return null
  const base =
    "absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm"
  switch (badge.kind) {
    case "owned":
      return (
        <span className={cn(base, "bg-primary text-primary-foreground")}>
          Owned
        </span>
      )
    case "free":
      return (
        <span className={cn(base, "bg-primary text-primary-foreground")}>
          Free
        </span>
      )
    case "listen":
      return (
        <span className={cn(base, "bg-primary text-primary-foreground")}>
          <Headphones className="h-3 w-3" />
          Listen
        </span>
      )
    case "sample":
      return (
        <span
          className={cn(base, "bg-card/90 text-foreground backdrop-blur")}
        >
          Sample
        </span>
      )
    case "price":
      return (
        <span
          className={cn(base, "bg-card/90 text-foreground backdrop-blur")}
        >
          {formatPrice(badge.priceInCents)}
        </span>
      )
    case "format":
      return (
        <span
          className={cn(base, "bg-card/90 text-foreground backdrop-blur")}
        >
          <BookOpen className="h-3 w-3" />
          {badge.label}
        </span>
      )
  }
}

export function BookCard({
  cover,
  title,
  author,
  language,
  href,
  badge = null,
  favorite,
  action,
  footer,
  error,
  className,
}: {
  cover: CoverBook
  title: string
  author: string | null
  language?: string | null
  /** Detail-page link. When omitted (live-only results) the cover/title are
   *  not links. */
  href?: string
  badge?: BookCardBadge
  /** Optional favorite control (only catalog books can be favorited). */
  favorite?: ReactNode
  action: BookCardAction
  /** Optional secondary content under the action (e.g. affiliate note, import). */
  footer?: ReactNode
  error?: string | null
  className?: string
}) {
  const showLangChip = language && language !== "en"
  const CoverInner = (
    <BookCover
      book={cover}
      className="w-full shadow-md transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-lg"
    />
  )

  return (
    <div className={cn("group flex flex-col gap-2.5", className)}>
      <div className="relative">
        {href ? (
          <Link href={href} aria-label={title} className="block">
            {CoverInner}
          </Link>
        ) : (
          CoverInner
        )}
        {favorite && (
          <div className="absolute left-2 top-2">{favorite}</div>
        )}
        <Badge badge={badge} />
      </div>

      <div className="min-w-0">
        {href ? (
          <Link href={href} className="block min-w-0">
            <p className="truncate text-sm font-semibold leading-snug">
              {title}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {showLangChip && (
                <span className="inline-flex shrink-0 items-center rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-secondary-foreground">
                  {languageLabel(language!)}
                </span>
              )}
              <span className="truncate">{author || "Unknown author"}</span>
            </p>
          </Link>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-snug">
              {title}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {showLangChip && (
                <span className="inline-flex shrink-0 items-center rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-secondary-foreground">
                  {languageLabel(language!)}
                </span>
              )}
              <span className="truncate">{author || "Unknown author"}</span>
            </p>
          </div>
        )}
      </div>

      <ActionButton action={action} />
      {footer}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
