"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import {
  Download,
  Loader2,
  PlusCircle,
  Trash2,
  Eye,
  EyeOff,
  DollarSign,
  Pencil,
  ImageIcon,
  BookDown,
  DownloadCloud,
  Link2,
  Search,
  X,
} from "lucide-react"
import {
  exportAuditLogCsv,
  type AuditQueryResult,
} from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PAGE_SIZES = [25, 50, 100, 200]

// Action metadata: label, icon, and a tone class for the badge.
const ACTIONS: Record<
  string,
  { label: string; icon: typeof PlusCircle; tone: string }
> = {
  create: {
    label: "Created",
    icon: PlusCircle,
    tone: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  delete: {
    label: "Deleted",
    icon: Trash2,
    tone: "border-transparent bg-destructive/15 text-destructive",
  },
  publish: {
    label: "Published",
    icon: Eye,
    tone: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  unpublish: {
    label: "Unpublished",
    icon: EyeOff,
    tone: "border-transparent bg-muted text-muted-foreground",
  },
  availability: {
    label: "Availability",
    icon: BookDown,
    tone: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  price: {
    label: "Price",
    icon: DollarSign,
    tone: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  metadata: {
    label: "Metadata",
    icon: Pencil,
    tone: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  cover: {
    label: "Cover image",
    icon: ImageIcon,
    tone: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  isbn_import: {
    label: "ISBN import",
    icon: BookDown,
    tone: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
  link_check: {
    label: "Link check",
    icon: Link2,
    tone: "border-transparent bg-muted text-muted-foreground",
  },
  import: {
    label: "Auto-import",
    icon: DownloadCloud,
    tone: "border-transparent bg-teal-500/15 text-teal-700 dark:text-teal-400",
  },
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  author: "Author",
  category: "Category",
  description: "Description",
  excerpt: "Excerpt",
  sampleText: "Sample text",
  isbn: "ISBN",
  buyUrl: "Buy URL",
  coverImageUrl: "Cover image",
  coverColor: "Cover color",
  accentColor: "Accent color",
  priceInCents: "Price",
  availability: "Availability",
  featured: "Featured",
  published: "Published",
}

function actionMeta(action: string) {
  return (
    ACTIONS[action] ?? {
      label: action,
      icon: Pencil,
      tone: "border-transparent bg-muted text-muted-foreground",
    }
  )
}

function formatWhen(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export type AuditQuery = {
  q: string
  action: string
  actor: string
}

export function AdminAuditLog({
  result,
  actors,
  query,
}: {
  result: AuditQueryResult
  actors: { email: string; name: string }[]
  query: AuditQuery
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [searchText, setSearchText] = useState(query.q)
  const [exporting, setExporting] = useState(false)

  // Merge params into the URL; reset to page 1 on any filter/search change.
  function pushParams(next: Record<string, string | number | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "" || value === "all") {
        params.delete(key)
      } else {
        params.set(key, String(value))
      }
    }
    if (!("page" in next)) params.delete("page")
    startTransition(() => router.push(`?${params.toString()}`))
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    pushParams({ q: searchText.trim() || null })
  }

  const hasFilters =
    query.q !== "" || query.action !== "all" || query.actor !== "all"

  async function exportCsv() {
    setExporting(true)
    try {
      const csv = await exportAuditLogCsv({
        q: query.q,
        action: query.action,
        actor: query.actor,
      })
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `voxyfi-book-audit-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const { rows, total, page, pageSize, pageCount } = result
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1
  const lastRow = Math.min(page * pageSize, total)

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search book, user, field, or value…"
              className="pl-9"
              aria-label="Search audit log"
            />
          </form>
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || total === 0}
            className="gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={query.action}
            onValueChange={(v) => v && pushParams({ action: v })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTIONS).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={query.actor}
            onValueChange={(v) => v && pushParams({ actor: v })}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.email} value={a.email}>
                  {a.name || a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                setSearchText("")
                startTransition(() => router.push("?"))
              }}
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}

          <span className="ml-auto text-sm text-muted-foreground">
            {total === 0
              ? "No entries"
              : `${firstRow}–${lastRow} of ${total.toLocaleString()}`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-x-auto">
        {pending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No audit entries match your filters yet.
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Book</th>
                <th className="px-4 py-3 font-medium">Field</th>
                <th className="px-4 py-3 font-medium">Previous</th>
                <th className="px-4 py-3 font-medium">New</th>
                <th className="px-4 py-3 font-medium">User</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = actionMeta(r.action)
                const Icon = meta.icon
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 align-top last:border-0 hover:bg-muted/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatWhen(r.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`gap-1 font-medium ${meta.tone}`}
                        variant="outline"
                      >
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <span className="line-clamp-2 font-medium text-foreground">
                        {r.bookTitle || "—"}
                      </span>
                      {r.bookId != null && (
                        <span className="text-xs text-muted-foreground">
                          #{r.bookId}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {r.field ? (FIELD_LABELS[r.field] ?? r.field) : "—"}
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="line-clamp-2 text-muted-foreground">
                        {r.oldValue ?? "—"}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="line-clamp-2 text-foreground">
                        {r.newValue ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block font-medium text-foreground">
                        {r.actorName || "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.actorEmail}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => v && pushParams({ pageSize: v, page: 1 })}
            >
              <SelectTrigger className="h-9 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || pending}
              onClick={() => pushParams({ page: page - 1 })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || pending}
              onClick={() => pushParams({ page: page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
