"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  EyeOff,
  FileWarning,
  Hash,
  ImageOff,
  Library,
  Link2,
  Loader2,
  PackageX,
  Plus,
  RefreshCw,
  ShoppingBag,
} from "lucide-react"
import {
  checkBookLinks,
  importBooksNow,
  type CatalogStats,
} from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type ActiveFilter = { availability: string; link: string }

// A summary card. `filter` is the query it applies; `tone` picks the accent.
type StatCard = {
  key: string
  label: string
  count: number
  icon: typeof BookOpen
  filter: { availability?: string; link?: string }
  tone: "default" | "primary" | "warn" | "muted"
}

function formatWhen(d: Date | null): string {
  if (!d) return "Never"
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return "Never"
  const diffMs = Date.now() - date.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function AdminBooksDashboard({
  stats,
  active,
}: {
  stats: CatalogStats
  active: ActiveFilter
}) {
  const router = useRouter()
  const [checking, startCheck] = useTransition()
  const [importing, startImport] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [batch, setBatch] = useState(100)

  const a = stats.byAvailability

  const cards: StatCard[] = [
    {
      key: "total",
      label: "Total books",
      count: stats.total,
      icon: Library,
      filter: {},
      tone: "default",
    },
    {
      key: "available",
      label: "Available",
      count: a.available ?? 0,
      icon: CheckCircle2,
      filter: { availability: "available" },
      tone: "primary",
    },
    {
      key: "affiliate_only",
      label: "Affiliate only",
      count: a.affiliate_only ?? 0,
      icon: ShoppingBag,
      filter: { availability: "affiliate_only" },
      tone: "primary",
    },
    {
      key: "out_of_stock",
      label: "Out of stock",
      count: a.out_of_stock ?? 0,
      icon: PackageX,
      filter: { availability: "out_of_stock" },
      tone: "warn",
    },
    {
      key: "coming_soon",
      label: "Coming soon",
      count: a.coming_soon ?? 0,
      icon: CalendarClock,
      filter: { availability: "coming_soon" },
      tone: "muted",
    },
    {
      key: "hidden",
      label: "Hidden",
      count: a.hidden ?? 0,
      icon: EyeOff,
      filter: { availability: "hidden" },
      tone: "muted",
    },
    {
      key: "review",
      label: "Links need review",
      count: stats.linksNeedingReview,
      icon: Link2,
      filter: { link: "review" },
      tone: "warn",
    },
  ]

  function isActive(card: StatCard): boolean {
    if (card.key === "total") {
      return active.availability === "all" && active.link === "all"
    }
    if (card.filter.link) return active.link === card.filter.link
    return (
      active.availability === card.filter.availability && active.link === "all"
    )
  }

  function applyCard(card: StatCard) {
    // Clicking the active card clears back to the full catalog.
    if (isActive(card) && card.key !== "total") {
      router.push("/admin/books")
      return
    }
    const params = new URLSearchParams()
    if (card.filter.availability) params.set("availability", card.filter.availability)
    if (card.filter.link) params.set("link", card.filter.link)
    const qs = params.toString()
    router.push(qs ? `/admin/books?${qs}` : "/admin/books")
  }

  function runLinkCheck() {
    setNote(null)
    startCheck(async () => {
      const res = await checkBookLinks()
      setNote(
        `Checked ${res.checked} affiliate links: ${res.ok} OK, ${res.broken} broken, ${res.unknown} need review.`,
      )
      router.refresh()
    })
  }

  function runImport() {
    setImportNote(null)
    startImport(async () => {
      const res = await importBooksNow(batch)
      if (!res.ok) {
        setImportNote(`Import failed: ${res.error}`)
        return
      }
      if (res.added === 0) {
        setImportNote(
          res.candidates === 0
            ? "No new titles available to import right now."
            : `Reviewed ${res.candidates} candidates, but none passed the quality check.`,
        )
      } else {
        const breakdown = Object.entries(res.byLanguage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([lang, n]) => `${lang}:${n}`)
          .join(", ")
        setImportNote(
          `Added ${res.added} new title${res.added === 1 ? "" : "s"}${
            breakdown ? ` (${breakdown})` : ""
          }.`,
        )
      }
      router.refresh()
    })
  }

  const toneClasses: Record<StatCard["tone"], string> = {
    default: "text-foreground",
    primary: "text-primary",
    warn: "text-destructive",
    muted: "text-muted-foreground",
  }

  // Warning banner rows — only render the ones with a non-zero count.
  const warnings = [
    {
      key: "broken",
      count: stats.brokenLinks,
      label: "broken affiliate links",
      icon: Link2,
      href: "/admin/books?link=broken",
    },
    {
      key: "cover",
      count: stats.missingCover,
      label: "missing cover images",
      icon: ImageOff,
      href: null,
    },
    {
      key: "isbn",
      count: stats.missingIsbn,
      label: "missing ISBNs",
      icon: Hash,
      href: null,
    },
    {
      key: "meta",
      count: stats.incompleteMetadata,
      label: "incomplete metadata",
      icon: FileWarning,
      href: null,
    },
  ].filter((w) => w.count > 0)

  return (
    <section aria-label="Catalog health" className="flex flex-col gap-4">
      {/* Header row: title + last check + run button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden />
          <span>
            Last link check:{" "}
            <span className="font-medium text-foreground">
              {formatWhen(stats.lastLinkCheck)}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {note && (
            <span className="text-xs text-muted-foreground">{note}</span>
          )}
          {importNote && (
            <span className="text-xs text-muted-foreground">{importNote}</span>
          )}
          <div className="flex items-center gap-1.5">
            <label htmlFor="import-batch" className="sr-only">
              Number of books to import
            </label>
            <select
              id="import-batch"
              value={batch}
              onChange={(e) => setBatch(Number(e.target.value))}
              disabled={importing}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value={50}>50 books</option>
              <option value={100}>100 books</option>
              <option value={150}>150 books</option>
            </select>
            <Button
              type="button"
              size="sm"
              onClick={runImport}
              disabled={importing}
              className="gap-1.5"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              {importing ? "Importing…" : "Import now"}
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runLinkCheck}
            disabled={checking}
            className="gap-1.5"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Run link check
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {cards.map((card) => {
          const Icon = card.icon
          const activeCard = isActive(card)
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => applyCard(card)}
              aria-pressed={activeCard}
              className={`group rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeCard ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </span>
                <Icon
                  className={`h-4 w-4 ${toneClasses[card.tone]}`}
                  aria-hidden
                />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {card.count.toLocaleString()}
              </div>
            </button>
          )
        })}
      </div>

      {/* Warning banner */}
      {warnings.length > 0 && (
        <Card className="flex flex-col gap-3 border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Catalog needs attention
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {warnings.map((w) => {
                  const Icon = w.icon
                  const inner = (
                    <>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      <span className="tabular-nums">{w.count}</span>
                      <span>{w.label}</span>
                    </>
                  )
                  return w.href ? (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => router.push(w.href as string)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-background px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {inner}
                    </button>
                  ) : (
                    <Badge
                      key={w.key}
                      variant="outline"
                      className="gap-1.5 border-border bg-background px-2.5 py-1 font-medium text-muted-foreground"
                    >
                      {inner}
                    </Badge>
                  )
                })}
              </div>
            </div>
          </div>
          {stats.brokenLinks > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runLinkCheck}
              disabled={checking}
              className="shrink-0 gap-1.5"
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Recheck links
            </Button>
          )}
        </Card>
      )}
    </section>
  )
}
