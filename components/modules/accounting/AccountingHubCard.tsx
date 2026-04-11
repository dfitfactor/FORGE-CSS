'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  Calculator,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Receipt,
  Save,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

type IntegrationState = {
  provider_key: string
  display_name: string
  integration_type: string
  client_id: string
  has_client_secret: boolean
  client_secret_masked: string
  has_refresh_token: boolean
  refresh_token_masked: string
  accounts_url: string
  base_url: string
  is_enabled: boolean
  organization_id: string
  location: string
  last_test_status: string | null
  last_test_message: string | null
  last_tested_at: string | null
  oauth: {
    redirect_uri: string
    scopes: string
  }
  finance_scope: {
    primary_ledger: string
    inbound_sources: string[]
    first_sync_event: string
    reconciliation_goal: string
  }
}

type AccountingSummary = {
  revenue: {
    stripe_paid_cents: number
    stripe_pending_cents: number
    waived_cents: number
    package_paid_cents: number
    package_pending_cents: number
    known_money_in_cents: number
    known_pending_cents: number
  }
  activity: {
    paid_booking_count: number
    pending_booking_count: number
    waived_booking_count: number
    active_subscription_count: number
    grace_period_count: number
  }
  integrations: {
    stripe: {
      configured: boolean
      label: string
    }
    zoho_books: {
      configured: boolean
      enabled: boolean
      last_test_status: string | null
      last_test_message: string | null
      last_tested_at: string | null
      organization_id: string
      has_refresh_token: boolean
      location: string
    }
  }
  reporting: {
    expenses_available: boolean
    profit_loss_available: boolean
    notes: string[]
  }
  charts: {
    monthly_revenue: Array<{
      month: string
      sort_month: string
      booking_paid_cents: number
      booking_pending_cents: number
      package_paid_cents: number
      package_pending_cents: number
      total_paid_cents: number
      total_pending_cents: number
    }>
  }
}

type FormState = {
  display_name: string
  integration_type: string
  client_id: string
  client_secret: string
  accounts_url: string
  base_url: string
  organization_id: string
  is_enabled: boolean
}

type AccountingSurface = {
  label: string
  description: string
  icon: typeof Receipt
}

const ACCOUNTING_SURFACES: AccountingSurface[] = [
  {
    label: 'Invoices',
    description: 'Future home for package invoices, manual finance workflows, and billable service tracking.',
    icon: Receipt,
  },
  {
    label: 'Reconciliation',
    description: 'Compare Stripe, Venmo, PayPal, and manual collections against one accounting destination.',
    icon: CreditCard,
  },
  {
    label: 'Reporting',
    description: 'Reserve space for revenue summaries, payout visibility, and export-ready bookkeeping views.',
    icon: FileSpreadsheet,
  },
]

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

function oauthMessage(status: string | null) {
  switch (status) {
    case 'oauth-connected':
      return { type: 'success' as const, text: 'Zoho Books OAuth connected successfully. Refresh token saved.' }
    case 'oauth-denied':
      return { type: 'error' as const, text: 'Zoho authorization was denied before completion.' }
    case 'invalid-state':
      return { type: 'error' as const, text: 'Zoho OAuth state validation failed. Start the authorization again.' }
    case 'missing-client-config':
      return { type: 'error' as const, text: 'Save the Zoho client ID and client secret before authorizing.' }
    case 'oauth-start-failed':
    case 'oauth-failed':
      return { type: 'error' as const, text: 'Zoho OAuth did not complete. Check the configuration and try again.' }
    case 'unauthorized':
      return { type: 'error' as const, text: 'You must be signed in as coach or admin to connect Zoho Books.' }
    default:
      return null
  }
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: typeof Wallet
}) {
  return (
    <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-forge-text-primary">{value}</p>
      <p className="mt-2 text-sm text-forge-text-secondary">{detail}</p>
    </div>
  )
}

function formatAxisMoney(value: number) {
  return `$${Math.round(value / 100)}`
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-2 shadow-xl">
      <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">{label}</p>
      <div className="mt-2 space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-forge-text-secondary">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>{entry.name}</span>
            </div>
            <span className="font-medium text-forge-text-primary">{formatMoney(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AccountingHubCard() {
  const searchParams = useSearchParams()
  const [integration, setIntegration] = useState<IntegrationState | null>(null)
  const [summary, setSummary] = useState<AccountingSummary | null>(null)
  const [form, setForm] = useState<FormState>({
    display_name: 'FORGE CSS Zoho Books',
    integration_type: 'accounting',
    client_id: '',
    client_secret: '',
    accounts_url: 'https://accounts.zoho.com',
    base_url: 'https://www.zohoapis.com/books/v3',
    organization_id: '',
    is_enabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const zohoStatus = searchParams.get('zoho')
    const message = oauthMessage(zohoStatus)
    if (!message) return
    if (message.type === 'success') {
      setSuccess(message.text)
      setError('')
    } else {
      setError(message.text)
      setSuccess('')
    }
  }, [searchParams])

  useEffect(() => {
    let active = true

    async function loadData() {
      setLoading(true)

      try {
        const [integrationRes, summaryRes] = await Promise.all([
          fetch('/api/integrations/zoho-books', { cache: 'no-store' }),
          fetch('/api/accounting/summary', { cache: 'no-store' }),
        ])

        const integrationData = await integrationRes.json().catch(() => ({}))
        const summaryData = await summaryRes.json().catch(() => ({}))

        if (!integrationRes.ok) throw new Error(integrationData.error ?? 'Failed to load Zoho Books integration')
        if (!summaryRes.ok) throw new Error(summaryData.error ?? 'Failed to load accounting summary')

        if (!active) return

        const nextIntegration = integrationData.integration as IntegrationState
        setIntegration(nextIntegration)
        setSummary(summaryData.summary as AccountingSummary)
        setForm({
          display_name: nextIntegration.display_name,
          integration_type: nextIntegration.integration_type,
          client_id: nextIntegration.client_id ?? '',
          client_secret: '',
          accounts_url: nextIntegration.accounts_url ?? 'https://accounts.zoho.com',
          base_url: nextIntegration.base_url ?? 'https://www.zohoapis.com/books/v3',
          organization_id: nextIntegration.organization_id ?? '',
          is_enabled: nextIntegration.is_enabled,
        })
      } catch (err: unknown) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load accounting workspace')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadData()

    return () => {
      active = false
    }
  }, [])

  async function refreshSummary() {
    const res = await fetch('/api/accounting/summary', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setSummary(data.summary as AccountingSummary)
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/integrations/zoho-books', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to save Zoho Books integration')

      const nextIntegration = data.integration as IntegrationState
      setIntegration(nextIntegration)
      setForm((current) => ({
        ...current,
        client_secret: '',
        accounts_url: nextIntegration.accounts_url ?? current.accounts_url,
        base_url: nextIntegration.base_url ?? current.base_url,
        organization_id: nextIntegration.organization_id ?? current.organization_id,
        is_enabled: nextIntegration.is_enabled,
      }))
      setSuccess('Zoho Books configuration saved')
      await refreshSummary()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save Zoho Books integration')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/integrations/zoho-books/test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Connection test failed')

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
      await refreshSummary()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
        Loading accounting dashboard...
      </section>
    )
  }

  return (
    <section className="space-y-6 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Accounting</p>
          <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">Finance Dashboard</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            This page now works as the dashboard-group finance view: money in, pending collections, integration health, and the Zoho Books configuration workspace all in one place.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Known Money In"
          value={formatMoney(summary?.revenue.known_money_in_cents ?? 0)}
          detail={`${summary?.activity.paid_booking_count ?? 0} paid bookings + ${summary?.activity.active_subscription_count ?? 0} active subscriptions`}
          icon={Wallet}
        />
        <StatCard
          label="Pending Collections"
          value={formatMoney(summary?.revenue.known_pending_cents ?? 0)}
          detail={`${summary?.activity.pending_booking_count ?? 0} unpaid bookings and package balances still outstanding`}
          icon={Receipt}
        />
        <StatCard
          label="Stripe Revenue"
          value={formatMoney(summary?.revenue.stripe_paid_cents ?? 0)}
          detail={summary?.integrations.stripe.label ?? 'Stripe status unavailable'}
          icon={CreditCard}
        />
        <StatCard
          label="Package Revenue"
          value={formatMoney(summary?.revenue.package_paid_cents ?? 0)}
          detail={`${summary?.activity.grace_period_count ?? 0} accounts in grace period`}
          icon={Activity}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Financial Visibility</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                Revenue is live from FORGE-recorded transactions. Profit and money-out remain intentionally blocked until expense data is wired.
              </p>
            </div>
            <span className="rounded-full border border-forge-border bg-forge-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-forge-text-muted">
              Honest mode
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Money Out</p>
              <p className="mt-3 text-2xl font-semibold text-forge-text-primary">Unavailable</p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Zoho expense, bill, or vendor spend data is not connected yet.
              </p>
            </div>
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Profit / Loss</p>
              <p className="mt-3 text-2xl font-semibold text-forge-text-primary">Unavailable</p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Profit requires both money-in and money-out. We only have reliable money-in right now.
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Reporting Notes</p>
            {summary?.reporting.notes.map((note) => (
              <p key={note} className="text-sm text-forge-text-secondary">
                {note}
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-forge-text-primary">Reconciliation Readiness</h3>
            <p className="mt-1 text-sm text-forge-text-secondary">
              This gives you the split between operational revenue in FORGE and ledger readiness in Zoho Books.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-forge-text-primary">Stripe</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  summary?.integrations.stripe.configured
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
                }`}>
                  {summary?.integrations.stripe.label ?? 'Unknown'}
                </span>
              </div>
              <p className="mt-3 text-sm text-forge-text-secondary">
                Revenue tracked in FORGE: {formatMoney(summary?.revenue.stripe_paid_cents ?? 0)}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Pending Stripe-side collections: {formatMoney(summary?.revenue.stripe_pending_cents ?? 0)}
              </p>
            </div>

            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-forge-text-primary">Zoho Books</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusStyles(summary?.integrations.zoho_books.last_test_status ?? null)}`}>
                  {statusLabel(summary?.integrations.zoho_books.last_test_status ?? null)}
                </span>
              </div>
              <p className="mt-3 text-sm text-forge-text-secondary">
                {summary?.integrations.zoho_books.has_refresh_token ? 'Refresh token saved' : 'Refresh token missing'}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Organization: {summary?.integrations.zoho_books.organization_id || 'Not set'}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                DC: {summary?.integrations.zoho_books.location || 'Not detected yet'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-forge-text-primary">Revenue Over Time</h3>
            <p className="mt-1 text-sm text-forge-text-secondary">
              Six-month trend of paid revenue captured inside FORGE from bookings and package enrollments.
            </p>
          </div>

          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary?.charts.monthly_revenue ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="paidRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d9b12f" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#d9b12f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(125, 104, 197, 0.12)" vertical={false} />
                <XAxis dataKey="month" stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis stroke="#8f7bb8" tickFormatter={formatAxisMoney} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total_paid_cents"
                  name="Total paid"
                  stroke="#d9b12f"
                  strokeWidth={2.5}
                  fill="url(#paidRevenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-forge-text-primary">Collections Breakdown</h3>
            <p className="mt-1 text-sm text-forge-text-secondary">
              Paid versus pending totals by month. Profitability remains locked until expense sync is live.
            </p>
          </div>

          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.charts.monthly_revenue ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(125, 104, 197, 0.12)" vertical={false} />
                <XAxis dataKey="month" stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis stroke="#8f7bb8" tickFormatter={formatAxisMoney} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total_paid_cents" name="Paid" fill="#d9b12f" radius={[6, 6, 0, 0]} />
                <Bar dataKey="total_pending_cents" name="Pending" fill="#6d5ca5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Zoho Books OAuth Configuration</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                The integrations hub should surface health, but the provider-specific setup still lives here on the accounting dashboard page where the financial work happens.
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
              <option value="accounting">Accounting</option>
              <option value="finance">Finance</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="forge-label">Client ID</label>
            <input className="forge-input" value={form.client_id} onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))} />
          </div>

          <div>
            <label className="forge-label">Client Secret</label>
            <input
              type="password"
              className="forge-input"
              value={form.client_secret}
              onChange={(event) => setForm((current) => ({ ...current, client_secret: event.target.value }))}
              placeholder={integration?.has_client_secret ? integration.client_secret_masked || 'Saved secret on file' : 'Zoho OAuth client secret'}
            />
          </div>

          <div>
            <label className="forge-label">Accounts URL</label>
            <input type="url" className="forge-input" value={form.accounts_url} onChange={(event) => setForm((current) => ({ ...current, accounts_url: event.target.value }))} />
          </div>

          <div>
            <label className="forge-label">API Base URL</label>
            <input type="url" className="forge-input" value={form.base_url} onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))} />
          </div>

          <div>
            <label className="forge-label">Organization ID</label>
            <input className="forge-input" value={form.organization_id} onChange={(event) => setForm((current) => ({ ...current, organization_id: event.target.value }))} />
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Redirect URI</p>
            <p className="mt-2 break-all text-sm text-forge-text-primary">{integration?.oauth.redirect_uri}</p>
            <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Scopes</p>
            <p className="mt-2 break-all text-xs text-forge-text-secondary">{integration?.oauth.scopes}</p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-2 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-forge-text-primary">Enable this integration</p>
              <p className="mt-1 text-xs text-forge-text-muted">Enable after Zoho OAuth and organization mapping are in place.</p>
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

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="submit" disabled={saving} className="forge-btn-gold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>

            <a href="/api/integrations/zoho-books/oauth/start" className="inline-flex items-center justify-center gap-2 rounded-xl border border-forge-border bg-forge-surface px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface-2">
              <ShieldCheck className="h-4 w-4" />
              Authorize Zoho Books
            </a>

            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={testing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-forge-border bg-forge-surface px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface-2 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </form>

        <div className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-forge-text-primary">Connection Status</h3>
            <p className="mt-1 text-sm text-forge-text-secondary">This tracks whether the server has what it needs to talk to Zoho Books reliably.</p>
          </div>

          <div className="space-y-3 rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusStyles(integration?.last_test_status ?? null)}`}>
                {statusLabel(integration?.last_test_status ?? null)}
              </span>
              <span className="rounded-full border border-forge-border bg-forge-surface-3 px-2.5 py-1 text-xs text-forge-text-secondary">
                {integration?.has_refresh_token ? 'Refresh token saved' : 'Refresh token missing'}
              </span>
              <span className="rounded-full border border-forge-border bg-forge-surface-3 px-2.5 py-1 text-xs text-forge-text-secondary">
                {integration?.location ? `DC ${integration.location}` : 'DC not detected yet'}
              </span>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Last Test</p>
              <p className="mt-2 text-sm text-forge-text-primary">{formatDateTime(integration?.last_tested_at ?? null)}</p>
              <p className="mt-1 text-sm text-forge-text-secondary">{integration?.last_test_message || 'No connection test recorded yet.'}</p>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Accounts Server</p>
              <p className="mt-2 text-sm text-forge-text-primary">{integration?.accounts_url || 'No accounts server saved yet'}</p>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Organization</p>
              <p className="mt-2 text-sm text-forge-text-primary">{integration?.organization_id || 'No organization ID saved yet'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Finance Sync Plan</p>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-forge-text-secondary">
                <span className="font-medium text-forge-text-primary">Ledger owner:</span> {integration?.finance_scope.primary_ledger ?? 'Zoho Books'}
              </p>
              <p className="text-sm text-forge-text-secondary">
                <span className="font-medium text-forge-text-primary">First sync event:</span> {integration?.finance_scope.first_sync_event ?? 'package sale or invoice creation'}
              </p>
              <p className="text-sm text-forge-text-secondary">
                <span className="font-medium text-forge-text-primary">Inbound sources:</span> {(integration?.finance_scope.inbound_sources ?? []).join(', ') || 'Stripe, Venmo, PayPal, manual invoices'}
              </p>
              <p className="text-sm text-forge-text-secondary">
                <span className="font-medium text-forge-text-primary">Goal:</span> {integration?.finance_scope.reconciliation_goal ?? 'single accounting source of truth'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ACCOUNTING_SURFACES.map((surface) => {
          const Icon = surface.icon
          return (
            <div key={surface.label} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-forge-text-primary">{surface.label}</h3>
              <p className="mt-2 text-sm text-forge-text-secondary">{surface.description}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
