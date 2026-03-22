'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock3, Loader2, Plus, Trash2 } from 'lucide-react'

type AvailabilityRule = {
  id: string
  rule_type: 'weekly' | 'settings' | 'blackout'
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

type DayConfig = {
  enabled: boolean
  start_time: string
  end_time: string
  slot_duration_minutes: number
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_DAY: DayConfig = { enabled: false, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 60 }
const NOTICE_OPTIONS = [
  { label: 'Same day', value: 0 },
  { label: '24 hours', value: 24 },
  { label: '48 hours', value: 48 },
  { label: '1 week', value: 168 },
]

function createDefaultDays() {
  return Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }))
}

export default function AvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [days, setDays] = useState<DayConfig[]>(createDefaultDays())
  const [bufferMinutes, setBufferMinutes] = useState(10)
  const [minimumNoticeHours, setMinimumNoticeHours] = useState(24)
  const [blackoutDate, setBlackoutDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadRules() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/availability', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load availability')

      const nextRules = Array.isArray(data.rules) ? data.rules : []
      setRules(nextRules)

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
    void loadRules()
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
      await loadRules()
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
      await loadRules()
      setSuccess('Blackout date added')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add blackout date')
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
      await loadRules()
      setSuccess('Rule removed')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove rule')
    } finally {
      setSaving(false)
    }
  }

  const blackoutRules = useMemo(() => rules.filter((rule) => rule.rule_type === 'blackout' && rule.blackout_date), [rules])

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Availability</h1>
          <p className="mt-1 text-sm text-white/40">Set weekly schedule rules, booking settings, and blackout dates.</p>
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
    </div>
  )
}
