import type { Metadata } from "next"
import Link from "next/link"
import { Download, Mail } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { LogoMark } from "@/components/logo-mark"
import { BrandLogo } from "@/components/brand-logo"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Press & Media Kit — VOXYFI",
  description:
    "Company facts, boilerplate, logos, screenshots, and brand assets for journalists and partners covering VOXYFI.",
}

const DEEP = "#123f2e"
const EMERALD = "#12b981"
const GRADIENT = `linear-gradient(135deg, ${DEEP} 0%, ${EMERALD} 100%)`
const PRESS_EMAIL = "press@voxyfi.com"

const FACTS: { label: string; value: string }[] = [
  { label: "What it is", value: "An app that turns anything you read into natural audio you can listen to." },
  { label: "Category", value: "Productivity · Text-to-speech · Accessibility" },
  { label: "Formats", value: "PDF, DOCX, EPUB, articles, web links, and scanned pages" },
  { label: "Languages", value: "Reads and auto-translates across dozens of languages" },
  { label: "Platforms", value: "Web, iOS & Android (PWA), with Apple Watch now-playing" },
  { label: "Availability", value: "voxyfi.com" },
]

const SCREENSHOTS = [
  { src: "/brand/screenshots/01-listen-ios-6.7.png", alt: "VOXYFI listening screen" },
  { src: "/brand/screenshots/02-translate-ios-6.7.png", alt: "VOXYFI translation screen" },
  { src: "/brand/screenshots/03-tools-ios-6.7.png", alt: "VOXYFI AI tools screen" },
]

const LOGOS = [
  { src: "/icon-1024.png", title: "App icon", meta: "PNG · 1024²", href: "/icon-1024.png", checkered: false },
  { src: "/brand/voxyfi-icon.svg", title: "Icon (vector)", meta: "SVG", href: "/brand/voxyfi-icon.svg", checkered: true },
  { src: "/brand/voxyfi-mark-mono.svg", title: "Monochrome mark", meta: "SVG", href: "/brand/voxyfi-mark-mono.svg", checkered: true },
]

const COLORS = [
  { name: "Green (deep)", hex: "#123F2E", css: DEEP },
  { name: "Emerald", hex: "#10B981", css: "#10b981" },
  { name: "Primary", hex: "#176B43", css: "#176b43" },
  { name: "Cream", hex: "#F5F2EA", css: "#f5f2ea", border: true },
  { name: "Ink", hex: "#0C1B14", css: "#0c1b14" },
]

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight">{title}</h2>
      {children && <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  )
}

export default function PressPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Press &amp; Media</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            VOXYFI press kit
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Everything you need to write about VOXYFI — company facts, approved
            boilerplate, logos, screenshots, and brand assets. Free to use in
            editorial coverage of VOXYFI.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/brand/voxyfi-brand-kit.zip" download className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download brand kit
            </a>
            <Link href="/brand" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Brand guidelines
            </Link>
            <a href={`mailto:${PRESS_EMAIL}`} className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "gap-2")}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              {PRESS_EMAIL}
            </a>
          </div>
        </div>
      </section>

      {/* Fast facts */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="At a glance" title="Fast facts">
          The essentials, ready to quote.
        </SectionHeading>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FACTS.map((f) => (
            <Card key={f.label} className="p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">{f.label}</p>
              <p className="mt-2 text-pretty leading-relaxed">{f.value}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Boilerplate */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="Boilerplate" title="About VOXYFI">
            Approved company descriptions. Please use verbatim.
          </SectionHeading>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <p className="text-sm font-semibold">Short</p>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                VOXYFI turns anything you read — PDFs, documents, articles, and
                web pages — into natural, human-quality audio you can listen to
                anywhere, in dozens of languages.
              </p>
            </Card>
            <Card className="p-6">
              <p className="text-sm font-semibold">Long</p>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                VOXYFI is a listening app for everything you&apos;d normally have
                to read. Upload a PDF, paste a link, or import a document and
                VOXYFI reads it aloud in a natural voice — following along on the
                original page, translating on the fly, and syncing playback to
                your phone, browser, and Apple Watch. It&apos;s built for
                commuters, students, researchers, and anyone who retains more by
                listening.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Logos */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Logos" title="Logos & marks">
          Please keep clear space around the mark and never recolor or distort
          it. Full usage rules live in the{" "}
          <Link href="/brand" className="font-medium text-primary underline-offset-4 hover:underline">
            brand guidelines
          </Link>
          .
        </SectionHeading>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LOGOS.map((l) => (
            <Card key={l.title} className="flex flex-col overflow-hidden p-0">
              <div className={cn("flex items-center justify-center p-6", l.checkered ? "bg-secondary" : "bg-card")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.src || "/placeholder.svg"} alt={l.title} className="h-24 w-24 rounded-2xl object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">{l.meta}</p>
                </div>
                <a
                  href={l.href}
                  download
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
                  aria-label={`Download ${l.title}`}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </Card>
          ))}
        </div>
        {/* Lockup on gradient */}
        <div className="mt-4 overflow-hidden rounded-2xl">
          <div className="flex items-center gap-4 px-6 py-8 text-white" style={{ background: GRADIENT }}>
            <LogoMark className="h-10 w-10" />
            <span className="text-3xl font-semibold tracking-tight">VOXYFI</span>
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="Product" title="Screenshots">
            High-resolution app screenshots. More localized sets are in the
            brand guidelines.
          </SectionHeading>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {SCREENSHOTS.map((s) => (
              <Card key={s.src} className="flex flex-col overflow-hidden p-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src || "/placeholder.svg"} alt={s.alt} className="aspect-[1290/2796] w-full object-cover" />
                <div className="flex items-center justify-end border-t border-border p-2">
                  <a
                    href={s.src}
                    download
                    className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                    aria-label={`Download ${s.alt}`}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Color" title="Palette">
          The signature two-tone green. oklch values are authoritative; the hex
          below are approximations for print and design tools.
        </SectionHeading>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {COLORS.map((c) => (
            <Card key={c.name} className="overflow-hidden p-0">
              <div
                className={cn("h-24 w-full", c.border && "border-b border-border")}
                style={{ backgroundColor: c.css }}
              />
              <div className="p-3">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.hex}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Media contact</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Working on a story?</h2>
            <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
              For interviews, additional assets, or product questions, reach the
              VOXYFI team directly. We typically respond within two business days.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <a href={`mailto:${PRESS_EMAIL}`} className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              {PRESS_EMAIL}
            </a>
            <a href="/brand/voxyfi-brand-kit.zip" download className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download brand kit
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
          <BrandLogo size="sm" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} VOXYFI · <Link href="/brand" className="hover:text-foreground">Brand</Link> · <Link href="/" className="hover:text-foreground">Home</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
