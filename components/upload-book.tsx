"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

const ACCEPT =
  ".txt,.md,.markdown,.pdf,.docx,.epub,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip"

/**
 * Dropzone that uploads a book file (PDF/DOCX/EPUB/TXT/MD), parses it
 * server-side, saves it as a personal document, and opens the free player.
 */
export function UploadBook() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      setError("File is too large. Please use a file under 15MB.")
      return
    }
    setFileName(file.name)
    setUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body,
      })
      const data = (await res.json()) as { id?: number; error?: string }
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not process that file.")
        setUploading(false)
        return
      }
      router.push(`/app/listen/${data.id}`)
    } catch {
      setError("Upload failed. Please try again.")
      setUploading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-secondary/50 hover:bg-secondary",
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </span>
        <span className="font-semibold">
          {uploading
            ? `Processing ${fileName ?? "file"}…`
            : "Upload a book to listen free"}
        </span>
        <span className="text-xs text-muted-foreground">
          Drag &amp; drop or tap to choose · PDF, DOCX, EPUB, TXT, MD (up to
          15MB)
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
