"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  FileText,
  Link as LinkIcon,
  Mic,
  Sparkles,
  FolderOpen,
  Trash2,
  Loader2,
  Search,
  BookOpen,
} from "lucide-react"
import { deleteDocument } from "@/app/actions/documents"
import { BookCover } from "@/components/book-cover"
import { Input } from "@/components/ui/input"
import type { Book, Document } from "@/lib/db/schema"

const sourceIcon: Record<string, React.ElementType> = {
  text: FileText,
  link: LinkIcon,
  file: FolderOpen,
  dictate: Mic,
  ai: Sparkles,
}

type OwnedBook = Book & { lastWord: number }

export function LibraryView({
  documents,
  books,
}: {
  documents: Document[]
  books: OwnedBook[]
}) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()

  const filteredBooks = useMemo(
    () =>
      q
        ? books.filter(
            (b) =>
              b.title.toLowerCase().includes(q) ||
              b.author.toLowerCase().includes(q),
          )
        : books,
    [books, q],
  )

  const filteredDocs = useMemo(
    () =>
      q
        ? documents.filter((d) => d.title.toLowerCase().includes(q))
        : documents,
    [documents, q],
  )

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await deleteDocument(id)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library"
          className="pl-9"
          aria-label="Search your library"
        />
      </div>

      {/* My Books */}
      {books.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">My Books</h2>
            <span className="text-sm text-muted-foreground">
              {books.length}
            </span>
          </div>
          {filteredBooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No books match your search.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {filteredBooks.map((book) => {
                const progress =
                  book.lastWord > 0
                    ? Math.min(
                        99,
                        Math.round(
                          (book.lastWord /
                            Math.max(book.content.split(/\s+/).length, 1)) *
                            100,
                        ),
                      )
                    : 0
                return (
                  <Link
                    key={book.id}
                    href={`/app/listen/book/${book.id}`}
                    className="group flex flex-col gap-2"
                  >
                    <BookCover
                      book={book}
                      className="w-full transition-transform group-hover:-translate-y-1"
                    />
                    <div>
                      <p className="truncate text-sm font-semibold">
                        {book.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {progress > 0 ? `${progress}% listened` : "Not started"}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Uploads & documents */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">My Files</h2>
          <span className="text-sm text-muted-foreground">
            {documents.length}
          </span>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Upload a PDF, DOCX, EPUB, or paste text to start listening.
          </p>
        ) : filteredDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No files match your search.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredDocs.map((doc) => {
              const Icon = sourceIcon[doc.sourceType] ?? FileText
              const progress =
                doc.wordCount > 0
                  ? Math.round((doc.lastWord / doc.wordCount) * 100)
                  : 0
              return (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <Link
                    href={`/app/listen/${doc.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {doc.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {doc.wordCount} words
                        {progress > 0 &&
                          progress < 100 &&
                          ` · ${progress}% listened`}
                        {progress >= 100 && " · finished"}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    aria-label={`Delete ${doc.title}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
