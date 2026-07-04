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
      <rect x="94" y="126" width="44" height="260" rx="22" />
      <rect x="164" y="166" width="44" height="180" rx="22" />
      <rect x="234" y="201" width="44" height="110" rx="22" />
      <rect x="304" y="166" width="44" height="180" rx="22" />
      <rect x="374" y="126" width="44" height="260" rx="22" />
    </svg>
  )
}
