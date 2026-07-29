"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react"
import {
  bulkDeleteBooks,
  createCommercialBook,
  lookupIsbnMetadata,
  refreshBooksMetadata,
  setBooksPublished,
  updateBook,
  type AdminBook,
  type CommercialBookInput,
} from "@/app/actions/admin"
import { bookshopBuyUrl } from "@/lib/book-stores"
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

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

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
    priceInCents: b.priceInCents,
  }
}

const isAffiliate = (b: AdminBook) => b.fulfillment === "affiliate"
const sourceLabel = (b: AdminBook) => (isAffiliate(b) ? "Bookshop.org" : "VOXYFI")

type SortKey =
  | "title"
  | "author"
  | "price"
  | "source"
  | "status"
  | "category"
  | "created"

export function AdminBooks({ books }: { books: AdminBook[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Form state
  const [editing, setEditing] = useState<AdminBook | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CommercialBookInput>(empty)
  const [error, setError] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupNote, setLookupNote] = useState<string | null>(null)

  // List state
  const [query, setQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState<"all" | "in_app" | "affiliate">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "hidden">("all")
  const [sortKey, setSortKey] = useState<SortKey>("created")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lightbox, setLightbox] = useState<AdminBook | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const editingFulfillment = editing?.fulfillment ?? "affiliate"
  const editingIsAffiliate = editingFulfillment === "affiliate"

  function set<K extends keyof CommercialBookInput>(
    key: K,
    value: CommercialBookInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // -------- Derived list (filter → search → sort) --------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = books.filter((b) => {
      if (sourceFilter !== "all" && b.fulfillment !== sourceFilter) return false
      if (statusFilter === "published" && !b.published) return false
      if (statusFilter === "hidden" && b.published) return false
      if (!q) return true
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.isbn ?? "").toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
      )
    })
    const dir = sortDir === "asc" ? 1 : -1
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir
        case "author":
          return a.author.localeCompare(b.author) * dir
        case "price":
          return (a.priceInCents - b.priceInCents) * dir
        case "source":
          return sourceLabel(a).localeCompare(sourceLabel(b)) * dir
        case "status":
          return (Number(a.published) - Number(b.published)) * dir
        case "category":
          return a.category.localeCompare(b.category) * dir
        default:
          return (a.createdAt.getTime() - b.createdAt.getTime()) * dir
      }
    })
    return list
  }, [books, query, sourceFilter, statusFilter, sortKey, sortDir])

  const visibleIds = visible.map((b) => b.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const selectedList = books.filter((b) => selected.has(b.id))

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "created" ? "desc" : "asc")
    }
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
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

  // -------- Form actions --------
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
        setError("Add an ISBN or a buy URL so the Bookshop.org link can be built.")
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

  // -------- Bulk actions --------
  function runBulk(fn: () => Promise<unknown>, message: string) {
    startTransition(async () => {
      await fn()
      setNote(message)
      setSelected(new Set())
      router.refresh()
    })
  }

  const ids = () => Array.from(selected)

  function bulkPublish(published: boolean) {
    runBulk(
      () => setBooksPublished(ids(), published),
      `${selected.size} title${selected.size === 1 ? "" : "s"} ${published ? "published" : "hidden"}.`,
    )
  }

  function bulkRefresh() {
    const count = selected.size
    startTransition(async () => {
      const res = await refreshBooksMetadata(ids())
      setNote(
        `Metadata refresh: ${res.updated} updated, ${res.skipped} skipped (of ${count}).`,
      )
      setSelected(new Set())
      router.refresh()
    })
  }

  function bulkDelete() {
    runBulk(
      () => bulkDeleteBooks(ids()),
      `${selected.size} title${selected.size === 1 ? "" : "s"} deleted.`,
    )
    setConfirmDelete(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {books.length} title{books.length === 1 ? "" : "s"} in catalog
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

            {!editingIsAffiliate && (
              <div className="grid gap-1.5">
                <Label htmlFor="price">In-app price (USD)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={(form.priceInCents ?? 0) / 100}
                  onChange={(e) =>
                    set("priceInCents", Math.round(Number(e.target.value) * 100))
                  }
                />
              </div>
            )}

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="buyUrl">Buy URL override (optional — overrides the ISBN link)</Label>
              <Input
                id="buyUrl"
                value={form.buyUrl ?? ""}
                placeholder="https://bookshop.org/…"
                onChange={(e) => set("buyUrl", e.target.value)}
              />
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

      {/* ---------------- Toolbar ---------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, author, ISBN, category…"
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="in_app">VOXYFI</SelectItem>
            <SelectItem value="affiliate">Bookshop.org</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {note && (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{note}</div>
      )}

      {/* ---------------- Bulk action bar ---------------- */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="mr-1 text-sm font-medium">{selected.size} selected</span>
          {selectedList.length === 1 && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(selectedList[0])}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => bulkPublish(true)}>
            <Eye className="h-3.5 w-3.5" /> Publish
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => bulkPublish(false)}>
            <EyeOff className="h-3.5 w-3.5" /> Unpublish
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
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  className="h-4 w-4 rounded border-border"
                />
              </th>
              <th className="w-16 p-3">Cover</th>
              <SortHeader label="Title" k="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Author" k="author" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="p-3 font-medium">ISBN</th>
              <SortHeader label="Source" k="source" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Price" k="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Category" k="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="p-3 font-medium">Availability</th>
              <th className="p-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
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
                <td className="max-w-[160px] p-3 align-middle">
                  <span className="block truncate text-muted-foreground">{b.author}</span>
                </td>
                <td className="p-3 align-middle font-mono text-xs text-muted-foreground">
                  {b.isbn || "—"}
                </td>
                <td className="p-3 align-middle">
                  <Badge variant={isAffiliate(b) ? "outline" : "secondary"}>{sourceLabel(b)}</Badge>
                </td>
                <td className="p-3 align-middle">
                  {isAffiliate(b) ? (
                    <span className="text-muted-foreground">External</span>
                  ) : (
                    formatPrice(b.priceInCents)
                  )}
                </td>
                <td className="p-3 align-middle">
                  <Badge
                    variant="outline"
                    className={
                      b.published
                        ? "border-primary/40 text-primary"
                        : "border-border text-muted-foreground"
                    }
                  >
                    {b.published ? "Published" : "Hidden"}
                  </Badge>
                </td>
                <td className="max-w-[130px] p-3 align-middle">
                  <span className="block truncate text-muted-foreground">{b.category}</span>
                </td>
                <td className="p-3 align-middle text-muted-foreground">
                  {isAffiliate(b) ? "Sample only" : "Full in-app"}
                </td>
                <td className="p-3 align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)} aria-label={`Edit ${b.title}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <a
                      href={bookshopBuyUrl({ title: b.title, author: b.author, isbn: b.isbn, buyUrl: b.buyUrl })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                      aria-label={`Preview buy link for ${b.title}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-sm text-muted-foreground">
                  {books.length === 0
                    ? "No titles yet. Add a commercial title to sell via Bookshop.org."
                    : "No titles match your search / filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: "asc" | "desc"
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === k
  return (
    <th className="p-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
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
