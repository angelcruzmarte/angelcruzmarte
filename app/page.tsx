import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { BookOpen, Gauge, Headphones } from "lucide-react"
import { getCurrentUser } from "@/lib/session"
import { getActivePromotion } from "@/app/actions/promotions"
import { SiteHeader } from "@/components/site-header"
import { LogoMark } from "@/components/logo-mark"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { HomePricing, PromoHeroBadge, type HomePromo } from "@/components/home-promo"

export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

export default async function HomePage() {
  const user = await getCurrentUser()

  // Signed-in users skip the marketing page and go straight to the app.
  if (user) {
    redirect("/app")
  }

  // Reflect any active promotion on the public homepage. This is the same
  // promo that is applied as a real discount at checkout, so the prices shown
  // here are truthful. The banner/countdown only appears while the promo is
  // live (getActivePromotion respects the start/end window).
  const activePromo = await getActivePromotion()
  const promo: HomePromo | null =
    activePromo && activePromo.showBanner
      ? {
          percentOff: activePromo.percentOff,
          name: activePromo.name,
          description: activePromo.description,
          endsAt: activePromo.endsAt ? activePromo.endsAt.toISOString() : null,
          planScope: activePromo.planScope as "all" | "monthly" | "yearly",
        }
      : null

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero — clean, centered, no imagery */}
      <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:py-28">
        <PromoHeroBadge promo={promo} />
        <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Turn reading into listening
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Natural voices narrate your articles and books with word-by-word
          highlighting. Read with your ears while you commute, cook, or unwind.
        </p>
        <div className="mt-8">
          <Link
            href="/sign-up"
            className={buttonVariants({ size: "lg" }) + " w-full sm:w-auto"}
          >
            Start listening free
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Headphones,
              title: "Natural narration",
              body: "Lifelike voices read any text aloud at a pace that feels human.",
            },
            {
              icon: BookOpen,
              title: "Follow along",
              body: "Word-by-word highlighting keeps your eyes and ears in sync.",
            },
            {
              icon: Gauge,
              title: "Your speed",
              body: "Slow down to absorb or speed up to power through, 0.5x to 2x.",
            },
          ].map((f) => (
            <Card key={f.title} className="p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12">
          <div className="text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight">
              Simple, premium pricing
            </h2>
            <p className="mt-2 text-muted-foreground">
              Unlimited listening across the entire library. Cancel anytime.
            </p>
          </div>

          <HomePricing promo={promo} />
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <LogoMark className="h-4 w-4 text-primary" />
            VOXYFI
          </span>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/legal/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/legal/refund" className="hover:text-foreground">
              Refunds
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
