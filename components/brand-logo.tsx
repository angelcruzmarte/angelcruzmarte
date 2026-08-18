import { cn } from "@/lib/utils"
import { LogoMark } from "@/components/logo-mark"

type Size = "sm" | "md" | "lg"

/**
 * The single source of truth for the VOXYFI brand lockup: a rounded primary
 * tile holding the waveform glyph, next to the custom wordmark. Every header
 * across the app (marketing, app, admin, auth, onboarding) renders this so the
 * logo looks identical everywhere. Only the `size` changes per context.
 *
 * Polish lives in globals.css (`.voxyfi-logo*` / `.voxyfi-wordmark`): the tile
 * carries a soft two-layer brand shadow and an inset light edge, and lifts with
 * a gentle sheen sweep on hover/focus. All motion is transform/opacity only and
 * disabled under prefers-reduced-motion.
 */
const SIZES: Record<
  Size,
  { tile: string; word: string; gap: string }
> = {
  sm: {
    tile: "h-8 w-8",
    word: "text-[0.95rem]",
    gap: "gap-2",
  },
  md: {
    tile: "h-9 w-9",
    word: "text-lg",
    gap: "gap-2.5",
  },
  lg: {
    tile: "h-11 w-11",
    word: "text-2xl",
    gap: "gap-3",
  },
}

export function BrandLogo({
  size = "md",
  withWordmark = true,
  subtitle,
  className,
}: {
  size?: Size
  withWordmark?: boolean
  subtitle?: string
  className?: string
}) {
  const s = SIZES[size]
  return (
    <span
      className={cn("voxyfi-logo inline-flex items-center", s.gap, className)}
    >
      <span
        className={cn(
          "voxyfi-logo-tile relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          s.tile,
        )}
      >
        <LogoMark className="relative z-10 h-full w-full" />
        <span aria-hidden="true" className="voxyfi-logo-sheen" />
      </span>
      {withWordmark && (
        <span className="leading-none">
          <span className={cn("voxyfi-wordmark block text-foreground", s.word)}>
            VOXYFI
          </span>
          {subtitle && (
            <span className="mt-1 block text-xs font-medium text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
