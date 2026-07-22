"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  FileText,
  Link as LinkIcon,
  Mic,
  Sparkles,
  FolderOpen,
  RotateCcw,
  Trash2,
  Loader2,
} from "lucide-react"
import {
  restoreDocument,
  permanentlyDeleteDocument,
  emptyTrash,
} from "@/app/actions/documents"
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
import type { Document } from "@/lib/db/schema"

const sourceIcon: Record<string, React.ElementType> = {
  text: FileText,
  link: LinkIcon,
  file: FolderOpen,
  dictate: Mic,
  ai: Sparkles,
}

function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`
  const hours = Math.floor(diff / 3600000)
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`
  const mins = Math.floor(diff / 60000)
  if (mins > 0) return `${mins} min ago`
  return "just now"
}

export function DeletedFilesView({ documents }: { documents: Document[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [emptying, setEmptying] = useState(false)

  async function handleRestore(id: number) {
    setBusyId(id)
    try {
      await restoreDocument(id)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handlePermanentDelete(id: number) {
    setBusyId(id)
    try {
      await permanentlyDeleteDocument(id)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleEmptyTrash() {
    setEmptying(true)
    try {
      await emptyTrash()
      router.refresh()
    } finally {
      setEmptying(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/app/profile"
          aria-label="Back to settings"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Deleted Files</h1>
      </header>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Trash2 className="h-6 w-6" />
          </span>
          <p className="font-medium">Trash is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleted files appear here so you can restore them.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {documents.length} file{documents.length > 1 ? "s" : ""} in trash
            </p>
            <AlertDialog>
              <AlertDialogTrigger
                disabled={emptying}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                {emptying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Empty trash
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty trash?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes all {documents.length} file
                    {documents.length > 1 ? "s" : ""} in your trash. This cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleEmptyTrash}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <ul className="space-y-2">
            {documents.map((doc) => {
              const Icon = sourceIcon[doc.sourceType] ?? FileText
              const busy = busyId === doc.id
              return (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {doc.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Deleted {doc.deletedAt ? timeAgo(doc.deletedAt) : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(doc.id)}
                    disabled={busy}
                    aria-label={`Restore ${doc.title}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      disabled={busy}
                      aria-label={`Permanently delete ${doc.title}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Permanently delete?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          &ldquo;{doc.title}&rdquo; will be permanently deleted.
                          This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handlePermanentDelete(doc.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
