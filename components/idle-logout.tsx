"use client"

import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { authClient, useSession } from "@/lib/auth-client"

// Sign the user out automatically after this much inactivity.
const IDLE_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Signs the user out after a period of inactivity. Any pointer, keyboard,
 * touch, or scroll activity resets the timer. Only armed while a session
 * exists, so it is a no-op for logged-out visitors.
 */
export function IdleLogout() {
  const { data: session } = useSession()
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const signedIn = Boolean(session?.user)

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut()
    } finally {
      router.push("/sign-in?timeout=1")
      router.refresh()
    }
  }, [router])

  useEffect(() => {
    if (!signedIn) return

    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(signOut, IDLE_MS)
    }

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "visibilitychange",
    ]
    events.forEach((event) =>
      window.addEventListener(event, reset, { passive: true }),
    )
    reset()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      events.forEach((event) => window.removeEventListener(event, reset))
    }
  }, [signedIn, signOut])

  return null
}
