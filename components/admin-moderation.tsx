"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { EyeOff, Eye, Loader2 } from "lucide-react"
import {
  setReviewHidden,
  setUserStatus,
  updateReportStatus,
  type ModerationLogRow,
  type ModerationReport,
} from "@/app/actions/admin-moderation"
import {
  REPORT_STATUSES,
  reportReasonLabel,
  type ReportStatus,
} from "@/lib/moderation"
import { cn } from "@/lib/utils"

const STATUS_FILTERS = ["all", ...REPORT_STATUSES] as const

export function AdminModeration({
  reports,
  counts,
  activeStatus,
  log,
}: {
  reports: ModerationReport[]
  counts: Record<string, number>
  activeStatus: string
  log: ModerationLogRow[]
}) {
  return (
    <div className="space-y-10">
      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => {
          const active = activeStatus === s
          const n = s === "all" ? undefined : counts[s]
          return (
            <Link
              key={s}
              href={s === "all" ? "/moderation" : `/moderation?status=${s}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {s}
              {typeof n === "number" ? (
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {n}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>

      {/* Reports */}
      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No reports{activeStatus !== "all" ? ` with status "${activeStatus}"` : ""}.
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </ul>
      )}

      {/* Audit trail */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Moderation audit trail</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No moderation actions recorded yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Admin</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{e.actorName || e.actorEmail}</td>
                    <td className="px-3 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {e.action}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[e.targetType, e.targetId, e.targetUserId]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function ReportCard({ report }: { report: ModerationReport }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function run(fn: () => Promise<unknown>) {
    start(async () => {
      await fn()
      router.refresh()
    })
  }

  const reportedStatus = report.reportedUser?.status ?? "active"

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
          {reportReasonLabel(report.reason)}
        </span>
        <StatusBadge status={report.status} />
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Reported content preview */}
      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Reported {report.content.type.replace("_", " ")}
          {report.content.hidden ? (
            <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              HIDDEN
            </span>
          ) : null}
        </p>
        {report.content.exists ? (
          <>
            {report.content.bookTitle ? (
              <p className="mt-1 text-sm font-medium">
                {report.content.bookId ? (
                  <Link
                    href={`/app/books/${report.content.bookId}`}
                    className="underline underline-offset-2"
                  >
                    {report.content.bookTitle}
                  </Link>
                ) : (
                  report.content.bookTitle
                )}
              </p>
            ) : null}
            <p className="mt-1 whitespace-pre-line text-sm text-pretty">
              {report.content.text || (
                <span className="text-muted-foreground">
                  (no text in this review)
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            This content has been deleted.
          </p>
        )}
      </div>

      {/* Details */}
      {report.details ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">Reporter note: </span>
          <span className="text-muted-foreground">{report.details}</span>
        </p>
      ) : null}

      {/* Parties */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Party label="Reported by" user={report.reporter} />
        <Party
          label="Content author"
          user={report.reportedUser}
          status={reportedStatus}
        />
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">
          Set status:
        </span>
        {REPORT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending || report.status === s}
            onClick={() => run(() => updateReportStatus(report.id, s))}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-50",
              report.status === s
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border hover:bg-accent",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {report.content.exists ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                setReviewHidden(
                  Number(report.content.id),
                  !report.content.hidden,
                ),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {report.content.hidden ? (
              <>
                <Eye className="h-3.5 w-3.5" /> Unhide content
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" /> Hide content
              </>
            )}
          </button>
        ) : null}

        {report.reportedUser ? (
          <>
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              Author:
            </span>
            {reportedStatus !== "restricted" ? (
              <UserActionButton
                pending={pending}
                label="Restrict"
                onClick={() =>
                  run(() =>
                    setUserStatus(report.reportedUser!.id, "restricted"),
                  )
                }
              />
            ) : null}
            {reportedStatus !== "suspended" ? (
              <UserActionButton
                pending={pending}
                label="Suspend"
                destructive
                onClick={() =>
                  run(() =>
                    setUserStatus(report.reportedUser!.id, "suspended"),
                  )
                }
              />
            ) : null}
            {reportedStatus !== "active" ? (
              <UserActionButton
                pending={pending}
                label="Reinstate"
                onClick={() =>
                  run(() => setUserStatus(report.reportedUser!.id, "active"))
                }
              />
            ) : null}
          </>
        ) : null}

        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    </li>
  )
}

function UserActionButton({
  label,
  onClick,
  pending,
  destructive,
}: {
  label: string
  onClick: () => void
  pending: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        destructive
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border hover:bg-accent",
      )}
    >
      {label}
    </button>
  )
}

function Party({
  label,
  user,
  status,
}: {
  label: string
  user: { name: string; email: string } | null
  status?: string
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      {user ? (
        <div className="mt-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
          </p>
          {status ? (
            <span className="mt-1 inline-block">
              <UserStatusBadge status={status} />
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Unknown user</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    reviewed: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    resolved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dismissed: "bg-muted text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        map[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  )
}

function UserStatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        Active
      </span>
    )
  }
  return (
    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold capitalize text-destructive">
      {status}
    </span>
  )
}
