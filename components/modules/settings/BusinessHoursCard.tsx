'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'

type AvailabilityRule = {
  id: string
  rule_type: 'weekly' | 'settings' | 'blackout' | 'blocked'
  day_of_week: number | null
  start_time: string | null
  end_time: string | null
  slot_duration_minutes: number | null
  buffer_minutes: number | null
  minimum_notice_hours: number | null
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DEFAULT_DAY: DayConfig = {
  enabled: false,
  start_time: '09:00',
  end_time: '17:00',
  slot_duration_minutes: 60,
}

function createDefaultDays() {
  return Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }))
}

export function BusinessHoursCard({ canEdit }: { canEdit: boolean }) {
  const [days, setDays] = useState<DayConfig[]>(createDefaultDays())
  const [bufferMinutes, setBufferMinutes] = useState(10)
  const [minimumNoticeHours, setMinimumNoticeHours] = useState(24)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadRules() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/availability', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load business hours')

        const rules = Array.isArray(data.rules) ? (data.rules as AvailabilityRule[]) : []
        const nextDays = createDefaultDays()

        for (const rule of rules.filter((item) => item.rule_type === 'weekly' && item.day_of_week !== null)) {
          nextDays[rule.day_of_week as number] = {
            enabled: true,
            start_time: (rule.start_time ?? '09:00').slice(0, 5),
            end_time: (rule.end_time ?? '17:00').slice(0, 5),
            slot_duration_minutes: rule.slot_duration_minutes ?? 60,
          }
        }

        const settingsRules = rules.filter((item) => item.rule_type === 'settings')
        const bufferRule = settingsRules.find((item) => item.settings_key === 'buffer_minutes')
        const noticeRule = settingsRules.find((item) => item.settings_key === 'minimum_notice_hours')

        setDays(nextDays)
        setBufferMinutes(Number(bufferRule?.settings_value ?? bufferRule?.buffer_minutes ?? 10))
        setMinimumNoticeHours(Number(noticeRule?.settings_value ?? noticeRule?.minimum_notice_hours ?? 24))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load business hours')
      } finally {
        setLoading(false)
      }
    }

    void loadRules()
  }, [])

  async function saveBusinessHours() {
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
      if (!weeklyRes.ok) throw new Error(weeklyData.error ?? 'Failed to save weekly business hours')

      const currentRes = await fetch('/api/availability', { cache: 'no-store' })
      const currentData = await currentRes.json().catch(() => ({}))
      if (!currentRes.ok) throw new Error(currentData.error ?? 'Failed to refresh availability settings')

      const settingsRules = (Array.isArray(currentData.rules) ? currentData.rules : []).filter(
        (rule: AvailabilityRule) => rule.rule_type === 'settings'
      )

      await Promise.all(
        settingsRules.map((rule: AvailabilityRule) =>
          fetch(`/api/availability/${rule.id}`, { method: 'DELETE' })
        )
      )

      const settingsPayload = [
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

      await Promise.all(
        settingsPayload.map((record) =>
          fetch('/api/availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          })
        )
      )

      setSuccess('Business hours updated')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save business hours')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-5">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Business Hours</p>
        <h2 className="mt-3 text-sm font-semibold text-forge-text-primary">Master Open Hours</h2>
        <p className="mt-2 text-sm text-forge-text-secondary">
          Set the business week and open hours that act as the master availability window for booking.
        </p>
      </div>

      {!canEdit ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Admin access is required to change master business hours.
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{success}</div> : null}

      {loading ? (
        <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-8 text-center text-forge-text-muted">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
          Loading business hours...
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {days.map((day, index) => (
              <div key={DAYS[index]} className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-[140px]">
                    <div className="text-sm font-semibold text-forge-text-primary">{DAYS[index]}</div>
                    <div className="mt-1 text-xs text-forge-text-muted">
                      {day.enabled ? 'Open for bookings' : 'Closed'}
                    </div>
                  </div>

                  <div className="grid flex-1 gap-3 md:grid-cols-[auto_1fr_1fr_180px] md:items-center">
                    <label className="inline-flex items-center gap-2 text-sm text-forge-text-secondary">
                      <input
                        type="checkbox"
                        checked={day.enabled}
                        disabled={!canEdit || saving}
                        onChange={(event) =>
                          setDays((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, enabled: event.target.checked } : item
                            )
                          )
                        }
                      />
                      Open
                    </label>

                    <input
                      type="time"
                      className="forge-input"
                      value={day.start_time}
                      disabled={!canEdit || saving || !day.enabled}
                      onChange={(event) =>
                        setDays((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, start_time: event.target.value } : item
                          )
                        )
                      }
                    />

                    <input
                      type="time"
                      className="forge-input"
                      value={day.end_time}
                      disabled={!canEdit || saving || !day.enabled}
                      onChange={(event) =>
                        setDays((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, end_time: event.target.value } : item
                          )
                        )
                      }
                    />

                    <select
                      className="forge-input"
                      value={day.slot_duration_minutes}
                      disabled={!canEdit || saving || !day.enabled}
                      onChange={(event) =>
                        setDays((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, slot_duration_minutes: Number(event.target.value) } : item
                          )
                        )
                      }
                    >
                      {[15, 30, 45, 60].map((option) => (
                        <option key={option} value={option}>
                          {option} min slots
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="forge-label">Minimum Booking Notice</label>
              <select
                className="forge-input"
                value={minimumNoticeHours}
                disabled={!canEdit || saving}
                onChange={(event) => setMinimumNoticeHours(Number(event.target.value))}
              >
                {[0, 24, 48, 72, 168].map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? 'Same day' : `${value} hours`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="forge-label">Buffer Between Appointments</label>
              <select
                className="forge-input"
                value={bufferMinutes}
                disabled={!canEdit || saving}
                onChange={(event) => setBufferMinutes(Number(event.target.value))}
              >
                {[0, 5, 10, 15, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void saveBusinessHours()}
              disabled={!canEdit || saving}
              className="forge-btn-gold inline-flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Business Hours'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default BusinessHoursCard
