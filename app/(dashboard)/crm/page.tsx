import CrmHubCard from '@/components/modules/crm/CrmHubCard'

export default function CrmPage() {
  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">CRM</h1>
          <p className="mt-1 text-sm text-forge-text-muted">
            Manage the prospect-to-client handoff between AI-SHA CRM and FORGE CSS.
          </p>
        </div>

        <CrmHubCard />
      </div>
    </div>
  )
}
