import { cn } from "@/lib/utils"

/**
 * Animated version of the VOXYFI glyph — the two nested "Voice Chevron" strokes
 * gently bob up and down in a staggered wave while `playing`, evoking voice /
 * playback motion, then rest in the static chevron shape. Geometry matches
 * {@link LogoMark} and the favicon (/public/icon.svg) exactly, so the static
 * and animated marks are interchangeable.
 *
 * Motion is pure CSS (see `.voxyfi-anim` / `@keyframes voxyfi-chev-bob` in
 * globals.css) and automatically disables under `prefers-reduced-motion`.
 */
export function AnimatedLogoMark({
  className,
  playing = true,
}: {
  className?: string
  /** When false the mark is shown static in its resting shape. */
  playing?: boolean
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeWidth={48}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5", playing && "voxyfi-anim", className)}
      role="img"
      aria-label="VOXYFI"
    >
      <path
        d="M96 128 L256 288 L416 128"
        opacity={0.55}
        className={playing ? "voxyfi-chv voxyfi-chv-back" : undefined}
      />
      <path
        d="M96 210 L256 370 L416 210"
        className={playing ? "voxyfi-chv voxyfi-chv-front" : undefined}
      />
    </svg>
  )
}
