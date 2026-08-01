import { getAffiliateConfig, getRetentionStats } from "@/app/actions/admin"
import { AdminAuditRetention } from "@/components/admin-audit-retention"
import { AdminAffiliateSettings } from "@/components/admin-affiliate-settings"

export const dynamic = "force-dynamic"

export default async function AdminSettingsPage() {
  const [retention, affiliate] = await Promise.all([
    getRetentionStats(),
    getAffiliateConfig(),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        Admin-configurable policies for the VOXYFI store. Changes take effect
        immediately and, where relevant, are recorded in the audit log.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Affiliate
        </h2>
        <div className="mt-3">
          <AdminAffiliateSettings config={affiliate} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Audit log
        </h2>
        <div className="mt-3">
          <AdminAuditRetention stats={retention} />
        </div>
      </section>
    </div>
  )
}
