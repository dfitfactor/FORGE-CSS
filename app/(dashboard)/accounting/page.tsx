import AccountingHubCard from '@/components/modules/accounting/AccountingHubCard'

export default function AccountingPage() {
  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">Accounting</h1>
          <p className="mt-1 text-sm text-forge-text-muted">
            Manage accounting integrations, OAuth credentials, organization mapping, and ledger connection health from one dedicated workspace.
          </p>
        </div>

        <AccountingHubCard />
      </div>
    </div>
  )
}
