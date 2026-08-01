"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Voice persona avatar with graceful fallback. If the portrait image fails to
 * load (slow network, missing file), we render the voice's initials on a
 * branded circle instead of a broken-image icon.
 */
export function VoiceAvatar({
  name,
  image,
  size = 36,
  className,
  alt,
  ring = false,
}: {
  name: string
  image?: string
  size?: number
  className?: string
  alt?: string
  ring?: boolean
}) {
  const [failed, setFailed] = useState(false)

  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  const dimension = { width: size, height: size }

  if (failed || !image) {
    return (
      <span
        aria-hidden={alt === "" ? true : undefined}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        style={dimension}
        className={cn(
          "flex shrink-0 select-none items-center justify-center rounded-full bg-primary/15 font-semibold text-primary",
          ring && "ring-2 ring-primary/20",
          className,
        )}
      >
        <span style={{ fontSize: Math.max(10, size * 0.4) }}>{initials}</span>
      </span>
    )
  }

  return (
    <img
      src={image || "/placeholder.svg"}
      alt={alt ?? `${name} voice`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={dimension}
      className={cn(
        "shrink-0 rounded-full bg-muted object-cover",
        ring && "ring-2 ring-primary/20",
        className,
      )}
    />
  )
}
