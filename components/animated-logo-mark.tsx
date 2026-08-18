import { cn } from "@/lib/utils"

/**
 * Animated version of the VOXYFI glyph — the two downward chevrons gently bob
 * up and down in a staggered wave while `playing`, evoking playback motion,
 * then rest in the static shape. Geometry and colors match {@link LogoMark} and
 * the favicon (/public/icon.svg) exactly, so the static and animated marks are
 * interchangeable.
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
      className={cn("h-5 w-5", playing && "voxyfi-anim", className)}
      role="img"
      aria-label="VOXYFI"
    >
      {/* Black disc */}
      <circle cx="256" cy="256" r="256" fill="#050807" />
      {/* Glowing emerald ring */}
      <circle
        cx="256"
        cy="256"
        r="230"
        fill="none"
        stroke="#13d18e"
        strokeWidth="26"
      />
      {/* Two downward chevrons: emerald over white */}
      <g
        fill="none"
        strokeWidth="46"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M150 190 L256 276 L362 190"
          stroke="#13d18e"
          className={playing ? "voxyfi-chv voxyfi-chv-back" : undefined}
        />
        <path
          d="M150 270 L256 356 L362 270"
          stroke="#ffffff"
          className={playing ? "voxyfi-chv voxyfi-chv-front" : undefined}
        />
      </g>
    </svg>
  )
}
