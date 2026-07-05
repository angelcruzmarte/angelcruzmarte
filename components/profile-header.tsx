"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, Loader2, Pencil, X } from "lucide-react"
import { UserAvatar } from "@/components/user-avatar"
import { updateAvatar, updateName } from "@/app/actions/profile"
import { cn } from "@/lib/utils"

export function ProfileHeader({
  name,
  image,
  planLabel,
}: {
  name: string
  image: string | null
  planLabel: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentName, setCurrentName] = useState(name)
  const [currentImage, setCurrentImage] = useState<string | null>(image)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  function onPickFile() {
    setError(null)
    fileInputRef.current?.click()
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await updateAvatar(fd)
      if ("error" in res) {
        setError(res.error)
      } else {
        // Cache-bust so the new image shows immediately.
        setCurrentImage(res.pathname)
        router.refresh()
      }
    } catch {
      setError("Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  function saveName() {
    const trimmed = draftName.trim()
    if (trimmed === currentName) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      const res = await updateName(trimmed)
      if ("error" in res) {
        setError(res.error)
      } else {
        setCurrentName(res.name)
        setEditing(false)
        setError(null)
        router.refresh()
      }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <UserAvatar
            name={currentName}
            image={currentImage}
            className="h-20 w-20"
          />
          <button
            type="button"
            onClick={onPickFile}
            disabled={uploading}
            aria-label="Change profile photo"
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-70"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === "Enter") saveName()
                  if (e.key === "Escape") {
                    setEditing(false)
                    setDraftName(currentName)
                  }
                }}
                maxLength={60}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xl font-bold outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={pending}
                aria-label="Save name"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-70"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraftName(currentName)
                  setError(null)
                }}
                aria-label="Cancel"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftName(currentName)
                setEditing(true)
              }}
              className="group flex items-center gap-2 text-left"
            >
              <span className="truncate text-2xl font-bold tracking-tight">
                {currentName}
              </span>
              <Pencil className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </button>
          )}
          <p
            className={cn(
              "mt-0.5 text-sm font-medium text-muted-foreground",
              editing && "hidden",
            )}
          >
            {planLabel}
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}
