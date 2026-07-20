import type { ReactNode } from "react"
import Link from "next/link"
import { BrandLogo } from "@/components/brand-logo"

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <BrandLogo size="lg" />
      </Link>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
          {title}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {children}
      </div>
    </div>
  )
}
