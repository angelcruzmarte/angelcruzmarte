// Renders VOXYFI marketing / social / store graphics with pixel-perfect Geist
// text via next/og (satori). Run: node scripts/generate-brand-marketing.mjs
import { ImageResponse } from "next/og.js"
import { createElement as h } from "react"
import sharp from "sharp"
import { promises as fs } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const APP = path.join(ROOT, "app")
const SOCIAL = path.join(ROOT, "public", "brand", "social")

const DEEP = "#123f2e"
const EMERALD = "#12b981"
const CREAM = "#f5f2ea"
const BRAND_GRADIENT = `linear-gradient(135deg, ${DEEP} 0%, ${EMERALD} 100%)`

// Locate the bundled Geist TTF (ships with @vercel/og inside Next).
async function geistFont() {
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
        if (/node_modules|next|@vercel|compiled|dist/.test(e.name) || dir.includes("node_modules"))
          await walk(p)
      } else if (e.name === "Geist-Regular.ttf") {
        hits.push(p)
        return
      }
    }
  }
  await walk(path.join(ROOT, "node_modules"))
  if (!hits.length) throw new Error("Geist-Regular.ttf not found")
  return fs.readFile(hits[0])
}

// White waveform mark as a transparent PNG data URI (satori renders it as <img>).
async function whiteMarkDataUri(size = 320) {
  const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="#ffffff">
    <rect x="76" y="101" width="56" height="310" rx="28"/>
    <rect x="152" y="148" width="56" height="215" rx="28"/>
    <rect x="228" y="188" width="56" height="135" rx="28"/>
    <rect x="304" y="148" width="56" height="215" rx="28"/>
    <rect x="380" y="101" width="56" height="310" rx="28"/></g></svg>`
  const png = await sharp(Buffer.from(svg), { density: 512 }).resize(size, size).png().toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

// Rounded gradient tile holding the white mark.
function tile(mark, px) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: px,
        height: px,
        borderRadius: px * 0.28,
        background: BRAND_GRADIENT,
        boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
      },
    },
    h("img", { src: mark, width: px * 0.62, height: px * 0.62 }),
  )
}

async function render(node, width, height, fonts, outPath) {
  const res = new ImageResponse(node, { width, height, fonts })
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(outPath, buf)
  return outPath
}

async function main() {
  await fs.mkdir(SOCIAL, { recursive: true })
  const font = await geistFont()
  const fonts = [{ name: "Geist", data: font, weight: 400, style: "normal" }]
  const markLg = await whiteMarkDataUri(360)
  const written = []

  // ---- Social card (OG + Twitter), 1200x630: green gradient, white content ----
  const socialNode = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: BRAND_GRADIENT,
        color: "#ffffff",
        fontFamily: "Geist",
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "28px" } },
      h("img", { src: markLg, width: 132, height: 132 }),
      h(
        "div",
        { style: { fontSize: 84, fontWeight: 400, letterSpacing: -3, display: "flex" } },
        "VOXYFI",
      ),
    ),
    h(
      "div",
      { style: { marginTop: 44, fontSize: 60, letterSpacing: -1.5, lineHeight: 1.1, display: "flex" } },
      "Listen to anything.",
    ),
    h(
      "div",
      {
        style: {
          marginTop: 24,
          fontSize: 30,
          opacity: 0.82,
          maxWidth: 760,
          lineHeight: 1.35,
          display: "flex",
        },
      },
      "Turn any article, PDF, or note into natural-sounding speech with word-by-word highlighting.",
    ),
  )
  written.push(await render(socialNode, 1200, 630, fonts, path.join(APP, "opengraph-image.png")))
  written.push(await render(socialNode, 1200, 630, fonts, path.join(APP, "twitter-image.png")))
  written.push(
    await render(socialNode, 1200, 630, fonts, path.join(SOCIAL, "social-card-1200x630.png")),
  )

  // ---- Play Store feature graphic, 1024x500 (centered lockup on gradient) ----
  const featureNode = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "40px",
        background: BRAND_GRADIENT,
        color: "#ffffff",
        fontFamily: "Geist",
      },
    },
    h("img", { src: markLg, width: 190, height: 190 }),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h(
        "div",
        { style: { fontSize: 108, letterSpacing: -4, lineHeight: 1, display: "flex" } },
        "VOXYFI",
      ),
      h(
        "div",
        { style: { fontSize: 40, opacity: 0.85, marginTop: 12, display: "flex" } },
        "Listen to anything.",
      ),
    ),
  )
  written.push(
    await render(featureNode, 1024, 500, fonts, path.join(SOCIAL, "play-store-feature-1024x500.png")),
  )

  // ---- App Store promo, 1200x630 on cream (light variant for press/site) ----
  const lightNode = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: CREAM,
        color: DEEP,
        fontFamily: "Geist",
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "28px" } },
      tile(markLg, 132),
      h(
        "div",
        { style: { fontSize: 84, letterSpacing: -3, display: "flex", color: DEEP } },
        "VOXYFI",
      ),
    ),
    h(
      "div",
      { style: { marginTop: 44, fontSize: 58, letterSpacing: -1.5, display: "flex", color: DEEP } },
      "Your reading, out loud.",
    ),
    h(
      "div",
      {
        style: {
          marginTop: 22,
          fontSize: 29,
          color: "#3f5a4c",
          maxWidth: 780,
          lineHeight: 1.35,
          display: "flex",
        },
      },
      "Premium AI voices, word-by-word highlighting, and instant translation for any document.",
    ),
  )
  written.push(
    await render(lightNode, 1200, 630, fonts, path.join(SOCIAL, "promo-light-1200x630.png")),
  )

  console.log("Generated:\n" + written.map((w) => "  " + path.relative(ROOT, w)).join("\n"))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
