"use client"

import { useState } from "react"
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
} from "lucide-react"
import { deleteDocument } from "@/app/actions/documents"
import type { Document } from "@/lib/db/schema"

const sourceIcon: Record<string, React.ElementType> = {
  text: FileText,
  link: LinkIcon,
  file: FolderOpen,
  dictate: Mic,
  ai: Sparkles,
}

export function DocumentList({ documents }: { documents: Document[] }) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<number | null>(null)

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
    <ul className="space-y-2">
      {documents.map((doc) => {
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
                <span className="block truncate font-medium">{doc.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {doc.wordCount} words
                  {progress > 0 && progress < 100 && ` · ${progress}% listened`}
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
  )
}
