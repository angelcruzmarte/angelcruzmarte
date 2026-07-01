import { getMyInterests } from "@/app/actions/interests"
import { InterestPicker } from "@/components/interest-picker"

export default async function DiscoverPage() {
  const interests = await getMyInterests()

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-balance">
        Choose your interests
      </h1>
      <p className="mb-6 mt-1 text-muted-foreground text-pretty">
        Pick your interests to get the right content, faster.
      </p>
      <InterestPicker initial={interests} />
    </div>
  )
}
