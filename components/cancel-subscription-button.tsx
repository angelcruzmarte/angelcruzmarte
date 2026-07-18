"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  cancelSubscription,
  resumeSubscription,
} from "@/app/actions/subscription"
import { Button } from "@/components/ui/button"

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function CancelSubscriptionButton({
  cancelAtPeriodEnd,
  periodEnd,
  isTrialing,
}: {
  cancelAtPeriodEnd: boolean
  periodEnd: string | null
  isTrialing: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const endLabel = formatDate(periodEnd)

  async function handleCancel() {
    setError(null)
    setLoading(true)
    try {
      const result = await cancelSubscription()
      if (result.error) {
        setError(result.error)
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError("Could not cancel right now. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleResume() {
    setError(null)
    setLoading(true)
    try {
      const result = await resumeSubscription()
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    } catch {
      setError("Could not resume right now. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Cancellation already scheduled: reassure the user and offer to resume.
  if (cancelAtPeriodEnd) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium">
          {isTrialing
            ? "Your free trial is set to end and will not be charged."
            : "Your subscription is set to cancel."}
        </p>
        {endLabel && (
          <p className="mt-1 text-sm text-muted-foreground">
            {isTrialing ? "Access ends on " : "You keep access until "}
            <span className="font-medium text-foreground">{endLabel}</span>. No
            further charges will be made.
          </p>
        )}
        <Button
          onClick={handleResume}
          disabled={loading}
          className="mt-3 gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Resume plan
        </Button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // Inline confirmation so the user makes a deliberate choice.
  if (confirming) {
    return (
      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-medium">
          {isTrialing
            ? "Cancel your free trial?"
            : "Cancel your subscription?"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isTrialing
            ? "Your card will not be charged. You keep premium access until your trial ends"
            : "You won't be charged again and keep access until the end of your current period"}
          {endLabel ? ` (${endLabel}).` : "."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={handleCancel}
            disabled={loading}
            variant="destructive"
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isTrialing ? "Yes, cancel trial" : "Yes, cancel plan"}
          </Button>
          <Button
            onClick={() => setConfirming(false)}
            disabled={loading}
            variant="secondary"
          >
            Keep my plan
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <Button
        onClick={() => setConfirming(true)}
        variant="ghost"
        className="px-0 text-sm text-muted-foreground hover:text-destructive"
      >
        {isTrialing ? "Cancel trial" : "Cancel subscription"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
