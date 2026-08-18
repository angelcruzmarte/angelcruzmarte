"use client"

import { usePlatform } from "@/hooks/use-platform"

// Renders its children everywhere EXCEPT the native iOS app. Use it to hide
// purchase-referencing chrome (prices, promos, free-trial CTAs, external
// checkout links) inside the wrapped iOS build for Apple Guideline 3.1.1 /
// reader-app compliance. On web and Android, children render normally.
export function WebOnly({ children }: { children: React.ReactNode }) {
  const { isIOS } = usePlatform()
  if (isIOS) return null
  return <>{children}</>
}
