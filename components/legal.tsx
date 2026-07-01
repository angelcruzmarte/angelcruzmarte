import type { ReactNode } from "react"

export function LegalTitle({
  title,
  updated,
}: {
  title: string
  updated: string
}) {
  return (
    <header className="border-b border-border pb-6">
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
    </header>
  )
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-pretty leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}
