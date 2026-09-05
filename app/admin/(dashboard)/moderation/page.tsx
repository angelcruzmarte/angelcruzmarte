import {
  queryModerationLog,
  queryReports,
} from "@/app/actions/admin-moderation"
import { AdminModeration } from "@/components/admin-moderation"

export const dynamic = "force-dynamic"

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const status = first(sp.status) ?? "all"

  const [{ rows, counts }, log] = await Promise.all([
    queryReports({ status }),
    queryModerationLog(),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        Review reported user-generated content (book reviews). Change a
        report&apos;s status, hide objectionable content, and restrict or
        suspend offending accounts. Every action is recorded in the audit trail
        below. Only admins can view this page.
      </p>
      <div className="mt-8">
        <AdminModeration
          reports={rows}
          counts={counts}
          activeStatus={status}
          log={log}
        />
      </div>
    </div>
  )
}
