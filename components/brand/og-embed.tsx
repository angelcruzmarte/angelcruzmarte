"use client"

import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// Production origin used for the copyable snippets so pasted embeds always
// point at the live card, regardless of where the guide is previewed.
const SITE_ORIGIN = "https://www.voxyfi.com"

type Fields = {
  title: string
  kind: string
  lang: string
  words: string
  author: string
}

const DEFAULTS: Fields = {
  title: "The Declaration of Independence",
  kind: "PDF",
  lang: "Spanish",
  words: "1200",
  author: "archives.gov",
}

function buildOgUrl(origin: string, f: Fields): string {
  const p = new URLSearchParams()
  if (f.title.trim()) p.set("title", f.title.trim())
  if (f.kind.trim()) p.set("kind", f.kind.trim())
  if (f.lang.trim()) p.set("lang", f.lang.trim())
  if (f.words.trim()) p.set("words", f.words.trim())
  if (f.author.trim()) p.set("author", f.author.trim())
  return `${origin}/og?${p.toString()}`
}

/** One-click copy button with a transient "Copied!" state. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard may be unavailable in insecure contexts — fail silently.
    }
  }
  return (
    <Button type="button" size="sm" variant="secondary" onClick={copy} className="gap-1.5">
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied!" : label}
    </Button>
  )
}

/**
 * Interactive "Copy Embed" for the dynamic OG cards. Users tweak the document
 * fields, see a live preview of the branded card, and copy ready-to-paste
 * snippets (direct URL, HTML meta tags, an <img> tag, or Markdown) in one click.
 */
export function OgEmbed() {
  const [f, setF] = useState<Fields>(DEFAULTS)

  const ogUrl = useMemo(() => buildOgUrl(SITE_ORIGIN, f), [f])

  const snippets = useMemo(() => {
    const safeTitle = f.title.trim() || "VOXYFI document"
    const esc = (s: string) => s.replace(/"/g, "&quot;")
    const meta = [
      `<meta property="og:image" content="${ogUrl}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${ogUrl}" />`,
    ].join("\n")
    const img = `<img src="${ogUrl}" width="1200" height="630" alt="${esc(safeTitle)} — VOXYFI" />`
    const md = `![${safeTitle} — VOXYFI](${ogUrl})`
    return { url: ogUrl, meta, img, md }
  }, [ogUrl, f.title])

  function set<K extends keyof Fields>(key: K, value: string) {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Live preview + field controls */}
      <div className="flex flex-col gap-4">
        <Card className="overflow-hidden p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogUrl || "/placeholder.svg"}
            alt="Live preview of the branded share card"
            className="aspect-[1200/630] w-full bg-muted object-cover"
          />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="og-title">Title</Label>
            <Input
              id="og-title"
              value={f.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Document title"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="og-kind">Kind</Label>
            <Input
              id="og-kind"
              value={f.kind}
              onChange={(e) => set("kind", e.target.value)}
              placeholder="PDF"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="og-lang">Language</Label>
            <Input
              id="og-lang"
              value={f.lang}
              onChange={(e) => set("lang", e.target.value)}
              placeholder="Spanish"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="og-words">Words</Label>
            <Input
              id="og-words"
              inputMode="numeric"
              value={f.words}
              onChange={(e) => set("words", e.target.value.replace(/[^\d]/g, ""))}
              placeholder="1200"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="og-author">Author / source</Label>
            <Input
              id="og-author"
              value={f.author}
              onChange={(e) => set("author", e.target.value)}
              placeholder="archives.gov"
            />
          </div>
        </div>
      </div>

      {/* Copyable snippets */}
      <div className="flex flex-col">
        <Tabs defaultValue="html" className="flex flex-col gap-3">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="img">Image tag</TabsTrigger>
            <TabsTrigger value="md">Markdown</TabsTrigger>
            <TabsTrigger value="url">URL</TabsTrigger>
          </TabsList>

          <TabsContent value="html" className="mt-0">
            <Snippet
              text={snippets.meta}
              help="Paste into your page <head> for branded Open Graph + Twitter previews."
            />
          </TabsContent>
          <TabsContent value="img" className="mt-0">
            <Snippet text={snippets.img} help="Drop-in <img> tag for docs, dashboards, or emails." />
          </TabsContent>
          <TabsContent value="md" className="mt-0">
            <Snippet text={snippets.md} help="Markdown image for READMEs, issues, and notes." />
          </TabsContent>
          <TabsContent value="url" className="mt-0">
            <Snippet text={snippets.url} help="The raw, edge-cached image URL." oneLine />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function Snippet({ text, help, oneLine }: { text: string; help: string; oneLine?: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">{help}</p>
        <CopyButton text={text} label="Copy" />
      </div>
      <pre
        className={cn(
          "overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-foreground",
          oneLine && "whitespace-pre-wrap break-all",
        )}
      >
        <code>{text}</code>
      </pre>
    </Card>
  )
}
