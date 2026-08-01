import "server-only"

import { db } from "@/lib/db"
import { bookAuditLog } from "@/lib/db/schema"

/** Snapshot of who performed an action (stored inline so it survives changes). */
export type AuditActor = { id: string; name: string; email: string }

/** Semantic action categories shown in the audit log filter. */
export type AuditAction =
  | "create"
  | "delete"
  | "publish"
  | "unpublish"
  | "availability"
  | "price"
  | "metadata"
  | "cover"
  | "isbn_import"
  | "link_check"
  | "retention_prune"
  | "import"
  | "settings"

export type AuditEntry = {
  bookId: number | null
  bookTitle: string
  action: AuditAction
  field?: string | null
  oldValue?: string | null
  newValue?: string | null
}

const MAX_VALUE = 500

function snapshot(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = typeof v === "string" ? v : String(v)
  const trimmed = s.trim()
  if (!trimmed) return null
  return trimmed.length > MAX_VALUE ? `${trimmed.slice(0, MAX_VALUE)}…` : trimmed
}

/**
 * Appends audit entries. Best-effort: a logging failure is swallowed (and
 * logged to the server console) so it can never break the primary admin action.
 */
export async function logBookAudit(actor: AuditActor, entries: AuditEntry[]) {
  if (entries.length === 0) return
  try {
    await db.insert(bookAuditLog).values(
      entries.map((e) => ({
        bookId: e.bookId ?? null,
        bookTitle: (e.bookTitle || "").slice(0, 300),
        action: e.action,
        field: e.field ?? null,
        oldValue: snapshot(e.oldValue),
        newValue: snapshot(e.newValue),
        actorId: actor.id,
        actorName: actor.name || "",
        actorEmail: actor.email || "",
      })),
    )
  } catch (err) {
    console.log("[v0] book audit log write failed:", (err as Error).message)
  }
}

// Fields that, when changed, are their own action category. Everything else
// changed on a book is grouped under the "metadata" action.
const SPECIAL_FIELDS: Record<string, AuditAction> = {
  coverImageUrl: "cover",
  priceInCents: "price",
  availability: "availability",
}

// Human-friendly labels for the fields we diff.
export const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  author: "Author",
  category: "Category",
  description: "Description",
  excerpt: "Excerpt",
  sampleText: "Sample text",
  isbn: "ISBN",
  buyUrl: "Buy URL",
  coverImageUrl: "Cover image",
  coverColor: "Cover color",
  accentColor: "Accent color",
  priceInCents: "Price",
  availability: "Availability",
  featured: "Featured",
  published: "Published",
}

type Diffable = Record<string, unknown>

/**
 * Produces one audit entry per changed field between `before` and `after`,
 * choosing the right action category. `published` toggles map to
 * publish/unpublish; cover/price/availability get their own categories; all
 * other tracked fields fall under "metadata".
 */
export function diffBookChanges(
  bookId: number,
  bookTitle: string,
  before: Diffable,
  after: Diffable,
): AuditEntry[] {
  const entries: AuditEntry[] = []
  for (const key of Object.keys(FIELD_LABELS)) {
    if (!(key in after)) continue
    const oldV = before[key]
    const newV = after[key]
    if (normalize(oldV) === normalize(newV)) continue

    if (key === "published") {
      entries.push({
        bookId,
        bookTitle,
        action: newV ? "publish" : "unpublish",
        field: "published",
        oldValue: oldV ? "Published" : "Hidden",
        newValue: newV ? "Published" : "Hidden",
      })
      continue
    }

    entries.push({
      bookId,
      bookTitle,
      action: SPECIAL_FIELDS[key] ?? "metadata",
      field: key,
      oldValue: formatValue(key, oldV),
      newValue: formatValue(key, newV),
    })
  }
  return entries
}

function normalize(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "boolean") return v ? "1" : "0"
  return String(v).trim()
}

/** Formats a raw column value for display (e.g. cents -> dollars). */
function formatValue(key: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  if (key === "priceInCents" && typeof v === "number") {
    return `$${(v / 100).toFixed(2)}`
  }
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}
