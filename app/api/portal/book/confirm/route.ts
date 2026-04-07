import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createCalendarEvent } from '@/lib/google-calendar'
import { getSessionsRemaining } from '@/lib/session-bank'
import { sendClientBookingConfirmedEmail } from '@/lib/portal-booking'

const schema = z.object({
  bookingId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  requireRole(session, 'coach', 'admin')

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Booking id is required' }, { status: 400 })
  }

  try {
    const booking = await db.queryOne<{
      id: string
      client_id: string
      client_name: string
      client_email: string
      booking_date: string
      booking_time: string
      availability_id: string | null
      package_name: string | null
    }>(
      `SELECT b.id,
              b.client_id,
              b.client_name,
              b.client_email,
              b.booking_date::text AS booking_date,
              b.booking_time::text AS booking_time,
              b.availability_id,
              p.name AS package_name
       FROM bookings b
       LEFT JOIN packages p ON p.id = b.package_id
       WHERE b.id = $1
       LIMIT 1`,
      [parsed.data.bookingId]
    )

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    await db.query(
      `UPDATE bookings
       SET status = 'confirmed',
           confirmed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [parsed.data.bookingId]
    )

    const calendar = await createCalendarEvent({
      summary: `${booking.package_name ?? 'Session'} - ${booking.client_name}`,
      description: `FORGÃ‹ coaching session for ${booking.client_name}`,
      date: booking.booking_date,
      time: booking.booking_time.slice(0, 8),
      durationMinutes: 60,
      attendeeEmail: booking.client_email,
      attendeeName: booking.client_name,
    })

    if (calendar.id) {
      await db.query(
        `UPDATE bookings
         SET google_calendar_event_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [parsed.data.bookingId, calendar.id]
      )
    }

    const remaining = await getSessionsRemaining(booking.client_id)
    await sendClientBookingConfirmedEmail({
      clientEmail: booking.client_email,
      date: booking.booking_date,
      time: booking.booking_time.slice(0, 5),
      sessionsRemaining: remaining.remaining,
      calendarLink: calendar.htmlLink,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to confirm booking' }, { status: 500 })
  }
}


