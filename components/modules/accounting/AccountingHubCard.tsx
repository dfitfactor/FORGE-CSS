'use client'

import { ArrowUpRight, Calculator, CreditCard, FileSpreadsheet, Landmark, Receipt } from 'lucide-react'

type AccountingStatus = 'planned' | 'connected'

type AccountingProvider = {
  name: string
  status: AccountingStatus
  description: string
  capabilities: string[]
  notes: string
}

const PROVIDERS: AccountingProvider[] = [
  {
    name: 'Zoho Books',
    status: 'planned',
    description: 'Primary accounting placeholder for invoices, bookkeeping sync, payment reconciliation, and reporting.',
    capabilities: ['Invoice sync', 'Payment reconciliation', 'Ledger mapping', 'Financial reporting'],
    notes: 'Best fit for a future accounting system of record once package sales, Stripe payments, Venmo, PayPal, and manual invoices need one clean destination.',
  },
]

function statusClasses(status: AccountingStatus) {
  if (status === 'connected') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  return 'border-forge-gold/30 bg-forge-gold/10 text-forge-gold'
}

function statusLabel(status: AccountingStatus) {
  return status === 'connected' ? 'Connected' : 'Placeholder'
}

export default function AccountingHubCard() {
  return (
    <section className="space-y-5 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Accounting</p>
          <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">Accounting Hub</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Centralize invoicing, bookkeeping, reconciliation, payouts, and reporting here. This page is ready for provider-specific accounting logic when you are.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
            <Receipt className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Invoices</h3>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Future home for invoice creation, package billing visibility, and manual invoice posting.
          </p>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
            <CreditCard className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Reconciliation</h3>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Compare Stripe, Venmo, PayPal, and manual payments against the accounting ledger in one view.
          </p>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Reporting</h3>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Reserve space for revenue summaries, outstanding balances, and export-ready finance views.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3 text-sm text-forge-text-secondary">
        This area is intentionally separate from the general integrations page so finance workflows can grow without cluttering settings.
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((provider) => (
          <article key={provider.name} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-forge-text-primary">{provider.name}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClasses(provider.status)}`}>
                        {statusLabel(provider.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-forge-text-secondary">{provider.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {provider.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full border border-forge-border bg-forge-surface-2 px-2.5 py-1 text-xs text-forge-text-secondary"
                    >
                      {capability}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-xs leading-6 text-forge-text-muted">{provider.notes}</p>
              </div>

              <div className="flex w-full lg:w-auto lg:justify-end">
                <button
                  type="button"
                  disabled
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-forge-border bg-forge-surface-2 px-4 py-2 text-sm text-forge-text-muted opacity-70 lg:w-auto"
                >
                  Configure
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
