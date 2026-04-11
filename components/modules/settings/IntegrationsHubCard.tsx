'use client'

import Link from 'next/link'
import {
  ArrowUpRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  Calculator,
  Calendar,
  CreditCard,
  Mail,
  Pill,
  ShieldCheck,
  Webhook,
} from 'lucide-react'

type IntegrationStatus = 'connected' | 'planned'

type IntegrationItem = {
  name: string
  category: string
  description: string
  status: IntegrationStatus
  requirements: string[]
  notes: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
}

const INTEGRATIONS: IntegrationItem[] = [
  {
    name: 'Stripe',
    category: 'Payments',
    description: 'Primary billing engine for subscriptions, checkout, webhooks, and client payment updates.',
    status: 'connected',
    requirements: ['Live secret key', 'Webhook secret', 'Customer portal'],
    notes: 'Active in the platform now. Settings hub will become the control center for verification and diagnostics.',
    icon: CreditCard,
  },
  {
    name: 'Google Calendar',
    category: 'Scheduling',
    description: 'Controls calendar event creation, session confirmations, and coach scheduling sync.',
    status: 'planned',
    requirements: ['OAuth credentials', 'Target calendar ID', 'Connection test'],
    notes: 'Framework exists in code. A full reconnect and health panel is still needed here in Settings.',
    icon: Calendar,
  },
  {
    name: 'Email',
    category: 'Messaging',
    description: 'Handles booking confirmations, reminders, billing notices, and system emails.',
    status: 'connected',
    requirements: ['Resend API key', 'Verified sender domain', 'Delivery check'],
    notes: 'Transactional email is live. A future version of this hub can expose delivery health and test actions.',
    icon: Mail,
  },
  {
    name: 'AI-SHA CRM',
    category: 'Operations',
    description: 'Lead capture, follow-up automation, bookings, and prospect conversion before active clients move into FORGE CSS.',
    status: 'planned',
    requirements: ['API key', 'Lead endpoint mapping', 'Conversion handoff rule'],
    notes: 'Recommended split: AI-SHA CRM owns prospects and nurture, then FORGE CSS becomes the system of record after conversion.',
    icon: BriefcaseBusiness,
    href: '/crm',
  },
  {
    name: 'Zoho Books',
    category: 'Accounting',
    description: 'Accounting workspace for invoicing, bookkeeping sync, reconciliation, and financial reporting workflows.',
    status: 'planned',
    requirements: ['Zoho Books organization', 'OAuth credentials', 'Invoice and payment mapping'],
    notes: 'Best fit for accounting visibility once package sales, invoice flows, and alternate payment methods need to reconcile into a single ledger.',
    icon: Calculator,
    href: '/accounting',
  },
  {
    name: 'Fullscript',
    category: 'Supplements',
    description: 'Placeholder for supplement recommendations, dispensary workflows, client orders, and practitioner account sync.',
    status: 'planned',
    requirements: ['Practitioner account', 'Catalog access', 'Client recommendation flow'],
    notes: 'Best fit for supplement protocol handoff and product fulfillment once provider-level auth and mapping are added.',
    icon: Pill,
  },
  {
    name: 'PayPal',
    category: 'Payments',
    description: 'Placeholder for alternate checkout, invoice payments, and future verified payment handling.',
    status: 'planned',
    requirements: ['Merchant account', 'API credentials', 'Webhook verification'],
    notes: 'Can evolve into a true checkout integration after the hub scaffolding is in place.',
    icon: ShieldCheck,
  },
  {
    name: 'Venmo',
    category: 'Payments',
    description: 'Placeholder for manual payment workflows, payment instructions, and coach-side reconciliation.',
    status: 'planned',
    requirements: ['Payment handle', 'Manual receipt flow', 'Coach confirmation'],
    notes: 'Recommended as an operational payment option rather than a deep recurring billing source.',
    icon: BadgeDollarSign,
  },
  {
    name: 'Webhooks & Cron',
    category: 'Automation',
    description: 'Central place for Stripe webhook health, reminder cron status, and system automation checks.',
    status: 'planned',
    requirements: ['Webhook diagnostics', 'Cron secret check', 'Last run visibility'],
    notes: 'Good follow-up once the integrations hub starts surfacing live connection status.',
    icon: Webhook,
  },
]

const SORTED_INTEGRATIONS = [...INTEGRATIONS].sort((a, b) => a.name.localeCompare(b.name))

function statusClasses(status: IntegrationStatus) {
  if (status === 'connected') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  }

  return 'border-forge-gold/30 bg-forge-gold/10 text-forge-gold'
}

function statusLabel(status: IntegrationStatus) {
  return status === 'connected' ? 'Connected' : 'Placeholder'
}

export default function IntegrationsHubCard() {
  return (
    <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
          <Webhook className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Integrations</p>
          <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">Integration Hub</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Centralize payment, CRM, scheduling, messaging, and automation connections here. This hub is ready for provider-specific logic to be wired in next.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3 text-sm text-forge-text-secondary">
        Placeholder cards are live now so future integrations can be added without reworking the Settings structure.
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {SORTED_INTEGRATIONS.map((integration) => {
          const Icon = integration.icon

          return (
            <article key={integration.name} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-forge-text-primary">{integration.name}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClasses(integration.status)}`}>
                          {statusLabel(integration.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-mono uppercase tracking-widest text-forge-text-muted">
                        {integration.category}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-forge-text-secondary">{integration.description}</p>

                  <div className="space-y-2">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">What This Will Cover</p>
                    <div className="flex flex-wrap gap-2">
                      {integration.requirements.map((requirement) => (
                        <span
                          key={requirement}
                          className="rounded-full border border-forge-border bg-forge-surface-2 px-2.5 py-1 text-xs text-forge-text-secondary"
                        >
                          {requirement}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs leading-6 text-forge-text-muted">{integration.notes}</p>
                </div>

                <div className="flex w-full sm:w-auto sm:justify-end">
                  {integration.href ? (
                    <Link
                      href={integration.href}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-forge-border bg-forge-surface-2 px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface sm:w-auto"
                    >
                      Configure
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-forge-border bg-forge-surface-2 px-4 py-2 text-sm text-forge-text-muted opacity-70 sm:w-auto"
                    >
                      Configure
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
