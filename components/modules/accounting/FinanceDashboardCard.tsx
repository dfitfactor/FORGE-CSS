'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CreditCard,
  DollarSign,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type RangeKey =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'year_to_date'
  | 'last_4_weeks'

type ComparisonMetric = {
  current: number
  previous: number
  delta: number
  delta_percent: number | null
}

type FinanceSummary = {
  filters: {
    range: RangeKey
    label: string
    start: string
    end: string
    compare_start: string | null
    compare_end: string | null
    granularity: 'hour' | 'day' | 'week' | 'month'
    compare_enabled: boolean
  }
  metrics: {
    stripe_gross_cents: number
    stripe_pending_cents: number
    zoho_money_in_cents: number
    zoho_money_out_cents: number
    profit_cents: number
    known_pending_cents: number
    paid_booking_count: number
    active_subscription_count: number
  }
  comparisons: {
    stripe_gross_cents: ComparisonMetric
    stripe_pending_cents: ComparisonMetric
    zoho_money_in_cents: ComparisonMetric
    zoho_money_out_cents: ComparisonMetric
    profit_cents: ComparisonMetric
    paid_booking_count: ComparisonMetric
    active_subscription_count: ComparisonMetric
  }
  activity: {
    paid_booking_count: number
    active_subscription_count: number
    failed_payment_count: number
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
    timeline: Array<{
      label: string
      sort_key: string
      stripe_paid_cents: number
      stripe_pending_cents: number
      zoho_money_in_cents: number
      zoho_money_out_cents: number
      profit_cents: number
      previous_stripe_paid_cents: number
      previous_profit_cents: number
    }>
  }
  top_customers: Array<{
    name: string
    email: string
    paid_total_cents: number
  }>
}

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'year_to_date', label: 'Year To Date' },
  { value: 'last_4_weeks', label: 'Last 4 Weeks' },
]

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatCompactMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100)
}

function formatAxisMoney(value: number) {
  return formatCompactMoney(value)
}

function formatPercent(value: number | null) {
  if (value === null) return 'New'
  const rounded = Math.abs(value).toFixed(1)
  return `${value >= 0 ? '+' : '-'}${rounded}%`
}

function deltaTone(value: number | null) {
  if (value === null) return 'text-forge-gold'
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-red-300'
  return 'text-forge-text-muted'
}

function MetricCard({
  label,
  value,
  compare,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  compare: ComparisonMetric
  detail: string
  icon: typeof DollarSign
}) {
  const isUp = compare.delta >= 0

  return (
    <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
          <Icon className="h-4 w-4" />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${deltaTone(compare.delta_percent)}`}>
          {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {formatPercent(compare.delta_percent)}
        </div>
      </div>
      <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-forge-text-primary">{value}</p>
      <p className="mt-2 text-sm text-forge-text-secondary">{detail}</p>
      <p className="mt-1 text-xs text-forge-text-muted">Previous period: {typeof compare.previous === 'number' ? formatMoney(compare.previous) : '$0.00'}</p>
    </div>
  )
}

function CountCard({
  label,
  current,
  compare,
  detail,
  icon: Icon,
}: {
  label: string
  current: number
  compare: ComparisonMetric
  detail: string
  icon: typeof Users
}) {
  const isUp = compare.delta >= 0

  return (
    <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
          <Icon className="h-4 w-4" />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${deltaTone(compare.delta_percent)}`}>
          {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {formatPercent(compare.delta_percent)}
        </div>
      </div>
      <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-forge-text-primary">{current}</p>
      <p className="mt-2 text-sm text-forge-text-secondary">{detail}</p>
      <p className="mt-1 text-xs text-forge-text-muted">Previous period: {compare.previous}</p>
    </div>
  )
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

export default function FinanceDashboardCard() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState<RangeKey>('year_to_date')
  const [compare, setCompare] = useState(true)

  useEffect(() => {
    let active = true

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          range,
          compare: compare ? 'true' : 'false',
        })

        const response = await fetch(`/api/accounting/summary?${params.toString()}`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? 'Failed to load finance dashboard')
        if (!active) return
        setSummary(data.summary as FinanceSummary)
      } catch (err: unknown) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load finance dashboard')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadData()

    return () => {
      active = false
    }
  }, [range, compare])

  const currentWindowLabel = useMemo(() => {
    if (!summary) return ''
    const start = new Date(summary.filters.start)
    const end = new Date(summary.filters.end)
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }, [summary])

  if (loading) {
    return (
      <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
        Loading finance dashboard...
      </section>
    )
  }

  return (
    <section className="space-y-6 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Business Overview</p>
          <h2 className="mt-2 text-xl font-semibold text-forge-text-primary">Finance Reporting</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Review Stripe revenue, Zoho Books cashflow, profitability, and client spend across a selected reporting window.
          </p>
          {summary ? <p className="mt-2 text-xs text-forge-text-muted">{currentWindowLabel}</p> : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-xl border border-forge-border bg-forge-surface-3 px-3 py-2 text-sm text-forge-text-secondary">
            <span>Date Range</span>
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as RangeKey)}
              className="bg-transparent text-forge-text-primary outline-none"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-forge-surface text-forge-text-primary">
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setCompare((current) => !current)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              compare
                ? 'border-forge-gold/40 bg-forge-gold/10 text-forge-gold'
                : 'border-forge-border bg-forge-surface-3 text-forge-text-secondary'
            }`}
          >
            Compare: {compare ? 'Previous Period' : 'Off'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Revenue And Profit Trend</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                Current period versus previous period, with Stripe gross volume and Zoho-based profit tracking.
              </p>
            </div>
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary?.charts.timeline ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="stripeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d9b12f" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#d9b12f" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#28c76f" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#28c76f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(125, 104, 197, 0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis stroke="#8f7bb8" tickFormatter={formatAxisMoney} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="stripe_paid_cents" name="Stripe gross" stroke="#d9b12f" strokeWidth={2.5} fill="url(#stripeFill)" />
                <Area type="monotone" dataKey="previous_stripe_paid_cents" name="Previous stripe" stroke="#6d5ca5" strokeDasharray="5 5" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="profit_cents" name="Profit" stroke="#28c76f" strokeWidth={2.2} fill="url(#profitFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Cashflow Mix</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                Money in versus money out across the same selected period.
              </p>
            </div>
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
              <BarChart3 className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.charts.timeline ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(125, 104, 197, 0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="#8f7bb8" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis stroke="#8f7bb8" tickFormatter={formatAxisMoney} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="zoho_money_in_cents" name="Zoho in" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="zoho_money_out_cents" name="Zoho out" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Stripe Gross Volume"
          value={formatMoney(summary?.metrics.stripe_gross_cents ?? 0)}
          compare={summary?.comparisons.stripe_gross_cents ?? { current: 0, previous: 0, delta: 0, delta_percent: 0 }}
          detail="Successful Stripe revenue in the selected window."
          icon={CreditCard}
        />
        <MetricCard
          label="Profit & Loss"
          value={formatMoney(summary?.metrics.profit_cents ?? 0)}
          compare={summary?.comparisons.profit_cents ?? { current: 0, previous: 0, delta: 0, delta_percent: 0 }}
          detail="Zoho money in minus Zoho money out."
          icon={DollarSign}
        />
        <MetricCard
          label="Pending Collections"
          value={formatMoney(summary?.metrics.stripe_pending_cents ?? 0)}
          compare={summary?.comparisons.stripe_pending_cents ?? { current: 0, previous: 0, delta: 0, delta_percent: 0 }}
          detail="Stripe payment intents still pending completion."
          icon={Receipt}
        />
        <MetricCard
          label="Zoho Money In"
          value={formatMoney(summary?.metrics.zoho_money_in_cents ?? 0)}
          compare={summary?.comparisons.zoho_money_in_cents ?? { current: 0, previous: 0, delta: 0, delta_percent: 0 }}
          detail="Bank-transaction inflows from Zoho Books."
          icon={TrendingUp}
        />
        <MetricCard
          label="Zoho Money Out"
          value={formatMoney(summary?.metrics.zoho_money_out_cents ?? 0)}
          compare={summary?.comparisons.zoho_money_out_cents ?? { current: 0, previous: 0, delta: 0, delta_percent: 0 }}
          detail="Expenses and cash outflows from Zoho Books."
          icon={Activity}
        />
        <CountCard
          label="Active Subscribers"
          current={summary?.metrics.active_subscription_count ?? 0}
          compare={summary?.comparisons.active_subscription_count ?? { current: 0, previous: 0, delta: 0, delta_percent: 0 }}
          detail="Active package/subscription enrollments in FORGE."
          icon={Users}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-forge-text-primary">Top Customers By Spend</h3>
            <p className="mt-1 text-sm text-forge-text-secondary">
              Highest paid booking totals inside FORGE for the selected range.
            </p>
          </div>

          <div className="space-y-3">
            {(summary?.top_customers ?? []).length ? (
              summary?.top_customers.map((customer) => (
                <div key={`${customer.email}-${customer.name}`} className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-forge-text-primary">{customer.name}</p>
                      <p className="mt-1 text-xs text-forge-text-muted">{customer.email || 'Email unavailable'}</p>
                    </div>
                    <p className="text-sm font-semibold text-forge-gold">{formatMoney(customer.paid_total_cents)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-forge-border bg-forge-surface-2 p-4 text-sm text-forge-text-muted">
                No paid customer activity found in this range yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-forge-text-primary">Reporting Health</h3>
            <p className="mt-1 text-sm text-forge-text-secondary">
              A quick read on which systems are feeding the dashboard and how trustworthy the current numbers are.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Stripe</p>
              <p className="mt-3 text-lg font-semibold text-forge-text-primary">{summary?.integrations.stripe.label ?? 'Unknown'}</p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Gross volume: {formatMoney(summary?.metrics.stripe_gross_cents ?? 0)}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Failed payments: {summary?.activity.failed_payment_count ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Zoho Books</p>
              <p className="mt-3 text-lg font-semibold text-forge-text-primary">
                {summary?.integrations.zoho_books.last_test_status === 'connected' ? 'Connected' : 'Needs attention'}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                Org: {summary?.integrations.zoho_books.organization_id || 'Not set'}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                DC: {summary?.integrations.zoho_books.location || 'Unknown'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Reporting Notes</p>
            <div className="mt-3 space-y-2">
              {summary?.reporting.notes.map((note) => (
                <p key={note} className="text-sm text-forge-text-secondary">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
