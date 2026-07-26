import { cn } from "@/lib/utils"
import { LogoMark } from "@/components/logo-mark"

type Size = "sm" | "md" | "lg"

/**
 * The single source of truth for the VOXYFI brand lockup: a rounded-xl
 * primary tile holding the waveform glyph, next to the wordmark. Every header
 * across the app (marketing, app, admin, auth) renders this so the logo looks
 * identical everywhere. Only the `size` changes per context.
 */
const SIZES: Record<
  Size,
  { tile: string; glyph: string; word: string }
> = {
  sm: { tile: "h-8 w-8 rounded-xl", glyph: "h-[18px] w-[18px]", word: "text-base" },
  md: { tile: "h-9 w-9 rounded-xl", glyph: "h-5 w-5", word: "text-lg" },
  lg: { tile: "h-10 w-10 rounded-xl", glyph: "h-[22px] w-[22px]", word: "text-xl" },
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
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center bg-brand-gradient text-white shadow-sm",
          s.tile,
        )}
      >
        <LogoMark className={s.glyph} />
      </span>
      {withWordmark && (
        <span className="leading-none">
          <span className={cn("font-semibold tracking-tight", s.word)}>
            VOXYFI
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
