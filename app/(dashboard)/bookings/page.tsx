'use client'

import { useEffect, useMemo, useState } from 'react'

type Booking = {
  id: string
  client_name: string
  booking_date: string
  booking_time: string
  status: string
  package_name: string | null
  service_name: string | null
}

function formatDateTime(booking: Booking) {
  return new Date(`${booking.booking_date}T${booking.booking_time.slice(0, 5)}:00`).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadBookings() {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load bookings')
      setBookings(Array.isArray(data.bookings) ? data.bookings : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBookings()
  }, [])

  const pending = useMemo(() => bookings.filter((booking) => booking.status === 'pending_confirmation'), [bookings])
  const other = useMemo(() => bookings.filter((booking) => booking.status !== 'pending_confirmation'), [bookings])

  async function handleAction(bookingId: string, action: 'confirm' | 'decline') {
    setSavingId(bookingId)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/portal/book/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action} booking`)
      setMessage(action === 'confirm' ? 'Booking confirmed.' : 'Booking declined and session restored.')
      await loadBookings()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action} booking`)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-forge-surface p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">Bookings</h1>
          <p className="mt-1 text-sm text-forge-text-muted">Review pending client session requests and active booking history.</p>
        </div>

        {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div> : null}
        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}

        <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-forge-text-muted">Pending Confirmation</div>
              <div className="mt-2 text-2xl font-semibold text-forge-text-primary">{pending.length}</div>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-forge-text-muted">Loading bookings...</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-forge-text-muted">No pending session requests.</div>
          ) : (
            <div className="space-y-3">
              {pending.map((booking) => (
                <div key={booking.id} className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-base font-semibold text-forge-text-primary">{booking.client_name}</div>
                      <div className="mt-1 text-sm text-forge-text-secondary">{formatDateTime(booking)}</div>
                      <div className="mt-1 text-sm text-forge-text-muted">{booking.package_name ?? booking.service_name ?? 'Session'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void handleAction(booking.id, 'confirm')} disabled={savingId === booking.id} className="forge-btn-gold disabled:opacity-50">
                        {savingId === booking.id ? 'Saving...' : 'Confirm'}
                      </button>
                      <button onClick={() => void handleAction(booking.id, 'decline')} disabled={savingId === booking.id} className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
          <div className="mb-4 text-xs uppercase tracking-widest text-forge-text-muted">All Other Bookings</div>
          <div className="space-y-3">
            {other.map((booking) => (
              <div key={booking.id} className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-base font-semibold text-forge-text-primary">{booking.client_name}</div>
                    <div className="mt-1 text-sm text-forge-text-secondary">{formatDateTime(booking)}</div>
                    <div className="mt-1 text-sm text-forge-text-muted">{booking.package_name ?? booking.service_name ?? 'Session'}</div>
                  </div>
                  <div className="rounded-full border border-forge-border bg-forge-surface px-3 py-1 text-xs uppercase tracking-wide text-forge-text-secondary">
                    {booking.status.replace(/_/g, ' ')}
                  </div>
                </div>
                {booking.status === 'declined' ? <div className="mt-3 text-sm text-emerald-300">Session restored to client bank.</div> : null}
              </div>
            ))}
            {!loading && other.length === 0 ? <div className="text-sm text-forge-text-muted">No other bookings yet.</div> : null}
          </div>
        </section>
      </div>
    </div>
  )
}

