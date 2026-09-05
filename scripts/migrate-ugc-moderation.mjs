// Creates the UGC-safety tables (content_report, user_block, moderation_log)
// and adds moderation columns to existing tables (user.status/statusReason,
// book_rating.hidden/hiddenReason). Idempotent. Raw pg, same pattern as the
// other migrate-*.mjs scripts. One statement per query() call.
import pg from "pg"

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error("[migrate] No DATABASE_URL / POSTGRES_URL in env")
  process.exit(1)
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

const STATEMENTS = [
  // --- user moderation status ---
  `alter table "user" add column if not exists status text not null default 'active'`,
  `alter table "user" add column if not exists "statusReason" text`,

  // --- book_rating moderation hide ---
  `alter table book_rating add column if not exists hidden boolean not null default false`,
  `alter table book_rating add column if not exists "hiddenReason" text`,

  // --- content_report ---
  `create table if not exists content_report (
    id serial primary key,
    "reporterId" text not null,
    "reportedUserId" text not null,
    "contentType" text not null,
    "contentId" text not null,
    reason text not null,
    details text,
    status text not null default 'pending',
    "createdAt" timestamp not null default now(),
    "updatedAt" timestamp not null default now()
  )`,
  `create unique index if not exists content_report_reporter_content_uniq
    on content_report ("reporterId", "contentType", "contentId")`,
  `create index if not exists content_report_status_idx on content_report (status)`,
  `create index if not exists content_report_created_idx on content_report ("createdAt" desc)`,
  `create index if not exists content_report_reported_user_idx on content_report ("reportedUserId")`,

  // --- user_block ---
  `create table if not exists user_block (
    id serial primary key,
    "blockerId" text not null,
    "blockedId" text not null,
    "createdAt" timestamp not null default now()
  )`,
  `create unique index if not exists user_block_pair_uniq on user_block ("blockerId", "blockedId")`,
  `create index if not exists user_block_blocker_idx on user_block ("blockerId")`,

  // --- moderation_log ---
  `create table if not exists moderation_log (
    id serial primary key,
    "actorId" text,
    "actorName" text not null default '',
    "actorEmail" text not null default '',
    action text not null,
    "targetType" text,
    "targetId" text,
    "targetUserId" text,
    note text,
    "createdAt" timestamp not null default now()
  )`,
  `create index if not exists moderation_log_created_idx on moderation_log ("createdAt" desc)`,
  `create index if not exists moderation_log_target_user_idx on moderation_log ("targetUserId")`,
]

try {
  await client.connect()
  for (const sql of STATEMENTS) {
    await client.query(sql)
  }
  const { rows } = await client.query(
    `select
      (select count(*)::int from content_report) as reports,
      (select count(*)::int from user_block) as blocks,
      (select count(*)::int from moderation_log) as logs`,
  )
  console.log(
    `[migrate] ugc-moderation ready (reports=${rows[0].reports}, blocks=${rows[0].blocks}, logs=${rows[0].logs})`,
  )
} catch (err) {
  console.error("[migrate] failed:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
