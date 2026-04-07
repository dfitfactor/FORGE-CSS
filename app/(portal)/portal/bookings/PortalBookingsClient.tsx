'use client'

import { useMemo, useState } from 'react'

type Booking = {
  id: string
  booking_date: string
  booking_time: string
  scheduled_at?: string | null
  status: string
  item_name: string
}

const ORDER = ['pending_confirmation', 'confirmed', 'completed', 'cancelled', 'declined', 'no_show']

function formatDateTime(booking: Booking) {
  const timestamp = new Date(`${booking.booking_date}T${booking.booking_time.slice(0, 5)}:00`)
  return timestamp.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function canCancel(booking: Booking) {
  if (booking.status !== 'confirmed') return false
  const hoursUntil = (new Date(`${booking.booking_date}T${booking.booking_time.slice(0, 5)}:00`).getTime() - Date.now()) / (1000 * 60 * 60)
  return hoursUntil >= 24
}

export default function PortalBookingsClient({ initialBookings }: { initialBookings: Booking[] }) {
  const [bookings, setBookings] = useState(initialBookings)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const groups = useMemo(() => {
    return ORDER.map((status) => ({
      status,
      bookings: bookings.filter((booking) => booking.status === status),
    })).filter((group) => group.bookings.length > 0)
  }, [bookings])

  async function cancelBooking() {
    if (!selectedBooking) return
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/portal/book/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: selectedBooking.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to cancel booking')

      setBookings((current) => current.map((booking) => booking.id === selectedBooking.id ? { ...booking, status: 'cancelled' } : booking))
      setSelectedBooking(null)
      setMessage('Session cancelled. Your session was forfeited per policy.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel booking')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: 'var(--app-text)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>My Bookings</h1>
        <p style={{ color: 'var(--app-text-secondary)', fontSize: 14, margin: 0 }}>
          Track your pending confirmations, upcoming confirmed sessions, and booking history.
        </p>
      </section>

      {message ? <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', padding: '14px 16px', fontSize: 14 }}>{message}</div> : null}
      {error ? <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', padding: '14px 16px', fontSize: 14 }}>{error}</div> : null}

      <section style={{ display: 'grid', gap: 16 }}>
        {groups.length === 0 ? (
          <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, color: 'var(--app-text-secondary)' }}>
            No bookings yet.
          </div>
        ) : groups.map((group) => (
          <div key={group.status} style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
            <div style={{ color: 'var(--app-gold)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
              {group.status.replace(/_/g, ' ')}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {group.bookings.map((booking) => (
                <div key={booking.id} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'var(--app-surface-muted)', padding: 16 }}>
                  <div style={{ color: 'var(--app-text)', fontSize: 16, fontWeight: 600 }}>{booking.item_name}</div>
                  <div style={{ color: 'var(--app-text-secondary)', fontSize: 14, marginTop: 6 }}>{formatDateTime(booking)}</div>
                  {booking.status === 'declined' ? <div style={{ color: '#6ee7b7', fontSize: 13, marginTop: 10 }}>Session restored to your bank.</div> : null}
                  {canCancel(booking) ? (
                    <button type="button" onClick={() => setSelectedBooking(booking)} style={{ marginTop: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)', background: 'transparent', color: '#fca5a5', padding: '10px 14px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  ) : booking.status === 'confirmed' ? (
                    <div style={{ color: 'var(--app-text-muted)', fontSize: 13, marginTop: 10 }}>Cancellation window passed</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {selectedBooking ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', padding: 24 }}>
            <h2 style={{ color: 'var(--app-text)', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Cancel Session</h2>
            <div style={{ color: 'var(--app-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              <div>{selectedBooking.item_name}</div>
              <div>{formatDateTime(selectedBooking)}</div>
            </div>
            <div style={{ marginTop: 16, borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '12px 14px', fontSize: 13 }}>
              Cancelling will forfeit this session.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button type="button" onClick={() => setSelectedBooking(null)} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--app-text-secondary)', padding: '10px 14px', cursor: 'pointer' }}>
                Close
              </button>
              <button type="button" onClick={() => void cancelBooking()} disabled={saving} style={{ borderRadius: 10, border: 'none', background: 'var(--app-gold)', color: '#111', padding: '10px 16px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.65 : 1 }}>
                {saving ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

