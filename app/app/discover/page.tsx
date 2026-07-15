import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getMyInterests } from "@/app/actions/interests"
import { InterestPicker } from "@/components/interest-picker"

export default async function DiscoverPage() {
  const interests = await getMyInterests()

  return (
    <div className="px-4 py-6 sm:px-6">
      <Link
        href="/app/books"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Book Store
      </Link>
      <h1 className="text-3xl font-bold tracking-tight text-balance">
        Personalize your books
      </h1>
      <p className="mb-6 mt-1 text-muted-foreground text-pretty">
        Pick your interests and we&apos;ll tailor the Book Store shelves to you.
      </p>
      <InterestPicker initial={interests} />
    </div>
  )
}
