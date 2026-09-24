"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PLANS } from "@/lib/plans"
import {
  isIosNativeApp,
  runStoreKitProductDiagnostic,
  type StoreKitDiagnosticReport,
} from "@/lib/apple/swing-bridge"

/**
 * TEMPORARY, READ-ONLY developer diagnostic.
 *
 * Renders a clearly labeled panel that asks the native bridge what StoreKit
 * reports for the two subscription products. It NEVER starts a purchase, never
 * simulates success, and never grants an entitlement — it only reads. It is
 * shown only inside the native iOS app WebView because the StoreKit bridge does
 * not exist anywhere else, so the readout would be meaningless (and empty) in a
 * plain browser. It adds a diagnostic readout; it does not hide or alter any
 * user-facing feature or the purchase flow.
 */
export function StoreKitDiagnostic() {
  const [visible, setVisible] = useState(false)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<StoreKitDiagnosticReport | null>(null)

  // Only mount inside the native iOS app WebView. The bridge is native-only, so
  // this readout is meaningless on the web.
  useEffect(() => {
    setVisible(isIosNativeApp())
  }, [])

  if (!visible) return null

  const productIds = PLANS.map((p) => p.appleProductId)

  async function handleRun() {
    setRunning(true)
    try {
      const result = await runStoreKitProductDiagnostic(productIds)
      setReport(result)
      console.log("[v0] StoreKit diagnostic:", JSON.stringify(result))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section
      aria-label="Developer diagnostic"
      className="mx-auto mt-12 max-w-lg rounded-2xl border border-dashed border-muted-foreground/40 bg-muted/30 p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Developer Diagnostic — StoreKit product check (temporary)
      </p>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">
        Read-only. Asks the native bridge what StoreKit reports for each
        subscription product. Does not start or simulate a purchase.
      </p>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleRun}
        disabled={running}
        className="mt-4 gap-2"
      >
        {running && <Loader2 className="h-4 w-4 animate-spin" />}
        Run StoreKit check
      </Button>

      {report && (
        <div className="mt-5 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-background/60 p-3 text-xs">
            <dt className="text-muted-foreground">In native app WebView</dt>
            <dd className="text-right font-mono">{String(report.inNativeAppWebView)}</dd>
            <dt className="text-muted-foreground">iOS native app</dt>
            <dd className="text-right font-mono">{String(report.isIosNativeApp)}</dd>
            <dt className="text-muted-foreground">Bridge present</dt>
            <dd className="text-right font-mono">{String(report.bridgePresent)}</dd>
            <dt className="text-muted-foreground">Product query supported</dt>
            <dd className="text-right font-mono">{String(report.productQuerySupported)}</dd>
            <dt className="text-muted-foreground">Bridge methods</dt>
            <dd className="text-right font-mono break-all">
              {report.availableMethods.length ? report.availableMethods.join(", ") : "none"}
            </dd>
          </dl>

          {!report.productQuerySupported && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              The native bridge exposes no product-metadata query method, so
              StoreKit price/availability/duration cannot be read on this device.
              The isSubscribed result below is the only StoreKit-backed signal
              available.
            </p>
          )}

          {report.products.map((p) => (
            <dl
              key={p.productId}
              className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-background/60 p-3 text-xs"
            >
              <dt className="col-span-2 font-semibold break-all">{p.productId}</dt>
              <dt className="text-muted-foreground">StoreKit returned product</dt>
              <dd className="text-right font-mono">{String(p.storeKitReturnedProduct)}</dd>
              <dt className="text-muted-foreground">Available for purchase</dt>
              <dd className="text-right font-mono">{String(p.availableForPurchase)}</dd>
              <dt className="text-muted-foreground">Localized price</dt>
              <dd className="text-right font-mono">{p.localizedPrice ?? "—"}</dd>
              <dt className="text-muted-foreground">Subscription duration</dt>
              <dd className="text-right font-mono">{p.subscriptionDuration ?? "—"}</dd>
              <dt className="text-muted-foreground">isSubscribed()</dt>
              <dd className="text-right font-mono">{String(p.isSubscribedResult)}</dd>
              <dt className="text-muted-foreground">Query method</dt>
              <dd className="text-right font-mono">{p.queryMethodUsed ?? "none"}</dd>
              {p.raw && (
                <dd className="col-span-2 mt-1 break-all rounded bg-muted p-2 font-mono text-[10px] text-muted-foreground">
                  {p.raw}
                </dd>
              )}
            </dl>
          ))}
        </div>
      )}
    </section>
  )
}
