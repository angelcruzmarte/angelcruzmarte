"use client"

import { useEffect, useState } from "react"
import { detectPlatform, isIOSApp, isNativeApp, type Platform } from "@/lib/platform"

// Client hook exposing the current runtime platform. Starts as "web" to keep
// server and first client render identical (avoids hydration mismatch), then
// resolves to the real platform after mount. Components can gate purchase UI on
// `isIOS` for Apple Guideline 3.1.1 compliance.
export function usePlatform() {
  const [platform, setPlatform] = useState<Platform>("web")

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  return {
    platform,
    isIOS: isIOSApp(platform),
    isNative: isNativeApp(platform),
  }
}
