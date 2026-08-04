// Assembles the downloadable VOXYFI Brand Kit ZIP from the approved assets in
// /public, plus generated colors/typography/README docs. Output:
//   public/brand/voxyfi-brand-kit.zip
//
// Run: node scripts/generate-brand-kit-zip.mjs

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const PUB = path.join(ROOT, "public")

const ROOT_NAME = "VOXYFI-Brand-Kit"

/** Adds a file from /public to the zip; warns and skips if missing. */
async function addFile(zip, srcRel, destRel) {
  const abs = path.join(PUB, srcRel)
  try {
    const buf = await fs.readFile(abs)
    zip.file(`${ROOT_NAME}/${destRel}`, buf)
    return true
  } catch {
    console.warn(`  ! skipped (missing): ${srcRel}`)
    return false
  }
}

function addText(zip, destRel, text) {
  zip.file(`${ROOT_NAME}/${destRel}`, text)
}

const COLORS_JSON = {
  brand: {
    "green-deep": { oklch: "oklch(0.33 0.098 152)", hex: "#123f2e", use: "Primary gradient start, dark surfaces" },
    "green-emerald": { oklch: "oklch(0.72 0.16 160)", hex: "#10b981", use: "Primary gradient end, accents, highlights" },
    primary: { oklch: "oklch(0.4 0.11 152)", hex: "#176b43", use: "Solid brand green (buttons, links, chips)" },
    gradient: { css: "linear-gradient(135deg, #123f2e 0%, #10b981 100%)", use: "Signature two-tone brand gradient (logo tile, hero)" },
  },
  neutral: {
    cream: { hex: "#f5f2ea", use: "App/marketing background (light)" },
    ink: { hex: "#0c1b14", use: "Dark email/marketing surface" },
    foreground: { hex: "#1a1a17", use: "Primary text on light" },
  },
}

const COLORS_CSS = `/* VOXYFI brand colors — oklch is the source of truth; hex are approximations
   for design tools that don't support oklch. */
:root {
  --brand-green-deep: oklch(0.33 0.098 152);   /* ~#123f2e */
  --brand-green-emerald: oklch(0.72 0.16 160); /* ~#10b981 */
  --brand-primary: oklch(0.4 0.11 152);        /* ~#176b43 */
  --brand-cream: #f5f2ea;
  --brand-ink: #0c1b14;
  --brand-gradient: linear-gradient(135deg, #123f2e 0%, #10b981 100%);
}
`

const TYPOGRAPHY_TXT = `VOXYFI TYPOGRAPHY
=================

Primary typeface: Geist (sans-serif)
  - Headings: Geist, weights 600-700, tight tracking on large sizes.
  - Body: Geist, weight 400-500, line-height 1.5.
  - Wordmark "VOXYFI": Geist Bold, letter-spacing ~ +4 at large sizes.

Monospace: Geist Mono (for code, metadata, and technical labels).

The Geist-Regular.ttf used across our generated marketing assets is included
in this kit under /typography. Geist is open source (SIL Open Font License)
and available from Vercel: https://vercel.com/font

Fallback stack:
  font-family: "Geist", ui-sans-serif, system-ui, -apple-system, sans-serif;
`

function readme() {
  return `VOXYFI BRAND KIT
================

Everything you need to represent VOXYFI correctly.

CONTENTS
  /logos          Vector masters (SVG): gradient icon, mono mark, horizontal lockup.
  /icons          App icons & favicons (iOS, Android, watchOS, PWA, .ico).
  /colors         colors.json + colors.css (oklch source of truth + hex).
  /typography     Type guidelines + Geist-Regular.ttf.
  /social         Open Graph, promo & store graphics, plus high-res profile
                  avatar (2048px), transparent marks, and a 2400px share banner.
  /screenshots    App Store / Play Store marketing screenshots (English set).

LOGO USAGE
  - The mark is the "Voice Chevron": two nested chevrons forming a V.
  - Keep clear space around the mark equal to the chevron's stroke width.
  - Do not recolor, rotate, stretch, add shadows, or place the mark on a
    low-contrast background.
  - Use the mono mark (voxyfi-mark-mono.svg) for single-color contexts.
  - The signature gradient runs deep green -> emerald at 135deg.

COLOR
  - Primary gradient: #123f2e -> #10b981. Solid brand green: #176b43.
  - oklch values in colors.css are authoritative; hex are approximations.

More: https://www.voxyfi.com/brand   |   Press: https://www.voxyfi.com/press

(c) VOXYFI. All assets are for representing VOXYFI. Geist is licensed under the
SIL Open Font License.
`
}

async function main() {
  const zip = new JSZip()

  console.log("Adding logos…")
  await addFile(zip, "brand/voxyfi-icon.svg", "logos/voxyfi-icon.svg")
  await addFile(zip, "brand/voxyfi-mark-mono.svg", "logos/voxyfi-mark-mono.svg")
  await addFile(zip, "brand/voxyfi-lockup.svg", "logos/voxyfi-lockup.svg")

  console.log("Adding icons…")
  await addFile(zip, "icon-1024.png", "icons/app-icon-1024.png")
  await addFile(zip, "icon-512.png", "icons/icon-512.png")
  await addFile(zip, "icon-192.png", "icons/icon-192.png")
  await addFile(zip, "icon-maskable-512.png", "icons/icon-maskable-512.png")
  await addFile(zip, "icon.svg", "icons/icon.svg")
  await addFile(zip, "favicon.ico", "icons/favicon.ico")
  await addFile(zip, "brand/favicon/favicon-16.png", "icons/favicon-16.png")
  await addFile(zip, "brand/favicon/favicon-32.png", "icons/favicon-32.png")
  await addFile(zip, "brand/favicon/favicon-48.png", "icons/favicon-48.png")
  await addFile(zip, "brand/favicon/apple-touch-180.png", "icons/apple-touch-180.png")
  await addFile(zip, "brand/watch/watch-icon-1024.png", "icons/watch-icon-1024.png")
  await addFile(zip, "brand/android/ic_launcher_512.png", "icons/android-launcher-512.png")
  await addFile(zip, "brand/android/play-store-512.png", "icons/play-store-512.png")

  console.log("Adding colors…")
  addText(zip, "colors/colors.json", JSON.stringify(COLORS_JSON, null, 2))
  addText(zip, "colors/colors.css", COLORS_CSS)

  console.log("Adding typography…")
  addText(zip, "typography/typography.txt", TYPOGRAPHY_TXT)
  await addFile(zip, "brand/fonts/Geist-Regular.ttf", "typography/Geist-Regular.ttf")

  console.log("Adding social…")
  await addFile(zip, "brand/social/social-card-1200x630.png", "social/social-card-1200x630.png")
  await addFile(zip, "brand/social/promo-light-1200x630.png", "social/promo-light-1200x630.png")
  await addFile(zip, "brand/social/play-store-feature-1024x500.png", "social/play-store-feature-1024x500.png")
  await addFile(zip, "brand/social/voxyfi-avatar-2048.png", "social/voxyfi-avatar-2048.png")
  await addFile(zip, "brand/social/voxyfi-mark-white-2048.png", "social/voxyfi-mark-white-2048.png")
  await addFile(zip, "brand/social/voxyfi-mark-green-2048.png", "social/voxyfi-mark-green-2048.png")
  await addFile(zip, "brand/social/voxyfi-social-banner-2400x1260.png", "social/voxyfi-social-banner-2400x1260.png")

  console.log("Adding screenshots…")
  await addFile(zip, "brand/screenshots/01-listen-ios-6.7.png", "screenshots/01-listen.png")
  await addFile(zip, "brand/screenshots/02-translate-ios-6.7.png", "screenshots/02-translate.png")
  await addFile(zip, "brand/screenshots/03-tools-ios-6.7.png", "screenshots/03-tools.png")

  addText(zip, "README.txt", readme())

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })
  const dest = path.join(PUB, "brand", "voxyfi-brand-kit.zip")
  await fs.writeFile(dest, out)
  const kb = (out.byteLength / 1024).toFixed(0)
  console.log(`\nWrote public/brand/voxyfi-brand-kit.zip (${kb} KB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
