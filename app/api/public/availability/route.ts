import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration: z.coerce.number().int().min(15).max(240).default(60),
  period: z.enum(['morning', 'afternoon', 'evening']).optional(),
})

type AvailabilityRuleRow = {
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
}

type BookingRow = {
  booking_time: string
  duration_minutes: number | null
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatLabel(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function rangeForPeriod(period?: 'morning' | 'afternoon' | 'evening') {
  if (period === 'morning') return { start: 5 * 60, end: 12 * 60 }
  if (period === 'afternoon') return { start: 12 * 60, end: 17 * 60 }
  if (period === 'evening') return { start: 17 * 60, end: 22 * 60 }
  return { start: 0, end: 24 * 60 }
}

function isOverlapping(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    date: request.nextUrl.searchParams.get('date'),
    duration: request.nextUrl.searchParams.get('duration') ?? '60',
    period: request.nextUrl.searchParams.get('period') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid availability query', details: parsed.error.flatten() }, { status: 400 })
  }

  const { date, duration, period } = parsed.data

  try {
    const [rules, bookings] = await Promise.all([
      db.query<AvailabilityRuleRow>(
        `SELECT *
         FROM availability_rules
         WHERE is_active = true
         ORDER BY day_of_week ASC NULLS LAST, start_time ASC NULLS LAST`
      ),
      db.query<BookingRow>(
        `SELECT booking_time::text AS booking_time, duration_minutes
         FROM bookings
         WHERE booking_date = $1::date
           AND status IN ('pending', 'approved', 'rescheduled', 'confirmed')`,
        [date]
      ),
    ])

    const blackout = rules.some((rule) => rule.rule_type === 'blackout' && rule.blackout_date === date)
    if (blackout) {
      return NextResponse.json({ available: false, reason: 'Unavailable for this date', slots: [] })
    }

    const dayOfWeek = new Date(`${date}T12:00:00`).getDay()
    const weeklyRules = rules.filter((rule) => rule.rule_type === 'weekly' && rule.day_of_week === dayOfWeek && rule.start_time && rule.end_time)
    if (weeklyRules.length === 0) {
      return NextResponse.json({ available: false, reason: 'No availability on this day', slots: [] })
    }

    const blockedRules = rules.filter((rule) => rule.rule_type === 'blocked' && rule.day_of_week === dayOfWeek && rule.start_time && rule.end_time)
    const settingsRules = rules.filter((rule) => rule.rule_type === 'settings')
    const minimumNoticeRule = settingsRules.find((rule) => rule.settings_key === 'minimum_notice_hours')
    const bufferRule = settingsRules.find((rule) => rule.settings_key === 'buffer_minutes')
    const minimumNoticeHours = Number(minimumNoticeRule?.settings_value ?? minimumNoticeRule?.minimum_notice_hours ?? 0)
    const bufferMinutes = Number(bufferRule?.settings_value ?? bufferRule?.buffer_minutes ?? 0)
    const minimumAllowed = new Date(Date.now() + minimumNoticeHours * 60 * 60 * 1000)
    const periodRange = rangeForPeriod(period)

    const bookingRanges = bookings.map((booking) => {
      const start = timeToMinutes(booking.booking_time)
      const end = start + Number(booking.duration_minutes ?? duration)
      return { start, end }
    })

    const slots: Array<{ value: string; label: string }> = []

    for (const rule of weeklyRules) {
      const slotStep = Number(rule.slot_duration_minutes ?? duration)
      const ruleStart = Math.max(timeToMinutes(rule.start_time as string), periodRange.start)
      const ruleEnd = Math.min(timeToMinutes(rule.end_time as string), periodRange.end)

      for (let slotStart = ruleStart; slotStart + duration <= ruleEnd; slotStart += slotStep) {
        const slotEnd = slotStart + duration
        const slotDateTime = new Date(`${date}T${minutesToTime(slotStart)}:00`)
        if (slotDateTime < minimumAllowed) continue

        const blocked = blockedRules.some((blockedRule) => {
          const blockedStart = timeToMinutes(blockedRule.start_time as string)
          const blockedEnd = timeToMinutes(blockedRule.end_time as string)
          return isOverlapping(slotStart, slotEnd, blockedStart, blockedEnd)
        })
        if (blocked) continue

        const overlapsBooking = bookingRanges.some((bookingRange) => (
          isOverlapping(slotStart, slotEnd, bookingRange.start - bufferMinutes, bookingRange.end + bufferMinutes)
        ))
        if (overlapsBooking) continue

        slots.push({
          value: minutesToTime(slotStart),
          label: formatLabel(slotStart),
        })
      }
    }

    return NextResponse.json({
      available: slots.length > 0,
      reason: slots.length > 0 ? null : 'No open times in this window',
      slots,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load public availability' }, { status: 500 })
  }
}
