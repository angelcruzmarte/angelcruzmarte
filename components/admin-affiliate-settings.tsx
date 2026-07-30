"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import {
  saveAffiliateConfig,
  type AffiliateConfig,
} from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function AdminAffiliateSettings({
  config,
}: {
  config: AffiliateConfig
}) {
  const [tag, setTag] = useState(config.tag)
  const [region, setRegion] = useState(config.region)
  const [source, setSource] = useState(config.tagSource)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const next = await saveAffiliateConfig({ tag, region })
        setTag(next.tag)
        setRegion(next.region)
        setSource(next.tagSource)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch {
        setError("Could not save. Please try again.")
      }
    })
  }

  return (
    <Card className="max-w-2xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Amazon Associates</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Commercial titles link out to Amazon with this Associate tag
            appended, so qualifying purchases earn commission.
          </p>
        </div>
        {source === "none" ? (
          <Badge variant="destructive">Not set</Badge>
        ) : source === "env" ? (
          <Badge variant="secondary">From env</Badge>
        ) : (
          <Badge variant="outline">Configured</Badge>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="amazon-tag">Associate tag</Label>
          <Input
            id="amazon-tag"
            value={tag}
            placeholder="yourtag-20"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setTag(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            e.g. <code>voxyfi-20</code>. Leave blank to clear the override and
            fall back to the environment variable.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="amazon-region">Marketplace</Label>
          <Select value={region} onValueChange={(v) => v && setRegion(v)}>
            <SelectTrigger id="amazon-region">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.regions.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Determines which Amazon domain (e.g. amazon.com vs amazon.co.uk)
            links point to.
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </Card>
  )
}
