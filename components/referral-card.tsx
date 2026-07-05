"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Gift, Share2 } from "lucide-react"
import { getOrCreateReferralCode } from "@/app/actions/profile"

export function ReferralCard({ initialCode }: { initialCode: string | null }) {
  const [code, setCode] = useState<string | null>(initialCode)
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState("")

  // Ensure a code exists (generates one lazily on first visit).
  useEffect(() => {
    if (!code) {
      getOrCreateReferralCode().then((res) => {
        if ("code" in res) setCode(res.code)
      })
    }
  }, [code])

  useEffect(() => {
    if (code && typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/sign-up?ref=${code}`)
    }
  }, [code])

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(shareUrl || code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // no-op
    }
  }

  async function share() {
    if (!code) return
    const text = `Listen to anything with VOXYFI. Use my code ${code} to get started:`
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "VOXYFI", text, url: shareUrl })
        return
      } catch {
        // user cancelled or unsupported — fall back to copy
      }
    }
    copy()
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Gift className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight">Invite friends</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Share VOXYFI and give friends a head start with your personal code.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-card px-4 py-3">
        <span className="font-mono text-lg font-bold tracking-widest">
          {code ?? "········"}
        </span>
        <button
          type="button"
          onClick={copy}
          disabled={!code}
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
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

      <button
        type="button"
        onClick={share}
        disabled={!code}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Share2 className="h-4 w-4" />
        Share invite
      </button>
    </div>
  )
}
