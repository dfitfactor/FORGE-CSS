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
}

export function SessionBankCard({ clientId }: { clientId: string }) {
  const [bank, setBank] = useState<SessionBank | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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
    return <div className="forge-card">No active package enrollment found.</div>
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
        <div>Allotted this cycle: {bank.allotted}</div>
        <div className="mt-2">Sessions expire: {bank.graceExpires ? new Date(bank.graceExpires).toLocaleDateString('en-US') : 'Not set'}</div>
        <div className="mt-2">Subscription status: <span className="capitalize">{(bank.subscriptionStatus ?? 'active').replace(/_/g, ' ')}</span></div>
        <div className="mt-2">Next renewal: {bank.nextRenewalAt ? new Date(bank.nextRenewalAt).toLocaleDateString('en-US') : 'Not set'}</div>
        <div className="mt-2">Last renewed: {bank.lastRenewedAt ? new Date(bank.lastRenewedAt).toLocaleDateString('en-US') : 'Not set'}</div>
        {bank.gracePeriodEndsAt ? <div className="mt-2 text-amber-300">Grace period ends: {new Date(bank.gracePeriodEndsAt).toLocaleString('en-US')}</div> : null}
        {bank.expired ? <div className="mt-2 text-red-300">Current session bank is expired.</div> : null}
        {bank.overrideSetAt ? <div className="mt-2 text-forge-text-muted">Override last updated {new Date(bank.overrideSetAt).toLocaleString('en-US')}</div> : null}
      </div>

      <div className="flex flex-wrap gap-3">
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

