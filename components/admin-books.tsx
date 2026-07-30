"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import {
  bulkDeleteBooks,
  checkBookLinks,
  createCommercialBook,
  lookupIsbnMetadata,
  refreshBooksMetadata,
  setBooksAvailability,
  setBooksPublished,
  updateBook,
  type AdminBook,
  type CatalogQueryResult,
  type CatalogSort,
  type CommercialBookInput,
} from "@/app/actions/admin"
import {
  AVAILABILITY_BADGE_CLASS,
  AVAILABILITY_VALUES,
  availabilityLabel,
  LINK_STATUS_LABELS,
  type Availability,
  type LinkStatus,
} from "@/lib/book-availability"
import { affiliateBuyUrl, isValidIsbn, ACTIVE_AFFILIATE_LABEL } from "@/lib/affiliate"
import { BookCover } from "@/components/book-cover"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
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
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`
const formatDate = (d: Date) =>
  new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const empty: CommercialBookInput = {
  title: "",
  author: "",
  category: "General",
  description: "",
  excerpt: "",
  sampleText: "",
  isbn: "",
  buyUrl: "",
  coverImageUrl: "",
  coverColor: "#1f3a5f",
  accentColor: "#f4b740",
  featured: false,
  published: true,
  availability: "affiliate_only",
  priceInCents: 499,
}

function toInput(b: AdminBook): CommercialBookInput {
  return {
    title: b.title,
    author: b.author,
    category: b.category,
    description: b.description,
    excerpt: b.excerpt,
    sampleText: b.sampleText ?? "",
    isbn: b.isbn ?? "",
    buyUrl: b.buyUrl ?? "",
    coverImageUrl: b.coverImageUrl ?? "",
    coverColor: b.coverColor,
    accentColor: b.accentColor,
    featured: b.featured,
    published: b.published,
    availability: b.availability,
    priceInCents: b.priceInCents,
  }
}

const isAffiliate = (b: AdminBook) => b.fulfillment === "affiliate"
const sourceLabel = (b: AdminBook) =>
  isAffiliate(b) ? ACTIVE_AFFILIATE_LABEL : "VOXYFI"

type ActiveQuery = {
  q: string
  source: string
  status: string
  availability: string
  sort: CatalogSort
  dir: "asc" | "desc"
}

export function AdminBooks({
  result,
  categories,
  query,
}: {
  result: CatalogQueryResult
  categories: string[]
  query: ActiveQuery
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const rows = result.rows

  // ---- URL-driven navigation helpers ----
  function pushParams(
    patch: Record<string, string | number | undefined>,
    { resetPage = true }: { resetPage?: boolean } = {},
  ) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === "all") params.delete(k)
      else params.set(k, String(v))
    }
    if (resetPage && !("page" in patch)) params.delete("page")
    startTransition(() => router.push(`/admin/books?${params.toString()}`))
  }

  function toggleSort(key: CatalogSort) {
    if (query.sort === key) {
      pushParams({ sort: key, dir: query.dir === "asc" ? "desc" : "asc" })
    } else {
      pushParams({ sort: key, dir: key === "updated" ? "desc" : "asc" })
    }
  }

  // ---- Debounced search ----
  const [search, setSearch] = useState(query.q)
  const firstRender = useRef(true)
  useEffect(() => {
    setSearch(query.q)
  }, [query.q])
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const id = setTimeout(() => {
      if (search !== query.q) pushParams({ q: search })
    }, 400)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // ---- Selection (per page) ----
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const pageIds = rows.map((b) => b.id)
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }
  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---- Full create/edit form ----
  const [editing, setEditing] = useState<AdminBook | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CommercialBookInput>(empty)
  const [error, setError] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupNote, setLookupNote] = useState<string | null>(null)

  const editingFulfillment = editing?.fulfillment ?? "affiliate"
  const editingIsAffiliate = editingFulfillment === "affiliate"

  function set<K extends keyof CommercialBookInput>(
    key: K,
    value: CommercialBookInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function fetchMetadata() {
    setError(null)
    setLookupNote(null)
    setLookingUp(true)
    try {
      const res = await lookupIsbnMetadata(form.isbn ?? "")
      if (res.error) {
        setError(res.error)
        return
      }
      const d = res.data ?? {}
      const filled: string[] = []
      setForm((f) => {
        const next = { ...f }
        if (!f.title.trim() && d.title) {
          next.title = d.title
          filled.push("title")
        }
        if (!f.author.trim() && d.author) {
          next.author = d.author
          filled.push("author")
        }
        if (!f.description.trim() && d.description) {
          next.description = d.description
          filled.push("description")
        }
        if ((!f.category?.trim() || f.category === "General") && d.category) {
          next.category = d.category
          filled.push("category")
        }
        if (!f.coverImageUrl?.trim() && d.coverImageUrl) {
          next.coverImageUrl = d.coverImageUrl
          filled.push("cover")
        }
        return next
      })
      setLookupNote(
        filled.length
          ? `Filled: ${filled.join(", ")}. Review before saving.`
          : "No new fields to fill — everything was already set.",
      )
    } finally {
      setLookingUp(false)
    }
  }

  function openNew() {
    setForm(empty)
    setEditing(null)
    setShowForm(true)
    setError(null)
    setLookupNote(null)
  }
  function openEdit(b: AdminBook) {
    setForm(toInput(b))
    setEditing(b)
    setShowForm(true)
    setError(null)
    setLookupNote(null)
  }
  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  function submit() {
    if (!form.title.trim() || !form.author.trim()) {
      setError("Title and author are required.")
      return
    }
    if (editingIsAffiliate) {
      if (!form.sampleText.trim()) {
        setError("Add a listenable sample — this is what users hear in-app.")
        return
      }
    if (!form.isbn?.trim() && !form.buyUrl?.trim()) {
      setError("Add an ISBN or a buy URL so the Amazon link can be built.")
      return
    }
    if (form.isbn?.trim() && !isValidIsbn(form.isbn)) {
      setError("That ISBN looks invalid. Enter a valid ISBN-10 or ISBN-13.")
      return
    }
    }
    setError(null)
    startTransition(async () => {
      const res = editing
        ? await updateBook(editing.id, form)
        : await createCommercialBook(form)
      if (res && "error" in res && res.error) {
        setError(res.error)
        return
      }
      closeForm()
      setForm(empty)
      router.refresh()
    })
  }

  // ---- Quick edit ----
  const [quick, setQuick] = useState<AdminBook | null>(null)
  const [quickForm, setQuickForm] = useState<CommercialBookInput>(empty)
  const [quickError, setQuickError] = useState<string | null>(null)

  function openQuick(b: AdminBook) {
    setQuick(b)
    setQuickForm(toInput(b))
    setQuickError(null)
  }
  function saveQuick() {
    if (!quick) return
    startTransition(async () => {
      const res = await updateBook(quick.id, quickForm)
      if (res && "error" in res && res.error) {
        setQuickError(res.error)
        return
      }
      setQuick(null)
      router.refresh()
    })
  }

  // ---- Bulk actions ----
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const ids = () => Array.from(selected)

  function afterBulk(message: string) {
    setNote(message)
    setSelected(new Set())
    router.refresh()
  }

  function bulkPublish(published: boolean) {
    const n = selected.size
    startTransition(async () => {
      await setBooksPublished(ids(), published)
      afterBulk(`${n} title${n === 1 ? "" : "s"} ${published ? "published" : "hidden"}.`)
    })
  }
  function bulkAvailability(availability: string | null) {
    if (!availability) return
    const n = selected.size
    startTransition(async () => {
      await setBooksAvailability(ids(), availability)
      afterBulk(`Set ${n} title${n === 1 ? "" : "s"} to “${availabilityLabel(availability)}”.`)
    })
  }
  function bulkRefresh() {
    const n = selected.size
    startTransition(async () => {
      const res = await refreshBooksMetadata(ids())
      afterBulk(`Metadata: ${res.updated} updated, ${res.skipped} skipped (of ${n}).`)
    })
  }
  function bulkCheckLinks() {
    const n = selected.size
    startTransition(async () => {
      const res = await checkBookLinks(ids())
      afterBulk(
        `Link check: ${res.ok} OK, ${res.broken} broken, ${res.unknown} need review (checked ${res.checked} affiliate of ${n} selected).`,
      )
    })
  }
  function bulkDelete() {
    const n = selected.size
    startTransition(async () => {
      await bulkDeleteBooks(ids())
      afterBulk(`${n} title${n === 1 ? "" : "s"} deleted.`)
    })
    setConfirmDelete(false)
  }

  // ---- Lightbox ----
  const [lightbox, setLightbox] = useState<AdminBook | null>(null)

  const { page, pageCount, pageSize, total } = result
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} title{total === 1 ? "" : "s"} in catalog
        </p>
        {!showForm && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            New commercial title
          </Button>
        )}
      </div>

      {/* ---------------- Create / edit form ---------------- */}
      {showForm && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {editing
                ? `Edit ${editingIsAffiliate ? "commercial" : "VOXYFI"} title`
                : "New commercial title"}
            </h2>
            <Button variant="ghost" size="icon" onClick={closeForm} aria-label="Close form">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="author">Author</Label>
              <Input id="author" value={form.author} onChange={(e) => set("author", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={form.category} onChange={(e) => set("category", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="isbn">ISBN (13-digit)</Label>
              <div className="flex gap-2">
                <Input
                  id="isbn"
                  value={form.isbn ?? ""}
                  placeholder="9780000000000"
                  onChange={(e) => set("isbn", e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchMetadata}
                  disabled={lookingUp || !form.isbn?.trim()}
                  className="shrink-0 gap-1.5"
                  title="Auto-fill title, author, description & cover from Open Library"
                >
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Fetch
                </Button>
              </div>
              {lookupNote && <p className="text-xs text-muted-foreground">{lookupNote}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="availability">Availability</Label>
              <Select
                value={form.availability ?? "available"}
                onValueChange={(v) => v && set("availability", v)}
              >
                <SelectTrigger id="availability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {availabilityLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editingIsAffiliate && (
              <div className="grid gap-1.5">
                <Label htmlFor="price">In-app price (USD)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={(form.priceInCents ?? 0) / 100}
                  onChange={(e) => set("priceInCents", Math.round(Number(e.target.value) * 100))}
                />
              </div>
            )}

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="buyUrl">Buy URL override (optional — overrides the ISBN link)</Label>
              <Input
                id="buyUrl"
                value={form.buyUrl ?? ""}
                placeholder="https://www.amazon.com/dp/…"
                onChange={(e) => set("buyUrl", e.target.value)}
              />
              {/* Live preview of the affiliate link customers will actually
                  get (tag is applied server-side at click time). */}
              {editingIsAffiliate && (
                <p className="truncate text-xs text-muted-foreground">
                  Amazon link:{" "}
                  <a
                    href={affiliateBuyUrl({
                      title: form.title,
                      author: form.author,
                      isbn: form.isbn,
                      buyUrl: form.buyUrl,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    {affiliateBuyUrl({
                      title: form.title,
                      author: form.author,
                      isbn: form.isbn,
                      buyUrl: form.buyUrl,
                    })}
                  </a>
                </p>
              )}
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="coverImageUrl">Cover image URL (optional)</Label>
              <Input
                id="coverImageUrl"
                value={form.coverImageUrl ?? ""}
                placeholder="https://…/cover.jpg"
                onChange={(e) => set("coverImageUrl", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sampleText">
                Listenable sample{editingIsAffiliate ? "" : " (optional for VOXYFI titles)"}
              </Label>
              <Textarea
                id="sampleText"
                rows={6}
                value={form.sampleText}
                placeholder="Paste the licensed sample/first pages here…"
                onChange={(e) => set("sampleText", e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => set("featured", e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Feature on storefront
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.published ?? true}
                  onChange={(e) => set("published", e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Published (visible in store)
              </label>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <Button onClick={submit} disabled={pending} className="gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create title"}
            </Button>
            <Button variant="outline" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* ---------------- Toolbar: search + filters ---------------- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, author, ISBN, category…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={query.source} onValueChange={(v) => v && pushParams({ source: v })}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="in_app">VOXYFI</SelectItem>
                <SelectItem value="affiliate">{ACTIVE_AFFILIATE_LABEL}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={query.status} onValueChange={(v) => v && pushParams({ status: v })}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={query.availability} onValueChange={(v) => v && pushParams({ availability: v })}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Availability" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All availability</SelectItem>
              {AVAILABILITY_VALUES.map((v) => (
                <SelectItem key={v} value={v}>{availabilityLabel(v)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
        </div>
      </div>

      {note && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{note}</div>
      )}

      {/* ---------------- Bulk action bar ---------------- */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="mr-1 text-sm font-medium">{selected.size} selected</span>
          {selected.size === 1 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                const only = rows.find((b) => selected.has(b.id))
                if (only) openEdit(only)
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => bulkPublish(true)}>
            <Eye className="h-3.5 w-3.5" /> Publish
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => bulkPublish(false)}>
            <EyeOff className="h-3.5 w-3.5" /> Unpublish
          </Button>
          <Select onValueChange={bulkAvailability}>
            <SelectTrigger className="h-8 w-40 text-xs" disabled={pending}>
              <SelectValue placeholder="Set availability…" />
            </SelectTrigger>
            <SelectContent>
              {AVAILABILITY_VALUES.map((v) => (
                <SelectItem key={v} value={v}>{availabilityLabel(v)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={bulkCheckLinks}>
            <Link2 className="h-3.5 w-3.5" /> Check links
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={bulkRefresh}>
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} /> Refresh metadata
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* ---------------- Table ---------------- */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all on page"
                  className="h-4 w-4 rounded border-border"
                />
              </th>
              <th className="w-16 p-3 font-medium">Cover</th>
              <SortHeader label="Title" k="title" query={query} onSort={toggleSort} />
              <SortHeader label="Author" k="author" query={query} onSort={toggleSort} />
              <SortHeader label="ISBN" k="isbn" query={query} onSort={toggleSort} />
              <SortHeader label="Source" k="source" query={query} onSort={toggleSort} />
              <th className="p-3 font-medium">Price</th>
              <SortHeader label="Status" k="status" query={query} onSort={toggleSort} />
              <SortHeader label="Category" k="category" query={query} onSort={toggleSort} />
              <SortHeader label="Availability" k="availability" query={query} onSort={toggleSort} />
              <SortHeader label="Updated" k="updated" query={query} onSort={toggleSort} />
              <th className="p-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="p-3 align-middle">
                  <input
                    type="checkbox"
                    checked={selected.has(b.id)}
                    onChange={() => toggleOne(b.id)}
                    aria-label={`Select ${b.title}`}
                    className="h-4 w-4 rounded border-border"
                  />
                </td>
                <td className="p-3 align-middle">
                  <button
                    type="button"
                    onClick={() => setLightbox(b)}
                    className="block w-11 shrink-0 rounded-md ring-offset-background transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`View full cover of ${b.title}`}
                  >
                    <BookCover book={b} className="w-11" />
                  </button>
                </td>
                <td className="max-w-[220px] p-3 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{b.title}</span>
                    {b.featured && <Star className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Featured" />}
                  </div>
                </td>
                <td className="max-w-[150px] p-3 align-middle">
                  <span className="block truncate text-muted-foreground">{b.author}</span>
                </td>
                <td className="p-3 align-middle font-mono text-xs text-muted-foreground">
                  {b.isbn || "—"}
                </td>
                <td className="p-3 align-middle">
                  <Badge variant={isAffiliate(b) ? "outline" : "secondary"}>{sourceLabel(b)}</Badge>
                </td>
                <td className="p-3 align-middle">
                  {isAffiliate(b) ? <span className="text-muted-foreground">External</span> : formatPrice(b.priceInCents)}
                </td>
                <td className="p-3 align-middle">
                  <Badge
                    variant="outline"
                    className={b.published ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}
                  >
                    {b.published ? "Published" : "Hidden"}
                  </Badge>
                </td>
                <td className="max-w-[120px] p-3 align-middle">
                  <span className="block truncate text-muted-foreground">{b.category}</span>
                </td>
                <td className="p-3 align-middle">
                  <div className="flex flex-col gap-1">
                    <Badge variant="outline" className={AVAILABILITY_BADGE_CLASS[b.availability as Availability] ?? ""}>
                      {availabilityLabel(b.availability)}
                    </Badge>
                    {isAffiliate(b) && b.linkStatus !== "unknown" && (
                      <span
                        className={`text-[11px] ${b.linkStatus === "ok" ? "text-muted-foreground" : "text-destructive"}`}
                      >
                        {LINK_STATUS_LABELS[b.linkStatus as LinkStatus] ?? b.linkStatus}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3 align-middle text-xs text-muted-foreground">
                  {formatDate(b.updatedAt)}
                </td>
                <td className="p-3 align-middle">
                  <div className="flex items-center justify-end gap-0.5">
                    <Button variant="ghost" size="icon" onClick={() => openQuick(b)} aria-label={`Quick edit ${b.title}`} title="Quick edit">
                      <Zap className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)} aria-label={`Edit ${b.title}`} title="Full edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <a
                          href={affiliateBuyUrl({ title: b.title, author: b.author, isbn: b.isbn, buyUrl: b.buyUrl })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                      aria-label={`Preview buy link for ${b.title}`}
                      title="Preview buy link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-8 text-center text-sm text-muted-foreground">
                  No titles match your search / filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------- Pagination ---------------- */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{" "}
            {total.toLocaleString()}
          </span>
          <span className="mx-1">·</span>
          <span>Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => pushParams({ pageSize: Number(v), page: 1 })}
          >
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={page <= 1 || pending}
            onClick={() => pushParams({ page: page - 1 }, { resetPage: false })}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={page >= pageCount || pending}
            onClick={() => pushParams({ page: page + 1 }, { resetPage: false })}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ---------------- Quick edit dialog ---------------- */}
      <Dialog open={!!quick} onOpenChange={(o) => !o && setQuick(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-pretty">Quick edit</DialogTitle>
          </DialogHeader>
          {quick && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="q-title">Title</Label>
                <Input
                  id="q-title"
                  value={quickForm.title}
                  onChange={(e) => setQuickForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-author">Author</Label>
                <Input
                  id="q-author"
                  value={quickForm.author}
                  onChange={(e) => setQuickForm((f) => ({ ...f, author: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="q-category">Category</Label>
                  <Input
                    id="q-category"
                    value={quickForm.category}
                    onChange={(e) => setQuickForm((f) => ({ ...f, category: e.target.value }))}
                  />
                </div>
                {quick.fulfillment === "in_app" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="q-price">Price (USD)</Label>
                    <Input
                      id="q-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={(quickForm.priceInCents ?? 0) / 100}
                      onChange={(e) =>
                        setQuickForm((f) => ({ ...f, priceInCents: Math.round(Number(e.target.value) * 100) }))
                      }
                    />
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-availability">Availability</Label>
                <Select
                  value={quickForm.availability ?? "available"}
                  onValueChange={(v) => v && setQuickForm((f) => ({ ...f, availability: v }))}
                >
                  <SelectTrigger id="q-availability"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>{availabilityLabel(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={quickForm.published ?? true}
                    onChange={(e) => setQuickForm((f) => ({ ...f, published: e.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                  Published
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={quickForm.featured}
                    onChange={(e) => setQuickForm((f) => ({ ...f, featured: e.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                  Featured
                </label>
              </div>
              {quickError && (
                <p className="text-sm text-destructive" role="alert">{quickError}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={saveQuick} disabled={pending} className="gap-2">
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </Button>
                <Button variant="outline" onClick={() => setQuick(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------------- Cover lightbox ---------------- */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-pretty">{lightbox?.title}</DialogTitle>
          </DialogHeader>
          {lightbox && (
            <div className="flex flex-col items-center gap-3">
              <BookCover book={lightbox} className="w-56" />
              <p className="text-sm text-muted-foreground">{lightbox.author}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------------- Delete confirm ---------------- */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} title{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected titles from the catalog. Any
              in-app purchases and favorites for them are also removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SortHeader({
  label,
  k,
  query,
  onSort,
}: {
  label: string
  k: CatalogSort
  query: ActiveQuery
  onSort: (k: CatalogSort) => void
}) {
  const active = query.sort === k
  return (
    <th className="p-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          query.dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </th>
  )
}
