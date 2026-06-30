import Link from "next/link"
import { BookOpen, Library, TrendingUp, Users } from "lucide-react"
import { getAdminStats } from "@/app/actions/admin"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default async function AdminOverviewPage() {
  const stats = await getAdminStats()

  const cards = [
    {
      label: "Total users",
      value: stats.totalUsers,
      icon: Users,
    },
    {
      label: "Active subscribers",
      value: stats.activeSubscribers,
      icon: TrendingUp,
    },
    {
      label: "Published titles",
      value: stats.publishedItems,
      icon: BookOpen,
    },
    {
      label: "Total titles",
      value: stats.totalItems,
      icon: Library,
    },
  ]

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 text-muted-foreground">
        A snapshot of your subscribers and library.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {card.value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Add a new title</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish an article or chapter for your subscribers to listen to.
          </p>
          <Link href="/admin/content" className={buttonVariants() + " mt-4"}>
            Manage content
          </Link>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Manage subscribers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review subscription status and assign admin access.
          </p>
          <Link
            href="/admin/subscribers"
            className={buttonVariants({ variant: "secondary" }) + " mt-4"}
          >
            View subscribers
          </Link>
        </Card>
      </div>
    </div>
  )
}
