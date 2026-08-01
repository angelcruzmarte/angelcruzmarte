"use client"

import { useRouter } from "next/navigation"
import useSWR from "swr"
import { useMemo, useState } from "react"
import { ArrowLeft, Flame } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import { getListeningStats } from "@/app/actions/stats"
import {
  DAILY_GOAL_MINUTES,
  type StatPoint,
  type StatRange,
  type StatsSummary,
} from "@/lib/stats-shared"
import { cn } from "@/lib/utils"

const RANGES: { id: StatRange; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "6months", label: "6 Months" },
  { id: "year", label: "Year" },
]

export function StatsView() {
  const router = useRouter()

  return (
    <div className="pb-10">
      <header className="sticky top-0 z-10 flex items-center justify-center border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight">Statistics</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        <StatSection kind="time" title="Time Listened" />
        <div className="my-2 h-px bg-border" />
        <StatSection kind="words" title="Words Listened" />
      </div>
    </div>
  )
}

function StatSection({
  kind,
  title,
}: {
  kind: "time" | "words"
  title: string
}) {
  const [range, setRange] = useState<StatRange>("week")

  const { data, isLoading } = useSWR<StatsSummary>(
    ["stats", range],
    () => getListeningStats(range),
    { revalidateOnFocus: false },
  )

  return (
    <section className="py-6">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>

      {/* Range tabs */}
      <div className="mt-4 flex gap-1 rounded-xl bg-secondary p-1">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-colors",
              range === r.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-4xl font-extrabold tracking-tight">
            {kind === "time"
              ? formatMinutes(data?.avgSeconds ?? 0)
              : formatCount(data?.avgWords ?? 0)}
          </p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Daily Average
          </p>
          {kind === "time" && (
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-primary">
              <Flame className="h-4 w-4" aria-hidden="true" />
              Goal: {DAILY_GOAL_MINUTES}m
            </p>
          )}
        </div>
        <div>
          <p className="text-4xl font-extrabold tracking-tight">
            {kind === "time"
              ? formatMinutes(data?.totalSeconds ?? 0)
              : formatCount(data?.totalWords ?? 0)}
          </p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Total
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 h-56 w-full">
        {isLoading || !data ? (
          <div className="h-full w-full animate-pulse rounded-xl bg-secondary" />
        ) : (
          <StatChart kind={kind} points={data.points} range={range} />
        )}
      </div>
    </section>
  )
}

function StatChart({
  kind,
  points,
  range,
}: {
  kind: "time" | "words"
  points: StatPoint[]
  range: StatRange
}) {
  // For long ranges, group days into buckets so the bars stay readable.
  const bars = useMemo(() => bucketPoints(points, range), [points, range])

  const value = (b: Bucket) => (kind === "time" ? b.seconds / 60 : b.words)
  const goal = kind === "time" ? DAILY_GOAL_MINUTES : null

  const data = bars.map((b) => ({ label: b.label, value: value(b) }))
  const maxValue = Math.max(goal ?? 0, ...data.map((d) => d.value), 1)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
        barCategoryGap={bars.length > 20 ? 1 : "18%"}
      >
        <CartesianGrid
          vertical={false}
          stroke="var(--color-border)"
          strokeDasharray="0"
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={44}
          domain={[0, Math.ceil(maxValue)]}
          tickFormatter={(v: number) =>
            kind === "time" ? formatAxisMinutes(v) : formatCount(v)
          }
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        {goal != null && (
          <ReferenceLine
            y={goal}
            stroke="var(--color-chart-2)"
            strokeWidth={2}
          />
        )}
        <Bar
          dataKey="value"
          fill="var(--color-primary)"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

type Bucket = { label: string; seconds: number; words: number }

/** Groups the daily points into a sensible number of chart buckets. */
function bucketPoints(points: StatPoint[], range: StatRange): Bucket[] {
  if (range === "week" || range === "month") {
    return points.map((p) => ({
      label: shortDay(p.day, range),
      seconds: p.seconds,
      words: p.words,
    }))
  }

  // 6 months / year: group into weekly buckets.
  const buckets: Bucket[] = []
  for (let i = 0; i < points.length; i += 7) {
    const slice = points.slice(i, i + 7)
    const seconds = slice.reduce((s, p) => s + p.seconds, 0)
    const words = slice.reduce((s, p) => s + p.words, 0)
    buckets.push({ label: shortDay(slice[0].day, range), seconds, words })
  }
  return buckets
}

function shortDay(dayKey: string, range: StatRange): string {
  const [y, m, d] = dayKey.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  if (range === "year" || range === "6months") {
    return date.toLocaleDateString(undefined, { month: "short" })
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatAxisMinutes(mins: number): string {
  if (mins <= 0) return "0h"
  if (mins < 60) return `${Math.round(mins)}m`
  const h = mins / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(Math.round(n))
}
