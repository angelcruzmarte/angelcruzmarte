"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import {
  createItem,
  deleteItem,
  togglePublished,
  updateItem,
} from "@/app/actions/library"
import type { ReadingItem } from "@/lib/db/schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Props = {
  items: ReadingItem[]
}

const EMPTY = {
  title: "",
  author: "",
  category: "",
  excerpt: "",
  content: "",
}

export function AdminContentManager({ items }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY)
    setError(null)
    setShowForm(true)
  }

  function openEdit(item: ReadingItem) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      author: item.author ?? "",
      category: item.category,
      excerpt: item.excerpt ?? "",
      content: item.content,
    })
    setError(null)
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const payload = {
        title: form.title,
        author: form.author || undefined,
        category: form.category || undefined,
        excerpt: form.excerpt || undefined,
        content: form.content,
      }
      const result = editingId
        ? await updateItem(editingId, payload)
        : await createItem(payload)
      if (result && "error" in result && result.error) {
        setError(result.error)
        return
      }
      setShowForm(false)
      setForm(EMPTY)
      setEditingId(null)
      router.refresh()
    })
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteItem(id)
      router.refresh()
    })
  }

  function handleToggle(id: number, next: boolean) {
    startTransition(async () => {
      await togglePublished(id, next)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "title" : "titles"}
        </p>
        {!showForm && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New title
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mt-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {editingId ? "Edit title" : "New title"}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowForm(false)}
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="author">Author (optional)</Label>
                <Input
                  id="author"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Essays, Fiction, News"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="excerpt">Excerpt (optional)</Label>
              <Input
                id="excerpt"
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                placeholder="Short summary shown in the library"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
                className="min-h-60 font-serif text-base leading-relaxed"
                placeholder="Paste the full text to be narrated..."
              />
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Save changes" : "Publish title"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {items.length === 0 && !showForm && (
          <Card className="p-10 text-center text-muted-foreground">
            No titles yet. Create your first one to get started.
          </Card>
        )}
        {items.map((item) => (
          <Card key={item.id} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-medium">{item.title}</h3>
                <Badge variant={item.published ? "default" : "secondary"}>
                  {item.published ? "Published" : "Draft"}
                </Badge>
                <Badge variant="secondary">{item.category}</Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {item.author ? `by ${item.author} · ` : ""}
                {item.content.trim().split(/\s+/).length.toLocaleString()} words
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleToggle(item.id, !item.published)}
                disabled={isPending}
                aria-label={item.published ? "Unpublish" : "Publish"}
              >
                {item.published ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEdit(item)}
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(item.id)}
                disabled={isPending}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
