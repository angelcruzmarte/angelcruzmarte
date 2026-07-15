export default function BooksLoading() {
  return (
    <div className="px-4 py-6 sm:px-6">
      {/* Header row: title + cart */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-secondary" />
          <div className="h-4 w-56 animate-pulse rounded bg-secondary" />
        </div>
        <div className="h-11 w-16 animate-pulse rounded-full bg-secondary" />
      </div>

      {/* Search bar */}
      <div className="mt-4 h-14 w-full animate-pulse rounded-2xl bg-secondary" />

      {/* Filter chips */}
      <div className="mt-4 flex gap-2">
        <div className="h-9 w-24 animate-pulse rounded-full bg-secondary" />
        <div className="h-9 w-28 animate-pulse rounded-full bg-secondary" />
      </div>

      {/* A few shelf skeletons */}
      <div className="mt-8 space-y-8">
        {[0, 1, 2].map((shelf) => (
          <div key={shelf}>
            <div className="mb-3 h-5 w-48 animate-pulse rounded bg-secondary" />
            <div className="flex gap-4 overflow-hidden">
              {[0, 1, 2, 3, 4].map((card) => (
                <div key={card} className="w-32 shrink-0 sm:w-36">
                  <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-secondary" />
                  <div className="mt-2 h-4 w-full animate-pulse rounded bg-secondary" />
                  <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-secondary" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading the book store…</span>
    </div>
  )
}
