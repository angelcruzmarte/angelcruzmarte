// Regenerates the entire VOXYFI raster icon set from the single vector master
// (public/brand/voxyfi-icon.svg). Run: node scripts/generate-brand-assets.mjs
// Uses sharp for SVG->PNG rasterization and a tiny inline ICO encoder.
import sharp from "sharp"
import { promises as fs } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const PUB = path.join(ROOT, "public")
const APP = path.join(ROOT, "app")
const BRAND = path.join(PUB, "brand")

const DEEP = "#123f2e"
const EMERALD = "#12b981"
const CREAM = "#f5f2ea"

// The five waveform bars (shared geometry, viewBox 512).
const BARS = `
  <rect x="76" y="101" width="56" height="310" rx="28"/>
  <rect x="152" y="148" width="56" height="215" rx="28"/>
  <rect x="228" y="188" width="56" height="135" rx="28"/>
  <rect x="304" y="148" width="56" height="215" rx="28"/>
  <rect x="380" y="101" width="56" height="310" rx="28"/>`

// Full rounded-square app icon (iOS/PWA style squircle).
function iconSquircle(radius = 115) {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${DEEP}"/><stop offset="1" stop-color="${EMERALD}"/>
    </linearGradient></defs>
    <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>
    <g fill="#ffffff">${BARS}</g>
  </svg>`
}

// Maskable: full-bleed gradient (no corner radius — the OS applies its own
// mask) with the glyph scaled into the ~64% safe zone so it never gets clipped.
function iconMaskable() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${DEEP}"/><stop offset="1" stop-color="${EMERALD}"/>
    </linearGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <g fill="#ffffff" transform="translate(256 256) scale(0.62) translate(-256 -256)">${BARS}</g>
  </svg>`
}

// Circular watchOS-style icon.
function iconCircle() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${DEEP}"/><stop offset="1" stop-color="${EMERALD}"/>
    </linearGradient></defs>
    <circle cx="256" cy="256" r="256" fill="url(#g)"/>
    <g fill="#ffffff" transform="translate(256 256) scale(0.82) translate(-256 -256)">${BARS}</g>
  </svg>`
}

// Android adaptive foreground (transparent, glyph in safe zone) — green tint so
// it reads on any launcher background layer.
function androidForeground() {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <g fill="#ffffff" transform="translate(256 256) scale(0.58) translate(-256 -256)">${BARS}</g>
  </svg>`
}

const buf = (svg) => Buffer.from(svg)

async function png(svg, size, outPath, background) {
  let img = sharp(buf(svg), { density: 512 }).resize(size, size)
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
  await fs.mkdir(path.join(BRAND, "watch"), { recursive: true })
  await fs.mkdir(path.join(BRAND, "android"), { recursive: true })
  await fs.mkdir(path.join(BRAND, "favicon"), { recursive: true })

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
  written.push(await png(squircle, 180, path.join(BRAND, "favicon", "apple-touch-180.png")))

  // Favicon .ico (16/32/48)
  written.push(await writeIco([16, 32, 48], squircle, path.join(PUB, "favicon.ico")))

  // Apple Watch icon set (circular)
  for (const s of [1024, 216, 172, 100, 87, 55]) {
    written.push(await png(circle, s, path.join(BRAND, "watch", `watch-icon-${s}.png`)))
  }

  // Android adaptive icon layers
  written.push(
    await png(androidForeground(), 432, path.join(BRAND, "android", "ic_launcher_foreground.png")),
  )
  written.push(
    await png(iconSquircle(0), 512, path.join(BRAND, "android", "ic_launcher_512.png")),
  )
  // Play Store listing icon (512, opaque)
  written.push(await png(iconSquircle(0), 512, path.join(BRAND, "android", "play-store-512.png")))

  console.log("Generated:\n" + written.map((w) => "  " + path.relative(ROOT, w)).join("\n"))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
