"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Gift, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ReferralCard({ code }: { code: string }) {
  const [link, setLink] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Build the invite link from the current origin on the client.
    if (typeof window !== "undefined") {
      setLink(`${window.location.origin}/?ref=${code}`)
    }
  }, [code])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link || code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Listen with me on VOXYFI",
          text: "Turn anything into audio. Use my link to get started on VOXYFI.",
          url: link,
        })
        return
      } catch {
        // User cancelled or share failed — fall back to copy.
      }
    }
    void copy()
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
          <Gift className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold">Invite friends, get free time</h3>
          <p className="mt-0.5 text-sm text-primary-foreground/80">
            Share your code and you&apos;ll both unlock a free week of Premium.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary-foreground/10 p-1.5 pl-4">
        <span className="flex-1 truncate font-mono text-lg font-bold tracking-widest">
          {code}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary-foreground px-3 text-sm font-semibold text-primary transition-opacity hover:opacity-90"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy
            </>
          )}
        </button>
      </div>

      <Button
        onClick={share}
        variant="secondary"
        className="mt-3 w-full gap-2 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
      >
        <Share2 className="h-4 w-4" />
        Share invite link
      </Button>
    </div>
  )
}
