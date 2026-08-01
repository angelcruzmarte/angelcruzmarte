"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, ChevronDown, Mail } from "lucide-react"
import { cn } from "@/lib/utils"

type QA = { q: string; a: string }

const FAQS: QA[] = [
  {
    q: "What is VOXYFI?",
    a: "VOXYFI turns your books, documents, and articles into natural-sounding audio using premium AI voices, so you can listen anywhere.",
  },
  {
    q: "Which file types can I listen to?",
    a: "You can listen to PDFs, TXT and DOC files, EPUB books, and pasted text. Upload a file or add text and VOXYFI narrates it for you.",
  },
  {
    q: "How does the free trial work?",
    a: "Premium starts with a free trial. You get full access to all AI voices and unlimited listening during the trial. You can cancel anytime before it ends and you won't be charged.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Go to Profile → Account & billing and tap Cancel. Your access continues until the end of the current period, and no further charges are made. You can resume before it ends if you change your mind.",
  },
  {
    q: "Will I be charged after the trial if I cancel?",
    a: "No. If you cancel during the trial, the subscription ends when the trial does and your card is never charged.",
  },
  {
    q: "Can I change the narration voice or speed?",
    a: "Yes. In the player you can switch between premium AI voices and adjust the playback speed to suit how you like to listen.",
  },
  {
    q: "How does the referral program work?",
    a: "Share your referral link from your profile. When friends subscribe, you both get rewarded — invite 2 friends and get 1 year free.",
  },
  {
    q: "I need more help. How do I reach support?",
    a: "Tap the Email support button below, or email us directly at support@voxyfi.com. We're happy to help.",
  },
]

export function FaqView() {
  const router = useRouter()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="pb-10">
      <header className="sticky top-0 z-10 flex items-center justify-center border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight">FAQ</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        <p className="pt-6 text-pretty text-sm text-muted-foreground">
          Answers to common questions. Still stuck? Reach us any time.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i
            return (
              <li
                key={item.q}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-accent"
                >
                  <span className="text-sm font-semibold">{item.q}</span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        <a
          href="mailto:support@voxyfi.com"
          className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Mail className="h-4 w-4" />
          Email support
        </a>
      </div>
    </div>
  )
}
