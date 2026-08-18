// Regenerates the entire VOXYFI raster icon + social asset set from the single
// vector master: a black disc ringed by a glowing emerald circle, holding two
// downward "double chevron" strokes (emerald over white).
// Run: node scripts/generate-brand-assets.mjs
// Uses sharp for SVG->PNG rasterization and a tiny inline ICO encoder.
import sharp from "sharp"
import { promises as fs } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const PUB = path.join(ROOT, "public")
const APP = path.join(ROOT, "app")
const BRAND = path.join(PUB, "brand")
// Source images consumed by @capacitor/assets to generate native iOS/Android
// icons and splash screens (run `npx @capacitor/assets generate` in the wrapper).
const ASSETS = path.join(ROOT, "assets")

const BLACK = "#000000"
const EMERALD = "#13d18e"
const WHITE = "#ffffff"
const CREAM = "#f5f2ea"

// Glow filter (soft emerald bloom behind the ring). std tunes the spread.
function glowDefs(std = 12) {
  return `<filter id="glow" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="${std}"/></filter>`
}

// The mark: glowing emerald ring + two downward chevrons (emerald over white).
// `scale` shrinks it about the center so it can be pulled into a safe zone for
// maskable / adaptive icons. Assumes a 512 viewBox and a `glow` filter in defs.
function mark({ scale = 1 } = {}) {
  const inner = `
    <circle cx="256" cy="256" r="230" fill="none" stroke="${EMERALD}" stroke-width="26" opacity="0.7" filter="url(#glow)"/>
    <circle cx="256" cy="256" r="230" fill="none" stroke="${EMERALD}" stroke-width="26"/>
    <g fill="none" stroke-width="46" stroke-linecap="round" stroke-linejoin="round">
      <path d="M150 190 L256 276 L362 190" stroke="${EMERALD}"/>
      <path d="M150 270 L256 356 L362 270" stroke="${WHITE}"/>
    </g>`
  if (scale === 1) return inner
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${inner}</g>`
}

// Bare double-chevron in a single color, on transparent (overlays / downloads).
function chevronOnly(stroke) {
  return `<g fill="none" stroke="${stroke}" stroke-width="52" stroke-linecap="round" stroke-linejoin="round">
    <path d="M120 176 L256 300 L392 176"/>
    <path d="M120 268 L256 392 L392 268"/>
  </g>`
}

// Full square app icon — black canvas with the glowing ring mark centered
// (matches the master artwork). `radius` rounds the corners (0 = full square).
function iconSquare(radius = 0) {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${glowDefs()}</defs>
    <rect width="512" height="512" rx="${radius}" fill="${BLACK}"/>
    ${mark()}
  </svg>`
}

// Maskable: full-bleed black with the mark pulled into the safe zone so the OS
// circular/rounded mask never clips the ring.
function iconMaskable() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${glowDefs()}</defs>
    <rect width="512" height="512" fill="${BLACK}"/>
    ${mark({ scale: 0.72 })}
  </svg>`
}

// Circular watchOS-style icon (black disc + mark).
function iconCircle() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${glowDefs()}</defs>
    <circle cx="256" cy="256" r="256" fill="${BLACK}"/>
    ${mark()}
  </svg>`
}

// Android adaptive foreground (transparent; mark in the safe zone).
function androidForeground() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${glowDefs()}</defs>
    ${mark({ scale: 0.66 })}
  </svg>`
}

// Vectorized "VOXYFI" wordmark (monoline, round caps/joins to echo the mark).
// Drawn in a 496x100 cap-height box so it renders with NO font dependency
// (this environment has no fontconfig/pango, so <text> would tofu).
const WORD_W = 496
function wordmark(color) {
  const t = 18
  const letters = [
    `<path d="M9 0 L35 100 L61 0"/>`, // V
    `<ellipse cx="35" cy="50" rx="26" ry="41"/>`, // O
    `<path d="M9 0 L61 100 M61 0 L9 100"/>`, // X
    `<path d="M9 0 L35 52 L61 0 M35 52 L35 100"/>`, // Y
    `<path d="M9 100 L9 0 L58 0 M9 50 L48 50"/>`, // F
    `<path d="M20 0 L20 100"/>`, // I
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

// Centered lockup (mark badge + vectorized wordmark) for social / share
// graphics. Defaults to the dark brand style (black bg, glowing mark, white
// wordmark); `bg: "light"` uses a cream card with a dark wordmark.
function lockup(w, h, { bg = "dark", fg = "#ffffff" } = {}) {
  const tile = Math.round(h * 0.3)
  const capH = Math.round(tile * 0.5)
  const scale = capH / 100
  const wordW = WORD_W * scale
  const gap = Math.round(tile * 0.3)
  const groupW = tile + gap + wordW
  const gx = (w - groupW) / 2
  const tileY = (h - tile) / 2
  const wordY = (h - capH) / 2
  const background =
    bg === "light"
      ? `<rect width="${w}" height="${h}" fill="${CREAM}"/>`
      : `<rect width="${w}" height="${h}" fill="${BLACK}"/>`
  const discFill = bg === "light" ? BLACK : "none"
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs>${glowDefs()}</defs>
    ${background}
    <g transform="translate(${gx} ${tileY})">
      <g transform="scale(${tile / 512})">
        <circle cx="256" cy="256" r="256" fill="${discFill}"/>
        ${mark()}
      </g>
    </g>
    <g transform="translate(${gx + tile + gap} ${wordY}) scale(${scale})">
      ${wordmark(fg)}
    </g>
  </svg>`
}

// Full-bleed App Store marketing icon (1024, opaque, no rounding, no alpha —
// Apple REJECTS icons with an alpha channel).
function iconFullBleed() {
  return `<svg width="1024" height="1024" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${glowDefs()}</defs>
    <rect width="512" height="512" fill="${BLACK}"/>
    ${mark()}
  </svg>`
}

// Plain black square (no mark) — Android adaptive-icon background layer.
function iconBackground() {
  return `<svg width="1024" height="1024" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="${BLACK}"/>
  </svg>`
}

// Launch splash (square canvas so @capacitor/assets can crop to every device).
// Black background with a centered mark and the wordmark beneath.
function splash() {
  const S = 2732
  const c = S / 2
  const tile = 660
  const capH = 150
  const scale = capH / 100
  const wordW = WORD_W * scale
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg"><defs>${glowDefs(20)}</defs>
    <rect width="${S}" height="${S}" fill="${BLACK}"/>
    <g transform="translate(${c - tile / 2} ${c - tile / 2 - 120})">
      <g transform="scale(${tile / 512})">${mark()}</g>
    </g>
    <g transform="translate(${c - wordW / 2} ${c + tile / 2 - 40}) scale(${scale})">
      ${wordmark(WHITE)}
    </g>
  </svg>`
}

const buf = (svg) => Buffer.from(svg)

// Intrinsic px width declared on the <svg>, used to pick a rasterization
// density that renders a crisp base without exceeding sharp's pixel limit.
function svgWidth(svg) {
  const m = svg.match(/width="(\d+)"/)
  return m ? Number(m[1]) : 512
}
function densityFor(svg, target) {
  const iw = svgWidth(svg)
  // Aim for a base render ~1.3x the target longest edge.
  return Math.max(72, Math.min(600, Math.round((96 * target * 1.3) / iw)))
}

async function png(svg, size, outPath, background) {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  const target = Array.isArray(size) ? Math.max(size[0], size[1]) : size
  let img = sharp(buf(svg), { density: densityFor(svg, target) })
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
  const square = iconSquare()
  const maskable = iconMaskable()
  const circle = iconCircle()
  const written = []

  // PWA / general app icons
  written.push(await png(square, 192, path.join(PUB, "icon-192.png")))
  written.push(await png(square, 512, path.join(PUB, "icon-512.png")))
  written.push(await png(square, 1024, path.join(PUB, "icon-1024.png")))
  written.push(await png(maskable, 512, path.join(PUB, "icon-maskable-512.png")))

  // Apple touch icon (opaque, Apple adds rounding)
  written.push(await png(iconSquare(0), 180, path.join(PUB, "apple-icon.png"), BLACK))

  // Browser tab PNGs (light/dark identical — the mark reads on both)
  written.push(await png(square, 32, path.join(PUB, "icon-light-32x32.png")))
  written.push(await png(square, 32, path.join(PUB, "icon-dark-32x32.png")))
  written.push(await png(square, 16, path.join(BRAND, "favicon", "favicon-16.png")))
  written.push(await png(square, 32, path.join(BRAND, "favicon", "favicon-32.png")))
  written.push(await png(square, 48, path.join(BRAND, "favicon", "favicon-48.png")))
  written.push(await png(iconSquare(0), 180, path.join(BRAND, "favicon", "apple-touch-180.png"), BLACK))

  // Favicon .ico (16/32/48)
  written.push(await writeIco([16, 32, 48], square, path.join(PUB, "favicon.ico")))

  // Apple Watch icon set (circular)
  for (const s of [1024, 216, 172, 100, 87, 55]) {
    written.push(await png(circle, s, path.join(BRAND, "watch", `watch-icon-${s}.png`)))
  }

  // Android adaptive icon layers
  written.push(await png(androidForeground(), 432, path.join(BRAND, "android", "ic_launcher_foreground.png")))
  written.push(await png(iconSquare(0), 512, path.join(BRAND, "android", "ic_launcher_512.png"), BLACK))
  written.push(await png(iconSquare(0), 512, path.join(BRAND, "android", "play-store-512.png"), BLACK))

  // Social / store graphics (existing references on the brand page)
  written.push(await png(lockup(1200, 630, { bg: "dark" }), [1200, 630], path.join(BRAND, "social", "social-card-1200x630.png")))
  written.push(await png(lockup(1200, 630, { bg: "light", fg: "#083b26" }), [1200, 630], path.join(BRAND, "social", "promo-light-1200x630.png")))
  written.push(await png(lockup(1024, 500, { bg: "dark" }), [1024, 500], path.join(BRAND, "social", "play-store-feature-1024x500.png")))

  // High-quality downloadable social assets
  written.push(await png(iconCircle(), 2048, path.join(BRAND, "social", "voxyfi-avatar-2048.png"))) // round profile pic
  written.push(await png(`<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${chevronOnly(WHITE)}</svg>`, 2048, path.join(BRAND, "social", "voxyfi-mark-white-2048.png")))
  written.push(await png(`<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${chevronOnly(EMERALD)}</svg>`, 2048, path.join(BRAND, "social", "voxyfi-mark-green-2048.png")))
  written.push(await png(lockup(2400, 1260, { bg: "dark" }), [2400, 1260], path.join(BRAND, "social", "voxyfi-social-banner-2400x1260.png")))

  // App-level Open Graph / Twitter images
  const og = lockup(1200, 630, { bg: "dark" })
  written.push(await png(og, [1200, 630], path.join(APP, "opengraph-image.png")))
  written.push(await png(og, [1200, 630], path.join(APP, "twitter-image.png")))

  // ---- Native / App Store assets ----
  // App Store marketing icon: 1024, opaque (flattened), no rounding.
  written.push(await png(iconFullBleed(), 1024, path.join(BRAND, "app-store", "app-store-icon-1024.png"), BLACK))

  // @capacitor/assets sources (root /assets). It generates every iOS/Android
  // icon + splash size from these five files.
  written.push(await png(iconFullBleed(), 1024, path.join(ASSETS, "icon-only.png"), BLACK))
  written.push(await png(androidForeground(), 1024, path.join(ASSETS, "icon-foreground.png")))
  written.push(await png(iconBackground(), 1024, path.join(ASSETS, "icon-background.png"), BLACK))
  written.push(await png(splash(), 2732, path.join(ASSETS, "splash.png"), BLACK))
  written.push(await png(splash(), 2732, path.join(ASSETS, "splash-dark.png"), BLACK))

  console.log("Generated:\n" + written.map((w) => "  " + path.relative(ROOT, w)).join("\n"))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
