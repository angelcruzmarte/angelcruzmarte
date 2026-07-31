import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

// ----- Better Auth tables (camelCase columns must match Better Auth defaults) -----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  // Unique, user-chosen @handle (lowercase). Distinct from the display name.
  username: text("username").unique(),
  role: text("role").notNull().default("user"),
  // Stripe subscription fields
  stripeCustomerId: text("stripeCustomerId"),
  stripeSubscriptionId: text("stripeSubscriptionId"),
  subscriptionStatus: text("subscriptionStatus"),
  plan: text("plan"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  // True when the user has scheduled a cancellation: the subscription (or its
  // trial) will end at `currentPeriodEnd` and will NOT be charged/renewed.
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  // Whether this account has already used its one-time free trial.
  hasUsedTrial: boolean("hasUsedTrial").notNull().default(false),
  // Whether the user has completed the first-run onboarding flow.
  onboardingComplete: boolean("onboardingComplete").notNull().default(false),
  // Shareable referral code (generated on demand).
  referralCode: text("referralCode"),
  // ----- Listening preferences (Speechify-style settings) -----
  // Start playing a file as soon as it opens.
  prefAutoPlay: boolean("prefAutoPlay").notNull().default(false),
  // Auto-hide the docked player after a few seconds of inactivity.
  prefAutoHide: boolean("prefAutoHide").notNull().default(false),
  // Don't pause audio from other apps (native wrapper honors this).
  prefMixAudio: boolean("prefMixAudio").notNull().default(false),
  // Skip headers, footers, citations, and page numbers during narration.
  prefAutoSkip: boolean("prefAutoSkip").notNull().default(false),
  // Daily listening goal in minutes.
  dailyGoalMinutes: integer("dailyGoalMinutes").notNull().default(30),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// ----- App tables -----

export const readingItem = pgTable("reading_item", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author"),
  category: text("category").notNull().default("General"),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  published: boolean("published").notNull().default(true),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// User-owned text-to-speech documents (paste / type / file / link)
export const document = pgTable("document", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceType: text("sourceType").notNull().default("text"),
  sourceUrl: text("sourceUrl"),
  // Blob URL of the original uploaded file (PDF/image), preserved so the
  // reader can render the real pages. Null for paste/type/link sources.
  originalUrl: text("originalUrl"),
  // MIME type of the original file (e.g. application/pdf, image/png).
  originalMime: text("originalMime"),
  // Persisted first-page thumbnail (small JPEG in Blob storage), generated once
  // from the original PDF/image. Preferred everywhere a preview is shown, and
  // used as OS now-playing artwork (iPhone Lock Screen, Live Activities, Apple
  // Watch, notifications) — a real https URL those surfaces will render, unlike
  // a client-generated data: URL. Null until generated / for non-visual sources.
  thumbnailUrl: text("thumbnailUrl"),
  // Detected BCP-47 language code of the document content (e.g. "en", "fr").
  sourceLang: text("sourceLang"),
  wordCount: integer("wordCount").notNull().default(0),
  lastWord: integer("lastWord").notNull().default(0),
  // ----- Cloud delta-sync (Google Drive / OneDrive / Dropbox) -----
  // When a document originated from a cloud provider, we record enough to
  // detect upstream changes and re-import in place. `cloudProvider` is the
  // provider id ("google-drive" | "onedrive" | "dropbox"); `cloudFileId` is
  // that provider's stable file id; `cloudRevision` is the change token we
  // compare against (Drive modifiedTime, OneDrive eTag, Dropbox rev). All null
  // for non-cloud sources (paste/type/link/direct upload).
  cloudProvider: text("cloudProvider"),
  cloudFileId: text("cloudFileId"),
  cloudRevision: text("cloudRevision"),
  // Last time we checked/synced this document against its cloud source.
  lastSyncedAt: timestamp("lastSyncedAt"),
  // Soft-delete timestamp. Non-null means the document is in the trash and is
  // hidden from the library but restorable from the "Deleted Files" screen.
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Durable, content-addressed cache of translated narration sections. Keyed by
// (documentId, lang, sourceHash) so a page that has already been translated is
// loaded instantly on reopen instead of re-calling the translation API. Because
// the key is the hash of the SOURCE text (not a section index), it stays valid
// even when section boundaries shift (e.g. toggling "skip boilerplate").
export const documentTranslation = pgTable(
  "document_translation",
  {
    id: serial("id").primaryKey(),
    documentId: integer("documentId").notNull(),
    userId: text("userId").notNull(),
    // Target language code translated INTO (e.g. "en", "fr").
    lang: text("lang").notNull(),
    // Hash of the trimmed source passage (see lib/hash.ts sectionHash).
    sourceHash: text("sourceHash").notNull(),
    // The translated passage.
    text: text("text").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqTranslation: unique().on(t.documentId, t.lang, t.sourceHash),
  }),
)

// Per-user Discover interest selections
export const userInterest = pgTable(
  "user_interest",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    interest: text("interest").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqUserInterest: unique().on(t.userId, t.interest),
  }),
)

// Books store catalog
export const book = pgTable("book", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  category: text("category").notNull().default("General"),
  // Primary language of the title, as a two-letter code (e.g. "en", "es",
  // "fr"). OpenAI TTS detects the language automatically, so any language can
  // be narrated in-app. Defaults to English for existing/legacy rows.
  language: text("language").notNull().default("en"),
  description: text("description").notNull(),
  excerpt: text("excerpt").notNull(),
  // Full book text used for text-to-speech once purchased. Only populated for
  // in-app (public-domain / licensed / owned) titles. Affiliate titles never
  // store full copyrighted text — see `fulfillment` below.
  content: text("content").notNull().default(""),
  // One-time purchase price in cents. Ignored for affiliate titles (the price
  // lives on the partner store).
  priceInCents: integer("priceInCents").notNull().default(499),
  // How this title is fulfilled:
  //  - "in_app"   → sold via our Stripe checkout; full text streamed in-app
  //                 (public-domain / licensed / owned inventory).
  //  - "affiliate"→ commercial title; users listen to a FREE sample in-app and
  //                 buy the full book on the affiliate store (Amazon). We
  //                 never serve the full copyrighted text.
  fulfillment: text("fulfillment").notNull().default("in_app"),
  // 13-digit ISBN, used to build a deep affiliate link to the exact edition.
  isbn: text("isbn"),
  // Free, in-app listenable sample/excerpt for affiliate titles (publisher- or
  // admin-provided). Distinct from `excerpt`, which is a short marketing blurb.
  sampleText: text("sampleText"),
  // Optional explicit buy URL. When null, an affiliate link is derived from
  // isbn/title at render time.
  buyUrl: text("buyUrl"),
  // Optional exact Amazon ASINs per format. A Kindle/Audible edition has its
  // own ASIN that CANNOT be derived from an ISBN, so admins may paste them to
  // deep-link the precise digital product. When null, the buy engine falls back
  // to a Kindle-Store-scoped search (digital reading is prioritized). `isbn`
  // still resolves the print (paperback/hardcover) product page.
  kindleAsin: text("kindleAsin"),
  audibleAsin: text("audibleAsin"),
  printAsin: text("printAsin"),
  // Real cover image URL (e.g. Project Gutenberg). Falls back to the color
  // design when null.
  coverImageUrl: text("coverImageUrl"),
  // Source catalog id (Project Gutenberg ebook id) for reference/dedupe.
  gutenbergId: integer("gutenbergId"),
  coverColor: text("coverColor").notNull().default("#3b3f8f"),
  accentColor: text("accentColor").notNull().default("#f4b740"),
  featured: boolean("featured").notNull().default(false),
  // Storefront visibility. Unpublished titles stay in the catalog/admin but are
  // hidden from the public store listing. Defaults true so existing books stay
  // visible.
  published: boolean("published").notNull().default(true),
  // Merchandising status, independent of `published`. One of the values in
  // lib/book-availability.ts (available, out_of_stock, affiliate_only,
  // coming_soon, preorder, unavailable, needs_review, hidden).
  availability: text("availability").notNull().default("available"),
  // Health of the affiliate buy link, set by the broken-link checker:
  // unknown | ok | broken | needs_review.
  linkStatus: text("linkStatus").notNull().default("unknown"),
  // When the buy link was last checked.
  linkCheckedAt: timestamp("linkCheckedAt"),
  // Original publication year (negative for BCE). Used in the quality score and
  // shown in admin; nullable when unknown.
  publicationYear: integer("publicationYear"),
  // Metadata quality score 0-100 from lib/book-quality.ts scoreBook().
  qualityScore: integer("qualityScore"),
  // Full quality report (JSON: score, verdict, flags, per-field checks) so the
  // admin review queue can explain exactly why a book was accepted or held.
  qualityReport: jsonb("qualityReport"),
  // When the quality score was last computed.
  qualityCheckedAt: timestamp("qualityCheckedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  // Last edit/refresh time, for "last updated" sorting in admin.
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// One-time book purchases. A row means the user owns the book forever.
export const bookPurchase = pgTable(
  "book_purchase",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    bookId: integer("bookId")
      .notNull()
      .references(() => book.id, { onDelete: "cascade" }),
    // Resume position (word index) for the purchased book.
    lastWord: integer("lastWord").notNull().default(0),
    stripeSessionId: text("stripeSessionId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqUserBook: unique().on(t.userId, t.bookId),
  }),
)

// Per-user favorited (wishlisted) books.
export const bookFavorite = pgTable(
  "book_favorite",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    bookId: integer("bookId")
      .notNull()
      .references(() => book.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqUserBookFav: unique().on(t.userId, t.bookId),
  }),
)

// Append-only audit trail of admin actions on the book catalog. `bookId` is
// intentionally NOT a FK (and `bookTitle` is snapshotted) so entries survive a
// book deletion. Values are stored as short text snapshots, not typed columns.
export const bookAuditLog = pgTable("book_audit_log", {
  id: serial("id").primaryKey(),
  bookId: integer("bookId"),
  bookTitle: text("bookTitle").notNull().default(""),
  // Semantic category: create | delete | publish | unpublish | availability |
  // price | metadata | cover | isbn_import | link_check.
  action: text("action").notNull(),
  // Specific column for field-level edits (e.g. "title", "description").
  field: text("field"),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  // Who performed it (snapshotted so it survives user changes).
  actorId: text("actorId"),
  actorName: text("actorName").notNull().default(""),
  actorEmail: text("actorEmail").notNull().default(""),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Generic key/value store for admin-configurable app settings (e.g. the audit
// log retention policy). Values are JSON-encoded strings.
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Per-user daily aggregate of listening time (seconds) and words listened.
export const listeningStat = pgTable(
  "listening_stat",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    // Calendar day (local) the listening happened, stored as YYYY-MM-DD.
    day: text("day").notNull(),
    seconds: integer("seconds").notNull().default(0),
    words: integer("words").notNull().default(0),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqUserDay: unique().on(t.userId, t.day),
  }),
)

// Per-user free-tier AI quota, modeled as a refilling token bucket rather than
// a per-calendar-day counter. `tokens` is the number of AI generations banked
// right now; `updatedAt` is the anchor from which refill periods are measured.
// Subscribers/admins are unlimited and never get a row.
export const aiQuota = pgTable("ai_quota", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  tokens: integer("tokens").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Admin-created promotional discounts (e.g. 50% off during signup).
export const promotion = pgTable("promotion", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // Percentage off, 1-100.
  percentOff: integer("percentOff").notNull(),
  // Stripe coupon duration: "once" | "repeating" | "forever".
  durationType: text("durationType").notNull().default("once"),
  // Number of months for "repeating" duration.
  durationMonths: integer("durationMonths"),
  // Which plans it applies to: "all" | "monthly" | "annual".
  planScope: text("planScope").notNull().default("all"),
  active: boolean("active").notNull().default(true),
  // Whether to surface the promo banner during signup / on pricing.
  showBanner: boolean("showBanner").notNull().default(true),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  // Cached Stripe coupon id, created lazily when first applied.
  stripeCouponId: text("stripeCouponId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Bookstore commerce analytics. An append-only event stream that powers the
// admin affiliate/revenue dashboard. `bookId` is intentionally NOT a FK (and
// `bookTitle`/`author` are snapshotted) so events survive a book deletion.
//   - type "affiliate_click" → user clicked out to a retail affiliate
//     (provider = "amazon"); `amountCents` is 0 (Amazon reports revenue on its
//     own dashboard, not back to us).
//   - type "native_purchase" → completed VOXYFI Stripe purchase
//     (provider = "voxyfi"); `amountCents` is the price paid.
export const bookEvent = pgTable("book_event", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  bookId: integer("bookId"),
  bookTitle: text("bookTitle").notNull().default(""),
  author: text("author").notNull().default(""),
  // Fulfillment provider: "amazon" (affiliate) | "voxyfi" (native).
  provider: text("provider").notNull().default(""),
  // Revenue in cents (native purchases only; 0 for affiliate clicks).
  amountCents: integer("amountCents").notNull().default(0),
  // Who triggered it, when known. Snapshotted; nullable for anonymous clicks.
  userId: text("userId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Anonymous pricing-page views, used to measure the signup funnel.
export const pricingView = pgTable("pricing_view", {
  id: serial("id").primaryKey(),
  // Anonymous visitor id from a first-party cookie.
  visitorId: text("visitorId").notNull(),
  // Set once the visitor becomes a registered user.
  userId: text("userId"),
  path: text("path").notNull().default("pricing"),
  referrer: text("referrer"),
  // True once the visitor completed registration.
  converted: boolean("converted").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export type Promotion = typeof promotion.$inferSelect
export type PricingView = typeof pricingView.$inferSelect
export type BookEvent = typeof bookEvent.$inferSelect

export type ListeningStat = typeof listeningStat.$inferSelect
export type AiQuota = typeof aiQuota.$inferSelect

export type ReadingItem = typeof readingItem.$inferSelect
export type User = typeof user.$inferSelect
export type Document = typeof document.$inferSelect
export type Book = typeof book.$inferSelect
// Lightweight book shape for listings/storefront: excludes the heavy full-text
// `content`/`sampleText` columns (only needed on reader/detail pages) and the
// admin-only merchandising fields (availability/link health/updatedAt).
export type BookCard = Omit<
  Book,
  | "content"
  | "sampleText"
  | "kindleAsin"
  | "audibleAsin"
  | "printAsin"
  | "availability"
  | "linkStatus"
  | "linkCheckedAt"
  | "updatedAt"
  | "publicationYear"
  | "qualityScore"
  | "qualityReport"
  | "qualityCheckedAt"
>
export type BookPurchase = typeof bookPurchase.$inferSelect
export type BookFavorite = typeof bookFavorite.$inferSelect
export type BookAuditLog = typeof bookAuditLog.$inferSelect
export type AppSetting = typeof appSetting.$inferSelect
