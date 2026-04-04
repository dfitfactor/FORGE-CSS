'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Loader2, PauseCircle, ShieldAlert, TimerReset } from 'lucide-react'

type SessionBank = {
  enrollmentId: string
  billingPeriod: string
  allotted: number
  used: number
  forfeited: number
  returned: number
  remaining: number
  graceExpires: string | null
  isOnHold: boolean
  holdUntil: string | null
  weeklyUsed: number
  weeklyLimit: number
  canBook: boolean
  cannotBookReason: string | null
}

type Enrollment = {
  id: string
}

type ForfeitedEntitlement = {
  id: string
  booking_id: string | null
  forfeiture_reason: string | null
  updated_at: string | null
  booking_date: string | null
  booking_time: string | null
  service_name: string | null
}

type Hold = {
  id: string
  hold_type: string
  reason: string | null
  start_date: string
  end_date: string
  status: string
  package_name?: string | null
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(dateValue: string | null | undefined, timeValue: string | null | undefined) {
  if (!dateValue) return '—'
  const fallback = [dateValue, timeValue].filter(Boolean).join(' ')
  if (!timeValue) return formatDate(dateValue)
  const date = new Date(`${dateValue}T${timeValue}`)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function holdLabel(type: string) {
  if (type === 'illness') return 'Illness / Sick'
  if (type === 'medical') return 'Medical Leave'
  if (type === 'administrative') return 'Administrative'
  return 'Vacation'
}

function statusBadge(status: string) {
  if (status === 'active') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (status === 'completed') return 'border-white/10 bg-white/5 text-white/55'
  if (status === 'cancelled') return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (status === 'pending') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
  return 'border-white/10 bg-white/5 text-white/55'
}

export function SessionBankCard({ clientId }: { clientId: string }) {
  const [bank, setBank] = useState<SessionBank | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [forfeited, setForfeited] = useState<ForfeitedEntitlement[]>([])
  const [holds, setHolds] = useState<Hold[]>([])
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showHoldHistory, setShowHoldHistory] = useState(false)
  const [showOverrideModal, setShowOverrideModal] = useState<ForfeitedEntitlement | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [showHoldPanel, setShowHoldPanel] = useState(false)
  const [holdSaving, setHoldSaving] = useState(false)
  const [liftSaving, setLiftSaving] = useState(false)
  const [holdForm, setHoldForm] = useState({
    holdType: 'vacation',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    reason: '',
  })

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [bankRes, holdsRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/session-bank`, { cache: 'no-store' }),
        fetch(`/api/clients/${clientId}/holds`, { cache: 'no-store' }),
      ])
      const [bankData, holdsData] = await Promise.all([
        bankRes.json().catch(() => ({})),
        holdsRes.json().catch(() => ({})),
      ])

      if (!bankRes.ok) throw new Error(bankData.error ?? 'Failed to load session bank')
      if (!holdsRes.ok) throw new Error(holdsData.error ?? 'Failed to load holds')

      setBank(bankData.bank ?? null)
      setEnrollment(bankData.enrollment ?? null)
      setForfeited(Array.isArray(bankData.forfeitedEntitlements) ? bankData.forfeitedEntitlements : [])
      setActiveHoldId(bankData.activeHoldId ?? null)
      setHolds(Array.isArray(holdsData.holds) ? holdsData.holds : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load session bank')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [clientId])

  const progressWidth = useMemo(() => {
    if (!bank || bank.allotted <= 0) return '0%'
    return `${Math.min((bank.used / bank.allotted) * 100, 100)}%`
  }, [bank])

  const durationDays = useMemo(() => {
    const start = new Date(`${holdForm.startDate}T00:00:00`)
    const end = new Date(`${holdForm.endDate}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
    return Math.max(Math.round((end.getTime() - start.getTime()) / 86400000) + 1, 0)
  }, [holdForm.endDate, holdForm.startDate])

  const activeHold = holds.find((hold) => hold.status === 'active') ?? null

  async function onOverride() {
    if (!showOverrideModal || overrideReason.trim().length < 5) return
    setOverrideSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/session-bank/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entitlementId: showOverrideModal.id, overrideReason: overrideReason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to override forfeiture')
      setMessage('Forfeited session reinstated')
      setShowOverrideModal(null)
      setOverrideReason('')
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to override forfeiture')
    } finally {
      setOverrideSaving(false)
    }
  }

  async function onPlaceHold() {
    setHoldSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holdForm),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to place hold')
      setMessage(
        data.status === 'active'
          ? 'Hold placed and active'
          : data.status === 'approved'
            ? `Hold approved - starts ${formatDate(holdForm.startDate)}`
            : 'Hold request submitted for approval'
      )
      setShowHoldPanel(false)
      setHoldForm((current) => ({ ...current, reason: '' }))
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to place hold')
    } finally {
      setHoldSaving(false)
    }
  }

  async function onLiftHold() {
    const holdId = activeHoldId ?? activeHold?.id
    if (!holdId) return
    setLiftSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/holds/${holdId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lift' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to lift hold')
      setMessage('Hold lifted')
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to lift hold')
    } finally {
      setLiftSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="forge-card flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    )
  }

  if (!enrollment || !bank) {
    return (
      <div className="forge-card">
        <div className="flex items-center gap-2 text-white">
          <CalendarDays className="h-4 w-4 text-[#D4AF37]" />
          <h2 className="forge-section-title">Session Bank</h2>
        </div>
        <p className="mt-3 text-sm text-forge-text-muted">No active package enrollment found.</p>
      </div>
    )
  }

  return (
    <>
      <div className="forge-card space-y-5">
        {bank.isOnHold ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Enrollment paused · Resumes {formatDate(bank.holdUntil)}</div>
                <div className="text-xs text-amber-200/80 mt-1">Bookings are suspended while this hold is active.</div>
              </div>
              <button
                type="button"
                onClick={() => void onLiftHold()}
                disabled={liftSaving}
                className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
              >
                {liftSaving ? 'Lifting...' : 'Lift Hold Early'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-white">
          <CalendarDays className="h-4 w-4 text-[#D4AF37]" />
          <div>
            <h2 className="forge-section-title">Session Bank</h2>
            <p className="text-sm text-forge-text-muted mt-1">
              {new Date(`${bank.billingPeriod}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div> : null}

        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-white/75">
            <span>{bank.used} of {bank.allotted} sessions used</span>
            <span>{bank.remaining} remaining</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-[#D4AF37] transition-all" style={{ width: progressWidth }} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
            <div className="text-xs uppercase tracking-widest text-white/35">Allotted</div>
            <div className="mt-2 text-xl font-semibold text-white/75">{bank.allotted}</div>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-center">
            <div className="text-xs uppercase tracking-widest text-blue-200/60">Used</div>
            <div className="mt-2 text-xl font-semibold text-blue-300">{bank.used}</div>
          </div>
          <div className={`rounded-xl border px-4 py-3 text-center ${bank.remaining > 0 ? 'border-[#D4AF37]/20 bg-[#D4AF37]/10' : 'border-red-500/20 bg-red-500/10'}`}>
            <div className="text-xs uppercase tracking-widest text-white/45">Remaining</div>
            <div className={`mt-2 text-xl font-semibold ${bank.remaining > 0 ? 'text-[#D4AF37]' : 'text-red-300'}`}>{bank.remaining}</div>
          </div>
          {bank.forfeited > 0 ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center">
              <div className="text-xs uppercase tracking-widest text-red-200/60">Forfeited</div>
              <div className="mt-2 text-xl font-semibold text-red-300">{bank.forfeited}</div>
            </div>
          ) : null}
        </div>

        <div className={`text-sm ${bank.weeklyUsed >= bank.weeklyLimit && bank.weeklyLimit > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
          {bank.weeklyUsed} of {bank.weeklyLimit} sessions used this week
        </div>

        {bank.graceExpires && bank.remaining > 0 ? (
          <div className="text-sm text-amber-300">
            {bank.remaining} unused session{bank.remaining === 1 ? '' : 's'} expire {new Date(bank.graceExpires).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        ) : null}

        <div className={`flex items-center gap-2 text-sm ${bank.canBook ? 'text-emerald-300' : 'text-red-300'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${bank.canBook ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span>{bank.canBook ? 'Available to book' : bank.cannotBookReason}</span>
        </div>

        {bank.forfeited > 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
            <div className="flex items-center gap-2 text-white">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold">{bank.forfeited} session(s) forfeited</h3>
            </div>
            <div className="mt-3 space-y-3">
              {forfeited.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-white/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{item.service_name ?? 'Session entitlement'}</div>
                      <div className="mt-1 text-xs text-white/35">{item.forfeiture_reason ?? 'forfeited'} · {formatDateTime(item.booking_date, item.booking_time)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOverrideModal(item)}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:text-white"
                    >
                      Manager Override
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Hold / Pause</h3>
              <p className="mt-1 text-xs text-white/35">Pause the membership when travel, illness, or admin needs interrupt booking.</p>
            </div>
            {!bank.isOnHold ? (
              <button
                type="button"
                onClick={() => setShowHoldPanel(true)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:text-white"
              >
                Place on Hold
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowHoldHistory((current) => !current)}
            className="mt-4 text-xs text-white/55 hover:text-white"
          >
            {showHoldHistory ? 'Hide Hold History' : 'View Hold History'}
          </button>

          {showHoldHistory ? (
            <div className="mt-4 space-y-3">
              {holds.length > 0 ? holds.map((hold) => {
                const start = new Date(`${hold.start_date}T00:00:00`)
                const end = new Date(`${hold.end_date}T00:00:00`)
                const duration = Math.max(Math.round((end.getTime() - start.getTime()) / 86400000) + 1, 1)
                return (
                  <div key={hold.id} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-white/70">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70">{holdLabel(hold.hold_type)}</span>
                      <span className={`rounded-full border px-2 py-1 text-xs ${statusBadge(hold.status)}`}>{hold.status}</span>
                    </div>
                    <div className="mt-2 text-xs text-white/35">{formatDate(hold.start_date)} - {formatDate(hold.end_date)} · {duration} day{duration === 1 ? '' : 's'}</div>
                    <div className="mt-2 text-sm text-white/60 line-clamp-2">{hold.reason ?? 'No reason provided'}</div>
                  </div>
                )
              }) : <div className="text-sm text-white/40">No hold history yet.</div>}
            </div>
          ) : null}
        </div>
      </div>

      {showOverrideModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111111] p-6">
            <h3 className="text-lg font-semibold text-white">Manager Override</h3>
            <p className="mt-2 text-sm text-white/55">
              {showOverrideModal.forfeiture_reason ?? 'forfeited'} · {formatDateTime(showOverrideModal.booking_date, showOverrideModal.booking_time)}
            </p>
            <textarea
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              className="forge-input mt-4 min-h-[120px]"
              placeholder="Required reason for reinstating this forfeited session"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowOverrideModal(null); setOverrideReason('') }} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white">Cancel</button>
              <button type="button" onClick={() => void onOverride()} disabled={overrideSaving || overrideReason.trim().length < 5} className="forge-btn-gold disabled:opacity-50">
                {overrideSaving ? 'Overriding...' : 'Confirm Override'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showHoldPanel ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <button className="flex-1" onClick={() => setShowHoldPanel(false)} aria-label="Close hold panel" />
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#111111] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Place on Hold</h3>
                <p className="mt-1 text-sm text-white/45">Freeze the session bank and pause booking access.</p>
              </div>
              <button type="button" onClick={() => setShowHoldPanel(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:text-white">Close</button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="forge-label">Hold Type</label>
                <select className="forge-input" value={holdForm.holdType} onChange={(event) => setHoldForm((current) => ({ ...current, holdType: event.target.value }))}>
                  <option value="vacation">Vacation</option>
                  <option value="illness">Illness / Sick</option>
                  <option value="medical">Medical Leave</option>
                  <option value="administrative">Administrative</option>
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="forge-label">Start Date</label>
                  <input type="date" min={new Date().toISOString().slice(0, 10)} className="forge-input" value={holdForm.startDate} onChange={(event) => setHoldForm((current) => ({ ...current, startDate: event.target.value, endDate: current.endDate < event.target.value ? event.target.value : current.endDate }))} />
                </div>
                <div>
                  <label className="forge-label">End Date</label>
                  <input type="date" min={holdForm.startDate} className="forge-input" value={holdForm.endDate} onChange={(event) => setHoldForm((current) => ({ ...current, endDate: event.target.value }))} />
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm text-white/70">
                <div className="flex items-center gap-2"><TimerReset className="h-4 w-4 text-[#D4AF37]" /> Duration: {durationDays} day{durationDays === 1 ? '' : 's'}</div>
              </div>
              <div>
                <label className="forge-label">Reason</label>
                <textarea className="forge-input min-h-[140px]" value={holdForm.reason} onChange={(event) => setHoldForm((current) => ({ ...current, reason: event.target.value }))} />
              </div>
              <button type="button" onClick={() => void onPlaceHold()} disabled={holdSaving || holdForm.reason.trim().length < 10} className="forge-btn-gold w-full disabled:opacity-50">
                {holdSaving ? 'Submitting...' : 'Submit Hold Request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
