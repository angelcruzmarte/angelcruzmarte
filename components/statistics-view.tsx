"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChevronLeft, Flame } from "lucide-react"
import {
  getListeningStats,
  type StatRange,
  type StatsResult,
} from "@/app/actions/stats"
import { SegmentedControl } from "@/components/segmented-control"

const RANGE_OPTIONS: { value: StatRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "6months", label: "6 Months" },
  { value: "year", label: "Year" },
]

// Fixed daily listening goal (minutes), shown as a reference line like the
// reference design.
const DAILY_GOAL_MIN = 30

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m"
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function StatisticsView({ initialWeek }: { initialWeek: StatsResult }) {
  const router = useRouter()

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold tracking-tight">Statistics</h1>
      </div>

      <div className="space-y-8 px-4 pb-16 pt-2">
        <StatSection
          title="Time Listened"
          metric="time"
          initialWeek={initialWeek}
        />
        <div className="h-px bg-border" />
        <StatSection
          title="Words Listened"
          metric="words"
          initialWeek={initialWeek}
        />
      </div>
    </div>
  )
}

function StatSection({
  title,
  metric,
  initialWeek,
}: {
  title: string
  metric: "time" | "words"
  initialWeek: StatsResult
}) {
  const [range, setRange] = useState<StatRange>("week")

  const { data } = useSWR<StatsResult>(
    ["stats", range],
    () => getListeningStats(range),
    {
      fallbackData: range === "week" ? initialWeek : undefined,
      revalidateOnFocus: false,
    },
  )

  const isTime = metric === "time"
  const stats = data
  const loading = !stats

  const total = isTime ? stats?.totalSeconds ?? 0 : stats?.totalWords ?? 0
  const dailyAvg = isTime
    ? stats?.dailyAvgSeconds ?? 0
    : stats?.dailyAvgWords ?? 0

  const chartData =
    stats?.points.map((p) => ({
      label: p.label,
      value: isTime ? p.seconds / 60 : p.words, // minutes for time
    })) ?? []

  const primaryDisplay = isTime ? formatDuration(dailyAvg) : formatNumber(dailyAvg)
  const totalDisplay = isTime ? formatDuration(total) : formatNumber(total)

  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>

      <div className="mt-3">
        <SegmentedControl
          aria-label={`${title} range`}
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
        />
      </div>

      <div className="mt-6 flex items-start gap-12">
        <div>
          <p className="text-4xl font-extrabold tabular-nums tracking-tight">
            {primaryDisplay}
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Daily Average
          </p>
          {isTime && (
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-500">
              <Flame className="h-4 w-4" />
              Goal: {DAILY_GOAL_MIN}m
            </p>
          )}
        </div>
        <div>
          <p className="text-4xl font-extrabold tabular-nums tracking-tight">
            {totalDisplay}
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Total</p>
        </div>
      </div>

      <div className="mt-6 h-56 w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(v: number) =>
                  isTime ? formatDuration(v * 60) : formatNumber(v)
                }
              />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--card-foreground)",
                  fontSize: 12,
                }}
                formatter={(v: number) => [
                  isTime ? formatDuration(v * 60) : formatNumber(Math.round(v)),
                  isTime ? "Time" : "Words",
                ]}
              />
              {isTime && (
                <ReferenceLine
                  y={DAILY_GOAL_MIN}
                  stroke="var(--color-emerald-500, #10b981)"
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
              )}
              <Bar
                dataKey="value"
                fill="var(--primary)"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
