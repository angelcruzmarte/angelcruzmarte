import { getReviewQueue } from "@/app/actions/admin"
import { QUALITY_PUBLISH_THRESHOLD as QUALITY_THRESHOLD } from "@/lib/book-quality"
import { AdminReviewQueue } from "@/components/admin-review-queue"

export const dynamic = "force-dynamic"

export default async function AdminReviewPage() {
  const books = await getReviewQueue()

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Quality review queue</h1>
      <p className="mt-1 max-w-3xl text-pretty text-muted-foreground">
        Every imported book is scored on eight metadata signals before it can go
        live. Titles that fail a check, duplicate an existing entry, use a
        placeholder cover, or score below {QUALITY_THRESHOLD}/100 are held here.
        Correct and re-check them, approve them to the store, or delete them.
      </p>
      <div className="mt-8">
        <AdminReviewQueue books={books} threshold={QUALITY_THRESHOLD} />
      </div>
    </div>
  )
}
