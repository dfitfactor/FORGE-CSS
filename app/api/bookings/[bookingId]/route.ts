import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { bookingPatchSchema } from '@/lib/booking'
import { createCalendarEvent } from '@/lib/google-calendar'

type BookingWithDetails = {
  id: string
  client_name: string
  client_email: string
  client_phone: string | null
  booking_date: string
  booking_time: string
  notes: string | null
  service_name: string | null
  package_name: string | null
  duration_minutes: number | null
  pkg_duration: number | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = bookingPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    updates.push(`${key} = $${values.length + 1}`)
    values.push(value ?? null)
  }

  if (data.status === 'cancelled') {
    updates.push('cancelled_at = NOW()')
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  values.push(params.bookingId)

  try {
    const booking = await db.queryOne(
      `UPDATE bookings
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    )

    if (data.status === 'confirmed') {
      try {
        const confirmedBooking = await db.queryOne<BookingWithDetails>(
          `SELECT b.*, s.name as service_name, s.duration_minutes,
                  p.name as package_name, p.duration_minutes as pkg_duration
           FROM bookings b
           LEFT JOIN services s ON b.service_id = s.id
           LEFT JOIN packages p ON b.package_id = p.id
           WHERE b.id = $1`,
          [params.bookingId]
        )

        if (confirmedBooking) {
          const eventId = await createCalendarEvent({
            summary: `${confirmedBooking.service_name ?? confirmedBooking.package_name ?? 'Booking'} — ${confirmedBooking.client_name}`,
            description: `Client: ${confirmedBooking.client_name}\nEmail: ${confirmedBooking.client_email}\nPhone: ${confirmedBooking.client_phone ?? ''}\nNotes: ${confirmedBooking.notes ?? ''}`,
            date: confirmedBooking.booking_date,
            time: confirmedBooking.booking_time,
            durationMinutes: Number(confirmedBooking.duration_minutes ?? confirmedBooking.pkg_duration ?? 60),
            attendeeEmail: confirmedBooking.client_email,
            attendeeName: confirmedBooking.client_name,
          })

          if (eventId) {
            await db.query(
              `UPDATE bookings SET google_calendar_event_id = $1 WHERE id = $2`,
              [eventId, params.bookingId]
            )
          }
        }
      } catch (calendarError) {
        console.error('Failed to create Google Calendar event for confirmed booking', calendarError)
      }
    }

    return NextResponse.json({ booking })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update booking' }, { status: 500 })
  }
}
