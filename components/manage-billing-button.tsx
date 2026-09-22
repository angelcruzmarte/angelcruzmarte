"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { createBillingPortalSession } from "@/app/actions/subscription"
import { Button } from "@/components/ui/button"
import { usePlatform } from "@/hooks/use-platform"

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isIOS } = usePlatform()

  // Inside the iOS app the subscription is an Apple In-App Purchase, so it is
  // managed through the App Store (Settings > Apple Account > Subscriptions) —
  // the same place Apple manages every IAP subscription. We do not link out to
  // an external billing surface here.
  if (isIOS) {
    return (
      <p className="text-sm text-muted-foreground">
        Manage or cancel your subscription in the App Store: open the Settings
        app, tap your name, then tap{" "}
        <span className="font-medium text-foreground">Subscriptions</span>.
      </p>
    )
  }

  async function handleClick() {
    setError(null)
    setLoading(true)
    try {
      const result = await createBillingPortalSession()
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) {
        if (window.self !== window.top) {
          window.open(result.url, "_blank")
        } else {
          window.location.href = result.url
        }
      }
    } catch {
      setError("Could not open billing portal.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        variant="secondary"
        className="gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Manage billing
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
