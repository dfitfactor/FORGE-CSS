'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Copy, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { formatDurationLabel } from '@/lib/booking'

type Booking = {
  id: string
  client_name: string
  client_email: string
  client_phone: string | null
  booking_date: string
  booking_time: string
  duration_minutes: number | null
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  payment_status: 'unpaid' | 'paid' | 'waived'
  attended: boolean | null
  notes: string | null
  service_name: string | null
  package_name: string | null
  google_calendar_event_id?: string | null
}

type BookingHistoryEntry = {
  id: string
  action: string
  payload: Record<string, unknown> | null
  created_at: string
}

const STATUS_OPTIONS = ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const

const STATUS_BADGES: Record<string, string> = {
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  confirmed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  completed: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-300',
  no_show: 'border-white/15 bg-white/5 text-white/55',
}

const PAYMENT_BADGES: Record<string, string> = {
  unpaid: 'border-red-500/30 bg-red-500/10 text-red-300',
  paid: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  waived: 'border-white/15 bg-white/5 text-white/55',
}

function startOfWeek(date: Date) {
  const copy = new Date(date)
  const day = copy.getDay()
  copy.setDate(copy.getDate() - day)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return end
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function shiftMonth(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function formatBookingDate(date: string, time: string) {
  const timestamp = new Date(`${date}T${time}`)
  if (Number.isNaN(timestamp.getTime())) return `${date} · ${time}`
  return timestamp.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function availableActions(status: Booking['status']) {
  const actions: Array<{ label: string; value: Booking['status'] }> = []
  if (status === 'pending') {
    actions.push({ label: 'Confirm', value: 'confirmed' }, { label: 'Cancel', value: 'cancelled' })
  }
  if (status === 'confirmed') {
    actions.push(
      { label: 'Mark Complete', value: 'completed' },
      { label: 'Mark No Show', value: 'no_show' },
      { label: 'Cancel', value: 'cancelled' }
    )
  }
  if (status === 'completed') actions.push({ label: 'Mark No Show', value: 'no_show' })
  if (status === 'no_show') actions.push({ label: 'Confirm', value: 'confirmed' }, { label: 'Cancel', value: 'cancelled' })
  if (status === 'cancelled') actions.push({ label: 'Confirm', value: 'confirmed' })
  return actions
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
      <div className="text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 font-mono text-xs uppercase tracking-widest text-white/35">{label}</div>
    </div>
  )
}

function DetailDrawer({
  booking,
  open,
  updating,
  history,
  historyLoading,
  form,
  onClose,
  onChange,
  onSave,
  onCopy,
}: {
  booking: Booking | null
  open: boolean
  updating: boolean
  history: BookingHistoryEntry[]
  historyLoading: boolean
  form: { booking_date: string; booking_time: string; payment_status: Booking['payment_status']; notes: string }
  onClose: () => void
  onChange: (field: 'booking_date' | 'booking_time' | 'payment_status' | 'notes', value: string) => void
  onSave: () => void
  onCopy: (value: string, label: string) => void
}) {
  if (!open || !booking) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button className="flex-1" onClick={onClose} aria-label="Close booking details" />
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#111111] p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white">Booking Details</h2>
            <p className="mt-2 text-lg font-semibold text-white">{booking.client_name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white">
            <XCircle size={18} />
          </button>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-white/35">Session</div>
            <div className="mt-2 text-base font-medium text-white">{booking.service_name ?? booking.package_name ?? 'Custom booking'}</div>
            <div className="mt-2 text-sm text-white/45">{formatDurationLabel(booking.duration_minutes)}</div>
            {booking.google_calendar_event_id ? (
              <div className="mt-3 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                Calendar linked
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-widest text-white/35">Contact</div>
              <div className="mt-3 space-y-3 text-sm text-white/70">
                <div>
                  <div className="text-white">{booking.client_email}</div>
                  <button onClick={() => onCopy(booking.client_email, 'Email')} className="mt-1 text-xs text-[#D4AF37] hover:text-white">Copy email</button>
                </div>
                <div>
                  <div className="text-white">{booking.client_phone || 'No phone on file'}</div>
                  {booking.client_phone ? <button onClick={() => onCopy(booking.client_phone ?? '', 'Phone')} className="mt-1 text-xs text-[#D4AF37] hover:text-white">Copy phone</button> : null}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-widest text-white/35">Status</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2 py-1 text-xs capitalize ${STATUS_BADGES[booking.status] ?? 'border-white/10 bg-white/5 text-white/55'}`}>{booking.status.replace('_', ' ')}</span>
                <span className={`rounded-full border px-2 py-1 text-xs capitalize ${PAYMENT_BADGES[booking.payment_status] ?? 'border-white/10 bg-white/5 text-white/55'}`}>{booking.payment_status}</span>
              </div>
              <div className="mt-3 text-sm text-white/45">
                {booking.attended === null ? 'Attendance not set' : booking.attended ? 'Marked attended' : 'Marked not attended'}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-white/35">Reschedule & Notes</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="forge-label">Booking Date</label>
                <input type="date" value={form.booking_date} onChange={(event) => onChange('booking_date', event.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Booking Time</label>
                <input type="time" value={form.booking_time} onChange={(event) => onChange('booking_time', event.target.value)} className="forge-input" />
              </div>
            </div>
            <div className="mt-4">
              <label className="forge-label">Payment Status</label>
              <select value={form.payment_status} onChange={(event) => onChange('payment_status', event.target.value)} className="forge-input">
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="waived">Waived</option>
              </select>
            </div>
            <div className="mt-4">
              <label className="forge-label">Notes</label>
              <textarea value={form.notes} onChange={(event) => onChange('notes', event.target.value)} className="forge-input min-h-[120px]" />
            </div>
            <button onClick={onSave} disabled={updating} className="forge-btn-gold mt-5 w-full disabled:opacity-50">
              {updating ? 'Saving...' : 'Save Booking Updates'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-white/35">Recent Changes</div>
            <div className="mt-4 space-y-3">
              {historyLoading ? (
                <div className="text-sm text-white/40">Loading history...</div>
              ) : history.length > 0 ? (
                history.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">{entry.action.replace('.', ' ')}</div>
                      <div className="text-xs text-white/35">{new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                    {entry.payload && Object.keys(entry.payload).length > 0 ? (
                      <div className="mt-2 text-xs text-white/45">
                        {Object.entries(entry.payload).map(([key, value]) => `${key}: ${String(value ?? '')}`).join(' · ')}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/40">No booking changes logged yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))
  const [hasInitializedMonth, setHasInitializedMonth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null)
  const [detailHistory, setDetailHistory] = useState<BookingHistoryEntry[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailForm, setDetailForm] = useState({
    booking_date: '',
    booking_time: '',
    payment_status: 'unpaid' as Booking['payment_status'],
    notes: '',
  })
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)

  async function loadBookings() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/bookings', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load bookings')
      const nextBookings = Array.isArray(data.bookings) ? data.bookings : []
      setBookings(nextBookings)

      if (!hasInitializedMonth) {
        const currentMonthStart = startOfMonth(new Date())
        const currentMonthEnd = endOfMonth(currentMonthStart)
        const hasCurrentMonthBookings = nextBookings.some((booking: Booking) => {
          const timestamp = new Date(`${booking.booking_date}T${booking.booking_time}`)
          return timestamp >= currentMonthStart && timestamp < currentMonthEnd
        })

        if (!hasCurrentMonthBookings && nextBookings.length > 0) {
          const latestBooking = [...nextBookings].sort((left, right) => (
            new Date(`${right.booking_date}T${right.booking_time}`).getTime() -
            new Date(`${left.booking_date}T${left.booking_time}`).getTime()
          ))[0]

          if (latestBooking) {
            setSelectedMonth(startOfMonth(new Date(`${latestBooking.booking_date}T12:00:00`)))
          }
        }

        setHasInitializedMonth(true)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBookings()
  }, [])

  async function openBookingDetails(booking: Booking) {
    setDetailBooking(booking)
    setDetailForm({
      booking_date: booking.booking_date,
      booking_time: booking.booking_time,
      payment_status: booking.payment_status,
      notes: booking.notes ?? '',
    })
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load booking details')
      if (data.booking) {
        setDetailBooking(data.booking)
        setDetailForm({
          booking_date: data.booking.booking_date,
          booking_time: data.booking.booking_time,
          payment_status: data.booking.payment_status,
          notes: data.booking.notes ?? '',
        })
      }
      setDetailHistory(Array.isArray(data.history) ? data.history : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load booking details')
    } finally {
      setDetailLoading(false)
    }
  }

  async function updateBookingStatus(bookingId: string, status: Booking['status']) {
    setUpdating(bookingId)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setBookings((prev) => prev.map((booking) => (
          booking.id === bookingId ? { ...booking, status } : booking
        )))
        if (detailBooking?.id === bookingId) {
          setDetailBooking((current) => current ? { ...current, status } : current)
        }
        if (data.message) {
          window.alert(data.message)
        }
        setSuccess(`Booking ${status.replace('_', ' ')} successfully.`)
        await loadBookings()
      } else {
        window.alert(data.error || 'Action failed')
      }
    } catch {
      window.alert('Network error — please try again')
    } finally {
      setUpdating(null)
    }
  }

  async function copyBookingLink() {
    try {
      await navigator.clipboard.writeText('https://forge-css.vercel.app/book')
      setCopied(true)
      setSuccess('Booking page link copied.')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Unable to copy booking page link')
    }
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setSuccess(`${label} copied.`)
    } catch {
      setError(`Unable to copy ${label.toLowerCase()}`)
    }
  }

  async function saveBookingDetails() {
    if (!detailBooking) return
    setUpdating(detailBooking.id)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/bookings/${detailBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: detailForm.booking_date,
          booking_time: detailForm.booking_time,
          payment_status: detailForm.payment_status,
          notes: detailForm.notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update booking details')

      await loadBookings()
      if (detailBooking) {
        void openBookingDetails({ ...detailBooking, booking_date: detailForm.booking_date, booking_time: detailForm.booking_time, payment_status: detailForm.payment_status, notes: detailForm.notes.trim() || null })
      }
      setDetailBooking((current) => current ? {
        ...current,
        booking_date: detailForm.booking_date,
        booking_time: detailForm.booking_time,
        payment_status: detailForm.payment_status,
        notes: detailForm.notes.trim() || null,
      } : null)
      setSuccess('Booking details updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update booking details')
    } finally {
      setUpdating(null)
    }
  }

  const monthBookings = useMemo(() => {
    const monthStart = startOfMonth(selectedMonth)
    const monthEnd = endOfMonth(selectedMonth)

    return bookings.filter((booking) => {
      const timestamp = new Date(`${booking.booking_date}T${booking.booking_time}`)
      return timestamp >= monthStart && timestamp < monthEnd
    })
  }, [bookings, selectedMonth])

  const filteredBookings = useMemo(() => {
    return monthBookings.filter((booking) => {
      if (statusFilter !== 'all' && booking.status !== statusFilter) return false
      if (!search.trim()) return true
      const query = search.trim().toLowerCase()
      return booking.client_name.toLowerCase().includes(query) || booking.client_email.toLowerCase().includes(query)
    })
  }, [monthBookings, search, statusFilter])

  const stats = useMemo(() => {
    const now = new Date()
    const todayKey = now.toISOString().slice(0, 10)
    const weekStart = startOfWeek(now)
    const weekEnd = endOfWeek(now)
    const monthStart = startOfMonth(selectedMonth)
    const monthEnd = endOfMonth(selectedMonth)

    const withDates = bookings.map((booking) => ({
      ...booking,
      timestamp: new Date(`${booking.booking_date}T${booking.booking_time}`),
    }))

    return {
      today: withDates.filter((booking) => booking.booking_date === todayKey).length,
      week: withDates.filter((booking) => booking.timestamp >= weekStart && booking.timestamp < weekEnd).length,
      pending: withDates.filter((booking) => booking.status === 'pending' && booking.timestamp >= monthStart && booking.timestamp < monthEnd).length,
      completedMonth: withDates.filter((booking) => booking.status === 'completed' && booking.timestamp >= monthStart && booking.timestamp < monthEnd).length,
    }
  }, [bookings, selectedMonth])

  const latestBookingMonth = useMemo(() => {
    if (bookings.length === 0) return null
    const latestBooking = [...bookings].sort((left, right) => (
      new Date(`${right.booking_date}T${right.booking_time}`).getTime() -
      new Date(`${left.booking_date}T${left.booking_time}`).getTime()
    ))[0]
    return latestBooking ? startOfMonth(new Date(`${latestBooking.booking_date}T12:00:00`)) : null
  }, [bookings])

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Bookings</h1>
          <p className="mt-1 text-sm text-white/40">Manage booking requests, confirmations, and attendance.</p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111111] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/35">Viewing Month</div>
              <div className="mt-2 text-lg font-semibold text-white">{formatMonthLabel(selectedMonth)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedMonth((current) => shiftMonth(current, -1))}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
              >
                Previous Month
              </button>
              <button
                onClick={() => setSelectedMonth(startOfMonth(new Date()))}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
              >
                Current Month
              </button>
              <button
                onClick={() => setSelectedMonth((current) => shiftMonth(current, 1))}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
              >
                Next Month
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{success}</div> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Today's Bookings" value={stats.today} />
          <StatCard label="This Week" value={stats.week} />
          <StatCard label={`Pending In ${selectedMonth.toLocaleDateString('en-US', { month: 'short' })}`} value={stats.pending} />
          <StatCard label={`Completed In ${selectedMonth.toLocaleDateString('en-US', { month: 'short' })}`} value={stats.completedMonth} />
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111111] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => setStatusFilter(option)}
                  className={`rounded-xl px-3 py-2 text-sm capitalize transition-colors ${statusFilter === option ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/60 hover:text-white'}`}
                >
                  {option === 'all' ? 'All' : option.replace('_', ' ')}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by client name or email"
              className="forge-input w-full max-w-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-white/20" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#111111] p-12 text-center">
            <XCircle className="mx-auto h-10 w-10 text-white/20" />
            <h2 className="mt-4 text-lg font-semibold text-white">No bookings for {formatMonthLabel(selectedMonth)}</h2>
            <p className="mt-2 text-sm text-white/40">
              {bookings.length > 0
                ? 'Bookings exist in other months. Jump to the latest booking month or choose another month above.'
                : 'Try another month or share the public booking page to start collecting requests.'}
            </p>
            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {bookings.length > 0 && latestBookingMonth ? (
                <button
                  onClick={() => setSelectedMonth(latestBookingMonth)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
                >
                  Jump To Latest Booking
                </button>
              ) : null}
              <button onClick={() => void copyBookingLink()} className="forge-btn-gold inline-flex items-center gap-2">
                <Copy size={15} />
                {copied ? 'Copied booking link' : 'Copy booking page link'}
              </button>
              <Link href="/book" target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white">
                <ExternalLink size={15} />
                View booking page
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#111111]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Service / Package</th>
                    <th className="px-4 py-3">Date &amp; Time</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-white/6 align-top text-white/70">
                      <td className="px-4 py-4">
                        <div className="font-medium text-white">{booking.client_name}</div>
                        <div className="mt-1 text-xs text-white/35">{booking.client_email}</div>
                      </td>
                      <td className="px-4 py-4 text-white/60">{booking.service_name ?? booking.package_name ?? 'Custom booking'}</td>
                      <td className="px-4 py-4 text-white/60">{formatBookingDate(booking.booking_date, booking.booking_time)}</td>
                      <td className="px-4 py-4 text-white/60">{formatDurationLabel(booking.duration_minutes)}</td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full border px-2 py-1 text-xs capitalize ${STATUS_BADGES[booking.status] ?? 'border-white/10 bg-white/5 text-white/55'}`}>
                          {booking.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full border px-2 py-1 text-xs capitalize ${PAYMENT_BADGES[booking.payment_status] ?? 'border-white/10 bg-white/5 text-white/55'}`}>
                          {booking.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void openBookingDetails(booking)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:text-white"
                          >
                            View
                          </button>
                          <details className="group relative inline-block text-left">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:text-white">
                              Actions
                              <ChevronDown size={14} className="transition group-open:rotate-180" />
                            </summary>
                            <div className="absolute right-0 z-10 mt-2 min-w-[180px] rounded-xl border border-white/10 bg-[#0d0d0d] p-2 shadow-2xl">
                              {availableActions(booking.status).length > 0 ? (
                                availableActions(booking.status).map((action) => {
                                  const isUpdating = updating === booking.id
                                  return (
                                    <button
                                      key={action.value}
                                      onClick={() => void updateBookingStatus(booking.id, action.value)}
                                      disabled={updating === booking.id}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-50"
                                    >
                                      {isUpdating ? (
                                        <Loader2 size={14} className="animate-spin" />
                                      ) : action.value === 'completed' ? (
                                        <CheckCircle2 size={14} />
                                      ) : (
                                        <span className="h-2 w-2 rounded-full bg-[#D4AF37]" />
                                      )}
                                      {isUpdating ? 'Updating...' : action.label}
                                    </button>
                                  )
                                })
                              ) : (
                                <div className="px-3 py-2 text-xs text-white/35">No actions available</div>
                              )}
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <DetailDrawer
        booking={detailBooking}
        open={Boolean(detailBooking)}
        updating={updating === detailBooking?.id}
        history={detailHistory}
        historyLoading={detailLoading}
        form={detailForm}
        onClose={() => { setDetailBooking(null); setDetailHistory([]) }}
        onChange={(field, value) => setDetailForm((current) => ({ ...current, [field]: value }))}
        onSave={() => void saveBookingDetails()}
        onCopy={(value, label) => void copyValue(value, label)}
      />
    </div>
  )
}
