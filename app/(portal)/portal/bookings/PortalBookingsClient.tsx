'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List, Loader2 } from 'lucide-react'

type Booking = {
  id: string
  booking_date: string
  booking_time: string
  duration_minutes: number | null
  status: string
  payment_status: string | null
  notes: string | null
  item_name: string
}

type Slot = {
  value: string
  label: string
}

type ViewMode = 'list' | 'calendar'

function badgeColors(status: string) {
  if (status === 'confirmed') return { background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)' }
  if (status === 'completed') return { background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.35)' }
  if (status === 'cancelled' || status === 'no_show') return { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' }
  if (status === 'approved' || status === 'rescheduled') return { background: 'rgba(212,175,55,0.12)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.35)' }
  return { background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)' }
}

function canModifyBooking(booking: Booking) {
  if (!['pending', 'approved', 'confirmed', 'rescheduled'].includes(booking.status)) return false
  const hoursUntil = (new Date(`${booking.booking_date}T${booking.booking_time.slice(0, 5)}:00`).getTime() - Date.now()) / (1000 * 60 * 60)
  return hoursUntil >= 24
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function startOfCalendar(date: Date) {
  const monthStart = startOfMonth(date)
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() - monthStart.getDay())
}

function endOfCalendar(date: Date) {
  const monthEnd = endOfMonth(date)
  return new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + (6 - monthEnd.getDay()))
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function toBookingDate(booking: Booking) {
  return new Date(`${booking.booking_date}T12:00:00`)
}

export default function PortalBookingsClient({
  initialBookings,
}: {
  initialBookings: Booking[]
}) {
  const [bookings, setBookings] = useState(initialBookings)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedWindow, setSelectedWindow] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  const [selectedTime, setSelectedTime] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))

  const grouped = useMemo(() => {
    return {
      upcoming: bookings.filter((booking) => ['pending', 'approved', 'confirmed', 'rescheduled'].includes(booking.status)),
      history: bookings.filter((booking) => ['completed', 'cancelled', 'no_show'].includes(booking.status)),
    }
  }, [bookings])

  const calendarDays = useMemo(() => {
    const days: Date[] = []
    const cursor = startOfCalendar(selectedMonth)
    const calendarEnd = endOfCalendar(selectedMonth)
    while (cursor <= calendarEnd) {
      days.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return days
  }, [selectedMonth])

  const bookingsByDay = useMemo(() => {
    return calendarDays.map((day) => bookings.filter((booking) => sameDay(toBookingDate(booking), day)))
  }, [bookings, calendarDays])

  async function refreshBookings() {
    const res = await fetch('/api/portal/bookings', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (res.ok && Array.isArray(data.bookings)) {
      setBookings(data.bookings)
    }
  }

  async function handleCancel(bookingId: string) {
    setActiveBookingId(bookingId)
    setMessage('')
    setError('')
    try {
      const res = await fetch(`/api/portal/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to cancel booking')
      setMessage(data.message ?? 'Booking cancelled.')
      await refreshBookings()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel booking')
    } finally {
      setActiveBookingId(null)
    }
  }

  async function loadSlots(booking: Booking, nextDate: string, nextWindow: 'morning' | 'afternoon' | 'evening') {
    setSlotsLoading(true)
    setError('')
    try {
      const duration = booking.duration_minutes ?? 60
      const res = await fetch(`/api/public/availability?date=${encodeURIComponent(nextDate)}&duration=${duration}&period=${nextWindow}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load availability')
      setSlots(Array.isArray(data.slots) ? data.slots : [])
      setSelectedTime('')
      if (!Array.isArray(data.slots) || data.slots.length === 0) {
        setError(data.reason ?? 'No open times in this window.')
      }
    } catch (err: unknown) {
      setSlots([])
      setError(err instanceof Error ? err.message : 'Failed to load availability')
    } finally {
      setSlotsLoading(false)
    }
  }

  async function handleReschedule(booking: Booking) {
    if (!selectedDate || !selectedTime) {
      setError('Choose a new date and available time first.')
      return
    }

    setActiveBookingId(booking.id)
    setMessage('')
    setError('')
    try {
      const res = await fetch(`/api/portal/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reschedule',
          bookingDate: selectedDate,
          bookingTime: selectedTime,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to reschedule booking')
      setMessage(data.message ?? 'Reschedule request saved.')
      setReschedulingId(null)
      setSelectedDate('')
      setSelectedTime('')
      setSlots([])
      await refreshBookings()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reschedule booking')
    } finally {
      setActiveBookingId(null)
    }
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      {message ? <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', padding: '14px 16px', fontSize: 14 }}>{message}</div> : null}
      {error ? <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', padding: '14px 16px', fontSize: 14 }}>{error}</div> : null}

      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>My Sessions</h1>
            <p style={{ color: '#777', fontSize: 14, marginBottom: 0 }}>
              View your booked sessions, upcoming requests, and make changes more than 24 hours in advance.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              style={{
                borderRadius: 10,
                border: viewMode === 'list' ? '1px solid rgba(212,175,55,0.45)' : '1px solid rgba(255,255,255,0.1)',
                background: viewMode === 'list' ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: viewMode === 'list' ? '#D4AF37' : '#ddd',
                padding: '10px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <List size={16} />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              style={{
                borderRadius: 10,
                border: viewMode === 'calendar' ? '1px solid rgba(212,175,55,0.45)' : '1px solid rgba(255,255,255,0.1)',
                background: viewMode === 'calendar' ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: viewMode === 'calendar' ? '#D4AF37' : '#ddd',
                padding: '10px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <CalendarDays size={16} />
              Calendar
            </button>
          </div>
        </div>
      </section>

      {viewMode === 'calendar' ? (
        <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Calendar</div>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>
                {selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedMonth((current) => addMonths(current, -1))}
                style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#ddd', padding: '10px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth(startOfMonth(new Date()))}
                style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#ddd', padding: '10px 12px', cursor: 'pointer' }}
              >
                Current Month
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth((current) => addMonths(current, 1))}
                style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#ddd', padding: '10px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 760, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} style={{ padding: '12px 10px', textAlign: 'center', color: '#777', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {day}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {calendarDays.map((day, index) => {
                  const dayBookings = bookingsByDay[index]
                  const inMonth = day.getMonth() === selectedMonth.getMonth()
                  const isToday = sameDay(day, new Date())
                  return (
                    <div
                      key={day.toISOString()}
                      style={{
                        minHeight: 140,
                        padding: 10,
                        borderRight: index % 7 === 6 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        background: isToday ? 'rgba(212,175,55,0.08)' : 'transparent',
                        opacity: inMonth ? 1 : 0.45,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{
                          color: isToday ? '#D4AF37' : '#fff',
                          fontSize: 14,
                          fontWeight: 700,
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isToday ? 'rgba(212,175,55,0.12)' : 'transparent',
                        }}>
                          {day.getDate()}
                        </span>
                        {dayBookings.length > 0 ? (
                          <span style={{ color: '#888', fontSize: 11 }}>{dayBookings.length} booked</span>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {dayBookings.length === 0 ? (
                          <span style={{ color: '#555', fontSize: 12 }}>No sessions</span>
                        ) : (
                          dayBookings.slice(0, 3).map((booking) => (
                            <div
                              key={booking.id}
                              style={{
                                ...badgeColors(booking.status),
                                borderRadius: 10,
                                padding: '8px 9px',
                                fontSize: 11,
                              }}
                            >
                              <div style={{ fontWeight: 700, marginBottom: 2 }}>{booking.booking_time.slice(0, 5)}</div>
                              <div style={{ color: 'inherit', opacity: 0.95, lineHeight: 1.35 }}>{booking.item_name}</div>
                            </div>
                          ))
                        )}
                        {dayBookings.length > 3 ? (
                          <span style={{ color: '#D4AF37', fontSize: 11 }}>+{dayBookings.length - 3} more</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section style={{ display: viewMode === 'list' ? 'block' : 'none', background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>Upcoming & Active</div>
        {grouped.upcoming.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14 }}>No upcoming sessions or requests right now.</p>
        ) : (
          grouped.upcoming.map((booking) => (
            <div key={booking.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{booking.item_name}</div>
                  <div style={{ color: '#888', fontSize: 14, marginTop: 4 }}>
                    {new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {booking.booking_time.slice(0, 5)}
                  </div>
                  <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                    Payment: {booking.payment_status ?? 'unpaid'}{booking.notes ? ` · ${booking.notes}` : ''}
                  </div>
                </div>
                <span style={{ ...badgeColors(booking.status), textTransform: 'capitalize', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                  {booking.status.replace('_', ' ')}
                </span>
              </div>

              {canModifyBooking(booking) ? (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => handleCancel(booking.id)}
                    disabled={activeBookingId === booking.id}
                    style={{ borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)', background: 'transparent', color: '#fca5a5', padding: '10px 14px', cursor: 'pointer', opacity: activeBookingId === booking.id ? 0.6 : 1 }}
                  >
                    {activeBookingId === booking.id ? 'Updating...' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReschedulingId(reschedulingId === booking.id ? null : booking.id)
                      setSelectedDate('')
                      setSelectedTime('')
                      setSlots([])
                      setError('')
                    }}
                    style={{ borderRadius: 10, border: '1px solid rgba(212,175,55,0.35)', background: 'transparent', color: '#D4AF37', padding: '10px 14px', cursor: 'pointer' }}
                  >
                    {reschedulingId === booking.id ? 'Close Reschedule' : 'Reschedule'}
                  </button>
                </div>
              ) : (
                <div style={{ color: '#777', fontSize: 13, marginTop: 12 }}>
                  Changes are available until 24 hours before your scheduled time.
                </div>
              )}

              {reschedulingId === booking.id ? (
                <div style={{ marginTop: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: 16 }}>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: 12, marginBottom: 8 }}>New Date</label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => {
                          const nextDate = event.target.value
                          setSelectedDate(nextDate)
                          if (nextDate) {
                            void loadSlots(booking, nextDate, selectedWindow)
                          }
                        }}
                        style={{ width: '100%', boxSizing: 'border-box', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: 12, marginBottom: 8 }}>Time Of Day</label>
                      <select
                        value={selectedWindow}
                        onChange={(event) => {
                          const nextWindow = event.target.value as 'morning' | 'afternoon' | 'evening'
                          setSelectedWindow(nextWindow)
                          if (selectedDate) {
                            void loadSlots(booking, selectedDate, nextWindow)
                          }
                        }}
                        style={{ width: '100%', boxSizing: 'border-box', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff' }}
                      >
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>Available Times</div>
                    {slotsLoading ? (
                      <div style={{ color: '#aaa', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 className="h-4 w-4 animate-spin" /> Loading available times...</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {slots.map((slot) => (
                          <button
                            key={slot.value}
                            type="button"
                            onClick={() => setSelectedTime(slot.value)}
                            style={{
                              borderRadius: 10,
                              border: selectedTime === slot.value ? '1px solid rgba(212,175,55,0.6)' : '1px solid rgba(255,255,255,0.1)',
                              background: selectedTime === slot.value ? 'rgba(212,175,55,0.12)' : 'transparent',
                              color: selectedTime === slot.value ? '#f6dfa1' : '#ddd',
                              padding: '10px 12px',
                              cursor: 'pointer',
                            }}
                          >
                            {slot.label}
                          </button>
                        ))}
                        {slots.length === 0 && !slotsLoading ? <div style={{ color: '#777', fontSize: 13 }}>Choose a date to load available times.</div> : null}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => handleReschedule(booking)}
                      disabled={activeBookingId === booking.id}
                      style={{ borderRadius: 10, border: 'none', background: '#D4AF37', color: '#111', padding: '10px 16px', fontWeight: 700, cursor: 'pointer', opacity: activeBookingId === booking.id ? 0.6 : 1 }}
                    >
                      {activeBookingId === booking.id ? 'Saving...' : 'Submit Reschedule Request'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>

      <section style={{ display: viewMode === 'list' ? 'block' : 'none', background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
        <div style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>History</div>
        {grouped.history.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14 }}>Your completed, cancelled, and missed session history will appear here.</p>
        ) : (
          grouped.history.map((booking) => (
            <div key={booking.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 0', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{booking.item_name}</div>
                <div style={{ color: '#777', fontSize: 13, marginTop: 4 }}>
                  {new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {booking.booking_time.slice(0, 5)}
                </div>
              </div>
              <span style={{ ...badgeColors(booking.status), textTransform: 'capitalize', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                {booking.status.replace('_', ' ')}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
