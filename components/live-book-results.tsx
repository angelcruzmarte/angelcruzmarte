"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import useSWRInfinite from "swr/infinite"
import {
  BookOpen,
  ExternalLink,
  Headphones,
  Loader2,
  ShoppingCart,
} from "lucide-react"
import { createGutenbergCheckout } from "@/app/actions/books"
import { formatPrice } from "@/lib/plans"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Flat price for imported public-domain books (mirrors the server value).
const IMPORTED_PRICE = 499

type StoreResult = {
  key: string
  title: string
  author: string
  year: number | null
  coverUrl: string | null
  gutenbergId: number | null
  listenable: boolean
  buyUrl: string
}

type SearchPage = {
  results: StoreResult[]
  page: number
  hasMore: boolean
}

const fetcher = (url: string): Promise<SearchPage> =>
  fetch(url).then((r) => r.json())

export function LiveBookResults({ query }: { query: string }) {
  const getKey = (index: number, prev: SearchPage | null) => {
    if (prev && !prev.hasMore) return null
    return `/api/store/search?q=${encodeURIComponent(query)}&page=${index + 1}`
  }

  const { data, size, setSize, isLoading, isValidating } =
    useSWRInfinite<SearchPage>(getKey, fetcher, {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    })

  // Flatten pages and de-duplicate works that appear more than once.
  const results = useMemo(() => {
    const seen = new Set<string>()
    const out: StoreResult[] = []
    for (const page of data ?? []) {
      for (const r of page?.results ?? []) {
        if (seen.has(r.key)) continue
        seen.add(r.key)
        out.push(r)
      }
    }
    return out
  }, [data])

  const hasMore = data ? Boolean(data[data.length - 1]?.hasMore) : false
  const loadingMore = isValidating && (data?.length ?? 0) > 0

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isValidating) {
          setSize((s) => s + 1)
        }
      },
      { rootMargin: "600px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isValidating, setSize])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="aspect-[2/3] animate-pulse rounded-lg bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
        <BookOpen className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">No books found for &ldquo;{query}&rdquo;</p>
        <p className="text-sm text-muted-foreground">
          Try a different title, author, or keyword.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {results.map((r) => (
          <LiveBookCard key={r.key} result={r} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-8" />

      {loadingMore && (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {!hasMore && results.length > 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          That&apos;s everything for &ldquo;{query}&rdquo;.
        </p>
      )}
    </div>
  )
}

function LiveBookCard({ result }: { result: StoreResult }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleBuy() {
    if (!result.gutenbergId) return
    setError(null)
    startTransition(async () => {
      const res = await createGutenbergCheckout(result.gutenbergId as number, {
        title: result.title,
        author: result.author,
        coverUrl: result.coverUrl,
      })
      if (res && "url" in res && res.url) {
        window.location.href = res.url
      } else {
        setError(
          (res && "error" in res && res.error) || "Something went wrong.",
        )
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <LiveCover result={result} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{result.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {result.author}
          {result.year ? ` · ${result.year}` : ""}
        </p>
      </div>

      {result.listenable ? (
        <Button
          size="sm"
          className="gap-1.5"
          onClick={handleBuy}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="h-4 w-4" />
          )}
          Buy {formatPrice(IMPORTED_PRICE)}
        </Button>
      ) : (
        <a
          href={result.buyUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ size: "sm", variant: "secondary" }),
            "gap-1.5",
          )}
        >
          <ExternalLink className="h-4 w-4" />
          View
        </a>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function LiveCover({ result }: { result: StoreResult }) {
  const [broken, setBroken] = useState(false)
  const showImage = result.coverUrl && !broken

  return (
    <div className="relative">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.coverUrl as string}
          alt={`Cover of ${result.title}`}
          loading="lazy"
          onError={() => setBroken(true)}
          className="aspect-[2/3] w-full rounded-lg object-cover shadow-md"
        />
      ) : (
        <div className="flex aspect-[2/3] w-full flex-col justify-between rounded-lg bg-secondary p-3 shadow-md">
          <BookOpen className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-pretty text-sm font-bold leading-tight">
            {result.title}
          </p>
        </div>
      )}
      <span
        className={cn(
          "absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm",
          result.listenable
            ? "bg-primary text-primary-foreground"
            : "bg-card/90 text-muted-foreground backdrop-blur",
        )}
      >
        {result.listenable ? (
          <>
            <Headphones className="h-3 w-3" />
            Listen
          </>
        ) : (
          "Buy elsewhere"
        )}
      </span>
    </div>
  )
}
