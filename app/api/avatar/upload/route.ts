import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { eq } from "drizzle-orm"

export const maxDuration = 30

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export async function POST(req: Request) {
  const current = await getCurrentUser()
  if (!current) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 })
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Please upload a JPG, PNG, WebP, or GIF image." },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large. Please use one under 5MB." },
      { status: 400 },
    )
  }

  try {
    const ext = file.name.split(".").pop() || "jpg"
    const blob = await put(`avatars/${current.id}-${Date.now()}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
    })

    // Public blob URLs are directly usable in <img src> everywhere.
    const imageUrl = blob.url
    await db
      .update(userTable)
      .set({ image: imageUrl, updatedAt: new Date() })
      .where(eq(userTable.id, current.id))

    return NextResponse.json({ url: imageUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed."
    console.log("[v0] avatar upload error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
