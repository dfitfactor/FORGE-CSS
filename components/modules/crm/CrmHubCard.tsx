'use client'

import { ArrowRight, ArrowUpRight, Bot, BriefcaseBusiness, CheckCircle2, Network, UserPlus, Users } from 'lucide-react'

type ProviderStatus = 'planned' | 'ready'

type SyncSurface = {
  label: string
  description: string
}

const SYNC_SURFACES: SyncSurface[] = [
  {
    label: 'Lead Capture',
    description: 'Public booking requests, inquiries, and new prospects flow into AI-SHA CRM first.',
  },
  {
    label: 'Nurture & Follow-Up',
    description: 'AI-SHA CRM owns outreach, lead qualification, and conversion automation before service delivery starts.',
  },
  {
    label: 'Conversion Handoff',
    description: 'Once a prospect becomes a paying active client, FORGE CSS creates or activates the client profile.',
  },
  {
    label: 'Active Client Management',
    description: 'FORGE CSS becomes the system of record for bookings, packages, protocols, forms, and coaching operations.',
  },
]

const PROVIDER = {
  name: 'AI-SHA CRM',
  status: 'ready' as ProviderStatus,
  description: 'Lead generation, bookings, follow-up automation, and prospect conversion live here before clients graduate into FORGE CSS.',
  requirements: ['API key', 'Login credentials', 'Lead endpoint mapping', 'Conversion handoff rule'],
  notes:
    'Recommended architecture: AI-SHA CRM owns prospects and nurture, then FORGE CSS takes over when a lead becomes an active client.',
}

function statusClasses(status: ProviderStatus) {
  return status === 'ready'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-forge-gold/30 bg-forge-gold/10 text-forge-gold'
}

function statusLabel(status: ProviderStatus) {
  return status === 'ready' ? 'Credentials Ready' : 'Placeholder'
}

export default function CrmHubCard() {
  return (
    <section className="space-y-5 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">CRM</p>
          <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">CRM Handoff Workspace</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Keep prospect workflows in AI-SHA CRM, then hand converted clients into FORGE CSS for delivery, bookings, and coaching operations.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
        This page defines the boundary: <span className="font-medium">AI-SHA CRM manages leads</span>, and{' '}
        <span className="font-medium">FORGE CSS manages active clients</span>.
      </div>

      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
                <BriefcaseBusiness className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-forge-text-primary">{PROVIDER.name}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClasses(PROVIDER.status)}`}>
                    {statusLabel(PROVIDER.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-forge-text-secondary">{PROVIDER.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {PROVIDER.requirements.map((requirement) => (
                <span
                  key={requirement}
                  className="rounded-full border border-forge-border bg-forge-surface-2 px-2.5 py-1 text-xs text-forge-text-secondary"
                >
                  {requirement}
                </span>
              ))}
            </div>

            <p className="text-xs leading-6 text-forge-text-muted">{PROVIDER.notes}</p>
          </div>

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

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
            <UserPlus className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Prospects</h3>
          <p className="mt-2 text-sm text-forge-text-secondary">
            New inquiries, booking interest, and top-of-funnel leads stay in AI-SHA CRM.
          </p>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
            <Bot className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Automation</h3>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Follow-up messages, nurture sequences, and conversion automations live on the CRM side.
          </p>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
            <ArrowRight className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Conversion</h3>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Conversion creates the handoff event that moves a lead into FORGE CSS as a true client.
          </p>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
            <Users className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Client Delivery</h3>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Once active, the client lives in FORGE CSS for services, forms, bookings, protocols, and retention.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-forge-text-primary">Lifecycle Map</h3>
          <p className="mt-1 text-sm text-forge-text-muted">
            This gives the team a simple operating model before the API wiring starts.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {SYNC_SURFACES.map((surface) => (
            <div key={surface.label} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 p-1 text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-forge-text-primary">{surface.label}</h4>
                  <p className="mt-1 text-sm text-forge-text-secondary">{surface.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
