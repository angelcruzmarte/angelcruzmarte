// Renders App Store + Play Store marketing screenshots at full store resolution
// with next/og (satori): a branded caption over a device frame containing a
// faithful VOXYFI reader mock. Crisp at native size — no upscaled captures.
// Run: node scripts/generate-brand-screenshots.mjs
import { ImageResponse } from "next/og.js"
import { createElement as h } from "react"
import sharp from "sharp"
import { promises as fs } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "public", "brand", "screenshots")

const DEEP = "#123f2e"
const EMERALD = "#12b981"
const CREAM = "#f5f2ea"
const INK = "#1c2b22"
const MUTED = "#6b7b70"
const BRAND_GRADIENT = `linear-gradient(135deg, ${DEEP} 0%, ${EMERALD} 100%)`

async function geistFont(name) {
  const hits = []
  async function walk(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (hits.length) return
        await walk(p)
      } else if (e.name === name) {
        hits.push(p)
        return
      }
    }
  }
  await walk(path.join(ROOT, "node_modules"))
  if (!hits.length) throw new Error(`${name} not found`)
  return fs.readFile(hits[0])
}

// White waveform mark as a transparent PNG data URI.
async function whiteMark(size = 320) {
  const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="#ffffff">
    <rect x="76" y="101" width="56" height="310" rx="28"/>
    <rect x="152" y="148" width="56" height="215" rx="28"/>
    <rect x="228" y="188" width="56" height="135" rx="28"/>
    <rect x="304" y="148" width="56" height="215" rx="28"/>
    <rect x="380" y="101" width="56" height="310" rx="28"/></g></svg>`
  const png = await sharp(Buffer.from(svg), { density: 512 }).resize(size, size).png().toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

// A single equalizer bar for the mini-player waveform.
const bar = (hgt, color) =>
  h("div", { style: { width: 8, height: hgt, borderRadius: 4, background: color } })

// Grey text line placeholder; `hl` renders the brand highlight (translate demo).
const line = (w, hl = false) =>
  h("div", {
    style: {
      width: w,
      height: 20,
      borderRadius: 6,
      background: hl ? "rgba(18,185,129,0.20)" : "rgba(28,43,34,0.10)",
    },
  })

// The faithful in-app reader screen shown inside the phone frame.
function screen(mark, { title, highlightTranslate, emphasizeTools }) {
  const toolItem = (label, active) =>
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          flex: 1,
          padding: "4px 0",
          borderRadius: 16,
          background: active ? "rgba(18,185,129,0.12)" : "transparent",
        },
      },
      h("div", {
        style: {
          width: 26,
          height: 26,
          borderRadius: 8,
          background: active ? EMERALD : "rgba(28,43,34,0.18)",
        },
      }),
      h("div", { style: { fontSize: 15, color: active ? DEEP : MUTED } }, label),
    )

  const toggle = (label, active) =>
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          borderRadius: 999,
          fontSize: 16,
          color: active ? "#fff" : MUTED,
          background: active ? DEEP : "rgba(28,43,34,0.08)",
        },
      },
      label,
    )

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: CREAM,
        color: INK,
      },
    },
    // App header
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "28px 30px 18px",
        },
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 12 } },
        h("div", {
          style: {
            display: "flex",
            width: 46,
            height: 46,
            borderRadius: 13,
            background: BRAND_GRADIENT,
            alignItems: "center",
            justifyContent: "center",
          },
          children: h("img", { src: mark, width: 26, height: 26 }),
        }),
        h("div", { style: { fontSize: 26, fontWeight: 700, letterSpacing: 1 } }, "VOXYFI"),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            padding: "8px 16px",
            borderRadius: 999,
            background: DEEP,
            color: "#fff",
            fontSize: 15,
          },
        },
        "Premium",
      ),
    ),
    // Document title
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 6, padding: "6px 30px 18px" } },
      h("div", { style: { fontSize: 22, fontWeight: 700 } }, title),
      h("div", { style: { fontSize: 16, color: MUTED } }, "Page 2 of 2"),
    ),
    // Reader body
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 14,
          flex: 1,
          margin: "0 22px",
          padding: "26px 24px",
          borderRadius: 24,
          background: "#fff",
          boxShadow: "0 10px 40px rgba(18,63,46,0.08)",
        },
      },
      h("div", { style: { fontSize: 19, fontWeight: 700, marginBottom: 2 } }, "The Declaration of Independence"),
      line("100%", highlightTranslate),
      line("96%", highlightTranslate),
      line("92%", highlightTranslate),
      line("100%"),
      line("88%"),
      line("94%"),
      line("70%"),
    ),
    // Player card
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 20,
          margin: "20px 22px 30px",
          padding: "22px 22px 26px",
          borderRadius: 26,
          background: "#fff",
          boxShadow: "0 -6px 40px rgba(18,63,46,0.10)",
        },
      },
      // AI tools row
      h(
        "div",
        { style: { display: "flex", gap: 6 } },
        toolItem("Chat", emphasizeTools),
        toolItem("Summary", emphasizeTools),
        toolItem("Podcast", emphasizeTools),
        toolItem("Quiz", emphasizeTools),
      ),
      // Controls
      h(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        h("div", {
          style: { width: 52, height: 52, borderRadius: 999, background: "rgba(28,43,34,0.10)" },
        }),
        h("div", { style: { display: "flex", alignItems: "flex-end", gap: 6, height: 46 } },
          bar(20, EMERALD), bar(34, EMERALD), bar(46, DEEP), bar(30, EMERALD), bar(18, EMERALD)),
        h("div", {
          style: {
            display: "flex",
            width: 68,
            height: 68,
            borderRadius: 999,
            background: BRAND_GRADIENT,
            alignItems: "center",
            justifyContent: "center",
          },
          children: h("div", {
            style: {
              width: 0,
              height: 0,
              borderTop: "15px solid transparent",
              borderBottom: "15px solid transparent",
              borderLeft: "24px solid #fff",
              marginLeft: 6,
            },
          }),
        }),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              padding: "10px 16px",
              borderRadius: 999,
              background: "rgba(28,43,34,0.08)",
              fontSize: 16,
              color: INK,
            },
          },
          "1x",
        ),
      ),
      // Translate toggles
      h(
        "div",
        { style: { display: "flex", gap: 10 } },
        toggle("Translated to English", highlightTranslate),
        toggle("Original", !highlightTranslate),
      ),
    ),
  )
}

function frame(mark, caption, screenNode, W, H) {
  // Device geometry scales with the target height.
  const phoneW = Math.round(W * 0.74)
  const phoneH = Math.round(H * 0.68)
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: W,
        height: H,
        background: BRAND_GRADIENT,
        fontFamily: "Geist",
      },
    },
    // Caption
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: `${Math.round(H * 0.06)}px 8% ${Math.round(H * 0.03)}px`,
        },
      },
      h(
        "div",
        {
          style: {
            fontSize: Math.round(W * 0.062),
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.1,
            letterSpacing: -0.5,
          },
        },
        caption,
      ),
    ),
    // Phone
    h(
      "div",
      {
        style: {
          display: "flex",
          width: phoneW,
          height: phoneH,
          borderRadius: Math.round(phoneW * 0.13),
          background: "#0c1b14",
          padding: Math.round(phoneW * 0.03),
          boxShadow: "0 40px 120px rgba(0,0,0,0.4)",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            width: "100%",
            height: "100%",
            borderRadius: Math.round(phoneW * 0.1),
            overflow: "hidden",
          },
        },
        screenNode,
      ),
    ),
  )
}

const SHOTS = [
  { key: "01-listen", caption: "Turn any document into audio", opts: { title: "Declaration of Independence", highlightTranslate: false, emphasizeTools: false } },
  { key: "02-translate", caption: "Translate as you listen", opts: { title: "Spanish translation · U.S. Declaration", highlightTranslate: true, emphasizeTools: false } },
  { key: "03-tools", caption: "Summaries, podcasts & quizzes", opts: { title: "Research paper.pdf", highlightTranslate: false, emphasizeTools: true } },
]

const SIZES = [
  { name: "ios-6.7", w: 1290, h: 2796 },
  { name: "android", w: 1080, h: 1920 },
]

async function main() {
  await fs.mkdir(OUT, { recursive: true })
  const geist = await geistFont("Geist-Regular.ttf")
  let geistBold
  try {
    geistBold = await geistFont("Geist-Bold.ttf")
  } catch {
    geistBold = geist
  }
  const mark = await whiteMark(64)
  const fonts = [
    { name: "Geist", data: geist, weight: 400, style: "normal" },
    { name: "Geist", data: geistBold, weight: 700, style: "normal" },
  ]

  for (const size of SIZES) {
    for (const shot of SHOTS) {
      const node = frame(mark, shot.caption, screen(mark, shot.opts), size.w, size.h)
      const png = await new ImageResponse(node, {
        width: size.w,
        height: size.h,
        fonts,
      }).arrayBuffer()
      const file = path.join(OUT, `${shot.key}-${size.name}.png`)
      await fs.writeFile(file, Buffer.from(png))
      console.log("wrote", path.relative(ROOT, file))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
