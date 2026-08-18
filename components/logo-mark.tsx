import { cn } from "@/lib/utils"

/**
 * The VOXYFI glyph: a self-contained circular badge — a black disc ringed by a
 * glowing emerald circle, holding two downward "double chevron" strokes (a
 * vivid emerald over a white one) that read as playback / "listen now" motion.
 * The whole mark is baked into this SVG so the app headers and the favicon
 * (/public/icon.svg) stay pixel-identical. The outer neon glow is applied by
 * the tile container in globals.css (`.voxyfi-logo-tile`).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("h-5 w-5", className)}
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
        <path d="M150 190 L256 276 L362 190" stroke="#13d18e" />
        <path d="M150 270 L256 356 L362 270" stroke="#ffffff" />
      </g>
    </svg>
  )
}
