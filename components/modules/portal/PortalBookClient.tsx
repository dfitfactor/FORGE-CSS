'use client'

import { useEffect, useMemo, useState } from 'react'

type SessionBank = {
  remaining: number
  expired: boolean
  graceExpires: string | null
  weeklyLimit: number
  monthlyLimit: number
  weeklyUsed: number
  monthlyUsed: number
}

type Slot = {
  id: string
  date: string
  start_time: string
  end_time: string
}

function formatDay(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(value: string) {
  return value.slice(0, 5)
}

export default function PortalBookClient({
  initialBank,
}: {
  initialBank: SessionBank | null
}) {
  const [bank, setBank] = useState<SessionBank | null>(initialBank)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadSlots() {
      setLoading(true)
      try {
        const res = await fetch('/api/availability/slots', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load slots')
        setSlots(Array.isArray(data.slots) ? data.slots : [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load slots')
      } finally {
        setLoading(false)
      }
    }

    void loadSlots()
  }, [])

  const groupedSlots = useMemo(() => {
    return slots.reduce<Record<string, Slot[]>>((accumulator, slot) => {
      accumulator[slot.date] = [...(accumulator[slot.date] ?? []), slot]
      return accumulator
    }, {})
  }, [slots])

  async function confirmBooking() {
    if (!selectedSlot) return
    setBooking(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/portal/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilityId: selectedSlot.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to book session')

      setBank((current) => current ? { ...current, remaining: data.sessions_remaining } : current)
      setSlots((current) => current.filter((slot) => slot.id !== selectedSlot.id))
      setSelectedSlot(null)
      setMessage('Session request submitted. One session was deducted immediately.')
    } catch (err: unknown) {
      const next = err instanceof Error ? err.message : 'Failed to book session'
      setError(next === 'weekly_limit' ? 'Weekly booking limit reached.' : next === 'monthly_limit' ? 'Monthly booking limit reached.' : next)
    } finally {
      setBooking(false)
    }
  }

  const cannotBook = !bank || bank.remaining <= 0 || bank.expired

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: 'var(--app-text)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Book a Session</h1>
        <div style={{ color: 'var(--app-text-secondary)', fontSize: 14 }}>
          Sessions remaining: <strong style={{ color: 'var(--app-gold)' }}>{bank?.remaining ?? 0}</strong>
        </div>
        {bank?.graceExpires ? (
          <div style={{ color: 'var(--app-text-muted)', fontSize: 13, marginTop: 8 }}>
            Session balance expires on {new Date(bank.graceExpires).toLocaleDateString('en-US')}
          </div>
        ) : null}
      </section>

      {message ? <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', padding: '14px 16px', fontSize: 14 }}>{message}</div> : null}
      {error ? <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', padding: '14px 16px', fontSize: 14 }}>{error}</div> : null}

      {cannotBook ? (
        <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
          <div style={{ color: 'var(--app-text)', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No sessions remaining</div>
          <div style={{ color: 'var(--app-text-secondary)', fontSize: 14 }}>
            {bank?.expired ? 'Your session balance has expired for this cycle.' : 'Your current session bank is empty.'}
          </div>
        </section>
      ) : loading ? (
        <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, color: 'var(--app-text-secondary)' }}>
          Loading available slots...
        </section>
      ) : (
        <section style={{ display: 'grid', gap: 16 }}>
          {Object.entries(groupedSlots).map(([date, dateSlots]) => (
            <div key={date} style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
              <div style={{ color: 'var(--app-text)', fontSize: 16, fontWeight: 600, marginBottom: 14 }}>{formatDay(date)}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {dateSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'var(--app-surface-muted)',
                      color: 'var(--app-text)',
                      padding: '14px 16px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{formatTime(slot.start_time)} - {formatTime(slot.end_time)}</span>
                    <span style={{ color: 'var(--app-gold)' }}>Select</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {selectedSlot ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', padding: 24 }}>
            <h2 style={{ color: 'var(--app-text)', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Confirm Session Request</h2>
            <div style={{ color: 'var(--app-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              <div><strong>Date:</strong> {formatDay(selectedSlot.date)}</div>
              <div><strong>Time:</strong> {formatTime(selectedSlot.start_time)} - {formatTime(selectedSlot.end_time)}</div>
              <div><strong>Sessions remaining after deduction:</strong> {Math.max((bank?.remaining ?? 1) - 1, 0)}</div>
            </div>
            <div style={{ marginTop: 16, borderRadius: 12, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: '#f6dfa1', padding: '12px 14px', fontSize: 13 }}>
              1 session will be deducted immediately. Sessions are not restored on cancellation.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button type="button" onClick={() => setSelectedSlot(null)} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--app-text-secondary)', padding: '10px 14px', cursor: 'pointer' }}>
                Close
              </button>
              <button type="button" onClick={() => void confirmBooking()} disabled={booking} style={{ borderRadius: 10, border: 'none', background: 'var(--app-gold)', color: '#111', padding: '10px 16px', fontWeight: 700, cursor: 'pointer', opacity: booking ? 0.65 : 1 }}>
                {booking ? 'Submitting...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

