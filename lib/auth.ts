import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"
import { sendEmail, verificationEmail, resetPasswordEmail } from "@/lib/email"

export const auth = betterAuth({
  database: pool,
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // The very first registered user becomes the admin/owner so the
          // app has a way to bootstrap the admin dashboard.
          const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM "user"')
          const isFirstUser = rows[0]?.count === 0
          return { data: { ...user, role: isFirstUser ? "admin" : "user" } }
        },
      },
    },
  },
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const email = resetPasswordEmail(url)
      await sendEmail({ to: user.email, ...email })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const email = verificationEmail(url)
      await sendEmail({ to: user.email, ...email })
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, input: false },
      stripeCustomerId: { type: "string", required: false, input: false },
      stripeSubscriptionId: { type: "string", required: false, input: false },
      subscriptionStatus: { type: "string", required: false, input: false },
      plan: { type: "string", required: false, input: false },
      currentPeriodEnd: { type: "date", required: false, input: false },
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
