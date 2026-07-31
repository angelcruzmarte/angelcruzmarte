"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react"
import type { ReviewBook } from "@/app/actions/admin"
import {
  approveBook,
  bulkDeleteBooks,
  correctReviewBook,
  recheckBookQuality,
  rejectBook,
} from "@/app/actions/admin"
import { BookCover } from "@/components/book-cover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { cn } from "@/lib/utils"

function scoreTone(score: number | null, threshold: number) {
  if (score == null) return "muted"
  if (score >= threshold) return "pass"
  if (score >= 40) return "warn"
  return "fail"
}

const TONE_CLASSES: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  fail: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
}

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
  if (status === "warn")
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
  return <X className="h-4 w-4 shrink-0 text-destructive" />
}

export function AdminReviewQueue({
  books,
  threshold,
}: {
  books: ReviewBook[]
  threshold: number
}) {
  // Aggregate flag counts for the summary strip.
  const summary = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const b of books) {
      for (const f of b.qualityReport?.flags ?? []) {
        counts[f] = (counts[f] ?? 0) + 1
      }
    }
    return counts
  }, [books])

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
        <ShieldCheck className="h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-semibold">The queue is clear</h2>
        <p className="max-w-sm text-pretty text-sm text-muted-foreground">
          No books are awaiting review. New imports that fail a quality check
          will appear here automatically.
        </p>
      </div>
    )
  }

  const FLAG_LABELS: Record<string, string> = {
    missing_title: "Missing title",
    language_mismatch: "Language mismatch",
    placeholder_cover: "Placeholder cover",
    poor_description: "Boilerplate description",
    invalid_isbn: "Invalid ISBN",
    missing_isbn: "Missing ISBN",
    duplicate: "Duplicate",
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
        <span className="font-medium">
          {books.length} book{books.length === 1 ? "" : "s"} held
        </span>
        <span className="text-muted-foreground">·</span>
        {Object.keys(summary).length === 0 ? (
          <span className="text-muted-foreground">below quality threshold</span>
        ) : (
          Object.entries(summary)
            .sort((a, b) => b[1] - a[1])
            .map(([flag, n]) => (
              <Badge key={flag} variant="secondary" className="font-normal">
                {FLAG_LABELS[flag] ?? flag}: {n}
              </Badge>
            ))
        )}
      </div>

      {books.map((book) => (
        <ReviewCard key={book.id} book={book} threshold={threshold} />
      ))}
    </div>
  )
}

function ReviewCard({
  book,
  threshold,
}: {
  book: ReviewBook
  threshold: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [action, setAction] = useState<string | null>(null)

  const report = book.qualityReport
  const tone = scoreTone(book.qualityScore, threshold)

  function run(name: string, fn: () => Promise<unknown>) {
    setAction(name)
    startTransition(async () => {
      await fn()
      setAction(null)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-24 shrink-0 sm:w-28">
          <BookCover book={book} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-pretty text-lg font-semibold leading-tight">
                {book.title}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {book.author} · {book.language.toUpperCase()} · {book.category}
              </p>
            </div>
            <div
              className={cn(
                "flex flex-col items-center rounded-lg px-3 py-1.5 text-center",
                TONE_CLASSES[tone],
              )}
            >
              <span className="text-xl font-bold tabular-nums leading-none">
                {book.qualityScore ?? "—"}
              </span>
              <span className="text-[0.65rem] font-medium uppercase tracking-wide">
                / 100
              </span>
            </div>
          </div>

          {report?.summary && (
            <p className="mt-2 text-sm text-foreground/80">{report.summary}</p>
          )}

          {book.duplicateOf && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
              <Copy className="h-4 w-4" />
              <span>
                Duplicates existing book #{book.duplicateOf.id} —{" "}
                <span className="font-medium">{book.duplicateOf.title}</span> by{" "}
                {book.duplicateOf.author}
              </span>
            </div>
          )}

          {/* Per-field quality report */}
          {report?.checks && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {report.checks.map((c) => (
                <li key={c.field} className="flex items-start gap-2 text-sm">
                  <StatusIcon status={c.status} />
                  <span className="min-w-0">
                    <span className="font-medium">{c.label}:</span>{" "}
                    <span className="text-muted-foreground">{c.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Controls */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              Correct
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run("recheck", () => recheckBookQuality(book.id))}
              disabled={pending}
            >
              {pending && action === "recheck" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Re-check
            </Button>
            <Button
              size="sm"
              onClick={() => run("approve", () => approveBook(book.id))}
              disabled={pending}
            >
              {pending && action === "approve" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => run("reject", () => rejectBook(book.id))}
              disabled={pending}
            >
              Keep hidden
            </Button>

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                  />
                }
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this book?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {book.title} will be permanently removed from the catalog.
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() =>
                      run("delete", () => bulkDeleteBooks([book.id]))
                    }
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <CorrectionDialog
        book={book}
        open={editing}
        onOpenChange={setEditing}
        onSaved={() => {
          setEditing(false)
          router.refresh()
        }}
      />
    </div>
  )
}

function CorrectionDialog({
  book,
  open,
  onOpenChange,
  onSaved,
}: {
  book: ReviewBook
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    title: book.title,
    author: book.author,
    language: book.language,
    category: book.category,
    publicationYear:
      book.publicationYear != null ? String(book.publicationYear) : "",
    isbn: book.isbn ?? "",
    coverImageUrl: book.coverImageUrl ?? "",
    description: book.description,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const yearNum = form.publicationYear.trim()
      ? Number.parseInt(form.publicationYear, 10)
      : null
    const res = await correctReviewBook(book.id, {
      title: form.title,
      author: form.author,
      language: form.language,
      category: form.category,
      description: form.description,
      coverImageUrl: form.coverImageUrl,
      isbn: form.isbn,
      publicationYear:
        yearNum != null && Number.isFinite(yearNum) ? yearNum : null,
    })
    setSaving(false)
    if (res && "error" in res && res.error) {
      setError(res.error)
      return
    }
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct metadata</DialogTitle>
          <DialogDescription>
            Fix the flagged fields, then save to re-score. Saving does not
            publish the book — approve it once it clears the checks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="c-title">Title</Label>
            <Input
              id="c-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-author">Author</Label>
            <Input
              id="c-author"
              value={form.author}
              onChange={(e) => set("author", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="c-language">Language</Label>
              <Input
                id="c-language"
                value={form.language}
                onChange={(e) => set("language", e.target.value)}
                placeholder="en"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-year">Publication year</Label>
              <Input
                id="c-year"
                value={form.publicationYear}
                onChange={(e) => set("publicationYear", e.target.value)}
                placeholder="1851"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="c-category">Category</Label>
              <Input
                id="c-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-isbn">ISBN</Label>
              <Input
                id="c-isbn"
                value={form.isbn}
                onChange={(e) => set("isbn", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-cover">Cover image URL</Label>
            <Input
              id="c-cover"
              value={form.coverImageUrl}
              onChange={(e) => set("coverImageUrl", e.target.value)}
              placeholder="Leave blank for the branded card"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-desc">Description</Label>
            <Textarea
              id="c-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save &amp; re-check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
