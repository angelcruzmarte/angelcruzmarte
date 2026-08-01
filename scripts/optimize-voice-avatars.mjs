// One-off: downscale + compress the voice avatar portraits.
// The originals are 1024x1024 PNGs (~1.5MB each); displayed at <=44px.
// Resize to 224x224 and recompress so the voice picker loads instantly.
import { readdir, stat, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"

const dir = "public/voices"
const files = (await readdir(dir)).filter((f) => f.endsWith(".png"))

let before = 0
let after = 0
for (const file of files) {
  const path = join(dir, file)
  const orig = await readFile(path)
  before += orig.length
  const out = await sharp(orig)
    .resize(224, 224, { fit: "cover", position: "attention" })
    .png({ quality: 82, compressionLevel: 9, effort: 8 })
    .toBuffer()
  // Only overwrite if we actually saved space.
  if (out.length < orig.length) {
    await writeFile(path, out)
    after += out.length
  } else {
    after += orig.length
  }
}

const mb = (n) => (n / 1024 / 1024).toFixed(1)
console.log(
  `Optimized ${files.length} avatars: ${mb(before)}MB -> ${mb(after)}MB`,
)
