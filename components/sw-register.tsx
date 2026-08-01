"use client"

import { useEffect } from "react"

/**
 * Registers the VOXYFI service worker for PWA installability and offline
 * support. Registration is deferred until after load so it never blocks
 * first paint. Only runs in production over HTTPS (service workers require a
 * secure context).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal — the app still works online.
      })
    }

    if (document.readyState === "complete") {
      register()
    } else {
      window.addEventListener("load", register)
      return () => window.removeEventListener("load", register)
    }
  }, [])

  return null
}
