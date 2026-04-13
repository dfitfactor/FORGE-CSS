import { LeadsDashboard } from '@/components/modules/leads/LeadsDashboard'

export default function LeadsPage() {
  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">Leads</h1>
          <p className="mt-1 text-sm text-forge-text-muted">
            Track Ai-SHA lead flow, manage stage progression, and convert won prospects into active FORGE CSS clients.
          </p>
        </div>

        <LeadsDashboard />
      </div>
    </div>
  )
}
