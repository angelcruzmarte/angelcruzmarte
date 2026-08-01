"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  AlertTriangle,
  Download,
  FileJson,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import {
  exportPrunableAuditLog,
  pruneAuditLogNow,
  updateRetentionPolicy,
  type RetentionStats,
} from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

// Selectable retention windows (months). Mirrors RETENTION_MONTH_OPTIONS in
// lib/audit-retention.ts (kept local since that module is server-only).
const RETENTION_MONTH_OPTIONS = [3, 6, 12, 18, 24, 36, 48, 60]

function formatDate(d: Date | string | null): string {
  if (!d) return "—"
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function AdminAuditRetention({ stats }: { stats: RetentionStats }) {
  const router = useRouter()
  const [saving, startSaving] = useTransition()

  // Local draft of the policy (committed on Save).
  const [enabled, setEnabled] = useState(stats.policy.enabled)
  const [months, setMonths] = useState(String(stats.policy.months))
  const [exemptCritical, setExemptCritical] = useState(
    stats.policy.exemptCritical,
  )
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null)
  const [pruning, setPruning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const dirty =
    enabled !== stats.policy.enabled ||
    Number(months) !== stats.policy.months ||
    exemptCritical !== stats.policy.exemptCritical

  function save() {
    startSaving(async () => {
      await updateRetentionPolicy({
        enabled,
        months: Number(months),
        exemptCritical,
      })
      setNotice("Retention policy saved.")
      router.refresh()
    })
  }

  async function download(format: "csv" | "json") {
    setExporting(format)
    setNotice(null)
    try {
      const data = await exportPrunableAuditLog(format)
      const type =
        format === "json"
          ? "application/json;charset=utf-8;"
          : "text/csv;charset=utf-8;"
      const blob = new Blob([data], { type })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `voxyfi-audit-archive-${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(null)
    }
  }

  async function prune() {
    setPruning(true)
    setNotice(null)
    try {
      const res = await pruneAuditLogNow()
      setNotice(
        res.deleted > 0
          ? `Pruned ${res.deleted} entr${res.deleted === 1 ? "y" : "ies"}.`
          : "Nothing to prune right now.",
      )
      router.refresh()
    } finally {
      setPruning(false)
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2 text-muted-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Retention policy
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              Automatically prune old audit entries to keep the log lightweight.
              Export an archive before pruning, and optionally keep critical
              security and administrative events forever.
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            stats.policy.enabled
              ? "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "border-transparent bg-muted text-muted-foreground"
          }
        >
          {stats.policy.enabled ? "Auto-prune on" : "Auto-prune off"}
        </Badge>
      </div>

      {/* Live stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total entries" value={stats.totalEntries.toLocaleString()} />
        <Stat label="Oldest entry" value={formatDate(stats.oldestEntry)} />
        <Stat label="Prune cutoff" value={formatDate(stats.cutoff)} />
        <Stat
          label="Eligible to prune"
          value={stats.prunable.toLocaleString()}
          highlight={stats.prunable > 0}
        />
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-col gap-5 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="retention-enabled" className="text-sm font-medium">
              Automatic pruning
            </Label>
            <p className="text-sm text-muted-foreground">
              Runs weekly. Turn off to retain everything indefinitely.
            </p>
          </div>
          <Switch
            id="retention-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Retention period</Label>
            <p className="text-sm text-muted-foreground">
              Entries older than this are eligible for pruning.
            </p>
          </div>
          <Select
            value={months}
            onValueChange={(v) => v && setMonths(v)}
            disabled={!enabled}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_MONTH_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} months{m === 12 ? " (1 year)" : ""}
                  {m === 24 ? " (2 years)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="retention-exempt" className="text-sm font-medium">
              Keep critical events forever
            </Label>
            <p className="max-w-md text-sm text-muted-foreground">
              Exempt create, delete, publish/unpublish, and policy changes from
              pruning.
            </p>
          </div>
          <Switch
            id="retention-exempt"
            checked={exemptCritical}
            onCheckedChange={setExemptCritical}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!dirty || saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save policy
          </Button>
          {notice ? (
            <span className="text-sm text-muted-foreground">{notice}</span>
          ) : null}
        </div>
      </div>

      {/* Archive + prune */}
      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-muted-foreground">
            Pruning is permanent. Download an archive of the{" "}
            <span className="font-medium text-foreground">
              {stats.prunable.toLocaleString()}
            </span>{" "}
            entr{stats.prunable === 1 ? "y" : "ies"} eligible right now before
            you prune.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => download("csv")}
            disabled={exporting !== null || stats.prunable === 0}
            className="gap-1.5"
          >
            {exporting === "csv" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => download("json")}
            disabled={exporting !== null || stats.prunable === 0}
            className="gap-1.5"
          >
            {exporting === "json" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileJson className="h-4 w-4" />
            )}
            Export JSON
          </Button>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pruning || stats.prunable === 0}
                  className="gap-1.5"
                />
              }
            >
              {pruning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Prune now
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Prune {stats.prunable.toLocaleString()} audit entr
                  {stats.prunable === 1 ? "y" : "ies"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes audit entries older than{" "}
                  {stats.policy.months} months
                  {stats.policy.exemptCritical
                    ? " (critical security and administrative events are kept)"
                    : ""}
                  . Make sure you have exported an archive first. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={prune}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Prune now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          highlight ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  )
}
