// One-time backfill: generate cover thumbnails for existing documents that
// don't have one yet.
//
// It targets documents where `thumbnailUrl` is null but a viewable original
// file (`originalUrl`, a PDF or image) still exists in Blob storage — the only
// docs whose source bytes can be re-fetched. Paste/type/link docs and older
// cloud imports that stored just extracted text have no raster source, so they
// keep the branded logo fallback (nothing to render).
//
// Reuses the exact same renderers as the live pipeline (pdf.js + @napi-rs/canvas
// for PDFs, sharp for images), so backfilled covers are pixel-identical to new
// ones. Idempotent and safe to re-run: rows that already have a thumbnail are
// skipped.
//
// Usage:
//   node --env-file-if-exists=/vercel/share/.env.project \
//     scripts/backfill-document-thumbnails.mjs [--limit=N] [--dry-run]

import pg from "pg"
import { put } from "@vercel/blob"

const THUMB_WIDTH = 640
const THUMB_QUALITY = 82

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith("--limit="))
  return a ? Math.max(1, Number(a.split("=")[1]) || 0) : 0
})()

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL / POSTGRES_URL in the environment.")
  process.exit(1)
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Missing BLOB_READ_WRITE_TOKEN in the environment.")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

function isPdf(name, mime) {
  return (mime || "").includes("pdf") || /\.pdf$/i.test(name || "")
}
function isImage(name, mime) {
  return (
    (mime || "").startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name || "")
  )
}

// --- Renderers (mirror lib/document-thumbnail.ts) ---------------------------

async function renderPdf(buffer) {
  const napi = await import("@napi-rs/canvas")
  if (typeof globalThis.DOMMatrix === "undefined")
    globalThis.DOMMatrix = napi.DOMMatrix
  if (typeof globalThis.Path2D === "undefined")
    globalThis.Path2D = napi.Path2D
  if (typeof globalThis.ImageData === "undefined")
    globalThis.ImageData = napi.ImageData

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const data = new Uint8Array(buffer)
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise
  const page = await doc.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width })
  const canvas = napi.createCanvas(
    Math.floor(viewport.width),
    Math.floor(viewport.height),
  )
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  const jpeg = canvas.toBuffer("image/jpeg", THUMB_QUALITY)
  await doc.cleanup().catch(() => {})
  return jpeg
}

async function renderImage(buffer) {
  const sharp = (await import("sharp")).default
  return sharp(buffer)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer()
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log(
    `[backfill] starting${DRY_RUN ? " (dry run)" : ""}${LIMIT ? ` limit=${LIMIT}` : ""}`,
  )

  const { rows } = await pool.query(
    `SELECT id, "userId", title, "originalUrl", "originalMime"
     FROM document
     WHERE "thumbnailUrl" IS NULL
       AND "deletedAt" IS NULL
       AND "originalUrl" IS NOT NULL
     ORDER BY id DESC
     ${LIMIT ? "LIMIT $1" : ""}`,
    LIMIT ? [LIMIT] : [],
  )

  console.log(`[backfill] ${rows.length} candidate document(s) with original files`)

  let done = 0
  let skipped = 0
  let failed = 0

  for (const doc of rows) {
    const name = doc.originalUrl?.split("/").pop() || ""
    const mime = doc.originalMime || ""
    const kind = isPdf(name, mime) ? "pdf" : isImage(name, mime) ? "image" : null
    if (!kind) {
      skipped++
      continue
    }

    try {
      const res = await fetch(doc.originalUrl)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())

      const jpeg = kind === "pdf" ? await renderPdf(buffer) : await renderImage(buffer)
      if (!jpeg || jpeg.byteLength === 0) throw new Error("empty render")

      if (DRY_RUN) {
        console.log(`[backfill] would set thumbnail for #${doc.id} "${doc.title}" (${kind}, ${jpeg.byteLength}B)`)
        done++
        continue
      }

      const blob = await put(
        `documents/${doc.userId}/thumbnails/${doc.id}-${Date.now()}.jpg`,
        jpeg,
        { access: "public", addRandomSuffix: true, contentType: "image/jpeg" },
      )
      // Re-check thumbnailUrl in the WHERE clause so a concurrent live render
      // never gets clobbered (stays idempotent even if the app set it meanwhile).
      await pool.query(
        `UPDATE document
         SET "thumbnailUrl" = $1, "updatedAt" = NOW()
         WHERE id = $2 AND "thumbnailUrl" IS NULL`,
        [blob.url, doc.id],
      )
      console.log(`[backfill] #${doc.id} "${doc.title}" -> ${blob.url}`)
      done++
    } catch (err) {
      failed++
      console.log(
        `[backfill] #${doc.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  console.log(
    `[backfill] complete — generated=${done} skipped=${skipped} failed=${failed}`,
  )
  await pool.end().catch(() => {})
  process.exit(0)
}

main().catch(async (err) => {
  console.error("[backfill] fatal:", err)
  await pool.end().catch(() => {})
  process.exit(1)
})
