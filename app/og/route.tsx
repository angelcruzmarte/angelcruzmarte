import { ImageResponse } from "next/og"

// Dynamic, public, per-document OG share-card generator.
//   /og?title=...&kind=PDF&lang=Spanish&words=1200&author=...&thumb=https://...
// Renders a branded 1200x630 card using the VOXYFI two-tone gradient and the
// waveform+V mark (drawn as rounded divs so no rasterizer is needed at runtime).
// When a real first-page `thumb` is supplied it renders a two-column layout with
// the document preview; otherwise it falls back to a centered branded card.
export const runtime = "nodejs"

const DEEP = "#123f2e"
const EMERALD = "#12b981"

// The 5 waveform bar heights (px within a 132px tile) — tall→short→tall to form
// the subtle "V" dip, matching components/logo-mark.tsx.
const BARS = [
  { h: 74, top: 29 },
  { h: 52, top: 40 },
  { h: 33, top: 50 },
  { h: 52, top: 40 },
  { h: 74, top: 29 },
]

function WaveMark({ size }: { size: number }) {
  const barW = size * 0.1
  const gap = size * 0.048
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap,
        width: size,
        height: size,
      }}
    >
      {BARS.map((b, i) => (
        <div
          key={i}
          style={{
            width: barW,
            height: (b.h / 132) * size,
            borderRadius: barW,
            background: "#ffffff",
          }}
        />
      ))}
    </div>
  )
}

function clamp(s: string, max: number) {
  const t = s.trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t
}

// Fetch the thumbnail server-side and inline it as a data URI. Doing it here
// (instead of letting satori fetch the <img src>) means a slow/404/invalid
// image degrades gracefully to the no-thumb layout instead of throwing and
// breaking the entire card.
async function loadThumb(raw: string | null): Promise<string | null> {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(u.toString(), { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const type = res.headers.get("content-type") || ""
    if (!type.startsWith("image/")) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > 8_000_000) return null
    return `data:${type};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const { searchParams } = url
  const title = clamp(searchParams.get("title") || "Listen to anything", 90)
  const kind = clamp(searchParams.get("kind") || "Document", 18)
  const lang = searchParams.get("lang")?.trim() || ""
  const words = searchParams.get("words")?.trim() || ""
  const author = clamp(searchParams.get("author") || "", 48)

  // Load Geist from the public folder using the request origin — reliable in
  // both dev (Turbopack) and the production serverless runtime.
  const [font, thumb] = await Promise.all([
    fetch(`${url.origin}/brand/fonts/Geist-Regular.ttf`).then((r) => r.arrayBuffer()),
    loadThumb(searchParams.get("thumb")),
  ])

  // Meta chips shown in the footer (kind is always present).
  const chips = [kind]
  if (lang) chips.push(lang)
  if (words && /^\d+$/.test(words)) {
    chips.push(`${Number(words).toLocaleString()} words`)
  }

  const gradient = `linear-gradient(135deg, ${DEEP} 0%, ${EMERALD} 100%)`

  // Brand header (mark + wordmark), shared by both layouts.
  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 96,
          height: 96,
          borderRadius: 27,
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.22)",
        }}
      >
        <WaveMark size={60} />
      </div>
      <div style={{ display: "flex", fontSize: 46, letterSpacing: -2 }}>VOXYFI</div>
    </div>
  )

  // Footer meta chips + domain, shared by both layouts.
  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 14 }}>
        {chips.map((c, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              fontSize: 26,
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.22)",
            }}
          >
            {c}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", fontSize: 28, opacity: 0.9 }}>voxyfi.com</div>
    </div>
  )

  // Title + optional author byline block.
  const titleBlock = (big: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "flex",
          fontSize: big ? (title.length > 52 ? 62 : 78) : title.length > 40 ? 46 : 56,
          letterSpacing: -2,
          lineHeight: 1.08,
          maxWidth: big ? 1040 : 560,
        }}
      >
        {title}
      </div>
      {author ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, opacity: 0.92 }}>
          <div style={{ display: "flex", width: 24, height: 2, background: "#ffffff", opacity: 0.7 }} />
          {author}
        </div>
      ) : null}
    </div>
  )

  const card = thumb ? (
    // Two-column layout with the real first-page thumbnail.
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 72,
        background: gradient,
        color: "#ffffff",
        fontFamily: "Geist",
      }}
    >
      {/* Left: branding + title + author + chips */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          paddingRight: 56,
        }}
      >
        {header}
        {titleBlock(false)}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {chips.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                fontSize: 24,
                padding: "8px 20px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* Right: document page preview */}
      <div
        style={{
          display: "flex",
          width: 360,
          height: "100%",
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.3)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          width={360}
          style={{ width: 360, height: "100%", objectFit: "cover" }}
        />
      </div>
    </div>
  ) : (
    // Centered branded card (no thumbnail available).
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: gradient,
        color: "#ffffff",
        fontFamily: "Geist",
      }}
    >
      {header}
      {titleBlock(true)}
      {footer}
    </div>
  )

  return new ImageResponse(card, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Geist", data: font, weight: 400, style: "normal" }],
    headers: {
      // Cache aggressively at the edge — the card is a pure function of params.
      "cache-control": "public, max-age=31536000, immutable",
    },
  })
}
