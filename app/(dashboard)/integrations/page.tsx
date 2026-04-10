import IntegrationsHubCard from '@/components/modules/settings/IntegrationsHubCard'

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">Integrations</h1>
          <p className="mt-1 text-sm text-forge-text-muted">
            Manage payment, CRM, scheduling, email, and automation connection points for the platform.
          </p>
        </div>

        <IntegrationsHubCard />
      </div>
    </div>
  )
}
