"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowLeft, ChevronLeft, ChevronRight, Globe } from "lucide-react"
import {
  BookCard,
  type BookCardAction,
  type BookCardBadge,
  coverFrom,
} from "@/components/store/book-card"
import { FavoriteButton } from "@/components/favorite-button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCart } from "@/components/cart-provider"
import { usePlatform } from "@/hooks/use-platform"
import { languageLabel } from "@/lib/languages"
import { cn } from "@/lib/utils"
import type { GenrePage } from "@/app/actions/books"
import type { BookCard as BookCardData } from "@/lib/db/schema"

function toCartItem(b: BookCardData) {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    priceInCents: b.priceInCents,
    coverColor: b.coverColor,
    accentColor: b.accentColor,
    coverImageUrl: b.coverImageUrl,
  }
}

// Card wrapper mirroring the storefront's StoreBookCard so a genre page book
// behaves identically (owned → Listen, affiliate → Sample, native → Add).
function GenreCard({
  book,
  owned,
  favorited,
}: {
  book: BookCardData
  owned: boolean
  favorited: boolean
}) {
  const { has, add, remove } = useCart()
  const { isIOS } = usePlatform()
  const inCart = has(book.id)
  const isAffiliate = book.fulfillment === "affiliate"
  const gateNative = isIOS && !owned && !isAffiliate

  const badge: BookCardBadge = owned
    ? { kind: "owned" }
    : isAffiliate
      ? { kind: "sample" }
      : gateNative
        ? null
        : { kind: "price", priceInCents: book.priceInCents }

  const action: BookCardAction = owned
    ? { kind: "listen", href: `/app/listen/book/${book.id}` }
    : isAffiliate
      ? { kind: "sample", href: `/app/books/${book.id}` }
      : gateNative
        ? { kind: "web-only" }
        : {
            kind: "add",
            priceInCents: book.priceInCents,
            inCart,
            onAdd: () => add(toCartItem(book)),
            onRemove: () => remove(book.id),
          }

  return (
    <BookCard
      cover={coverFrom(book)}
      title={book.title}
      author={book.author}
      language={book.language}
      href={`/app/books/${book.id}`}
      badge={badge}
      favorite={
        <FavoriteButton
          bookId={book.id}
          initialFavorited={favorited}
          size="sm"
          className="h-8 w-8 bg-card/90 shadow-sm backdrop-blur hover:bg-card"
        />
      }
      action={action}
    />
  )
}

// Scoped language menu (same UX as the store's), navigating on selection.
function GenreLanguageMenu({
  languages,
  value,
  onChange,
}: {
  languages: Array<{ code: string; count: number }>
  value: string
  onChange: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const activeLabel = value === "all" ? "All languages" : languageLabel(value)
  const isDefault = value === "all"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Language: ${activeLabel}. Change language`}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
              isDefault
                ? "border-border bg-card hover:bg-secondary"
                : "border-primary bg-primary text-primary-foreground",
            )}
          />
        }
      >
        <Globe className="h-4 w-4" />
        <span className="max-w-[7rem] truncate">{activeLabel}</span>
        <ChevronRight className="h-3.5 w-3.5 rotate-90 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-0 p-1">
        <ul className="max-h-72 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange("all")
                setOpen(false)
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                value === "all" && "font-semibold text-primary",
              )}
            >
              All languages
            </button>
          </li>
          {languages.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                onClick={() => {
                  onChange(l.code)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                  value === l.code && "font-semibold text-primary",
                )}
              >
                <span className="truncate">{languageLabel(l.code)}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {l.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// Builds a compact page-number list with ellipses for large ranges.
function pageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const items: (number | "…")[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) items.push("…")
  for (let i = start; i <= end; i++) items.push(i)
  if (end < total - 1) items.push("…")
  items.push(total)
  return items
}

export function GenreBrowser({
  slug,
  data,
  languages,
  ownedIds,
  favoriteIds,
}: {
  slug: string
  data: GenrePage
  languages: Array<{ code: string; count: number }>
  ownedIds: number[]
  favoriteIds: number[]
}) {
  const router = useRouter()
  const owned = useMemo(() => new Set(ownedIds), [ownedIds])
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds])

  // Navigate by URL so pagination + language filter are shareable and the
  // server fetches only the requested page.
  function go(next: { page?: number; language?: string }) {
    const page = next.page ?? data.page
    const language = next.language ?? data.language
    const params = new URLSearchParams()
    if (page > 1) params.set("page", String(page))
    if (language && language !== "all") params.set("lang", language)
    const qs = params.toString()
    router.push(`/app/books/genre/${slug}${qs ? `?${qs}` : ""}`)
  }

  const from = (data.page - 1) * data.pageSize + 1
  const to = Math.min(data.total, data.page * data.pageSize)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/app/books"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All books
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-balance">
              {data.category}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.total.toLocaleString()}{" "}
              {data.total === 1 ? "book" : "books"}
              {data.language !== "all" && (
                <> · {languageLabel(data.language)}</>
              )}
            </p>
          </div>
          {languages.length > 1 && (
            <GenreLanguageMenu
              languages={languages}
              value={data.language}
              onChange={(language) => go({ language, page: 1 })}
            />
          )}
        </div>
      </div>

      {data.books.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-4 py-10 text-center text-sm text-muted-foreground">
          No books found in this genre for the selected language.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
            {data.books.map((book) => (
              <GenreCard
                key={book.id}
                book={book}
                owned={owned.has(book.id)}
                favorited={favorites.has(book.id)}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Showing {from.toLocaleString()}–{to.toLocaleString()} of{" "}
              {data.total.toLocaleString()}
            </p>
            {data.totalPages > 1 && (
              <nav
                aria-label="Genre pages"
                className="flex items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => go({ page: data.page - 1 })}
                  disabled={data.page <= 1}
                  aria-label="Previous page"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageItems(data.page, data.totalPages).map((it, i) =>
                  it === "…" ? (
                    <span
                      key={`gap-${i}`}
                      className="px-1 text-sm text-muted-foreground"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={it}
                      type="button"
                      onClick={() => go({ page: it })}
                      aria-current={it === data.page ? "page" : undefined}
                      className={cn(
                        "flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-semibold transition-colors",
                        it === data.page
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground hover:bg-secondary",
                      )}
                    >
                      {it}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => go({ page: data.page + 1 })}
                  disabled={data.page >= data.totalPages}
                  aria-label="Next page"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  )
}
