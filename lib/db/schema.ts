import {
  boolean,
  integer,
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
  // Whether this account has already used its one-time free trial.
  hasUsedTrial: boolean("hasUsedTrial").notNull().default(false),
  // Whether the user has completed the first-run onboarding flow.
  onboardingComplete: boolean("onboardingComplete").notNull().default(false),
  // Shareable referral code (generated on demand).
  referralCode: text("referralCode"),
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
  // Detected BCP-47 language code of the document content (e.g. "en", "fr").
  sourceLang: text("sourceLang"),
  wordCount: integer("wordCount").notNull().default(0),
  lastWord: integer("lastWord").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

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
  description: text("description").notNull(),
  excerpt: text("excerpt").notNull(),
  // Full book text used for text-to-speech once purchased.
  content: text("content").notNull().default(""),
  // One-time purchase price in cents.
  priceInCents: integer("priceInCents").notNull().default(499),
  // Real cover image URL (e.g. Project Gutenberg). Falls back to the color
  // design when null.
  coverImageUrl: text("coverImageUrl"),
  // Source catalog id (Project Gutenberg ebook id) for reference/dedupe.
  gutenbergId: integer("gutenbergId"),
  coverColor: text("coverColor").notNull().default("#3b3f8f"),
  accentColor: text("accentColor").notNull().default("#f4b740"),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
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

export type ListeningStat = typeof listeningStat.$inferSelect

export type ReadingItem = typeof readingItem.$inferSelect
export type User = typeof user.$inferSelect
export type Document = typeof document.$inferSelect
export type Book = typeof book.$inferSelect
export type BookPurchase = typeof bookPurchase.$inferSelect
