"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Headphones,
  Heart,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
} from "lucide-react"

import { addGutenbergBook, toggleFavorite } from "@/app/actions/books"
import { ensureScannedBook, type ScanMatch } from "@/app/actions/scan-book"
import { AffiliateDisclosure } from "@/components/affiliate-disclosure"
import { Button } from "@/components/ui/button"
import { trackAffiliateClick } from "@/lib/affiliate-track"
import type { AmazonFormatLink } from "@/lib/affiliate"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

const FORMAT_ICON: Record<AmazonFormatLink["id"], typeof BookOpen> = {
  kindle: BookOpen,
  audible: Headphones,
  print: ShoppingCart,
}

function formatHint(f: AmazonFormatLink): string {
  if (f.id === "kindle")
    return f.exact ? "Read instantly on any device" : "Opens the Kindle Store on Amazon"
  if (f.id === "audible")
    return f.exact ? "Listen on Audible" : "Search Audible on Amazon"
  return f.exact ? "Ships from Amazon" : "See paperback & hardcover on Amazon"
}

/** Opens an external URL in a new tab (safe inside the preview iframe too). */
function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * Results of a successful book-cover scan. Adapts its actions to what the book
 * is: public-domain titles can be read & listened to for free in VOXYFI, while
 * commercial titles show a clear "not streamable" note plus Amazon buy links.
 * A real catalog row is only created the first time the user takes an action
 * that needs one (view details, wishlist, add to library, or shop).
 */
export function ScanResultSheet({
  match,
  onScanAgain,
}: {
  match: ScanMatch
  onScanAgain: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [favorited, setFavorited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFormats, setShowFormats] = useState(false)
  // Cache the created/known catalog id so repeat actions don't create dupes.
  const bookIdRef = useRef<number | null>(match.bookId)

  const ensure = useCallback(async (): Promise<number | null> => {
    if (bookIdRef.current) return bookIdRef.current
    const res = await ensureScannedBook({
      bookId: match.bookId,
      title: match.title,
      author: match.author,
      isbn: match.isbn,
      year: match.year,
      coverUrl: match.coverUrl,
      description: match.description,
      listenable: match.listenable,
      gutenbergId: match.gutenbergId,
      fulfillment: match.fulfillment,
    })
    if ("error" in res) {
      setError(res.error)
      return null
    }
    bookIdRef.current = res.bookId
    return res.bookId
  }, [match])

  async function withBusy(key: string, fn: () => Promise<void>) {
    setError(null)
    setPending(key)
    haptic("light")
    try {
      await fn()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setPending(null)
    }
  }

  function viewDetails() {
    void withBusy("details", async () => {
      const id = await ensure()
      if (id) router.push(`/app/books/${id}`)
    })
  }

  function addToLibrary() {
    void withBusy("library", async () => {
      if (match.gutenbergId) {
        const res = await addGutenbergBook(match.gutenbergId, {
          title: match.title,
          author: match.author,
        })
        if ("error" in res) {
          setError(res.error ?? "Could not add this book.")
          return
        }
        bookIdRef.current = res.bookId
        haptic("success")
        router.push(`/app/books/${res.bookId}`)
      }
    })
  }

  function wishlist() {
    void withBusy("wishlist", async () => {
      const id = await ensure()
      if (!id) return
      const res = await toggleFavorite(id)
      if ("error" in res) {
        setError(res.error ?? "Could not update your wishlist.")
        return
      }
      setFavorited(Boolean(res.favorited))
      haptic("success")
    })
  }

  function shop(format: AmazonFormatLink) {
    void withBusy(`shop-${format.id}`, async () => {
      // Create the row (for attribution) but don't block the click on failure.
      const id = await ensure()
      trackAffiliateClick({ bookId: id, title: match.title, author: match.author })
      openExternal(format.url)
    })
  }

  function importFile() {
    haptic("light")
    router.push("/app/new?mode=file")
  }

  const [primaryFormat, ...otherFormats] = match.amazonFormats
  const busy = pending !== null

  return (
    <div className="space-y-5">
      {/* Book header */}
      <div className="flex gap-4">
        <div className="w-24 shrink-0 sm:w-28">
          {match.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={match.coverUrl || "/placeholder.svg"}
              alt={`Cover of ${match.title}`}
              className="aspect-[2/3] w-full rounded-xl border border-border object-cover shadow-sm"
            />
          ) : (
            <div
              className="flex aspect-[2/3] w-full flex-col justify-end rounded-xl border border-border bg-primary p-2.5 text-primary-foreground shadow-sm"
              aria-hidden="true"
            >
              <span className="line-clamp-4 text-sm font-bold leading-tight">
                {match.title}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight text-balance">
            {match.title}
          </h2>
          <p className="mt-0.5 text-muted-foreground">{match.author}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {match.year && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {match.year}
              </span>
            )}
            {match.isbn && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                ISBN {match.isbn}
              </span>
            )}
            {match.inCatalog && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                <ShieldCheck className="h-3 w-3" />
                In VOXYFI
              </span>
            )}
          </div>

          {match.confidence === "low" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Not the right book? Try scanning again with better lighting.
            </p>
          )}
        </div>
      </div>

      {match.description && (
        <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground text-pretty">
          {match.description}
        </p>
      )}

      {/* Availability banner */}
      {match.listenable ? (
        <div className="flex items-start gap-2 rounded-xl bg-primary/10 px-3.5 py-3 text-sm text-primary">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This book is in the public domain — read &amp; listen to the full
            text free in VOXYFI.
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl bg-secondary px-3.5 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This is a copyrighted commercial title, so it can&apos;t be streamed
            in full inside VOXYFI. Get the full book on Amazon, or import your
            own EPUB/PDF if you own it.
          </span>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      {/* Primary actions */}
      <div className="space-y-2">
        {match.listenable ? (
          <Button
            onClick={addToLibrary}
            disabled={busy}
            size="lg"
            className="h-12 w-full gap-2"
          >
            {pending === "library" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Headphones className="h-4 w-4" />
            )}
            Add to Library &amp; Listen
          </Button>
        ) : (
          primaryFormat && (
            <Button
              onClick={() => shop(primaryFormat)}
              disabled={busy}
              size="lg"
              className="h-12 w-full gap-2"
            >
              {pending === `shop-${primaryFormat.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
              {primaryFormat.exact ? `Buy ${primaryFormat.label}` : "Shop Kindle Edition"}
            </Button>
          )
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={viewDetails}
            disabled={busy}
            variant="secondary"
            className="gap-2"
          >
            {pending === "details" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            View Details
          </Button>
          <Button
            onClick={wishlist}
            disabled={busy}
            variant="secondary"
            className="gap-2"
          >
            {pending === "wishlist" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Heart className={cn("h-4 w-4", favorited && "fill-current text-primary")} />
            )}
            {favorited ? "Wishlisted" : "Wishlist"}
          </Button>
        </div>

        <Button
          onClick={importFile}
          disabled={busy}
          variant="ghost"
          className="w-full gap-2 text-muted-foreground"
        >
          <FolderOpen className="h-4 w-4" />
          Have the file? Import EPUB/PDF
        </Button>
      </div>

      {/* Other Amazon formats (commercial titles) */}
      {!match.listenable && otherFormats.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowFormats((v) => !v)}
            aria-expanded={showFormats}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showFormats && "rotate-180")}
            />
            {showFormats ? "Hide other formats" : "View other formats"}
          </button>
          {showFormats && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {otherFormats.map((f) => {
                const Icon = FORMAT_ICON[f.id]
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => shop(f)}
                      disabled={busy}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-60"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{f.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatHint(f)}
                        </span>
                      </span>
                      {pending === `shop-${f.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {!match.listenable && (
        <div className="space-y-1">
          <span className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
            <Info className="h-3 w-3 shrink-0" aria-hidden />
            Paid affiliate link — you complete your purchase on Amazon.
          </span>
          <AffiliateDisclosure />
        </div>
      )}

      <Button
        onClick={onScanAgain}
        disabled={busy}
        variant="ghost"
        className="w-full gap-2"
      >
        <RotateCcw className="h-4 w-4" />
        Scan another book
      </Button>
    </div>
  )
}
