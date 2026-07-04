import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import sharp from "sharp"
import pngToIco from "png-to-ico"

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public")

// The VOXYFI mark: five rounded bars in a waveform that dips to form a "V"
// (voice + equalizer). `bg` is a 2-stop analogous indigo gradient.
function markSvg({ from, to }) {
  return `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="120" fill="url(#bg)"/>
  <g fill="#ffffff">
    <rect x="94"  y="126" width="44" height="260" rx="22"/>
    <rect x="164" y="166" width="44" height="180" rx="22"/>
    <rect x="234" y="201" width="44" height="110" rx="22"/>
    <rect x="304" y="166" width="44" height="180" rx="22"/>
    <rect x="374" y="126" width="44" height="260" rx="22"/>
  </g>
</svg>`
}

const light = markSvg({ from: "#5b67f7", to: "#3a45e0" })
const dark = markSvg({ from: "#7480ff", to: "#5b67f7" })

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
}

async function main() {
  await mkdir(publicDir, { recursive: true })

  const outputs = [
    ["icon-light-32x32.png", light, 32],
    ["icon-dark-32x32.png", dark, 32],
    ["apple-icon.png", light, 180],
    ["icon-192.png", light, 192],
    ["icon-512.png", light, 512],
  ]

  for (const [name, svg, size] of outputs) {
    const buf = await png(svg, size)
    await writeFile(join(publicDir, name), buf)
    console.log("wrote", name, `${size}x${size}`)
  }

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
