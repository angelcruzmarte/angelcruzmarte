"use client"

import { useSyncExternalStore } from "react"
import { detectPlatform, isIOSApp, isNativeApp, type Platform } from "@/lib/platform"

// The runtime platform is fixed for a session (it comes from a URL flag /
// localStorage), so we detect it exactly ONCE and share the result with every
// consumer via a tiny external store. This matters for the store page, which
// renders hundreds of book cards that each call usePlatform(): a per-card
// useState+useEffect would make every card render twice on mount (once as
// "web", then again after detection) — a big, repeated cost while new shelves
// mount during scroll. With a shared store, detection happens on the first
// subscribe and any later-mounted card reads the already-correct value with no
// extra render.

let current: Platform = "web"
let detected = false
const listeners = new Set<() => void>()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  // Detect on the first subscription only; notify if it differs from the
  // server/default "web" value so mounted consumers update once.
  if (!detected) {
    detected = true
    const next = detectPlatform()
    if (next !== current) {
      current = next
      for (const l of listeners) l()
    }
  }
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): Platform {
  return current
}

// Always "web" on the server so SSR and the first client render match.
function getServerSnapshot(): Platform {
  return "web"
}

/**
 * Client hook exposing the current runtime platform. Backed by a shared,
 * detect-once store so it's cheap even when called by many components at once.
 */
export function usePlatform() {
  const platform = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return {
    platform,
    isIOS: isIOSApp(platform),
    isNative: isNativeApp(platform),
  }
}
