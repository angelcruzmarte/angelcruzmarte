"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWRInfinite from "swr/infinite"
import { BookOpen, Loader2, Upload } from "lucide-react"
import { addGutenbergBook } from "@/app/actions/books"
import { trackAffiliateClick } from "@/lib/affiliate-track"
import {
  AffiliateBuyNote,
  AffiliateDisclosure,
} from "@/components/affiliate-disclosure"
import {
  BookCard,
  coverFrom,
  type BookCardAction,
} from "@/components/store/book-card"

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

export function LiveBookResults({
  query,
  language = "en",
}: {
  query: string
  /** The store's active language filter. Search results are restricted to this
   *  language so the filter is respected for live results too. "all" searches
   *  every language. */
  language?: string
}) {
  const getKey = (index: number, prev: SearchPage | null) => {
    if (prev && !prev.hasMore) return null
    const langParam =
      language && language !== "all" ? `&lang=${encodeURIComponent(language)}` : ""
    return `/api/store/search?q=${encodeURIComponent(query)}&page=${index + 1}${langParam}`
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
    return <ResultsSkeleton />
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center">
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
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

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className="aspect-[2/3] animate-pulse rounded-lg bg-secondary" />
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
          <div className="mt-0.5 h-9 w-full animate-pulse rounded-full bg-secondary" />
        </div>
      ))}
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

  // Copyrighted: after buying on Amazon, import a file the user owns so it can
  // be narrated in the app.
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
      const res = await fetch("/api/documents/upload", { method: "POST", body })
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

  const cover = coverFrom({
    title: result.title,
    author: result.author,
    coverImageUrl: result.coverUrl,
  })
  const authorLine = result.year
    ? `${result.author} · ${result.year}`
    : result.author

  const action: BookCardAction = result.listenable
    ? { kind: "read-free", onClick: handleAddAndListen, pending }
    : {
        kind: "buy",
        href: result.buyUrl,
        onClick: () =>
          trackAffiliateClick({ title: result.title, author: result.author }),
      }

  return (
    <BookCard
      cover={cover}
      title={result.title}
      author={authorLine}
      badge={result.listenable ? { kind: "listen" } : null}
      action={action}
      error={error}
      footer={
        result.listenable ? null : (
          <>
            <AffiliateBuyNote />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
            >
              {importing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Already own it? Import file
            </button>
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
          </>
        )
      }
    />
  )
}
