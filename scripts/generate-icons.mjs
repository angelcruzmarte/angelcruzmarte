import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import sharp from "sharp"
import pngToIco from "png-to-ico"

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public")

// Brand greens (manifest theme_color is #176b43). A gentle diagonal gradient
// plus a soft top shine give the mark depth at App Store sizes.
const GREEN_LIGHT = "#1f8a55"
const GREEN_DARK = "#0e4d2e"

// The VOXYFI mark: five rounded bars in a waveform that dips to a center "V"
// (voice + equalizer), on a 512 grid. Kept in sync with components/logo-mark.tsx.
const BARS = [
  { x: 83, y: 116, w: 50, h: 280 },
  { x: 157, y: 161, w: 50, h: 190 },
  { x: 231, y: 196, w: 50, h: 120 },
  { x: 305, y: 161, w: 50, h: 190 },
  { x: 379, y: 116, w: 50, h: 280 },
]

function bars(fill) {
  return BARS.map(
    (b) =>
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="25" fill="${fill}"/>`,
  ).join("")
}

/**
 * Full icon SVG on a 512 viewBox.
 * @param {{from?: string, to?: string, rounded?: boolean}} opts
 *   `rounded` adds an app-tile corner radius; a square (full-bleed) icon is
 *   used for the App Store / iOS, which apply their own corner mask.
 */
function iconSvg({ from = GREEN_LIGHT, to = GREEN_DARK, rounded = true } = {}) {
  const r = rounded ? 114 : 0
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <linearGradient id="shine" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${r}" fill="url(#shine)"/>
  ${bars("#ffffff")}
</svg>`
}

// Render SVGs at high density so downscaling stays razor sharp.
async function png(svg, size, { opaque = false } = {}) {
  let p = sharp(Buffer.from(svg), { density: 320 }).resize(size, size, {
    fit: "cover",
  })
  if (opaque) p = p.flatten({ background: GREEN_DARK }).removeAlpha()
  return p.png({ compressionLevel: 9 }).toBuffer()
}

async function main() {
  await mkdir(publicDir, { recursive: true })

  const rounded = iconSvg({ rounded: true })
  const square = iconSvg({ rounded: false })
  const light = iconSvg({ rounded: true })
  const dark = iconSvg({ from: "#26a768", to: "#12603a", rounded: true })

  const outputs = [
    // App Store marketing icon: full-bleed, opaque (no alpha), no rounded
    // corners — Apple applies its own mask.
    ["icon-1024.png", square, 1024, { opaque: true }],
    // iOS home-screen icon: opaque, iOS masks the corners.
    ["apple-icon.png", square, 180, { opaque: true }],
    // PWA maskable: full-bleed so platforms can safely crop to any shape.
    ["icon-maskable-512.png", square, 512, {}],
    // Web / PWA any-purpose icons: rounded tile.
    ["icon-512.png", rounded, 512, {}],
    ["icon-192.png", rounded, 192, {}],
    // Browser tab favicons for light/dark UI.
    ["icon-light-32x32.png", light, 32, {}],
    ["icon-dark-32x32.png", dark, 32, {}],
  ]

  for (const [name, svg, size, opts] of outputs) {
    const buf = await png(svg, size, opts)
    await writeFile(join(publicDir, name), buf)
    console.log("wrote", name, `${size}x${size}`, opts.opaque ? "(opaque)" : "")
  }

  // Keep the standalone favicon SVG in sync (rounded tile).
  await writeFile(join(publicDir, "icon.svg"), rounded + "\n", "utf8")
  console.log("wrote icon.svg")

  // Multi-resolution favicon.ico for legacy browsers.
  const icoSizes = [16, 32, 48]
  const icoBuffers = await Promise.all(icoSizes.map((s) => png(light, s)))
  const ico = await pngToIco(icoBuffers)
  await writeFile(join(publicDir, "favicon.ico"), ico)
  console.log("wrote favicon.ico", icoSizes.join("/"))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
