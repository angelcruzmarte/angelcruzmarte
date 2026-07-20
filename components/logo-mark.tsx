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
      <rect x="76" y="101" width="56" height="310" rx="28" />
      <rect x="152" y="148" width="56" height="215" rx="28" />
      <rect x="228" y="188" width="56" height="135" rx="28" />
      <rect x="304" y="148" width="56" height="215" rx="28" />
      <rect x="380" y="101" width="56" height="310" rx="28" />
    </svg>
  )
}
