"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  )
}

export function ProfileAvatar({
  name,
  image,
}: {
  name: string
  image?: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(image ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)

    // Optimistic local preview while the upload runs.
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)

    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed.")
      setPreview(data.url)
      router.refresh()
    } catch (err) {
      setPreview(image ?? null)
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground ring-4 ring-background",
          "shadow-lg transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-primary",
        )}
        aria-label="Change profile photo"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview || "/placeholder.svg"}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-2xl font-bold">{initialsOf(name)}</span>
        )}

        <span className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-center bg-foreground/50 text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={handleFile}
      />

      {error && (
        <p className="mt-2 text-center text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
