import { cn } from "@/lib/utils"

/**
 * Animated version of the VOXYFI glyph — the five waveform bars pulse like an
 * equalizer while `playing`, then rest in the waveform-that-dips-into-a-"V"
 * shape. Geometry matches {@link LogoMark} and the favicon (/public/icon.svg)
 * exactly, so the static and animated marks are interchangeable.
 *
 * Motion is pure CSS (see `.voxyfi-anim` / `@keyframes voxyfi-eq` in
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
  // Per-bar [delay, duration] in ms — staggered and varied so the bars feel
  // organic rather than marching in lockstep. Outer bars are slower/taller.
  const bars: Array<{ x: number; y: number; h: number; delay: number; dur: number }> = [
    { x: 76, y: 101, h: 310, delay: 0, dur: 1180 },
    { x: 152, y: 148, h: 215, delay: 180, dur: 980 },
    { x: 228, y: 188, h: 135, delay: 90, dur: 820 },
    { x: 304, y: 148, h: 215, delay: 260, dur: 1020 },
    { x: 380, y: 101, h: 310, delay: 60, dur: 1240 },
  ]

  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      className={cn("h-5 w-5", playing && "voxyfi-anim", className)}
      role="img"
      aria-label="VOXYFI"
    >
      {bars.map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={b.y}
          width={56}
          height={b.h}
          rx={28}
          style={
            playing
              ? { animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms` }
              : undefined
          }
        />
      ))}
    </svg>
  )
}
