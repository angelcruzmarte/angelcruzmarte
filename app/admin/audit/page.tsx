import Link from "next/link"
import { listAuditActors, queryAuditLog } from "@/app/actions/admin"
import { AdminAuditLog } from "@/components/admin-audit-log"

export const dynamic = "force-dynamic"

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  const q = (first(sp.q) ?? "").trim()
  const action = first(sp.action) ?? "all"
  const actor = first(sp.actor) ?? "all"
  const page = Math.max(1, Number(first(sp.page)) || 1)
  const pageSize = Number(first(sp.pageSize)) || 50

  const [result, actors] = await Promise.all([
    queryAuditLog({ q, action, actor, page, pageSize }),
    listAuditActors(),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        A read-only, append-only history of every change to the book catalog —
        who did what, when, and the before/after values. Search, filter, and
        export to CSV. Only admins can view this page.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Retention and automatic pruning are configured in{" "}
        <Link
          href="/settings"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Settings
        </Link>
        .
      </p>
      <div className="mt-8">
        <AdminAuditLog
          result={result}
          actors={actors}
          query={{ q, action, actor }}
        />
      </div>
    </div>
  )
}
