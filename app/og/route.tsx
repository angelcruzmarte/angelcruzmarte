import { ImageResponse } from "next/og"

// Dynamic, public, per-document OG share-card generator.
//   /og?title=...&kind=PDF&lang=Spanish&words=1200
// Renders a branded 1200x630 card using the VOXYFI two-tone gradient and the
// waveform+V mark (drawn as rounded divs so no rasterizer is needed at runtime).
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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const { searchParams } = url
  const title = clamp(searchParams.get("title") || "Listen to anything", 90)
  const kind = clamp(searchParams.get("kind") || "Document", 18)
  const lang = searchParams.get("lang")?.trim() || ""
  const words = searchParams.get("words")?.trim() || ""

  // Load Geist from the public folder using the request origin — reliable in
  // both dev (Turbopack) and the production serverless runtime.
  const font = await fetch(`${url.origin}/brand/fonts/Geist-Regular.ttf`).then((r) =>
    r.arrayBuffer(),
  )

  // Meta chips shown in the footer (kind is always present).
  const chips = [kind]
  if (lang) chips.push(lang)
  if (words && /^\d+$/.test(words)) {
    chips.push(`${Number(words).toLocaleString()} words`)
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `linear-gradient(135deg, ${DEEP} 0%, ${EMERALD} 100%)`,
          color: "#ffffff",
          fontFamily: "Geist",
        }}
      >
        {/* Header: mark + wordmark */}
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

        {/* Document title */}
        <div
          style={{
            display: "flex",
            fontSize: title.length > 52 ? 62 : 78,
            letterSpacing: -2,
            lineHeight: 1.08,
            maxWidth: 1040,
          }}
        >
          {title}
        </div>

        {/* Footer: meta chips + domain */}
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
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Geist", data: font, weight: 400, style: "normal" }],
      headers: {
        // Cache aggressively at the edge — the card is a pure function of params.
        "cache-control": "public, max-age=31536000, immutable",
      },
    },
  )
}
