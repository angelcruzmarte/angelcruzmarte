"use client"

import { useMemo, useState, useTransition } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react"

import {
  saveAffiliateConfig,
  type AffiliateConfig,
} from "@/app/actions/admin"
import {
  testAffiliateLink,
  validateAmazonConfig,
  type AffiliateLinkTest,
  type ConfigValidationLevel,
} from "@/lib/affiliate"
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
import { cn } from "@/lib/utils"

const LEVEL_STYLES: Record<
  ConfigValidationLevel,
  { icon: typeof CheckCircle2; wrap: string; text: string; label: string }
> = {
  pass: {
    icon: CheckCircle2,
    wrap: "border-primary/30 bg-primary/5",
    text: "text-primary",
    label: "Pass",
  },
  warning: {
    icon: AlertTriangle,
    wrap: "border-amber-500/30 bg-amber-500/5",
    text: "text-amber-600 dark:text-amber-500",
    label: "Warning",
  },
  error: {
    icon: XCircle,
    wrap: "border-destructive/30 bg-destructive/5",
    text: "text-destructive",
    label: "Error",
  },
}

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
  const [test, setTest] = useState<AffiliateLinkTest | null>(null)
  const [copied, setCopied] = useState(false)

  // Validation runs automatically on every tag/marketplace change.
  const validation = useMemo(
    () => validateAmazonConfig(tag, region),
    [tag, region],
  )
  const blocked = validation.level === "error"

  function save() {
    if (blocked) return
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const result = await saveAffiliateConfig({ tag, region })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setTag(result.config.tag)
        setRegion(result.config.region)
        setSource(result.config.tagSource)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch {
        setError("Could not save. Please try again.")
      }
    })
  }

  function runTest() {
    setCopied(false)
    setTest(testAffiliateLink(tag, region))
  }

  async function copyUrl() {
    if (!test) return
    try {
      await navigator.clipboard.writeText(test.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable; the URL is still visible to copy manually.
    }
  }

  const style = LEVEL_STYLES[validation.level]
  const StatusIcon = style.icon

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
            aria-invalid={blocked}
            onChange={(e) => {
              setTag(e.target.value)
              setTest(null)
            }}
          />
          <p className="text-xs text-muted-foreground">
            e.g. <code>voxyfi-20</code>. Leave blank to clear the override and
            fall back to the environment variable.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="amazon-region">Marketplace</Label>
          <Select
            value={region}
            onValueChange={(v) => {
              if (v) {
                setRegion(v)
                setTest(null)
              }
            }}
          >
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

      {/* Live Pass / Warning / Error validation status. */}
      <div
        className={cn(
          "mt-4 flex items-start gap-2.5 rounded-lg border p-3",
          style.wrap,
        )}
        role={validation.level === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        <StatusIcon className={cn("mt-0.5 h-4 w-4 shrink-0", style.text)} />
        <div className="min-w-0 text-sm">
          <p className={cn("font-medium", style.text)}>
            {style.label}: {validation.title}
          </p>
          <p className="mt-0.5 text-muted-foreground">{validation.message}</p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending || blocked}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
        <Button type="button" variant="outline" onClick={runTest}>
          Test affiliate link
        </Button>
        {blocked && (
          <span className="text-xs text-muted-foreground">
            Fix the error above to save.
          </span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>

      {/* Test affiliate link result. */}
      {test && (
        <div className="mt-4 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {test.ok ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-primary">
                  {test.appliedTag
                    ? `Tag “${test.appliedTag}” applied correctly`
                    : "Link generated (no tag — uncredited)"}
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-destructive">
                  Applied tag doesn’t match the configured tag
                </span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sample link for a well-known title on{" "}
            <span className="font-mono">{test.domain}</span>:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1.5 text-xs">
              {test.url}
            </code>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={copyUrl}
              aria-label="Copy sample link"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a
                href={test.url}
                target="_blank"
                rel="noopener noreferrer sponsored nofollow"
                aria-label="Open sample link on Amazon"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
