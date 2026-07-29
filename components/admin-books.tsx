"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react"
import {
  createCommercialBook,
  deleteCommercialBook,
  updateCommercialBook,
  type AdminBook,
  type CommercialBookInput,
} from "@/app/actions/admin"
import { bookshopBuyUrl } from "@/lib/book-stores"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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
  }
}

export function AdminBooks({ books }: { books: AdminBook[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(books.length === 0)
  const [form, setForm] = useState<CommercialBookInput>(empty)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof CommercialBookInput>(
    key: K,
    value: CommercialBookInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setShowForm(true)
    setError(null)
  }

  function openEdit(b: AdminBook) {
    setForm(toInput(b))
    setEditingId(b.id)
    setShowForm(true)
    setError(null)
  }

  function submit() {
    if (!form.title.trim() || !form.author.trim()) {
      setError("Title and author are required.")
      return
    }
    if (!form.sampleText.trim()) {
      setError("Add a listenable sample — this is what users hear in-app.")
      return
    }
    if (!form.isbn?.trim() && !form.buyUrl?.trim()) {
      setError("Add an ISBN or a buy URL so the Bookshop.org link can be built.")
      return
    }
    setError(null)
    startTransition(async () => {
      const res = editingId
        ? await updateCommercialBook(editingId, form)
        : await createCommercialBook(form)
      if (res && "error" in res && res.error) {
        setError(res.error)
        return
      }
      setShowForm(false)
      setEditingId(null)
      setForm(empty)
      router.refresh()
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteCommercialBook(id)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {books.length} commercial title{books.length === 1 ? "" : "s"}
        </p>
        {!showForm && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            New title
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {editingId ? "Edit title" : "New commercial title"}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={form.author}
                onChange={(e) => set("author", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="isbn">ISBN (13-digit)</Label>
              <Input
                id="isbn"
                value={form.isbn ?? ""}
                placeholder="9780000000000"
                onChange={(e) => set("isbn", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="buyUrl">
                Buy URL override (optional — overrides the ISBN link)
              </Label>
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
                Listenable sample (publisher-provided excerpt — played in-app)
              </Label>
              <Textarea
                id="sampleText"
                rows={6}
                value={form.sampleText}
                placeholder="Paste the licensed sample/first pages here…"
                onChange={(e) => set("sampleText", e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set("featured", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Feature this title on the storefront
            </label>
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <Button onClick={submit} disabled={pending} className="gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save changes" : "Create title"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {books.map((b) => (
          <Card key={b.id} className="flex items-start gap-4 p-4">
            <div
              className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white"
              style={{ backgroundColor: b.coverColor }}
              aria-hidden
            >
              {b.isbn ? "ISBN" : "LINK"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{b.title}</p>
                {b.featured && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3" /> Featured
                  </Badge>
                )}
                <Badge variant="outline">{b.category}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{b.author}</p>
              <a
                href={bookshopBuyUrl({
                  title: b.title,
                  author: b.author,
                  isbn: b.isbn,
                  buyUrl: b.buyUrl,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Preview buy link <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEdit(b)}
                aria-label={`Edit ${b.title}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(b.id)}
                disabled={pending}
                aria-label={`Delete ${b.title}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
        {books.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">
            No commercial titles yet. Add one to sell via Bookshop.org.
          </p>
        )}
      </div>
    </div>
  )
}
