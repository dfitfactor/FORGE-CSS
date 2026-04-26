'use client'

import { useEffect, useState } from 'react'

type SessionBank = {
  enrollmentId: string
  remaining: number
  allotted: number
  used: number
  graceExpires: string | null
  subscriptionStatus: string | null
  gracePeriodEndsAt: string | null
  lastRenewedAt: string | null
  nextRenewalAt: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  weeklyUsed: number
  weeklyLimit: number
  monthlyUsed: number
  monthlyLimit: number
  overrideLimits: boolean
  overrideExpiration: boolean
  overrideSetAt: string | null
  expired: boolean
}

type Enrollment = {
  id: string
  package_id?: string | null
  package_name?: string | null
  billing_type?: string | null
}

type PackageOption = {
  id: string
  name: string
  session_count: number
  price_cents: number
  billing_type: string
  billing_period_months: number | null
}

export function SessionBankCard({ clientId }: { clientId: string }) {
  const [bank, setBank] = useState<SessionBank | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [packages, setPackages] = useState<PackageOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [stripePriceId, setStripePriceId] = useState('')

  const selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId) ?? null

  function formatPrice(priceCents: number) {
    return `$${(priceCents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  async function loadPackages() {
    try {
      const res = await fetch('/api/packages', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load packages')

      const nextPackages = Array.isArray(data.packages) ? (data.packages as PackageOption[]) : []
      setPackages(nextPackages)
      setSelectedPackageId((current) => current || nextPackages[0]?.id || '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load packages')
    }
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/session-bank`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load session bank')
      setBank(data.bank ?? null)
      setEnrollment(data.enrollment ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load session bank')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    void loadPackages()
  }, [clientId])

  async function saveOverrides(next: { override_limits: boolean; override_expiration: boolean }) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/coach/clients/${clientId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update overrides')
      setMessage('Client override settings updated.')
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update overrides')
    } finally {
      setSaving(false)
    }
  }

  async function startRecurringBilling(enrollmentId: string) {
    const normalizedPriceId = stripePriceId.trim()
    if (!normalizedPriceId) {
      throw new Error('Stripe price ID is required to start recurring billing')
    }

    const res = await fetch('/api/stripe/subscription/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, priceId: normalizedPriceId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Failed to start recurring billing')
  }

  async function createEnrollment(startRecurring: boolean) {
    if (!selectedPackageId) {
      setError('Choose a package before assigning it to this client.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch(`/api/clients/${clientId}/package-enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackageId,
          startDate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to assign package')

      if (startRecurring) {
        await startRecurringBilling(data.enrollmentId)
        setMessage('Package assigned and recurring billing started.')
      } else {
        setMessage('Package assigned to client.')
      }

      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign package')
    } finally {
      setSaving(false)
    }
  }

  async function updateSubscription(action: 'cancel' | 'reactivate') {
    if (!bank?.enrollmentId) return

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch(`/api/stripe/subscription/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId: bank.enrollmentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action} subscription`)
      setMessage(action === 'cancel' ? 'Subscription set to cancel at period end.' : 'Subscription reactivated.')
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action} subscription`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="forge-card">Loading session bank...</div>
  }

  if (!enrollment || !bank) {
    return (
      <div className="forge-card space-y-5">
        <div>
          <h2 className="forge-section-title">Session Bank</h2>
          <p className="mt-2 text-sm text-forge-text-muted">Assign a package to legacy clients so they can use session tracking and recurring billing.</p>
        </div>

        {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div> : null}
        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-forge-text-secondary">
            <span className="block text-xs uppercase tracking-widest text-white/35">Package</span>
            <select
              value={selectedPackageId}
              disabled={saving || packages.length === 0}
              onChange={(event) => setSelectedPackageId(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
            >
              {packages.length === 0 ? <option value="">No packages available</option> : null}
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} - {formatPrice(pkg.price_cents)} - {pkg.session_count} sessions
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-forge-text-secondary">
            <span className="block text-xs uppercase tracking-widest text-white/35">Cycle Start Date</span>
            <input
              type="date"
              value={startDate}
              disabled={saving}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
            />
          </label>
        </div>

        {selectedPackage ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-forge-text-secondary">
            <div>{selectedPackage.name}</div>
            <div className="mt-2">Billing type: <span className="capitalize">{selectedPackage.billing_type.replace(/_/g, ' ')}</span></div>
            <div className="mt-2">Package price: {formatPrice(selectedPackage.price_cents)}</div>
            <div className="mt-2">Sessions included: {selectedPackage.session_count}</div>
          </div>
        ) : null}

        <label className="space-y-2 text-sm text-forge-text-secondary">
          <span className="block text-xs uppercase tracking-widest text-white/35">Stripe Price ID (optional)</span>
          <input
            type="text"
            value={stripePriceId}
            disabled={saving}
            onChange={(event) => setStripePriceId(event.target.value)}
            placeholder="price_..."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30"
          />
          <span className="block text-xs text-forge-text-muted">Use this when you want to move the client onto recurring Stripe billing right away.</span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving || !selectedPackageId}
            onClick={() => void createEnrollment(false)}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Assign Package
          </button>
          <button
            type="button"
            disabled={saving || !selectedPackageId}
            onClick={() => void createEnrollment(true)}
            className="rounded-xl border border-emerald-500/20 px-4 py-2 text-sm text-emerald-300 disabled:opacity-50"
          >
            Assign + Start Recurring Billing
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="forge-card space-y-5">
      <div>
        <h2 className="forge-section-title">Session Bank</h2>
        <p className="mt-2 text-sm text-forge-text-muted">Track remaining sessions, current cycle pressure, and coach overrides.</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs uppercase tracking-widest text-white/35">Remaining</div>
          <div className="mt-2 text-2xl font-semibold text-[#D4AF37]">{bank.remaining}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs uppercase tracking-widest text-white/35">Used</div>
          <div className="mt-2 text-2xl font-semibold text-white">{bank.used}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs uppercase tracking-widest text-white/35">Weekly</div>
          <div className="mt-2 text-2xl font-semibold text-white">{bank.weeklyUsed}/{bank.weeklyLimit}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs uppercase tracking-widest text-white/35">Monthly</div>
          <div className="mt-2 text-2xl font-semibold text-white">{bank.monthlyUsed}/{bank.monthlyLimit}</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-forge-text-secondary">
        {enrollment.package_name ? <div>Package: {enrollment.package_name}</div> : null}
        <div className="mt-2">Allotted this cycle: {bank.allotted}</div>
        <div className="mt-2">Sessions expire: {bank.graceExpires ? new Date(bank.graceExpires).toLocaleDateString('en-US') : 'Not set'}</div>
        <div className="mt-2">Subscription status: <span className="capitalize">{(bank.subscriptionStatus ?? 'active').replace(/_/g, ' ')}</span></div>
        <div className="mt-2">Next renewal: {bank.nextRenewalAt ? new Date(bank.nextRenewalAt).toLocaleDateString('en-US') : 'Not set'}</div>
        <div className="mt-2">Last renewed: {bank.lastRenewedAt ? new Date(bank.lastRenewedAt).toLocaleDateString('en-US') : 'Not set'}</div>
        {bank.gracePeriodEndsAt ? <div className="mt-2 text-amber-300">Grace period ends: {new Date(bank.gracePeriodEndsAt).toLocaleString('en-US')}</div> : null}
        {bank.expired ? <div className="mt-2 text-red-300">Current session bank is expired.</div> : null}
        {bank.overrideSetAt ? <div className="mt-2 text-forge-text-muted">Override last updated {new Date(bank.overrideSetAt).toLocaleString('en-US')}</div> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {!bank.stripeSubscriptionId ? (
          <div className="flex min-w-[280px] flex-1 flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <input
              type="text"
              value={stripePriceId}
              disabled={saving}
              onChange={(event) => setStripePriceId(event.target.value)}
              placeholder="Stripe price ID for recurring billing"
              className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                setError('')
                setMessage('')
                try {
                  await startRecurringBilling(bank.enrollmentId)
                  setMessage('Recurring billing started.')
                  await loadData()
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Failed to start recurring billing')
                } finally {
                  setSaving(false)
                }
              }}
              className="rounded-xl border border-emerald-500/20 px-4 py-2 text-sm text-emerald-300 disabled:opacity-50"
            >
              Start Recurring Billing
            </button>
          </div>
        ) : null}
        {bank.stripeSubscriptionId ? (
          <button
            type="button"
            disabled={saving || bank.subscriptionStatus === 'cancelled'}
            onClick={() => void updateSubscription('cancel')}
            className="rounded-xl border border-red-500/20 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
          >
            Cancel Subscription
          </button>
        ) : null}
        {bank.subscriptionStatus === 'paused' ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void updateSubscription('reactivate')}
            className="rounded-xl border border-emerald-500/20 px-4 py-2 text-sm text-emerald-300 disabled:opacity-50"
          >
            Reactivate Subscription
          </button>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Allow makeup sessions</div>
            <div className="mt-1 text-sm text-forge-text-muted">Bypass weekly and monthly limits for this client this cycle.</div>
          </div>
          <input type="checkbox" checked={bank.overrideLimits} disabled={saving} onChange={(event) => void saveOverrides({ override_limits: event.target.checked, override_expiration: bank.overrideExpiration })} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Extend sessions</div>
            <div className="mt-1 text-sm text-forge-text-muted">Prevent session expiration for this cycle.</div>
          </div>
          <input type="checkbox" checked={bank.overrideExpiration} disabled={saving} onChange={(event) => void saveOverrides({ override_limits: bank.overrideLimits, override_expiration: event.target.checked })} />
        </div>
      </div>
    </div>
  )
}
