'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  ChevronRight,
  Filter,
  Loader2,
  Network,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type IntegrationState = {
  provider_key: string
  display_name: string
  integration_type: string
  api_key_masked: string
  has_api_key: boolean
  base_url: string
  is_enabled: boolean
  last_test_status: string | null
  last_test_message: string | null
  last_tested_at: string | null
  sync_scope: {
    leads_owned_by: string
    active_clients_owned_by: string
    first_sync_event: string
    conversion_handoff: string
  }
}

type FormState = {
  display_name: string
  integration_type: string
  api_key: string
  base_url: string
  is_enabled: boolean
}

type CrmSummary = {
  stats: {
    total_contacts: number
    new_prospects: number
    active_opportunities: number
    won_opportunities: number
    pipeline_value_cents: number
    activities_logged: number
  }
  conversion: {
    prospect_to_client_rate: number
    active_to_won_rate: number
    funnel_efficiency_rate: number
  }
  pipeline: Array<{ stage: string; total: number }>
  prompt_sources: Array<{ source: string; total: number }>
  lead_age_distribution: Array<{ bucket: string; total: number }>
  recent_activities: Array<{
    title: string
    activity_type: string
    happened_at: string
    client_name: string | null
  }>
  integration: {
    configured: boolean
    enabled: boolean
    last_test_status: string | null
    last_test_message: string | null
    last_tested_at: string | null
  }
}

const PIPELINE_COLORS = ['#22c55e', '#06b6d4', '#f59e0b', '#a855f7', '#ef4444']
const AGE_COLORS = ['#22c55e', '#facc15', '#f97316', '#ef4444', '#9333ea']

function formatDateTime(value: string | null) {
  if (!value) return 'Never tested'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function statusStyles(status: string | null) {
  if (status === 'connected') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300'
  return 'border-forge-border bg-forge-surface-2 text-forge-text-muted'
}

function statusLabel(status: string | null) {
  if (status === 'connected') return 'Connected'
  if (status === 'failed') return 'Needs attention'
  return 'Not tested'
}

function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail: string
  accent: string
}) {
  return (
    <div className={`rounded-2xl border bg-forge-surface-3/60 p-4 ${accent}`}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-forge-text-primary">{value}</p>
      <p className="mt-2 text-xs text-forge-text-secondary">{detail}</p>
    </div>
  )
}

export default function CrmHubCard() {
  const [integration, setIntegration] = useState<IntegrationState | null>(null)
  const [summary, setSummary] = useState<CrmSummary | null>(null)
  const [form, setForm] = useState<FormState>({
    display_name: 'FORGE CSS',
    integration_type: 'other',
    api_key: '',
    base_url: '',
    is_enabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function loadWorkspace() {
      setLoading(true)
      setError('')

      try {
        const [integrationRes, summaryRes] = await Promise.all([
          fetch('/api/integrations/aisha', { cache: 'no-store' }),
          fetch('/api/crm/summary', { cache: 'no-store' }),
        ])

        const integrationData = await integrationRes.json().catch(() => ({}))
        const summaryData = await summaryRes.json().catch(() => ({}))

        if (!integrationRes.ok) throw new Error(integrationData.error ?? 'Failed to load CRM integration')
        if (!summaryRes.ok) throw new Error(summaryData.error ?? 'Failed to load CRM summary')
        if (!active) return

        const nextIntegration = integrationData.integration as IntegrationState
        setIntegration(nextIntegration)
        setSummary(summaryData.summary as CrmSummary)
        setForm({
          display_name: nextIntegration.display_name,
          integration_type: nextIntegration.integration_type,
          api_key: '',
          base_url: nextIntegration.base_url ?? '',
          is_enabled: nextIntegration.is_enabled,
        })
      } catch (err: unknown) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load CRM workspace')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadWorkspace()

    return () => {
      active = false
    }
  }, [])

  async function reloadSummary() {
    const res = await fetch('/api/crm/summary', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      setSummary(data.summary as CrmSummary)
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/integrations/aisha', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save CRM integration')
      }

      const nextIntegration = data.integration as IntegrationState
      setIntegration(nextIntegration)
      setForm((current) => ({
        ...current,
        api_key: '',
        base_url: nextIntegration.base_url ?? '',
        is_enabled: nextIntegration.is_enabled,
      }))
      setSuccess('AI-SHA CRM configuration saved')
      await reloadSummary()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save CRM integration')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/integrations/aisha/test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error ?? 'Connection test failed')
      }

      setIntegration((current) =>
        current
          ? {
              ...current,
              last_test_status: data.status ?? (data.success ? 'connected' : 'failed'),
              last_test_message: data.message ?? '',
              last_tested_at: new Date().toISOString(),
            }
          : current
      )
      setSuccess(data.message ?? 'Connection test completed')
      await reloadSummary()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  const funnelData = useMemo(() => {
    if (!summary) return []

    return [
      { label: 'Prospects', total: summary.stats.new_prospects || summary.stats.active_opportunities },
      { label: 'Opportunities', total: summary.stats.active_opportunities },
      { label: 'Won', total: summary.stats.won_opportunities },
    ]
  }, [summary])

  const ownershipItems = [
    { icon: UserPlus, label: 'First event', value: integration?.sync_scope.first_sync_event ?? 'public inquiry or booking request' },
    { icon: ArrowRight, label: 'Handoff', value: integration?.sync_scope.conversion_handoff ?? 'lead converted to active paying client' },
    { icon: Users, label: 'Active client owner', value: integration?.sync_scope.active_clients_owned_by ?? 'FORGE CSS' },
    { icon: Bot, label: 'Aisha role', value: 'Lead capture, nurture, qualification, and conversion logic' },
  ]

  if (loading) {
    return (
      <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
        Loading AI-SHA CRM workspace...
      </section>
    )
  }

  return (
    <section className="space-y-5 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
      <div className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-sky-500/20 via-cyan-400/20 to-emerald-400/10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-cyan-100/70">AI-SHA CRM</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Welcome to the AI-SHA CRM workspace</h2>
            <p className="mt-2 max-w-3xl text-sm text-cyan-50/80">
              A powered cognitive relationship dashboard for lead capture, nurture, conversion, and the handoff into active coaching delivery inside FORGE CSS.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${statusStyles(integration?.last_test_status ?? null)}`}>
              {statusLabel(integration?.last_test_status ?? null)}
            </span>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100/80">
              Updated {formatDateTime(summary?.integration.last_tested_at ?? integration?.last_tested_at ?? null)}
            </span>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div> : null}

      <div className="grid gap-4 xl:grid-cols-6">
        <StatCard label="Total Contacts" value={String(summary?.stats.total_contacts ?? 0)} detail="FORGE-side client and contact records." accent="border-cyan-400/30" />
        <StatCard label="New Prospects" value={String(summary?.stats.new_prospects ?? 0)} detail="Prospect records created in the last 30 days." accent="border-emerald-400/30" />
        <StatCard label="Active Opportunities" value={String(summary?.stats.active_opportunities ?? 0)} detail="Current prospects still in the funnel." accent="border-orange-400/30" />
        <StatCard label="Won Opportunities" value={String(summary?.stats.won_opportunities ?? 0)} detail="New active clients created in the last 30 days." accent="border-green-400/30" />
        <StatCard label="Pipeline Value" value={formatMoney(summary?.stats.pipeline_value_cents ?? 0)} detail="Unpaid bookings and active package balances." accent="border-teal-400/30" />
        <StatCard label="Activities Logged" value={String(summary?.stats.activities_logged ?? 0)} detail="Audit activity tracked in the last 4 weeks." accent="border-sky-400/30" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Sales Pipeline</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">Opportunity volume by current client and prospect stage.</p>
            </div>
            <Target className="h-4 w-4 text-forge-gold" />
          </div>

          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.pipeline ?? []}>
                <CartesianGrid stroke="rgba(125, 104, 197, 0.12)" vertical={false} />
                <XAxis dataKey="stage" stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {(summary?.pipeline ?? []).map((entry, index) => (
                    <Cell key={`${entry.stage}-${index}`} fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Sales Funnel</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">Simple view of prospect progression into won clients.</p>
            </div>
            <Filter className="h-4 w-4 text-cyan-300" />
          </div>

          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="rgba(125, 104, 197, 0.12)" horizontal={false} />
                <XAxis type="number" stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="label" stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" radius={[0, 8, 8, 0]} fill="#22d3ee" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Prompt Source</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">Where new prospects are currently entering the system.</p>
            </div>
            <Sparkles className="h-4 w-4 text-emerald-300" />
          </div>

          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={summary?.prompt_sources ?? []} dataKey="total" nameKey="source" outerRadius={85} innerRadius={40}>
                  {(summary?.prompt_sources ?? []).map((entry, index) => (
                    <Cell key={`${entry.source}-${index}`} fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Conversion Rates</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">Current conversion efficiency based on FORGE-side prospect and client states.</p>
            </div>
            <TrendingUp className="h-4 w-4 text-forge-gold" />
          </div>

          <div className="mt-4 space-y-4">
            {[
              { label: 'Prospect to Client', value: summary?.conversion.prospect_to_client_rate ?? 0 },
              { label: 'Opportunity to Won', value: summary?.conversion.active_to_won_rate ?? 0 },
              { label: 'Funnel Efficiency', value: summary?.conversion.funnel_efficiency_rate ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-forge-text-primary">{item.label}</p>
                  <span className="text-sm font-semibold text-forge-gold">{item.value}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-forge-surface">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-forge-gold" style={{ width: `${Math.min(item.value, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Lead Age Distribution</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">Aging view of prospect records still in the funnel.</p>
            </div>
            <Users className="h-4 w-4 text-forge-gold" />
          </div>

          <div className="mt-4 space-y-3">
            {(summary?.lead_age_distribution ?? []).length ? (
              (summary?.lead_age_distribution ?? []).map((bucket, index) => (
                <div key={bucket.bucket}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-forge-text-secondary">{bucket.bucket}</span>
                    <span className="font-semibold text-forge-text-primary">{bucket.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-forge-surface">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(6, Math.min(bucket.total * 14, 100))}%`,
                        backgroundColor: AGE_COLORS[index % AGE_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-forge-border bg-forge-surface-2 p-4 text-sm text-forge-text-muted">
                No prospect aging data yet. Once AI-SHA or FORGE is holding active prospects, this section will fill in.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Recent Activities</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">Latest CRM-adjacent movements coming from FORGE activity logs.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-forge-text-muted" />
          </div>

          <div className="mt-4 space-y-3">
            {(summary?.recent_activities ?? []).length ? (
              (summary?.recent_activities ?? []).map((activity, index) => (
                <div key={`${activity.happened_at}-${index}`} className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-forge-text-primary">{activity.title}</p>
                      <p className="mt-1 text-xs text-forge-text-muted">{activity.client_name ?? 'System'} | {activity.activity_type}</p>
                    </div>
                    <p className="text-xs text-forge-text-muted">{formatDateTime(activity.happened_at)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-forge-border bg-forge-surface-2 p-4 text-sm text-forge-text-muted">
                No recent activity logged yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
              <BriefcaseBusiness className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">AI-SHA Connection Settings</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                This stays as the integration workspace for the lead handoff while the top half acts like the CRM command center.
              </p>
            </div>
          </div>

          <div>
            <label className="forge-label">Integration Name</label>
            <input className="forge-input" value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} />
          </div>

          <div>
            <label className="forge-label">Integration Type</label>
            <select className="forge-input" value={form.integration_type} onChange={(event) => setForm((current) => ({ ...current, integration_type: event.target.value }))}>
              <option value="other">Other</option>
              <option value="crm">CRM</option>
              <option value="automation">Automation</option>
            </select>
          </div>

          <div>
            <label className="forge-label">API Key / Token</label>
            <input
              type="password"
              className="forge-input"
              value={form.api_key}
              onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
              placeholder={integration?.has_api_key ? integration.api_key_masked || 'Saved token on file' : 'Paste the AI-SHA CRM API token'}
            />
            <p className="mt-2 text-xs text-forge-text-muted">
              {integration?.has_api_key ? `Saved token on file: ${integration.api_key_masked || 'masked'}` : 'No API key saved yet.'}
            </p>
          </div>

          <div>
            <label className="forge-label">Base URL</label>
            <input
              type="url"
              className="forge-input"
              value={form.base_url}
              onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
              placeholder="https://api.aishacrm.com/..."
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-2 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-forge-text-primary">Enable this integration</p>
              <p className="mt-1 text-xs text-forge-text-muted">Marks AI-SHA CRM as the live lead capture and nurture owner.</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, is_enabled: !current.is_enabled }))}
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                form.is_enabled
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-forge-border bg-forge-surface-3 text-forge-text-muted'
              }`}
            >
              {form.is_enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={saving} className="forge-btn-gold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={testing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-forge-border bg-forge-surface px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface-2 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </form>

        <div className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
              <Network className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Lead Ownership Rules</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                The boundary stays explicit so no one wonders which platform owns what.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
            Boundary rule: <span className="font-medium">AI-SHA CRM owns leads and nurture</span>, while <span className="font-medium">FORGE CSS owns active paying clients</span>.
          </div>

          <div className="space-y-3 rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            {ownershipItems.map((item) => {
              const Icon = item.icon

              return (
                <div key={item.label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 text-forge-gold" />
                  <div>
                    <p className="text-sm font-medium text-forge-text-primary">{item.label}</p>
                    <p className="text-sm text-forge-text-secondary">{item.value}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Connection Status</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${statusStyles(integration?.last_test_status ?? null)}`}>
                {statusLabel(integration?.last_test_status ?? null)}
              </span>
              <span className="rounded-full border border-forge-border bg-forge-surface-3 px-2 py-1 text-[10px] uppercase tracking-wide text-forge-text-secondary">
                {integration?.is_enabled ? 'Enabled' : 'Disabled'}
              </span>
              <span className="rounded-full border border-forge-border bg-forge-surface-3 px-2 py-1 text-[10px] uppercase tracking-wide text-forge-text-secondary">
                {integration?.has_api_key ? 'API key saved' : 'API key missing'}
              </span>
            </div>
            <p className="mt-3 text-sm text-forge-text-secondary">{integration?.last_test_message || 'No connection test recorded yet.'}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
