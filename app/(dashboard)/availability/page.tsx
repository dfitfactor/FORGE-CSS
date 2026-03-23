'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock3, Copy, Loader2, Plus, Trash2, X } from 'lucide-react'

type AvailabilityRule = {
  id: string
  rule_type: 'weekly' | 'settings' | 'blackout' | 'blocked'
  day_of_week: number | null
  start_time: string | null
  end_time: string | null
  slot_duration_minutes: number | null
  buffer_minutes: number | null
  minimum_notice_hours: number | null
  blackout_date: string | null
  settings_key: string | null
  settings_value: unknown
  is_active: boolean
}

type CoachBooking = {
  id: string
  client_name: string
  client_email?: string | null
  client_phone?: string | null
  booking_date: string
  booking_time: string
  duration_minutes: number | null
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  payment_status?: 'unpaid' | 'paid' | 'waived'
  notes?: string | null
  service_name: string | null
  package_name: string | null
  google_calendar_event_id?: string | null
}

type DayConfig = {
  enabled: boolean
  start_time: string
  end_time: string
  slot_duration_minutes: number
}

type BlockedFormState = {
  day_of_week: number
  start_time: string
  end_time: string
  label: string
}

type ActiveSlot = {
  dayIndex: number
  slotMinutes: number
} | null

function BookingDetailDrawer({
  booking,
  open,
  onClose,
  onCopy,
}: {
  booking: CoachBooking | null
  open: boolean
  onClose: () => void
  onCopy: (value: string, label: string) => void
}) {
  if (!open || !booking) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button className="flex-1" onClick={onClose} aria-label="Close booking details" />
      <div className="h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#111111] p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white">Booking Details</h2>
            <p className="mt-2 text-lg font-semibold text-white">{booking.client_name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-white/35">Session</div>
            <div className="mt-2 text-base font-medium text-white">{booking.service_name ?? booking.package_name ?? 'Custom booking'}</div>
            <div className="mt-2 text-sm text-white/45">{booking.booking_date} at {booking.booking_time}</div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-white/35">Contact</div>
            <div className="mt-3 space-y-3 text-sm text-white/70">
              <div>
                <div className="text-white">{booking.client_email || 'No email on file'}</div>
                {booking.client_email ? (
                  <button onClick={() => onCopy(booking.client_email ?? '', 'Email')} className="mt-1 inline-flex items-center gap-1 text-xs text-[#D4AF37] hover:text-white">
                    <Copy size={12} /> Copy email
                  </button>
                ) : null}
              </div>
              <div>
                <div className="text-white">{booking.client_phone || 'No phone on file'}</div>
                {booking.client_phone ? (
                  <button onClick={() => onCopy(booking.client_phone ?? '', 'Phone')} className="mt-1 inline-flex items-center gap-1 text-xs text-[#D4AF37] hover:text-white">
                    <Copy size={12} /> Copy phone
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-white/35">Status</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white/70">{booking.status.replace('_', ' ')}</span>
              {booking.payment_status ? <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white/70">{booking.payment_status}</span> : null}
              {booking.google_calendar_event_id ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">Calendar linked</span> : null}
            </div>
            {booking.notes ? <p className="mt-4 whitespace-pre-wrap text-sm text-white/55">{booking.notes}</p> : <p className="mt-4 text-sm text-white/35">No booking notes.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_DAY: DayConfig = { enabled: false, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 60 }
const INITIAL_BLOCKED_FORM: BlockedFormState = {
  day_of_week: 1,
  start_time: '12:00',
  end_time: '13:00',
  label: 'Lunch',
}
const NOTICE_OPTIONS = [
  { label: 'Same day', value: 0 },
  { label: '24 hours', value: 24 },
  { label: '48 hours', value: 48 },
  { label: '1 week', value: 168 },
]
const CALENDAR_START_HOUR = 6
const CALENDAR_END_HOUR = 21
const CALENDAR_SLOT_MINUTES = 30

function createDefaultDays() {
  return Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }))
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTimeString(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatCalendarTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function startOfWeek(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isSameDate(dateString: string, date: Date) {
  return `${dateString}T00:00:00`.slice(0, 10) === date.toISOString().slice(0, 10)
}

export default function AvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [bookings, setBookings] = useState<CoachBooking[]>([])
  const [days, setDays] = useState<DayConfig[]>(createDefaultDays())
  const [bufferMinutes, setBufferMinutes] = useState(10)
  const [minimumNoticeHours, setMinimumNoticeHours] = useState(24)
  const [blackoutDate, setBlackoutDate] = useState('')
  const [blockedForm, setBlockedForm] = useState<BlockedFormState>(INITIAL_BLOCKED_FORM)
  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null)
  const [editingBlockedRuleId, setEditingBlockedRuleId] = useState<string | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<CoachBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadPageData() {
    setLoading(true)
    setError('')
    try {
      const [availabilityRes, bookingsRes] = await Promise.all([
        fetch('/api/availability', { cache: 'no-store' }),
        fetch('/api/bookings', { cache: 'no-store' }),
      ])
      const [availabilityData, bookingsData] = await Promise.all([
        availabilityRes.json().catch(() => ({})),
        bookingsRes.json().catch(() => ({})),
      ])

      if (!availabilityRes.ok) throw new Error(availabilityData.error ?? 'Failed to load availability')
      if (!bookingsRes.ok) throw new Error(bookingsData.error ?? 'Failed to load bookings')

      const nextRules = Array.isArray(availabilityData.rules) ? availabilityData.rules : []
      setRules(nextRules)
      setBookings(Array.isArray(bookingsData.bookings) ? bookingsData.bookings : [])

      const nextDays = createDefaultDays()
      for (const rule of nextRules.filter((item: AvailabilityRule) => item.rule_type === 'weekly' && item.day_of_week !== null)) {
        nextDays[rule.day_of_week as number] = {
          enabled: true,
          start_time: rule.start_time ?? '09:00',
          end_time: rule.end_time ?? '17:00',
          slot_duration_minutes: rule.slot_duration_minutes ?? 60,
        }
      }
      setDays(nextDays)

      const settingsRules = nextRules.filter((item: AvailabilityRule) => item.rule_type === 'settings')
      const bufferRule = settingsRules.find((item: AvailabilityRule) => item.settings_key === 'buffer_minutes')
      const noticeRule = settingsRules.find((item: AvailabilityRule) => item.settings_key === 'minimum_notice_hours')
      setBufferMinutes(Number(bufferRule?.settings_value ?? bufferRule?.buffer_minutes ?? 10))
      setMinimumNoticeHours(Number(noticeRule?.settings_value ?? noticeRule?.minimum_notice_hours ?? 24))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load availability')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPageData()
  }, [])

  async function replaceSettings(nextRecords: Array<Record<string, unknown>>) {
    const existing = rules.filter((rule) => rule.rule_type === 'settings')
    await Promise.all(existing.map((rule) => fetch(`/api/availability/${rule.id}`, { method: 'DELETE' })))
    await Promise.all(
      nextRecords.map((record) =>
        fetch('/api/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        })
      )
    )
  }

  async function saveSchedule() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const weeklyRules = days
        .map((day, index) => ({ day, index }))
        .filter(({ day }) => day.enabled)
        .map(({ day, index }) => ({
          rule_type: 'weekly',
          day_of_week: index,
          start_time: day.start_time,
          end_time: day.end_time,
          slot_duration_minutes: day.slot_duration_minutes,
          is_active: true,
        }))

      const weeklyRes = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: weeklyRules }),
      })
      const weeklyData = await weeklyRes.json().catch(() => ({}))
      if (!weeklyRes.ok) throw new Error(weeklyData.error ?? 'Failed to save weekly schedule')

      const settingsRecords = [
        {
          rule_type: 'settings',
          settings_key: 'buffer_minutes',
          settings_value: bufferMinutes,
          buffer_minutes: bufferMinutes,
          is_active: true,
        },
        {
          rule_type: 'settings',
          settings_key: 'minimum_notice_hours',
          settings_value: minimumNoticeHours,
          minimum_notice_hours: minimumNoticeHours,
          is_active: true,
        },
      ]

      await replaceSettings(settingsRecords)
      await loadPageData()
      setSuccess('Availability saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save availability')
    } finally {
      setSaving(false)
    }
  }

  async function addBlackoutDate() {
    if (!blackoutDate) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_type: 'blackout', blackout_date: blackoutDate, is_active: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to add blackout date')
      setBlackoutDate('')
      await loadPageData()
      setSuccess('Blackout date added')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add blackout date')
    } finally {
      setSaving(false)
    }
  }

  async function addBlockedTime(nextBlockedForm: BlockedFormState = blockedForm) {
    if (timeToMinutes(nextBlockedForm.end_time) <= timeToMinutes(nextBlockedForm.start_time)) {
      setError('Blocked time end must be after start time')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(editingBlockedRuleId ? `/api/availability/${editingBlockedRuleId}` : '/api/availability', {
        method: editingBlockedRuleId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: 'blocked',
          day_of_week: nextBlockedForm.day_of_week,
          start_time: nextBlockedForm.start_time,
          end_time: nextBlockedForm.end_time,
          settings_key: nextBlockedForm.label || null,
          is_active: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Failed to ${editingBlockedRuleId ? 'update' : 'add'} blocked time`)
      setBlockedForm(INITIAL_BLOCKED_FORM)
      setActiveSlot(null)
      setEditingBlockedRuleId(null)
      await loadPageData()
      setSuccess(editingBlockedRuleId ? 'Blocked time updated' : 'Blocked time added')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${editingBlockedRuleId ? 'update' : 'add'} blocked time`)
    } finally {
      setSaving(false)
    }
  }

  async function removeRule(ruleId: string) {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/availability/${ruleId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove rule')
      setActiveSlot(null)
      if (editingBlockedRuleId === ruleId) {
        setEditingBlockedRuleId(null)
        setBlockedForm(INITIAL_BLOCKED_FORM)
      }
      await loadPageData()
      setSuccess('Rule removed')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove rule')
    } finally {
      setSaving(false)
    }
  }

  const blackoutRules = useMemo(() => rules.filter((rule) => rule.rule_type === 'blackout' && rule.blackout_date), [rules])
  const blockedRules = useMemo(
    () => rules.filter((rule) => rule.rule_type === 'blocked' && rule.day_of_week !== null && rule.start_time && rule.end_time),
    [rules]
  )
  const calendarSlots = useMemo(() => {
    const slots: number[] = []
    for (let minutes = CALENDAR_START_HOUR * 60; minutes <= CALENDAR_END_HOUR * 60; minutes += CALENDAR_SLOT_MINUTES) {
      slots.push(minutes)
    }
    return slots
  }, [])
  const weekStart = useMemo(() => startOfWeek(new Date()), [])
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const visibleBookings = useMemo(
    () => bookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed'),
    [bookings]
  )
  const blockedByDay = useMemo(() => {
    const map = new Map<number, AvailabilityRule[]>()
    for (const rule of blockedRules) {
      const day = Number(rule.day_of_week)
      map.set(day, [...(map.get(day) ?? []), rule])
    }
    return map
  }, [blockedRules])

  function isSlotBlocked(dayIndex: number, slotMinutes: number) {
    const dayBlockedRules = blockedByDay.get(dayIndex) ?? []
    return dayBlockedRules.some((rule) => slotMinutes >= timeToMinutes(rule.start_time as string) && slotMinutes < timeToMinutes(rule.end_time as string))
  }

  function blockedRulesStartingAt(dayIndex: number, slotMinutes: number) {
    const dayBlockedRules = blockedByDay.get(dayIndex) ?? []
    return dayBlockedRules.filter((rule) => timeToMinutes(rule.start_time as string) === slotMinutes)
  }

  function isSlotAvailable(day: DayConfig, dayIndex: number, slotMinutes: number) {
    if (!day.enabled) return false
    const start = timeToMinutes(day.start_time)
    const end = timeToMinutes(day.end_time)
    if (slotMinutes < start || slotMinutes >= end) return false
    return !isSlotBlocked(dayIndex, slotMinutes)
  }

  function bookingsStartingAt(dayIndex: number, slotMinutes: number) {
    const targetDate = weekDates[dayIndex]
    return visibleBookings.filter((booking) => {
      if (!isSameDate(booking.booking_date, targetDate)) return false
      return timeToMinutes(booking.booking_time) === slotMinutes
    })
  }

  function slotHasBooking(dayIndex: number, slotMinutes: number) {
    const targetDate = weekDates[dayIndex]
    return visibleBookings.some((booking) => {
      if (!isSameDate(booking.booking_date, targetDate)) return false
      const start = timeToMinutes(booking.booking_time)
      const end = start + Number(booking.duration_minutes ?? 60)
      return slotMinutes >= start && slotMinutes < end
    })
  }

  async function handleCalendarCellClick(dayIndex: number, slotMinutes: number) {
    if (saving || slotHasBooking(dayIndex, slotMinutes)) return

    const startingBlockedRules = blockedRulesStartingAt(dayIndex, slotMinutes)
    if (startingBlockedRules.length > 0) {
      const rule = startingBlockedRules[0]
      setEditingBlockedRuleId(rule.id)
      setActiveSlot({ dayIndex, slotMinutes })
      setBlockedForm({
        day_of_week: Number(rule.day_of_week),
        start_time: rule.start_time ?? '12:00',
        end_time: rule.end_time ?? '13:00',
        label: rule.settings_key ?? 'Blocked',
      })
      setSuccess('Blocked slot loaded for editing')
      return
    }

    if (!isSlotAvailable(days[dayIndex], dayIndex, slotMinutes)) return

    const nextBlockedForm = {
      day_of_week: dayIndex,
      start_time: minutesToTimeString(slotMinutes),
      end_time: minutesToTimeString(slotMinutes + CALENDAR_SLOT_MINUTES),
      label: 'Blocked',
    }

    setActiveSlot({ dayIndex, slotMinutes })
    setBlockedForm(nextBlockedForm)
    setEditingBlockedRuleId(null)
    await addBlockedTime(nextBlockedForm)
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setSuccess(`${label} copied.`)
    } catch {
      setError(`Unable to copy ${label.toLowerCase()}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Availability</h1>
          <p className="mt-1 text-sm text-white/40">Set weekly schedule rules, booking settings, blocked times, and blackout dates.</p>
        </div>

        {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{success}</div> : null}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-white/20" />
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Weekly Schedule</h2>
                  <p className="text-sm text-white/40">Enable the days you take appointments and set slot timing.</p>
                </div>
                <button onClick={() => void saveSchedule()} disabled={saving} className="forge-btn-gold disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {days.map((day, index) => (
                  <div key={DAYS[index]} className="rounded-2xl border border-white/8 bg-[#111111] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">{DAYS[index]}</div>
                      <button
                        type="button"
                        onClick={() => setDays((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${day.enabled ? 'bg-[#D4AF37]' : 'bg-white/10'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${day.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {day.enabled ? (
                      <div className="space-y-3">
                        <div>
                          <label className="forge-label">Start Time</label>
                          <input
                            type="time"
                            value={day.start_time}
                            onChange={(event) => setDays((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, start_time: event.target.value } : item))}
                            className="forge-input"
                          />
                        </div>
                        <div>
                          <label className="forge-label">End Time</label>
                          <input
                            type="time"
                            value={day.end_time}
                            onChange={(event) => setDays((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, end_time: event.target.value } : item))}
                            className="forge-input"
                          />
                        </div>
                        <div>
                          <label className="forge-label">Slot Duration</label>
                          <select
                            value={day.slot_duration_minutes}
                            onChange={(event) => setDays((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, slot_duration_minutes: Number(event.target.value) } : item))}
                            className="forge-input"
                          >
                            {[15, 30, 45, 60].map((option) => (
                              <option key={option} value={option}>
                                {option} min
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-6 text-center text-sm text-white/35">
                        Day disabled
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-white">Calendar View</h3>
                    <p className="mt-1 text-sm text-white/40">Preview this week's availability with blocked times, pending requests, and confirmed bookings layered into each day.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-[#D4AF37]">Available</span>
                    <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-red-300">Blocked</span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-white/75">Pending / Requested</span>
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-300">Confirmed</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[920px] overflow-hidden rounded-2xl border border-white/8 bg-black/20">
                    <div className="grid grid-cols-[100px_repeat(7,minmax(0,1fr))] border-b border-white/8 bg-white/5 text-xs font-mono uppercase tracking-widest text-white/35">
                      <div className="px-3 py-3">Time</div>
                      {DAYS.map((label, index) => (
                        <div key={label} className="border-l border-white/8 px-3 py-3 text-center">
                          <div>{label}</div>
                          <div className="mt-1 text-[10px] normal-case tracking-normal text-white/30">{formatDayLabel(weekDates[index])}</div>
                          <div className="mt-1 text-[10px] normal-case tracking-normal text-white/20">
                            {days[index].enabled ? `${days[index].start_time}-${days[index].end_time}` : 'Off'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {calendarSlots.map((slotMinutes) => (
                      <div key={slotMinutes} className="grid grid-cols-[100px_repeat(7,minmax(0,1fr))] border-b border-white/5 last:border-0">
                        <div className="px-3 py-3 text-xs text-white/35">{formatCalendarTime(slotMinutes)}</div>
                        {days.map((day, dayIndex) => {
                          const active = isSlotAvailable(day, dayIndex, slotMinutes)
                          const slotBookings = bookingsStartingAt(dayIndex, slotMinutes)
                          const booked = slotHasBooking(dayIndex, slotMinutes)
                          const blockedStartingRules = blockedRulesStartingAt(dayIndex, slotMinutes)
                          const blocked = isSlotBlocked(dayIndex, slotMinutes)
                          const isSelected = activeSlot?.dayIndex === dayIndex && activeSlot?.slotMinutes === slotMinutes
                          const isClickable = active || blockedStartingRules.length > 0
                          return (
                            <div key={`${DAYS[dayIndex]}-${slotMinutes}`} className="border-l border-white/5 px-2 py-2">
                              <div
                                className={`min-h-[44px] rounded-lg border text-left text-xs transition ${isSelected ? 'ring-2 ring-[#D4AF37]/60 ring-offset-0' : ''} ${slotBookings.length > 0 ? 'border-white/15 bg-white/5 text-white' : blocked ? 'border-red-500/30 bg-red-500/10 text-red-300' : booked ? 'border-white/10 bg-white/[0.04] text-white/50' : active ? 'border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#D4AF37]' : 'border-transparent bg-white/[0.02] text-white/10'}`}
                              >
                                {slotBookings.length > 0 ? (
                                  <div className="space-y-1 p-1.5">
                                    {slotBookings.map((booking) => {
                                      const statusClass = booking.status === 'confirmed'
                                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                                        : 'border-white/20 bg-white/10 text-white/75'
                                      return (
                                        <button key={booking.id} type="button" onClick={() => setSelectedBooking(booking)} className={`block w-full rounded-md border px-2 py-1 text-left ${statusClass}`}>
                                          <div className="font-medium">{booking.client_name}</div>
                                          <div className="text-[10px] uppercase tracking-wide opacity-80">{booking.status === 'pending' ? 'Requested' : 'Confirmed'} · {booking.service_name ?? booking.package_name ?? 'Booking'}</div>
                                        </button>
                                      )
                                    })}
                                  </div>
                                ) : blockedStartingRules.length > 0 ? (
                                  <button type="button" disabled={saving} onClick={() => void handleCalendarCellClick(dayIndex, slotMinutes)} className="block w-full space-y-1 p-1.5 text-left">
                                    {blockedStartingRules.map((rule) => (
                                      <div key={rule.id} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-200">
                                        <div className="font-medium">{rule.settings_key || 'Blocked'}</div>
                                        <div className="text-[10px] uppercase tracking-wide opacity-80">{rule.start_time} - {rule.end_time}</div>
                                      </div>
                                    ))}
                                  </button>
                                ) : active ? (
                                  <button type="button" disabled={saving} onClick={() => void handleCalendarCellClick(dayIndex, slotMinutes)} className="flex h-full w-full flex-col items-center justify-center px-2 py-2 text-center hover:bg-[#D4AF37]/20">
                                    <div className="font-medium">Available</div>
                                    <div className="text-[10px] uppercase tracking-wide opacity-70">Click to block</div>
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Blocked Times</h2>
                  <p className="text-sm text-white/40">Add recurring blocked windows for lunch, meetings, admin time, or anything else that changes by day.</p>
                </div>
                {editingBlockedRuleId ? (
                  <button onClick={() => { setEditingBlockedRuleId(null); setBlockedForm(INITIAL_BLOCKED_FORM); setActiveSlot(null) }} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white">
                    Cancel Edit
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr_1fr_1.2fr_auto]">
                <div>
                  <label className="forge-label">Day</label>
                  <select value={blockedForm.day_of_week} onChange={(event) => setBlockedForm((current) => ({ ...current, day_of_week: Number(event.target.value) }))} className="forge-input">
                    {DAYS.map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="forge-label">Start Time</label>
                  <input type="time" value={blockedForm.start_time} onChange={(event) => setBlockedForm((current) => ({ ...current, start_time: event.target.value }))} className="forge-input" />
                </div>
                <div>
                  <label className="forge-label">End Time</label>
                  <input type="time" value={blockedForm.end_time} onChange={(event) => setBlockedForm((current) => ({ ...current, end_time: event.target.value }))} className="forge-input" />
                </div>
                <div>
                  <label className="forge-label">Label</label>
                  <input value={blockedForm.label} onChange={(event) => setBlockedForm((current) => ({ ...current, label: event.target.value }))} className="forge-input" placeholder="Lunch, Team Meeting..." />
                </div>
                <button onClick={() => void addBlockedTime()} disabled={saving} className="forge-btn-gold mt-6 inline-flex items-center gap-2 disabled:opacity-50">
                  <Plus size={15} />
                  {editingBlockedRuleId ? 'Update Block' : 'Add Block'}
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {blockedRules.length > 0 ? (
                  blockedRules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="flex items-center gap-3 text-white/70">
                        <Clock3 className="h-4 w-4 text-red-300" />
                        <span>{DAYS[Number(rule.day_of_week)]} · {rule.start_time} - {rule.end_time}</span>
                        {rule.settings_key ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/55">{rule.settings_key}</span> : null}
                      </div>
                      <button onClick={() => void removeRule(rule.id)} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-white/35">
                    No blocked times added yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-white">Booking Settings</h2>
                <p className="text-sm text-white/40">Adjust booking buffers and minimum notice for new requests.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="forge-label">Buffer between appointments</label>
                  <select value={bufferMinutes} onChange={(event) => setBufferMinutes(Number(event.target.value))} className="forge-input">
                    {[0, 5, 10, 15, 30].map((option) => (
                      <option key={option} value={option}>
                        {option} min
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="forge-label">Minimum booking notice</label>
                  <select value={minimumNoticeHours} onChange={(event) => setMinimumNoticeHours(Number(event.target.value))} className="forge-input">
                    {NOTICE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Blackout Dates</h2>
                  <p className="text-sm text-white/40">Block one-off days from being bookable.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input type="date" value={blackoutDate} onChange={(event) => setBlackoutDate(event.target.value)} className="forge-input" />
                  <button onClick={() => void addBlackoutDate()} disabled={saving || !blackoutDate} className="forge-btn-gold inline-flex items-center gap-2 disabled:opacity-50">
                    <Plus size={15} />
                    Add Blackout
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {blackoutRules.length > 0 ? (
                  blackoutRules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="flex items-center gap-3 text-white/70">
                        <Clock3 className="h-4 w-4 text-[#D4AF37]" />
                        <span>{new Date(`${rule.blackout_date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <button onClick={() => void removeRule(rule.id)} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-white/35">
                    No blackout dates added yet.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <BookingDetailDrawer
        booking={selectedBooking}
        open={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        onCopy={(value, label) => void copyValue(value, label)}
      />
    </div>
  )
}
