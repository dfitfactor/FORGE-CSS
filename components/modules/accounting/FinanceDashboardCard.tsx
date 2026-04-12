'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  Calculator,
  CreditCard,
  Receipt,
  Wallet,
} from 'lucide-react'
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

type AccountingSummary = {
  revenue: {
    stripe_paid_cents: number
    stripe_pending_cents: number
    waived_cents: number
    package_paid_cents: number
    package_pending_cents: number
    known_money_in_cents: number
    known_pending_cents: number
    zoho_money_in_cents: number
    zoho_money_out_cents: number
    zoho_net_cents: number
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
      zoho_money_in_cents: number
      zoho_money_out_cents: number
      profit_cents: number
    }>
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatAxisMoney(value: number) {
  return `$${Math.round(value / 100)}`
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

function ProfitLossHeroCard({
  available,
  profitCents,
  revenueCents,
  expenseCents,
}: {
  available: boolean
  profitCents: number
  revenueCents: number
  expenseCents: number
}) {
  const isProfit = profitCents >= 0

  return (
    <div className="rounded-2xl border border-forge-gold/20 bg-gradient-to-br from-forge-surface-3 via-forge-surface-2 to-forge-surface-3 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Profit & Loss</p>
          <h3 className="mt-2 text-lg font-semibold text-forge-text-primary">Topline profitability</h3>
          <p className="mt-2 max-w-2xl text-sm text-forge-text-secondary">
            This gives you a cashflow-based read on the business using Zoho Books transactions for money in and money out.
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${
            available
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-forge-gold/30 bg-forge-gold/10 text-forge-gold'
          }`}
        >
          {available ? 'Live' : 'Awaiting Zoho cashflow'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2/90 p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Net Profit / Loss</p>
          <p className={`mt-3 text-3xl font-semibold ${available ? (isProfit ? 'text-emerald-300' : 'text-red-300') : 'text-forge-text-primary'}`}>
            {available ? formatMoney(profitCents) : 'Unavailable'}
          </p>
          <p className="mt-2 text-sm text-forge-text-secondary">
            {available
              ? 'Calculated from Zoho Books money in minus money out for the current six-month reporting window.'
              : 'Revenue is already flowing in. We still need a readable Zoho Books cashflow connection before this number becomes trustworthy.'}
          </p>
        </div>

        <div className="grid gap-4">
          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2/90 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Zoho Money In</p>
            <p className="mt-3 text-2xl font-semibold text-forge-text-primary">{formatMoney(revenueCents)}</p>
            <p className="mt-2 text-sm text-forge-text-secondary">
              Accounting-side inflows from Zoho Books bank transactions.
            </p>
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2/90 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Zoho Money Out</p>
            <p className="mt-3 text-2xl font-semibold text-forge-text-primary">{formatMoney(expenseCents)}</p>
            <p className="mt-2 text-sm text-forge-text-secondary">
              Accounting-side outflows and expense activity from Zoho Books.
            </p>
          </div>
        </div>
      </div>
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
  const [summary, setSummary] = useState<AccountingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadData() {
      setLoading(true)

      try {
        const summaryRes = await fetch('/api/accounting/summary', { cache: 'no-store' })
        const summaryData = await summaryRes.json().catch(() => ({}))

        if (!summaryRes.ok) throw new Error(summaryData.error ?? 'Failed to load finance dashboard')
        if (!active) return

        setSummary(summaryData.summary as AccountingSummary)
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
  }, [])

  if (loading) {
    return (
      <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
        Loading finance dashboard...
      </section>
    )
  }

  return (
    <section className="space-y-6 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
      <ProfitLossHeroCard
        available={summary?.reporting.profit_loss_available ?? false}
        profitCents={summary?.revenue.zoho_net_cents ?? 0}
        revenueCents={summary?.revenue.zoho_money_in_cents ?? 0}
        expenseCents={summary?.revenue.zoho_money_out_cents ?? 0}
      />

      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Finance</p>
          <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">Revenue And Profitability Dashboard</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            This page is the business view: money in, pending collections, revenue trends, and profitability readiness across FORGE and connected systems.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}

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
          label="Zoho Money In"
          value={formatMoney(summary?.revenue.zoho_money_in_cents ?? 0)}
          detail={summary?.integrations.zoho_books.last_test_status === 'connected' ? 'Live from Zoho Books' : 'Waiting on Zoho data'}
          icon={CreditCard}
        />
        <StatCard
          label="Zoho Money Out"
          value={formatMoney(summary?.revenue.zoho_money_out_cents ?? 0)}
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
              <p className="mt-3 text-2xl font-semibold text-forge-text-primary">
                {summary?.reporting.expenses_available ? formatMoney(summary?.revenue.zoho_money_out_cents ?? 0) : 'Unavailable'}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                {summary?.reporting.expenses_available
                  ? 'Pulled from Zoho Books bank transaction outflows.'
                  : 'Zoho expense, bill, or bank transaction data is not connected yet.'}
              </p>
            </div>
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Profit / Loss</p>
              <p className={`mt-3 text-2xl font-semibold ${
                summary?.reporting.profit_loss_available
                  ? (summary?.revenue.zoho_net_cents ?? 0) >= 0
                    ? 'text-emerald-300'
                    : 'text-red-300'
                  : 'text-forge-text-primary'
              }`}>
                {summary?.reporting.profit_loss_available ? formatMoney(summary?.revenue.zoho_net_cents ?? 0) : 'Unavailable'}
              </p>
              <p className="mt-2 text-sm text-forge-text-secondary">
                {summary?.reporting.profit_loss_available
                  ? 'Calculated from Zoho Books cash inflows minus outflows.'
                  : 'Profit requires both money-in and money-out. We only have reliable money-in right now.'}
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
              <p className="mt-2 text-sm text-forge-text-secondary">
                Cashflow tracked: {formatMoney(summary?.revenue.zoho_money_in_cents ?? 0)} in / {formatMoney(summary?.revenue.zoho_money_out_cents ?? 0)} out
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
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#28c76f" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#28c76f" stopOpacity={0.02} />
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
                <Area
                  type="monotone"
                  dataKey="profit_cents"
                  name="Zoho profit"
                  stroke="#28c76f"
                  strokeWidth={2}
                  fill="url(#profitFill)"
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
                <Bar dataKey="zoho_money_out_cents" name="Zoho out" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}
