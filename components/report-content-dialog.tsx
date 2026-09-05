"use client"

import { useState, useTransition } from "react"
import { Loader2, ShieldAlert } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { REPORT_REASONS, MAX_REPORT_DETAILS } from "@/lib/moderation"
import { submitReport } from "@/app/actions/moderation"
import { cn } from "@/lib/utils"

/**
 * Reusable "Report Content" modal. Presents Apple's required reason set, an
 * optional details field, and a mandatory confirmation step before the report
 * is submitted. On success it shows the required thank-you confirmation.
 */
export function ReportContentDialog({
  contentType,
  contentId,
  open,
  onOpenChange,
}: {
  contentType: string
  contentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setReason(null)
    setDetails("")
    setConfirming(false)
    setDone(false)
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function doSubmit() {
    if (!reason) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await submitReport({
          contentType,
          contentId,
          reason,
          details,
        })
        // Only confirm success when the server actually persisted the report.
        if ("error" in res && res.error) {
          setError(res.error)
          setConfirming(false)
          return
        }
        setDone(true)
      } catch (e) {
        console.error("[v0] report submission failed:", e)
        setError(
          "Something went wrong submitting your report. Please try again.",
        )
        setConfirming(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Report submitted</DialogTitle>
              <DialogDescription>
                Report submitted. Thank you for helping keep Voxyfi safe.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : confirming ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Submit this report?
              </DialogTitle>
              <DialogDescription>
                {"You're reporting this content as "}
                <span className="font-medium text-foreground">
                  {REPORT_REASONS.find((r) => r.value === reason)?.label}
                </span>
                {". Our moderation team will review it."}
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Back
              </Button>
              <Button onClick={doSubmit} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Submit report"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report Content</DialogTitle>
              <DialogDescription>
                Tell us what&apos;s wrong with this content. Reports are
                confidential.
              </DialogDescription>
            </DialogHeader>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Reason</legend>
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    reason === r.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:bg-accent",
                  )}
                  aria-pressed={reason === r.value}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      reason === r.value
                        ? "border-primary"
                        : "border-muted-foreground/50",
                    )}
                    aria-hidden
                  >
                    {reason === r.value ? (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  {r.label}
                </button>
              ))}
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="report-details" className="text-sm font-medium">
                Additional details{" "}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={MAX_REPORT_DETAILS}
                placeholder="Add any context that will help our team review this report."
                rows={3}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!reason} onClick={() => setConfirming(true)}>
                Report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
