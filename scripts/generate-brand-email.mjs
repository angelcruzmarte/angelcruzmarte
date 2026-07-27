// Renders raster assets for HTML email (where CSS gradients and SVG are
// unreliable): a full-width branded header banner and a standalone gradient
// icon tile for signatures. Run: node scripts/generate-brand-email.mjs
import { ImageResponse } from "next/og.js"
import { createElement as h } from "react"
import sharp from "sharp"
import { promises as fs } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "public", "brand", "email")

const DEEP = "#123f2e"
const EMERALD = "#12b981"
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
async function whiteMark(size) {
  const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="#ffffff">
    <rect x="76" y="101" width="56" height="310" rx="28"/>
    <rect x="152" y="148" width="56" height="215" rx="28"/>
    <rect x="228" y="188" width="56" height="135" rx="28"/>
    <rect x="304" y="148" width="56" height="215" rx="28"/>
    <rect x="380" y="101" width="56" height="310" rx="28"/></g></svg>`
  const png = await sharp(Buffer.from(svg), { density: 512 }).resize(size, size).png().toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

async function main() {
  await fs.mkdir(OUT, { recursive: true })
  const geistBold = await geistFont("Geist-Bold.ttf").catch(() => geistFont("Geist-Regular.ttf"))
  const fonts = [{ name: "Geist", data: geistBold, weight: 700, style: "normal" }]

  // 1) Header banner — 1200x320 (rendered @2x for crispness), gradient bg with
  //    the white mark tile + wordmark centered.
  const mark = await whiteMark(120)
  const banner = h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        width: 1200,
        height: 320,
        background: BRAND_GRADIENT,
        fontFamily: "Geist",
      },
    },
    h("div", {
      style: {
        display: "flex",
        width: 148,
        height: 148,
        borderRadius: 40,
        background: "rgba(255,255,255,0.14)",
        border: "2px solid rgba(255,255,255,0.28)",
        alignItems: "center",
        justifyContent: "center",
      },
      children: h("img", { src: mark, width: 92, height: 92 }),
    }),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h(
        "div",
        { style: { fontSize: 92, fontWeight: 700, color: "#fff", letterSpacing: 4, lineHeight: 1 } },
        "VOXYFI",
      ),
      h(
        "div",
        { style: { fontSize: 30, color: "rgba(255,255,255,0.82)", marginTop: 10, letterSpacing: 1 } },
        "Listen to anything",
      ),
    ),
  )
  const bannerPng = await new ImageResponse(banner, { width: 1200, height: 320, fonts }).arrayBuffer()
  await fs.writeFile(path.join(OUT, "email-banner.png"), Buffer.from(bannerPng))
  console.log("wrote public/brand/email/email-banner.png")

  // 2) Signature logo — 240x240 gradient squircle tile with the white mark,
  //    for use as a small logo/avatar in staff signatures.
  const tileSvg = `<svg width="240" height="240" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="240" y2="240" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${DEEP}"/><stop offset="1" stop-color="${EMERALD}"/>
    </linearGradient></defs>
    <rect width="240" height="240" rx="54" fill="url(#g)"/>
    <g fill="#ffffff" transform="translate(48 48) scale(0.28)">
      <rect x="76" y="101" width="56" height="310" rx="28"/>
      <rect x="152" y="148" width="56" height="215" rx="28"/>
      <rect x="228" y="188" width="56" height="135" rx="28"/>
      <rect x="304" y="148" width="56" height="215" rx="28"/>
      <rect x="380" y="101" width="56" height="310" rx="28"/>
    </g></svg>`
  await sharp(Buffer.from(tileSvg), { density: 300 }).png().toFile(path.join(OUT, "signature-logo.png"))
  console.log("wrote public/brand/email/signature-logo.png")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
