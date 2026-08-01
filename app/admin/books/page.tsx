import {
  getCatalogStats,
  listBookCategories,
  queryCatalogBooks,
  type CatalogSort,
} from "@/app/actions/admin"
import { AdminBooks } from "@/components/admin-books"
import { AdminBooksDashboard } from "@/components/admin-books-dashboard"
import { isAvailability } from "@/lib/book-availability"

export const dynamic = "force-dynamic"

const SORT_KEYS: CatalogSort[] = [
  "title",
  "author",
  "isbn",
  "source",
  "category",
  "availability",
  "status",
  "updated",
  "created",
]

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function AdminBooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  const q = first(sp.q)?.trim() || ""
  const sourceRaw = first(sp.source)
  const source =
    sourceRaw === "in_app" || sourceRaw === "affiliate" ? sourceRaw : "all"
  const statusRaw = first(sp.status)
  const status =
    statusRaw === "published" || statusRaw === "hidden" ? statusRaw : "all"
  const availRaw = first(sp.availability)
  const availability =
    availRaw && isAvailability(availRaw) ? availRaw : "all"
  const linkRaw = first(sp.link)
  const link = linkRaw === "broken" || linkRaw === "review" ? linkRaw : "all"
  const sortRaw = first(sp.sort) as CatalogSort | undefined
  const sort = sortRaw && SORT_KEYS.includes(sortRaw) ? sortRaw : "updated"
  const dir = first(sp.dir) === "asc" ? "asc" : "desc"
  const page = Math.max(1, Number(first(sp.page)) || 1)
  const pageSize = Number(first(sp.pageSize)) || 50

  const [result, categories, stats] = await Promise.all([
    queryCatalogBooks({
      q,
      source,
      status,
      availability,
      link,
      sort,
      dir,
      page,
      pageSize,
    }),
    listBookCategories(),
    getCatalogStats(),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Book catalog</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        Manage every title in the store. VOXYFI titles are sold and listened to
        in-app; Amazon titles offer a free in-app sample and buy through our
        affiliate link. Broken affiliate links are detected automatically and
        flagged for review.
      </p>
      <div className="mt-8">
        <AdminBooksDashboard
          stats={stats}
          active={{ availability, link }}
        />
      </div>
      <div className="mt-8">
        <AdminBooks
          result={result}
          categories={categories}
          query={{ q, source, status, availability, sort, dir }}
        />
      </div>
    </div>
  )
}
