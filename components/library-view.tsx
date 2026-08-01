"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  FileText,
  Link as LinkIcon,
  Mic,
  Sparkles,
  Trash2,
  Loader2,
  Search,
  X,
  MoreHorizontal,
  SlidersHorizontal,
  ListChecks,
  List as ListIcon,
  LayoutGrid,
  Grid3x3,
  Clock,
  CalendarDays,
  ArrowDownAZ,
  Check,
} from "lucide-react"
import { deleteDocument, deleteDocuments } from "@/app/actions/documents"
import { BookCover } from "@/components/book-cover"
import { DocumentThumbnail } from "@/components/document-thumbnail"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Book, Document } from "@/lib/db/schema"

type OwnedBook = Book & { lastWord: number; purchasedAt: Date }

type ViewMode = "list" | "large" | "small"
type SortKey = "recent" | "added" | "alpha"
type SortDir = "asc" | "desc"
type FileType = "pdf" | "txt" | "epub" | "web" | "doc"
type FilterKey = "unread" | FileType

const sourceIcon: Record<string, React.ElementType> = {
  text: FileText,
  link: LinkIcon,
  file: FileText,
  dictate: Mic,
  ai: Sparkles,
}

/** Visual treatment for each document file type. */
const typeStyle: Record<
  FileType | "book",
  { label: string; bg: string; fg: string }
> = {
  pdf: { label: "PDF", bg: "bg-red-100", fg: "text-red-700" },
  txt: { label: "TXT", bg: "bg-sky-100", fg: "text-sky-700" },
  epub: { label: "EPUB", bg: "bg-emerald-100", fg: "text-emerald-700" },
  web: { label: "WEB", bg: "bg-indigo-100", fg: "text-indigo-700" },
  doc: { label: "DOC", bg: "bg-secondary", fg: "text-muted-foreground" },
  book: { label: "BOOK", bg: "bg-primary/10", fg: "text-primary" },
}

function fileType(doc: Document): FileType {
  if (doc.sourceType === "link") return "web"
  const mime = (doc.originalMime ?? "").toLowerCase()
  const title = doc.title.toLowerCase()
  if (mime.includes("pdf") || title.endsWith(".pdf")) return "pdf"
  if (mime.includes("epub") || title.endsWith(".epub")) return "epub"
  if (mime.includes("text/plain") || title.endsWith(".txt")) return "txt"
  return "doc"
}

/**
 * Returns a renderable first-page preview source for a document, or null when
 * there's nothing visual to show (paste/type/link, or a non-viewable file).
 */
function docPreview(
  doc: Document | undefined,
): { src: string; mime: string; thumbnailUrl?: string | null; docId: number } | null {
  if (!doc) return null
  // A persisted thumbnail alone is enough to show a preview, even if we don't
  // re-render the original.
  if (doc.thumbnailUrl) {
    return {
      src: doc.originalUrl ?? doc.thumbnailUrl,
      mime: (doc.originalMime ?? "image/jpeg").toLowerCase(),
      thumbnailUrl: doc.thumbnailUrl,
      docId: doc.id,
    }
  }
  if (!doc.originalUrl) return null
  const mime = (doc.originalMime ?? "").toLowerCase()
  if (mime.startsWith("image/") || mime.includes("pdf")) {
    return { src: doc.originalUrl, mime, thumbnailUrl: null, docId: doc.id }
  }
  return null
}

/** A book or document normalized into a single shape for the unified list. */
type LibItem = {
  kind: "doc" | "book"
  id: number
  title: string
  href: string
  progress: number
  unread: boolean
  type: FileType | "book"
  updatedAt: number
  createdAt: number
  book?: OwnedBook
  doc?: Document
}

/** localStorage-backed state so view/sort/group prefs persist across sessions. */
function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) setValue(JSON.parse(raw) as T)
    } catch {
      /* ignore */
    }
    setLoaded(true)
  }, [key])
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }, [key, value, loaded])
  return [value, setValue] as const
}

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Returns a relative bucket label + sort weight for "Group by Date". */
function dateBucket(ts: number): { label: string; order: number } {
  const today = startOfDay(Date.now())
  const day = 86400000
  const d = startOfDay(ts)
  if (d >= today) return { label: "Today", order: 0 }
  if (d >= today - day) return { label: "Yesterday", order: 1 }
  if (d >= today - 7 * day) return { label: "Previous 7 days", order: 2 }
  if (d >= today - 30 * day) return { label: "Previous 30 days", order: 3 }
  return { label: "Older", order: 4 }
}

function progressLabel(item: LibItem) {
  if (item.progress >= 100) return "Finished"
  if (item.progress > 0) return `${item.progress}% listened`
  return "Not started"
}

export function LibraryView({
  documents,
  books,
}: {
  documents: Document[]
  books: OwnedBook[]
}) {
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [viewMode, setViewMode] = useStoredState<ViewMode>(
    "voxyfi.lib.view",
    "list",
  )
  const [sortKey, setSortKey] = useStoredState<SortKey>(
    "voxyfi.lib.sortKey",
    "recent",
  )
  const [sortDir, setSortDir] = useStoredState<SortDir>(
    "voxyfi.lib.sortDir",
    "desc",
  )
  const [groupByDate, setGroupByDate] = useStoredState<boolean>(
    "voxyfi.lib.group",
    false,
  )

  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // ----- Normalize books + documents into one list -----
  const items = useMemo<LibItem[]>(() => {
    const docItems: LibItem[] = documents.map((d) => ({
      kind: "doc",
      id: d.id,
      title: d.title,
      href: `/app/listen/${d.id}`,
      progress:
        d.wordCount > 0 ? Math.round((d.lastWord / d.wordCount) * 100) : 0,
      unread: d.lastWord === 0,
      type: fileType(d),
      updatedAt: new Date(d.updatedAt).getTime(),
      createdAt: new Date(d.createdAt).getTime(),
      doc: d,
    }))
    const bookItems: LibItem[] = books.map((b) => {
      const total = Math.max(b.content.split(/\s+/).length, 1)
      return {
        kind: "book",
        id: b.id,
        title: b.title,
        href: `/app/listen/book/${b.id}`,
        progress: b.lastWord > 0 ? Math.min(99, Math.round((b.lastWord / total) * 100)) : 0,
        unread: b.lastWord === 0,
        type: "book",
        // Books have no listening timestamp, so use the purchase date for both
        // "recent activity" and "date added" ordering.
        updatedAt: new Date(b.purchasedAt).getTime(),
        createdAt: new Date(b.purchasedAt).getTime(),
        book: b,
      }
    })
    return [...docItems, ...bookItems]
  }, [documents, books])

  // ----- Filter -----
  const activeTypeFilters = useMemo(
    () =>
      [...filters].filter((f): f is FileType => f !== "unread"),
    [filters],
  )
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (q && !it.title.toLowerCase().includes(q)) return false
      if (filters.has("unread") && !it.unread) return false
      if (activeTypeFilters.length > 0) {
        // Type filters only match documents; books are excluded when a type
        // filter is active.
        if (it.kind !== "doc") return false
        if (!activeTypeFilters.includes(it.type as FileType)) return false
      }
      return true
    })
  }, [items, q, filters, activeTypeFilters])

  // ----- Sort -----
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === "alpha") {
        cmp = a.title.localeCompare(b.title)
      } else if (sortKey === "added") {
        cmp = a.createdAt - b.createdAt
      } else {
        cmp = a.updatedAt - b.updatedAt
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // ----- Group -----
  const groups = useMemo(() => {
    if (!groupByDate) return [{ label: "", items: sorted }]
    const map = new Map<string, { order: number; items: LibItem[] }>()
    for (const it of sorted) {
      const dateForGroup = sortKey === "added" ? it.createdAt : it.updatedAt
      const { label, order } = dateBucket(dateForGroup)
      if (!map.has(label)) map.set(label, { order, items: [] })
      map.get(label)!.items.push(it)
    }
    return [...map.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([label, v]) => ({ label, items: v.items }))
  }, [sorted, groupByDate, sortKey])

  // ----- Actions -----
  function toggleFilter(key: FilterKey) {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function chooseSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "alpha" ? "asc" : "desc")
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelect() {
    setSelectMode(false)
    setSelected(new Set())
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await deleteDocument(id)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      await deleteDocuments(ids)
      exitSelect()
      router.refresh()
    } finally {
      setBulkBusy(false)
    }
  }

  const sortDirLabel = sortDir === "asc" ? "Ascending" : "Descending"
  const totalCount = sorted.length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {selectMode ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={exitSelect}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <span className="text-sm font-semibold">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={selected.size === 0 || bulkBusy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {bulkBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {/* Filter menu */}
          <Popover>
            <PopoverTrigger
              aria-label="Filter library"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary",
                filters.size > 0 && "border-primary text-primary",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 gap-1 p-2">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Filter
              </p>
              <div className="flex flex-wrap gap-2 p-1">
                {(
                  [
                    ["unread", "Unread"],
                    ["pdf", "PDF"],
                    ["txt", "TXT"],
                    ["epub", "ePub"],
                    ["web", "Web"],
                  ] as [FilterKey, string][]
                ).map(([key, label]) => {
                  const active = filters.has(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFilter(key)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground hover:bg-secondary/70",
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {filters.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(new Set())}
                  className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary"
                >
                  Clear filters
                </button>
              )}
            </PopoverContent>
          </Popover>

          {/* Search */}
          {showSearch ? (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your library"
                className="pl-9 pr-9"
                aria-label="Search your library"
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  setShowSearch(false)
                }}
                aria-label="Close search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                aria-label="Search"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary"
              >
                <Search className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Overflow menu */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger
              aria-label="Library options"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary"
            >
              <MoreHorizontal className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 gap-0 p-1.5">
              <MenuButton
                icon={ListChecks}
                label="Select Multiple"
                onClick={() => {
                  setSelectMode(true)
                  setMenuOpen(false)
                }}
              />

              <MenuSectionLabel>View</MenuSectionLabel>
              <MenuButton
                icon={ListIcon}
                label="List"
                checked={viewMode === "list"}
                onClick={() => setViewMode("list")}
              />
              <MenuButton
                icon={LayoutGrid}
                label="Large Grid"
                checked={viewMode === "large"}
                onClick={() => setViewMode("large")}
              />
              <MenuButton
                icon={Grid3x3}
                label="Small Grid"
                checked={viewMode === "small"}
                onClick={() => setViewMode("small")}
              />

              <MenuSectionLabel>Sorting</MenuSectionLabel>
              <MenuButton
                icon={Clock}
                label="Recent Activity"
                sublabel={sortKey === "recent" ? sortDirLabel : undefined}
                checked={sortKey === "recent"}
                onClick={() => chooseSort("recent")}
              />
              <MenuButton
                icon={CalendarDays}
                label="Date Added"
                sublabel={sortKey === "added" ? sortDirLabel : undefined}
                checked={sortKey === "added"}
                onClick={() => chooseSort("added")}
              />
              <MenuButton
                icon={ArrowDownAZ}
                label="Alphabetical"
                sublabel={sortKey === "alpha" ? sortDirLabel : undefined}
                checked={sortKey === "alpha"}
                onClick={() => chooseSort("alpha")}
              />

              <MenuSectionLabel>Grouping</MenuSectionLabel>
              <MenuButton
                icon={CalendarDays}
                label="Group by Date"
                checked={groupByDate}
                onClick={() => setGroupByDate((g) => !g)}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Active filter chips (outside menu, for quick removal) */}
      {filters.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...filters].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFilter(f)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {f === "unread"
                ? "Unread"
                : f === "epub"
                  ? "ePub"
                  : f === "web"
                    ? "Web"
                    : f.toUpperCase()}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Empty state after filtering */}
      {totalCount === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {q || filters.size > 0
            ? "Nothing matches your filters."
            : "Your library is empty."}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label || "all"}>
              {group.label && (
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                  {group.label}
                </h2>
              )}
              {viewMode === "list" ? (
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <LibListRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      selectMode={selectMode}
                      selected={selected.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                      onDelete={() => handleDelete(item.id)}
                      deleting={deletingId === item.id}
                    />
                  ))}
                </ul>
              ) : (
                <div
                  className={cn(
                    "grid gap-4",
                    viewMode === "large"
                      ? "grid-cols-2 sm:grid-cols-3"
                      : "grid-cols-3 sm:grid-cols-4",
                  )}
                >
                  {group.items.map((item) => (
                    <LibGridCard
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      small={viewMode === "small"}
                      selectMode={selectMode}
                      selected={selected.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Menu building blocks ---------- */

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

function MenuButton({
  icon: Icon,
  label,
  sublabel,
  checked,
  onClick,
}: {
  icon: React.ElementType
  label: string
  sublabel?: string
  checked?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
    >
      <span className="flex w-4 justify-center">
        {checked ? <Check className="h-4 w-4 text-primary" /> : null}
      </span>
      <Icon className="h-5 w-5 text-foreground" />
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {sublabel && (
          <span className="block text-xs text-muted-foreground">
            {sublabel}
          </span>
        )}
      </span>
    </button>
  )
}

/* ---------- Item renderers ---------- */

function DocThumb({
  item,
  className = "",
}: {
  item: LibItem
  className?: string
}) {
  const style = typeStyle[item.type]
  const preview = docPreview(item.doc)

  // Shown when there's no page to render (paste/type/link) or rendering fails.
  const fallback = (
    <div className="absolute inset-0 flex flex-col justify-between p-2">
      <span
        className={cn(
          "inline-flex w-fit rounded px-1.5 py-0.5 text-[0.6rem] font-bold",
          style.bg,
          style.fg,
        )}
      >
        {style.label}
      </span>
      <p className="line-clamp-3 text-pretty text-[0.7rem] font-semibold leading-tight">
        {item.title}
      </p>
    </div>
  )

  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className,
      )}
    >
      {preview ? (
        <DocumentThumbnail
          src={preview.src}
          mime={preview.mime}
          thumbnailUrl={preview.thumbnailUrl}
          docId={preview.docId}
          fallback={fallback}
          badge={
            <span
              className={cn(
                "absolute left-1.5 top-1.5 inline-flex rounded px-1.5 py-0.5 text-[0.55rem] font-bold shadow-sm",
                style.bg,
                style.fg,
              )}
            >
              {style.label}
            </span>
          }
        />
      ) : (
        fallback
      )}
    </div>
  )
}

function Cover({ item, className = "" }: { item: LibItem; className?: string }) {
  if (item.kind === "book" && item.book) {
    return <BookCover book={item.book} className={className} />
  }
  return <DocThumb item={item} className={className} />
}

function LibListRow({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onDelete,
  deleting,
}: {
  item: LibItem
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const Icon = item.kind === "book" ? FileText : sourceIcon[item.doc!.sourceType] ?? FileText
  const style = typeStyle[item.type]
  const selectable = item.kind === "doc"
  const preview = item.kind === "doc" ? docPreview(item.doc) : null

  const iconFallback = (
    <span
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center",
        style.bg,
        style.fg,
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="mt-0.5 text-[0.5rem] font-bold">{style.label}</span>
    </span>
  )

  const inner = (
    <>
      {item.kind === "book" && item.book ? (
        <BookCover book={item.book} className="h-14 w-10 shrink-0" />
      ) : (
        <span className="relative flex h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border">
          {preview ? (
            <DocumentThumbnail
              src={preview.src}
              mime={preview.mime}
              thumbnailUrl={preview.thumbnailUrl}
              docId={preview.docId}
              fallback={iconFallback}
            />
          ) : (
            iconFallback
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
        <span className="block text-xs text-muted-foreground">
          {progressLabel(item)}
          {item.kind === "doc" && item.doc!.wordCount > 0
            ? ` · ${item.doc!.wordCount} words`
            : ""}
        </span>
      </span>
    </>
  )

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      {selectMode && (
        <button
          type="button"
          onClick={selectable ? onToggleSelect : undefined}
          disabled={!selectable}
          aria-label={selected ? "Deselect" : "Select"}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
            !selectable && "opacity-30",
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>
      )}
      {selectMode ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
      ) : (
        <Link
          href={item.href}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {inner}
        </Link>
      )}
      {!selectMode && item.kind === "doc" && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete ${item.title}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      )}
    </li>
  )
}

function LibGridCard({
  item,
  small,
  selectMode,
  selected,
  onToggleSelect,
}: {
  item: LibItem
  small: boolean
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
}) {
  const selectable = item.kind === "doc"

  const body = (
    <>
      <div className="relative">
        <Cover
          item={item}
          className="w-full transition-transform group-hover:-translate-y-1"
        />
        {selectMode && (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white bg-black/30 text-transparent",
              !selectable && "opacity-30",
            )}
          >
            {selected && <Check className="h-3 w-3" />}
          </span>
        )}
      </div>
      <div className="mt-2">
        <p className={cn("truncate font-semibold", small ? "text-xs" : "text-sm")}>
          {item.title}
        </p>
        {!small && (
          <p className="truncate text-xs text-muted-foreground">
            {progressLabel(item)}
          </p>
        )}
      </div>
    </>
  )

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={selectable ? onToggleSelect : undefined}
        disabled={!selectable}
        className="group flex flex-col text-left"
      >
        {body}
      </button>
    )
  }

  return (
    <Link href={item.href} className="group flex flex-col">
      {body}
    </Link>
  )
}
