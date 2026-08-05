// Regenerates the entire VOXYFI raster icon + social asset set from the single
// "Voice Chevron" vector master. Run: node scripts/generate-brand-assets.mjs
// Uses sharp for SVG->PNG rasterization and a tiny inline ICO encoder.
import sharp from "sharp"
import { promises as fs } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const PUB = path.join(ROOT, "public")
const APP = path.join(ROOT, "app")
const BRAND = path.join(PUB, "brand")

// Richer, more vibrant emerald ramp: deep rich forest → vivid emerald → bright
// spring emerald. More saturated than the previous two-tone so the mark pops,
// especially at favicon sizes.
const DEEP = "#083b26"
const MID = "#0ea55e"
const EMERALD = "#19e084"
const CREAM = "#f5f2ea"

// The Voice Chevron: two nested rounded chevrons (viewBox 512). `stroke`,
// `inset`, `top` and `gap` let each composition tune reach / vertical centering.
function chevron({ stroke = "#ffffff", inset = 120, top = 152, gap = 72, width = 48 } = {}) {
  const right = 512 - inset
  const midTop = top + 136
  const bTop = top + gap
  const bMid = bTop + 136
  return `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${inset} ${top} L256 ${midTop} L${right} ${top}" opacity="0.55"/>
    <path d="M${inset} ${bTop} L256 ${bMid} L${right} ${bTop}"/>
  </g>`
}

const GRAD = `<defs>
  <linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${DEEP}"/>
    <stop offset="0.52" stop-color="${MID}"/>
    <stop offset="1" stop-color="${EMERALD}"/>
  </linearGradient>
  <linearGradient id="sheen" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
    <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
</defs>`

// Full rounded-square app icon (iOS/PWA style squircle).
function iconSquircle(radius = 115) {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${GRAD}
    <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>
    <rect width="512" height="512" rx="${radius}" fill="url(#sheen)"/>
    ${chevron()}
  </svg>`
}

// Maskable: full-bleed gradient (no corner radius — the OS applies its own
// mask) with the glyph pulled into the safe zone so it never gets clipped.
function iconMaskable() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${GRAD}
    <rect width="512" height="512" fill="url(#g)"/>
    <rect width="512" height="512" fill="url(#sheen)"/>
    ${chevron({ inset: 156, top: 182, gap: 60, width: 42 })}
  </svg>`
}

// Circular watchOS-style icon.
function iconCircle() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${GRAD}
    <circle cx="256" cy="256" r="256" fill="url(#g)"/>
    <circle cx="256" cy="256" r="256" fill="url(#sheen)"/>
    ${chevron({ inset: 140, top: 168, gap: 66, width: 46 })}
  </svg>`
}

// Android adaptive foreground (transparent, glyph in safe zone).
function androidForeground() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    ${chevron({ inset: 156, top: 182, gap: 60, width: 42 })}
  </svg>`
}

// Bare chevron on transparent bg (overlays / downloadable mark).
function markOnly(stroke) {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    ${chevron({ stroke, inset: 96, top: 128, gap: 82 })}
  </svg>`
}

// Vectorized "VOXYFI" wordmark (monoline, round caps/joins to echo the
// chevron). Drawn in a 496x100 cap-height box so it renders with NO font
// dependency (this environment has no fontconfig/pango, so <text> would tofu).
const WORD_W = 496
function wordmark(color) {
  const t = 18 // stroke thickness
  // Each letter is placed at an x offset; paths use a shared 0..100 cap height.
  const letters = [
    // V
    `<path d="M9 0 L35 100 L61 0"/>`,
    // O
    `<ellipse cx="35" cy="50" rx="26" ry="41"/>`,
    // X
    `<path d="M9 0 L61 100 M61 0 L9 100"/>`,
    // Y
    `<path d="M9 0 L35 52 L61 0 M35 52 L35 100"/>`,
    // F
    `<path d="M9 100 L9 0 L58 0 M9 50 L48 50"/>`,
    // I
    `<path d="M20 0 L20 100"/>`,
  ]
  const widths = [70, 70, 70, 70, 66, 40]
  const gap = 22
  let x = 0
  const placed = letters.map((l, i) => {
    const g = `<g transform="translate(${x} 0)">${l}</g>`
    x += widths[i] + gap
    return g
  })
  return `<g fill="none" stroke="${color}" stroke-width="${t}" stroke-linecap="round" stroke-linejoin="round">${placed.join("")}</g>`
}

// Centered lockup (tile + vectorized wordmark) for social / share graphics.
function lockup(w, h, { bg = "gradient", fg = "#ffffff" } = {}) {
  const tile = Math.round(h * 0.26)
  const capH = Math.round(tile * 0.52)
  const scale = capH / 100
  const wordW = WORD_W * scale
  const gap = Math.round(tile * 0.34)
  const groupW = tile + gap + wordW
  const gx = (w - groupW) / 2
  const tileY = (h - tile) / 2
  const wordY = (h - capH) / 2
  const background =
    bg === "gradient"
      ? `<rect width="${w}" height="${h}" fill="url(#g)"/>`
      : `<rect width="${w}" height="${h}" fill="${CREAM}"/>`
  const tileFill = bg === "gradient" ? "rgba(255,255,255,0.14)" : "url(#g)"
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${GRAD}
    ${background}
    <g transform="translate(${gx} ${tileY})">
      <g transform="scale(${tile / 512})">
        <rect width="512" height="512" rx="115" fill="${tileFill}"/>
        ${chevron({ stroke: "#ffffff" })}
      </g>
    </g>
    <g transform="translate(${gx + tile + gap} ${wordY}) scale(${scale})">
      ${wordmark(fg)}
    </g>
  </svg>`
}

const buf = (svg) => Buffer.from(svg)

async function png(svg, size, outPath, background) {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  let img = sharp(buf(svg), { density: 512 })
  if (Array.isArray(size)) img = img.resize(size[0], size[1])
  else img = img.resize(size, size)
  if (background) img = img.flatten({ background })
  await img.png().toFile(outPath)
  return outPath
}

// Minimal ICO encoder wrapping PNG entries (ICO supports embedded PNGs).
async function writeIco(sizes, svg, outPath) {
  const pngs = await Promise.all(
    sizes.map((s) => sharp(buf(svg), { density: 512 }).resize(s, s).png().toBuffer()),
  )
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngs.forEach((p, i) => {
    const s = sizes[i]
    const b = i * 16
    dir.writeUInt8(s >= 256 ? 0 : s, b + 0)
    dir.writeUInt8(s >= 256 ? 0 : s, b + 1)
    dir.writeUInt8(0, b + 2)
    dir.writeUInt8(0, b + 3)
    dir.writeUInt16LE(1, b + 4)
    dir.writeUInt16LE(32, b + 6)
    dir.writeUInt32LE(p.length, b + 8)
    dir.writeUInt32LE(offset, b + 12)
    offset += p.length
  })
  await fs.writeFile(outPath, Buffer.concat([header, dir, ...pngs]))
  return outPath
}

async function main() {
  const squircle = iconSquircle()
  const maskable = iconMaskable()
  const circle = iconCircle()
  const written = []

  // PWA / general app icons
  written.push(await png(squircle, 192, path.join(PUB, "icon-192.png")))
  written.push(await png(squircle, 512, path.join(PUB, "icon-512.png")))
  written.push(await png(squircle, 1024, path.join(PUB, "icon-1024.png")))
  written.push(await png(maskable, 512, path.join(PUB, "icon-maskable-512.png")))

  // Apple touch icon (opaque, Apple adds rounding) — 180
  written.push(await png(iconSquircle(0), 180, path.join(PUB, "apple-icon.png")))

  // Browser tab PNGs (light/dark identical — gradient reads on both)
  written.push(await png(squircle, 32, path.join(PUB, "icon-light-32x32.png")))
  written.push(await png(squircle, 32, path.join(PUB, "icon-dark-32x32.png")))
  written.push(await png(squircle, 16, path.join(BRAND, "favicon", "favicon-16.png")))
  written.push(await png(squircle, 32, path.join(BRAND, "favicon", "favicon-32.png")))
  written.push(await png(squircle, 48, path.join(BRAND, "favicon", "favicon-48.png")))
  written.push(await png(iconSquircle(0), 180, path.join(BRAND, "favicon", "apple-touch-180.png")))

  // Favicon .ico (16/32/48)
  written.push(await writeIco([16, 32, 48], squircle, path.join(PUB, "favicon.ico")))

  // Apple Watch icon set (circular)
  for (const s of [1024, 216, 172, 100, 87, 55]) {
    written.push(await png(circle, s, path.join(BRAND, "watch", `watch-icon-${s}.png`)))
  }

  // Android adaptive icon layers
  written.push(await png(androidForeground(), 432, path.join(BRAND, "android", "ic_launcher_foreground.png")))
  written.push(await png(iconSquircle(0), 512, path.join(BRAND, "android", "ic_launcher_512.png")))
  written.push(await png(iconSquircle(0), 512, path.join(BRAND, "android", "play-store-512.png")))

  // Social / store graphics (existing references on the brand page)
  written.push(await png(lockup(1200, 630, { bg: "gradient" }), [1200, 630], path.join(BRAND, "social", "social-card-1200x630.png")))
  written.push(await png(lockup(1200, 630, { bg: "light", fg: DEEP }), [1200, 630], path.join(BRAND, "social", "promo-light-1200x630.png")))
  written.push(await png(lockup(1024, 500, { bg: "gradient" }), [1024, 500], path.join(BRAND, "social", "play-store-feature-1024x500.png")))

  // High-quality downloadable social assets
  written.push(await png(iconSquircle(460), 2048, path.join(BRAND, "social", "voxyfi-avatar-2048.png"))) // rounded profile pic
  written.push(await png(markOnly("#ffffff"), 2048, path.join(BRAND, "social", "voxyfi-mark-white-2048.png")))
  written.push(await png(markOnly(DEEP), 2048, path.join(BRAND, "social", "voxyfi-mark-green-2048.png")))
  written.push(await png(lockup(2400, 1260, { bg: "gradient" }), [2400, 1260], path.join(BRAND, "social", "voxyfi-social-banner-2400x1260.png")))

  // App-level Open Graph / Twitter images
  const og = lockup(1200, 630, { bg: "gradient" })
  written.push(await png(og, [1200, 630], path.join(APP, "opengraph-image.png")))
  written.push(await png(og, [1200, 630], path.join(APP, "twitter-image.png")))

  console.log("Generated:\n" + written.map((w) => "  " + path.relative(ROOT, w)).join("\n"))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
