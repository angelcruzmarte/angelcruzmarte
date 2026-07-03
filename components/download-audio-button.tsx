"use client"

import { useState } from "react"
import Link from "next/link"
import { Download, Loader2, Lock } from "lucide-react"
import { generateDownloadableAudio } from "@/app/actions/speech"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PREMIUM_VOICES } from "@/lib/voices"

function base64ToBlobUrl(base64: string, mediaType: string) {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i)
  }
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }))
}

function safeFileName(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "voxyfi-audio"
  )
}

/**
 * Premium-only control that generates a full MP3 of the given text and triggers
 * a browser download for offline listening. Non-subscribers see an upgrade
 * prompt instead.
 */
export function DownloadAudioButton({
  title,
  text,
  premium,
}: {
  title: string
  text: string
  premium: boolean
}) {
  const [voice, setVoice] = useState<string>(PREMIUM_VOICES[0].id)
  const [status, setStatus] = useState<"idle" | "loading">("idle")
  const [error, setError] = useState<string | null>(null)

  if (!premium) {
    return (
      <Link
        href="/subscribe"
        className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-1.5"}
      >
        <Lock className="h-4 w-4" />
        Download
      </Link>
    )
  }

  async function handleDownload() {
    setError(null)
    setStatus("loading")
    try {
      const res = await generateDownloadableAudio(text, voice)
      if ("error" in res) {
        setError(res.error)
        return
      }
      const url = base64ToBlobUrl(res.audio, res.mediaType)
      const a = document.createElement("a")
      a.href = url
      a.download = `${safeFileName(title)}.mp3`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Give the download a moment to start before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } finally {
      setStatus("idle")
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-1.5"}
      >
        <Download className="h-4 w-4" />
        Download
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="text-sm font-semibold">Download for offline</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Generate a studio-quality MP3 to listen anywhere, even without a
          connection.
        </p>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Voice
          </label>
          <Select value={voice} onValueChange={(v) => setVoice((v as string) ?? PREMIUM_VOICES[0].id)}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREMIUM_VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="mt-3 w-full gap-2"
          onClick={handleDownload}
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download MP3
            </>
          )}
        </Button>

        {error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
