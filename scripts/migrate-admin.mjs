import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

await pool.query(`CREATE TABLE IF NOT EXISTS promotion (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  "percentOff" integer NOT NULL,
  "durationType" text NOT NULL DEFAULT 'once',
  "durationMonths" integer,
  "planScope" text NOT NULL DEFAULT 'all',
  active boolean NOT NULL DEFAULT true,
  "showBanner" boolean NOT NULL DEFAULT true,
  "startsAt" timestamp,
  "endsAt" timestamp,
  "stripeCouponId" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`)

await pool.query(`CREATE TABLE IF NOT EXISTS pricing_view (
  id serial PRIMARY KEY,
  "visitorId" text NOT NULL,
  "userId" text,
  path text NOT NULL DEFAULT 'pricing',
  referrer text,
  converted boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`)

await pool.query(
  `CREATE INDEX IF NOT EXISTS pricing_view_visitor_idx ON pricing_view ("visitorId")`,
)

console.log("Admin tables ready")
await pool.end()
