import type { Metadata } from "next"
import Link from "next/link"
import { Check, Download, X } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { BrandLogo } from "@/components/brand-logo"
import { LogoMark } from "@/components/logo-mark"
import { ColorSwatch } from "@/components/brand/color-swatch"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Brand Guidelines — VOXYFI",
  description:
    "The VOXYFI brand system: logo, two-tone green palette, typography, app icons, and downloadable assets.",
}

const DEEP = "#123f2e"
const EMERALD = "#12b981"
const GRADIENT = `linear-gradient(135deg, ${DEEP} 0%, ${EMERALD} 100%)`

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight">
        {title}
      </h2>
      {children && (
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  )
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "gap-1.5")}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  )
}

function AssetCard({
  src,
  title,
  meta,
  href,
  checkered,
}: {
  src: string
  title: string
  meta: string
  href: string
  checkered?: boolean
}) {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div
        className={cn(
          "flex items-center justify-center p-5",
          checkered ? "bg-secondary" : "bg-card",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src || "/placeholder.svg"}
          alt={title}
          className="h-24 w-24 rounded-2xl object-contain"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="font-mono text-xs text-muted-foreground">{meta}</p>
        </div>
        <a
          href={href}
          download
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
          aria-label={`Download ${title}`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </Card>
  )
}

export default function BrandPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Brand Guidelines
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            The VOXYFI identity
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            A calm, premium system built around a single idea: turning reading
            into listening. A voice-waveform that dips into a{" "}
            <span className="font-medium text-foreground">V</span>, a signature
            deep-green-to-emerald gradient, and clean Geist typography.
          </p>
          <div className="mt-8">
            <span
              className="inline-flex items-center gap-4 rounded-2xl px-6 py-5 text-white shadow-sm"
              style={{ background: GRADIENT }}
            >
              <LogoMark className="h-9 w-9" />
              <span className="text-3xl font-semibold tracking-tight">VOXYFI</span>
            </span>
          </div>
        </div>
      </section>

      {/* Logo */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Logo" title="The mark & lockup">
          The lockup is the primary signature. The mark can stand alone in tight
          spaces. Always keep clear space around it equal to the height of one
          waveform bar, and never recolor or distort the glyph.
        </SectionHeading>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="flex flex-col items-center justify-center gap-4 bg-card p-8">
            <BrandLogo size="lg" />
            <span className="text-xs text-muted-foreground">Primary lockup</span>
          </Card>
          <Card className="flex flex-col items-center justify-center gap-4 p-8" style={{ background: GRADIENT }}>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-white">
              <LogoMark className="h-9 w-9" />
            </span>
            <span className="text-xs text-white/80">Mark on brand gradient</span>
          </Card>
          <Card className="flex flex-col items-center justify-center gap-4 bg-foreground p-8">
            <LogoMark className="h-12 w-12 text-background" />
            <span className="text-xs text-background/70">Monochrome (knockout)</span>
          </Card>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <DownloadLink href="/brand/voxyfi-icon.svg" label="Icon SVG" />
          <DownloadLink href="/brand/voxyfi-mark-mono.svg" label="Monochrome SVG" />
          <DownloadLink href="/brand/voxyfi-lockup.svg" label="Lockup SVG" />
        </div>

        {/* Do / Don't */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Check className="h-4 w-4" aria-hidden="true" /> Do
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Use the white glyph on the green gradient tile.</li>
              <li>Give the logo generous, uncluttered clear space.</li>
              <li>Use the monochrome mark on photos or busy backgrounds.</li>
            </ul>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <X className="h-4 w-4" aria-hidden="true" /> Don&apos;t
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Recolor the gradient or use off-brand greens.</li>
              <li>Stretch, rotate, or add shadows to the glyph.</li>
              <li>Place the lockup on low-contrast backgrounds.</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Color */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="Color" title="A two-tone green system">
            Deep hunter green grounds the brand; emerald brings energy. The
            gradient between them is our signature. Warm cream neutrals and a
            single amber highlight round out the palette. Click any swatch to
            copy its value.
          </SectionHeading>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <ColorSwatch name="Deep Green" value="#123f2e" sample={DEEP} />
            <ColorSwatch name="Emerald" value="#12b981" sample={EMERALD} />
            <ColorSwatch name="Brand Gradient" value="135° #123f2e → #12b981" sample={GRADIENT} />
            <ColorSwatch name="Primary" value="--primary" sample="var(--primary)" />
            <ColorSwatch
              name="Background"
              value="--background"
              sample="var(--background)"
              textClass="text-foreground"
            />
            <ColorSwatch name="Foreground" value="--foreground" sample="var(--foreground)" />
            <ColorSwatch
              name="Highlight"
              value="--highlight"
              sample="var(--highlight)"
              textClass="text-foreground"
            />
            <ColorSwatch
              name="Accent"
              value="--accent"
              sample="var(--accent)"
              textClass="text-accent-foreground"
            />
          </div>
        </div>
      </section>

      {/* Typography */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Typography" title="Geist, with a Lora accent">
          Geist is the voice of the product — used for all headings and body.
          Geist Mono handles code and numeric labels, and Lora adds an editorial
          touch for long-form reading moments.
        </SectionHeading>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Sans — Geist
            </p>
            <p className="mt-3 font-sans text-4xl font-semibold tracking-tight">Aa</p>
            <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
              Headings &amp; UI. Turn reading into listening.
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Serif — Lora
            </p>
            <p className="mt-3 font-serif text-4xl font-semibold">Aa</p>
            <p className="mt-2 font-serif text-sm leading-relaxed text-muted-foreground">
              Editorial accents &amp; quotes for a warm, literary feel.
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Mono — Geist Mono
            </p>
            <p className="mt-3 font-mono text-4xl font-semibold">Aa</p>
            <p className="mt-2 font-mono text-sm leading-relaxed text-muted-foreground">
              1.0x · 128 wpm · code
            </p>
          </Card>
        </div>
      </section>

      {/* App icons & assets */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="Assets" title="Icons for every platform">
            One vector master, exported for iOS, Android, watchOS, the web, and
            the app stores. Download the individual assets below.
          </SectionHeading>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <AssetCard src="/icon-512.png" title="App icon" meta="512×512 PNG" href="/icon-512.png" />
            <AssetCard src="/icon-maskable-512.png" title="Maskable" meta="512×512 PNG" href="/icon-maskable-512.png" />
            <AssetCard src="/apple-icon.png" title="Apple touch" meta="180×180 PNG" href="/apple-icon.png" />
            <AssetCard src="/brand/watch/watch-icon-1024.png" title="Apple Watch" meta="1024×1024 PNG" href="/brand/watch/watch-icon-1024.png" checkered />
            <AssetCard src="/brand/android/play-store-512.png" title="Play Store" meta="512×512 PNG" href="/brand/android/play-store-512.png" />
            <AssetCard src="/icon-1024.png" title="Marketing icon" meta="1024×1024 PNG" href="/icon-1024.png" />
            <AssetCard src="/icon.svg" title="Favicon (vector)" meta="SVG" href="/icon.svg" checkered />
            <AssetCard src="/favicon.ico" title="Favicon" meta="ICO 16/32/48" href="/favicon.ico" checkered />
          </div>

          <div className="mt-10">
            <p className="text-sm font-semibold">Social &amp; store graphics</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { src: "/brand/social/social-card-1200x630.png", title: "Social card", meta: "1200×630" },
                { src: "/brand/social/play-store-feature-1024x500.png", title: "Play feature", meta: "1024×500" },
                { src: "/brand/social/promo-light-1200x630.png", title: "Light promo", meta: "1200×630" },
              ].map((g) => (
                <Card key={g.src} className="flex flex-col overflow-hidden p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.src || "/placeholder.svg"} alt={g.title} className="aspect-[1200/630] w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                    <div>
                      <p className="text-sm font-medium">{g.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">{g.meta}</p>
                    </div>
                    <a
                      href={g.src}
                      download
                      className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                      aria-label={`Download ${g.title}`}
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <LogoMark className="h-4 w-4 text-primary" />
            VOXYFI
          </span>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
            <Link href="/legal/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
