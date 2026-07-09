"use client"

import { PremiumNarration } from "@/components/premium-narration"

export default function Page() {
  return (
    <div className="min-h-[100dvh] bg-background p-4">
      <PremiumNarration
        text="Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega. One two three four five six seven eight nine ten eleven twelve."
        title="Test Doc"
        immersive
      />
    </div>
  )
}
