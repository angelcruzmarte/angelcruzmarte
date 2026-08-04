import type { Metadata } from "next"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "VOXYFI — Logo Options",
  description:
    "Unique logo concepts for VOXYFI, keeping the green voice-and-reading theme.",
}

/* -------------------------------------------------------------------------- */
/*  Concept glyphs (viewBox 0 0 512 512, fill = currentColor)                 */
/* -------------------------------------------------------------------------- */

/**
 * Concept 1 — "Waveform V".
 * The waveform you already have, but the bar CENTERS descend to a single low
 * point so the mark reads as an unmistakable "V". Keeps the equalizer DNA while
 * becoming ownable instead of a generic symmetric bell.
 */
function WaveformV({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="VOXYFI waveform V logo concept"
    >
      <rect x="76" y="90" width="56" height="200" rx="28" />
      <rect x="152" y="175" width="56" height="150" rx="28" />
      <rect x="228" y="240" width="56" height="120" rx="28" />
      <rect x="304" y="175" width="56" height="150" rx="28" />
      <rect x="380" y="90" width="56" height="200" rx="28" />
    </svg>
  )
}

/**
 * Concept 2 — "Voice Chevron".
 * Two nested rounded chevrons forming a bold "V" with a sense of motion/forward
 * playback. No bars at all, so it is the furthest from a generic equalizer and
 * scales down cleanly to favicon size.
 */
function VoiceChevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="VOXYFI voice chevron logo concept"
    >
      <path d="M96 108 L256 268 L416 108" strokeWidth={48} opacity={0.5} />
      <path d="M96 190 L256 350 L416 190" strokeWidth={48} />
    </svg>
  )
}

/**
 * Concept 3 — "Read-Aloud".
 * An open page whose text lines turn into a soundwave on the facing page —
 * literally "documents that speak". The most product-specific concept; best at
 * 24px and up (busier at favicon size).
 */
function ReadAloud({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="VOXYFI read-aloud logo concept"
    >
      {/* spine */}
      <rect x="248" y="150" width="16" height="230" rx="8" />
      {/* left page — text lines */}
      <rect x="96" y="182" width="140" height="20" rx="10" />
      <rect x="96" y="232" width="140" height="20" rx="10" />
      <rect x="96" y="282" width="108" height="20" rx="10" />
      {/* right page — waveform */}
      <rect x="288" y="236" width="22" height="60" rx="11" />
      <rect x="326" y="206" width="22" height="120" rx="11" />
      <rect x="364" y="180" width="22" height="172" rx="11" />
      <rect x="402" y="222" width="22" height="88" rx="11" />
    </svg>
  )
}

type Concept = {
  id: string
  name: string
  tagline: string
  note: string
  Glyph: (props: { className?: string }) => React.JSX.Element
}

const CONCEPTS: Concept[] = [
  {
    id: "waveform-v",
    name: "Waveform V",
    tagline: "Your equalizer, evolved into a real V",
    note: "Closest to today's mark — lowest risk, instantly on-brand, and the bars now spell the V so it stops looking like a stock audio icon.",
    Glyph: WaveformV,
  },
  {
    id: "voice-chevron",
    name: "Voice Chevron",
    tagline: "Bold, forward-motion, no bars at all",
    note: "The most distinct from boxify-style bar logos and the cleanest at tiny favicon sizes. Reads as V + playback momentum.",
    Glyph: VoiceChevron,
  },
  {
    id: "read-aloud",
    name: "Read-Aloud",
    tagline: "Text that turns into sound",
    note: "The most meaningful — a page whose lines become a waveform. Uniquely 'VOXYFI'. Best used at 24px and up.",
    Glyph: ReadAloud,
  },
]

/** Reuses the exact production tile styling from <BrandLogo>. */
function Tile({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-brand-gradient text-white ring-1 ring-inset ring-white/20",
        className,
      )}
    >
      {children}
    </span>
  )
}

export default function LogoOptionsPage() {
  return (
    <main className="min-h-dvh bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-primary">
            Brand exploration
          </p>
          <h1 className="text-balance text-3xl font-bold sm:text-4xl">
            Three unique logo directions for VOXYFI
          </h1>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Each keeps the green voice-and-reading theme and the rounded brand
            tile, but breaks away from the generic symmetric equalizer that looks
            like other audio apps. Pick the one you like and I&apos;ll wire it
            into the logo, the animated mark, and the favicon everywhere.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {CONCEPTS.map(({ id, name, tagline, note, Glyph }) => (
            <section
              key={id}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                {/* Lockup preview */}
                <div className="flex items-center gap-3">
                  <Tile className="h-14 w-14 rounded-2xl">
                    <Glyph className="h-8 w-8" />
                  </Tile>
                  <span className="leading-none">
                    <span className="voxyfi-wordmark block text-2xl text-foreground">
                      VOXYFI
                    </span>
                    <span className="mt-1 block text-xs font-medium text-muted-foreground">
                      {tagline}
                    </span>
                  </span>
                </div>

                {/* Size / color previews */}
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <Tile className="h-9 w-9 rounded-xl">
                      <Glyph className="h-5 w-5" />
                    </Tile>
                    <span className="text-[10px] text-muted-foreground">
                      header
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <Tile className="h-6 w-6 rounded-md">
                      <Glyph className="h-[14px] w-[14px]" />
                    </Tile>
                    <span className="text-[10px] text-muted-foreground">
                      favicon
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-primary">
                      <Glyph className="h-5 w-5" />
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      mono
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <h2 className="text-sm font-semibold">{name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {note}
                </p>
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Tell me which one (Waveform V, Voice Chevron, or Read-Aloud) and
          I&apos;ll apply it across the app.
        </p>
      </div>
    </main>
  )
}
