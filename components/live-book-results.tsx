"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWRInfinite from "swr/infinite"
import {
  BookOpen,
  Headphones,
  Loader2,
  Play,
  ShoppingCart,
  Upload,
} from "lucide-react"
import { addGutenbergBook } from "@/app/actions/books"
import { Button } from "@/components/ui/button"
import { trackAffiliateClick } from "@/lib/affiliate-track"
import {
  AffiliateBuyNote,
  AffiliateDisclosure,
} from "@/components/affiliate-disclosure"

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

      {/* Amazon Associates disclosure — kept clear and conspicuous near the
          "Buy on Amazon" links, as required by the program + FTC. */}
      <AffiliateDisclosure className="border-t border-border/60 pt-4 text-center" />
    </div>
  )
}

function LiveBookCard({ result }: { result: StoreResult }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Public domain: add to the library for free and open the player.
  function handleAddAndListen() {
    if (!result.gutenbergId) return
    setError(null)
    startTransition(async () => {
      const res = await addGutenbergBook(result.gutenbergId as number, {
        title: result.title,
        author: result.author,
        coverUrl: result.coverUrl,
      })
      if (res && "bookId" in res && res.bookId) {
        router.push(`/app/listen/book/${res.bookId}`)
      } else {
        setError(
          (res && "error" in res && res.error) || "Something went wrong.",
        )
      }
    })
  }

  // Copyrighted: after buying elsewhere, import the file the user owns so it
  // can be narrated in the app.
  async function handleImportFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      setError("File is too large. Please use a file under 15MB.")
      return
    }
    setImporting(true)
    setError(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body,
      })
      const data = (await res.json()) as { id?: number; error?: string }
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not process that file.")
        setImporting(false)
        return
      }
      router.push(`/app/listen/${data.id}`)
    } catch {
      setError("Upload failed. Please try again.")
      setImporting(false)
    }
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
          onClick={handleAddAndListen}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Add &amp; Listen
        </Button>
      ) : (
        <BuyControls
          buyUrl={result.buyUrl}
          title={result.title}
          author={result.author}
          importing={importing}
          onImport={() => fileRef.current?.click()}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,.docx,.epub,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleImportFile(file)
        }}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function BuyControls({
  buyUrl,
  title,
  author,
  importing,
  onImport,
}: {
  buyUrl: string
  title: string
  author: string
  importing: boolean
  onImport: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* One-tap buy on Amazon (Associate-tagged). Fires a click beacon before
          the new tab opens, and marks the link rel=sponsored for compliance. */}
      <Button
        size="sm"
        variant="secondary"
        className="w-full gap-1.5"
        disabled={importing}
        render={
          <a
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer sponsored nofollow"
            onClick={() => trackAffiliateClick({ title, author })}
          />
        }
      >
        {importing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShoppingCart className="h-4 w-4" />
        )}
        {importing ? "Importing…" : "Buy on Amazon"}
      </Button>
      <AffiliateBuyNote />
      <button
        type="button"
        onClick={onImport}
        disabled={importing}
        className="flex items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Upload className="h-3 w-3" />
        Already own it? Import file
      </button>
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
      {result.listenable && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm">
          <Headphones className="h-3 w-3" />
          Listen
        </span>
      )}
    </div>
  )
}
