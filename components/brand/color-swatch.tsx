"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A single brand color chip. Click to copy its hex/token value. Used across the
 * /brand guide so the palette is both documented and immediately usable.
 */
export function ColorSwatch({
  name,
  value,
  sample,
  textClass = "text-white",
  className,
}: {
  name: string
  /** The value copied to the clipboard + shown as the mono label (hex or token). */
  value: string
  /** CSS background applied to the chip (solid color or gradient). */
  sample: string
  /** Text color used for the on-chip label so it stays legible. */
  textClass?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard may be unavailable (e.g. insecure context) — fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border text-left transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={`Copy ${name} value ${value}`}
    >
      <span
        className={cn("flex h-20 items-end justify-end p-2", textClass)}
        style={{ background: sample }}
      >
        <span className="rounded-md bg-black/15 p-1 opacity-0 transition-opacity group-hover:opacity-100">
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>
      </span>
      <span className="flex flex-col gap-0.5 bg-card p-3">
        <span className="text-sm font-medium text-card-foreground">{name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {copied ? "Copied!" : value}
        </span>
      </span>
    </button>
  )
}
