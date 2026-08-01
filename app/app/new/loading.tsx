// Skeleton shown while the Add Content route loads, mirroring its layout so the
// transition feels instant and stable (no layout shift when content arrives).
export default function NewLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" aria-hidden="true">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[92px] animate-pulse rounded-2xl border border-border bg-muted/60"
          />
        ))}
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-12 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="space-y-1.5">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        </div>
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
