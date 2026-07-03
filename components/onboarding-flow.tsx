"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import * as Icons from "lucide-react"
import { X, Mic, Check, Loader2, Keyboard, Sparkles } from "lucide-react"
import { INTERESTS } from "@/lib/interests"
import { saveInterests } from "@/app/actions/interests"
import { completeOnboarding } from "@/app/actions/onboarding"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as any)[name] ?? Icons.Tag
  return <Icon className={className} />
}

const STEP_COUNT = 3

export function OnboardingFlow({ initialInterests }: { initialInterests: string[] }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [micState, setMicState] = useState<"idle" | "granted" | "denied">("idle")
  const [selected, setSelected] = useState<Set<string>>(new Set(initialInterests))
  const [finishing, setFinishing] = useState(false)

  async function requestMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMicState("granted")
    } catch {
      setMicState("denied")
    } finally {
      setStep(1)
    }
  }

  function toggleInterest(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function finish() {
    if (finishing) return
    setFinishing(true)
    try {
      if (selected.size > 0) await saveInterests(Array.from(selected))
      await completeOnboarding()
      router.replace("/app")
      router.refresh()
    } catch {
      setFinishing(false)
    }
  }

  async function skipAll() {
    if (finishing) return
    setFinishing(true)
    try {
      await completeOnboarding()
      router.replace("/app")
      router.refresh()
    } catch {
      setFinishing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar: close + segmented progress */}
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-6">
        <button
          type="button"
          onClick={skipAll}
          aria-label="Skip onboarding"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-2">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= step ? "bg-foreground" : "bg-border",
              )}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-6">
        {step === 0 && (
          <MicStep micState={micState} />
        )}

        {step === 1 && (
          <InterestsStep
            selected={selected}
            onToggle={toggleInterest}
          />
        )}

        {step === 2 && <AllSetStep count={selected.size} />}

        {/* Footer action */}
        <div className="mt-auto pt-6">
          {step === 0 && (
            <Button size="lg" className="w-full" onClick={requestMic}>
              Continue
            </Button>
          )}
          {step === 1 && (
            <Button
              size="lg"
              className="w-full"
              onClick={() => setStep(2)}
            >
              {selected.size > 0 ? `Continue (${selected.size})` : "Continue"}
            </Button>
          )}
          {step === 2 && (
            <Button
              size="lg"
              className="w-full"
              onClick={finish}
              disabled={finishing}
            >
              {finishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Start listening"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function MicStep({ micState }: { micState: "idle" | "granted" | "denied" }) {
  return (
    <div>
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl bg-primary">
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-primary-foreground/15">
          <Mic className="h-16 w-16 text-primary-foreground" strokeWidth={1.75} />
          <span className="absolute -right-1 -top-1 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-primary">
            <Check className="h-6 w-6 text-white" strokeWidth={3} />
          </span>
        </div>
      </div>
      <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight text-balance">
        Allow VOXYFI to access your microphone
      </h1>
      <p className="mt-3 text-lg text-muted-foreground text-pretty">
        VOXYFI uses your microphone to turn speech into text, so you can capture
        thoughts without stopping to type.
      </p>
      {micState === "denied" && (
        <p className="mt-3 text-sm text-muted-foreground">
          No problem &mdash; you can enable the microphone later in your browser
          settings.
        </p>
      )}
    </div>
  )
}

function InterestsStep({
  selected,
  onToggle,
}: {
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-balance">
        Choose your interests
      </h1>
      <p className="mt-2 text-lg text-muted-foreground text-pretty">
        Pick your interests to get the right content, faster.
      </p>
      <div className="mt-6 flex flex-wrap gap-2.5 overflow-y-auto">
        {INTERESTS.map((interest) => {
          const active = selected.has(interest.id)
          return (
            <button
              key={interest.id}
              type="button"
              onClick={() => onToggle(interest.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              <DynamicIcon name={interest.icon} className="h-4 w-4" />
              {interest.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AllSetStep({ count }: { count: number }) {
  return (
    <div>
      <div className="flex aspect-square w-full items-center justify-center rounded-3xl bg-primary">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary-foreground/15">
          <Sparkles className="h-16 w-16 text-primary-foreground" strokeWidth={1.75} />
        </div>
      </div>
      <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight text-balance">
        You&apos;re all set
      </h1>
      <p className="mt-3 text-lg text-muted-foreground text-pretty">
        {count > 0
          ? `We saved ${count} ${count === 1 ? "interest" : "interests"}. Add a file, paste a link, or type anything and VOXYFI will read it aloud.`
          : "Add a file, paste a link, or type anything and VOXYFI will read it aloud."}
      </p>
      <div className="mt-6 space-y-3">
        <TipRow icon={Keyboard} text="Tip: turn on the VOXYFI keyboard to dictate anywhere on your device." />
        <TipRow icon={Mic} text="Tap Dictate on the home screen to capture ideas hands-free." />
      </div>
    </div>
  )
}

function TipRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm text-foreground">{text}</p>
    </div>
  )
}
