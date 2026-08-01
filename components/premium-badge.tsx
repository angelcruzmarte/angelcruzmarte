import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type Size = "sm" | "md"

/**
 * The VOXYFI Premium membership indicator — the single source of truth for the
 * "Premium" pill across the app (headers, account menu, profile). It evolves
 * the flat badge into a premium-feeling chip: the signature green brand
 * gradient, an inset light edge for depth, a soft brand shadow, and a slow,
 * understated shine that loops once per cycle (see `.voxyfi-premium*` in
 * globals.css, disabled under prefers-reduced-motion). Brand green is
 * preserved throughout.
 */
const SIZES: Record<
  Size,
  { pill: string; icon: string; text: string }
> = {
  sm: {
    pill: "gap-1 px-2 py-0.5 text-xs",
    icon: "h-3 w-3",
    text: "",
  },
  md: {
    pill: "gap-1.5 px-2.5 py-1 text-xs",
    icon: "h-3.5 w-3.5",
    text: "tracking-wide",
  },
}

export function PremiumBadge({
  size = "md",
  className,
}: {
  size?: Size
  className?: string
}) {
  const s = SIZES[size]
  return (
    <span
      className={cn(
        "voxyfi-premium relative inline-flex items-center overflow-hidden rounded-full bg-brand-gradient font-semibold text-white shadow-[0_1px_3px_rgba(18,63,46,0.4)] ring-1 ring-inset ring-white/25",
        s.pill,
        className,
      )}
    >
      <Sparkles className={cn("relative z-10 shrink-0", s.icon)} aria-hidden="true" />
      <span className={cn("relative z-10", s.text)}>Premium</span>
      <span aria-hidden="true" className="voxyfi-premium-sheen" />
    </span>
  )
}
