import { cn } from "@/lib/utils"

/**
 * The VOXYFI glyph: two nested rounded chevrons ("Voice Chevron") forming a
 * bold "V" with a sense of forward playback motion. Drawn with strokes in
 * currentColor so it inherits the parent's text color, matching the tile
 * styling used across the app headers. Mirrors the favicon in /public/icon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeWidth={48}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5", className)}
      role="img"
      aria-label="VOXYFI"
    >
      <path d="M96 128 L256 288 L416 128" opacity={0.55} />
      <path d="M96 210 L256 370 L416 210" />
    </svg>
  )
}
