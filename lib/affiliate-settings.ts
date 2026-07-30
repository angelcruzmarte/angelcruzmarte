import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { appSetting } from "@/lib/db/schema"
import {
  AMAZON_MARKETPLACES,
  AMAZON_REGION_SETTING_KEY,
  AMAZON_TAG_SETTING_KEY,
  DEFAULT_AMAZON_REGION,
  affiliateBuyUrl,
  sanitizeAmazonTag,
  type AffiliateLinkInput,
} from "@/lib/affiliate"

/**
 * Resolved affiliate configuration for the active provider (Amazon). The tag
 * and region are admin-editable via `app_setting`, each falling back to an
 * environment variable, so the store keeps working before anything is set:
 *   tag    → app_setting `amazon_associate_tag`   → env AMAZON_ASSOCIATE_TAG
 *   region → app_setting `amazon_marketplace_region` → env AMAZON_MARKETPLACE
 */
export type AffiliateSettings = {
  tag: string
  region: string
  /** Where the tag came from, for admin display. */
  tagSource: "setting" | "env" | "none"
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: appSetting.value })
      .from(appSetting)
      .where(eq(appSetting.key, key))
      .limit(1)
    return row?.value?.trim() || null
  } catch {
    return null
  }
}

function normalizeRegion(value?: string | null): string {
  const code = (value || "").trim().toUpperCase()
  return AMAZON_MARKETPLACES.some((m) => m.code === code)
    ? code
    : DEFAULT_AMAZON_REGION
}

/** Reads the effective affiliate settings (DB override → env fallback). */
export async function resolveAffiliateSettings(): Promise<AffiliateSettings> {
  const [tagSetting, regionSetting] = await Promise.all([
    readSetting(AMAZON_TAG_SETTING_KEY),
    readSetting(AMAZON_REGION_SETTING_KEY),
  ])

  // Sanitize both sources so a pasted SiteStripe URL or "tag=..." fragment
  // still resolves to a bare, valid tag (and a junk value becomes "" → clean,
  // untagged links instead of broken ones).
  const settingTag = sanitizeAmazonTag(tagSetting)
  const envTag = sanitizeAmazonTag(process.env.AMAZON_ASSOCIATE_TAG)
  const tag = settingTag || envTag || ""
  const tagSource: AffiliateSettings["tagSource"] = settingTag
    ? "setting"
    : envTag
      ? "env"
      : "none"

  const region = normalizeRegion(
    regionSetting || process.env.AMAZON_MARKETPLACE || DEFAULT_AMAZON_REGION,
  )

  return { tag, region, tagSource }
}

/** Persists the admin-editable tag (empty string clears the override). */
export async function saveAmazonTag(tag: string): Promise<void> {
  // Store the sanitized bare tag so bad paste-ins never reach a live link.
  const value = sanitizeAmazonTag(tag)
  await db
    .insert(appSetting)
    .values({ key: AMAZON_TAG_SETTING_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value, updatedAt: new Date() },
    })
}

/** Persists the admin-editable marketplace region. */
export async function saveAmazonRegion(region: string): Promise<void> {
  const value = normalizeRegion(region)
  await db
    .insert(appSetting)
    .values({ key: AMAZON_REGION_SETTING_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value, updatedAt: new Date() },
    })
}

/**
 * Convenience: build an affiliate URL for a book using the effective settings.
 * Server-side only (reads DB). Client components receive the finished URL as a
 * prop so there is a single source of truth for the tag.
 */
export async function affiliateUrlForBook(
  input: Omit<AffiliateLinkInput, "tag" | "region">,
): Promise<string> {
  const { tag, region } = await resolveAffiliateSettings()
  return affiliateBuyUrl({ ...input, tag, region })
}
