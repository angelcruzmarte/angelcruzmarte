import { cn } from "@/lib/utils"

/**
 * The VOXYFI glyph: five rounded bars in a waveform that dips to form a "V"
 * (voice + equalizer). Uses currentColor so it inherits the parent's text
 * color, matching the tile styling used across the app headers. Mirrors the
 * favicon in /public/icon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      className={cn("h-5 w-5", className)}
      role="img"
      aria-label="VOXYFI"
    >
      <rect x="83" y="116" width="50" height="280" rx="25" />
      <rect x="157" y="161" width="50" height="190" rx="25" />
      <rect x="231" y="196" width="50" height="120" rx="25" />
      <rect x="305" y="161" width="50" height="190" rx="25" />
      <rect x="379" y="116" width="50" height="280" rx="25" />
    </svg>
  )
}
