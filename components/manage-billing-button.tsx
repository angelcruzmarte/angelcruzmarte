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

  // Apple Guideline 3.1.1: the Stripe billing portal is an external purchase-
  // management surface, which must not be linked from the native iOS app.
  // Direct iOS users to manage billing where they subscribed instead.
  if (isIOS) {
    return (
      <p className="text-sm text-muted-foreground">
        Manage your subscription at{" "}
        <span className="font-medium text-foreground">voxyfi.com</span> on the
        web.
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
