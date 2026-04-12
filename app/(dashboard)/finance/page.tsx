import FinanceDashboardCard from '@/components/modules/accounting/FinanceDashboardCard'

export default function FinancePage() {
  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">Finance</h1>
          <p className="mt-1 text-sm text-forge-text-muted">
            Review revenue, collection trends, profitability readiness, and financial visibility across FORGE and connected systems.
          </p>
        </div>

        <FinanceDashboardCard />
      </div>
    </div>
  )
}
