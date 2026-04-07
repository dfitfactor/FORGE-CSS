import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'
import {
  getCoachEmail,
  sendClientCancellationEmail,
  sendCoachCancellationEmail,
} from '@/lib/portal-booking'

const schema = z.object({
  bookingId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      coach_id: string | null
      scheduled_at: string
    }>(
      `SELECT b.id,
              b.client_id,
              b.client_name,
              b.client_email,
              b.booking_date::text AS booking_date,
              b.booking_time::text AS booking_time,
              b.availability_id,
              ca.coach_id,
              b.scheduled_at::text AS scheduled_at
       FROM bookings b
       LEFT JOIN coach_availability ca ON ca.id = b.availability_id
       WHERE b.id = $1
         AND b.client_id = $2
       LIMIT 1`,
      [parsed.data.bookingId, session.clientId]
    )

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const hoursUntil = (new Date(booking.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < 24) {
      return NextResponse.json({ error: 'Cancellation window has passed' }, { status: 400 })
    }

    await db.transaction(async (client) => {
      await client.query(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancellation_reason = 'client_cancelled',
             updated_at = NOW()
         WHERE id = $1`,
        [booking.id]
      )

      if (booking.availability_id) {
        await client.query(
          `UPDATE coach_availability
           SET is_booked = false
           WHERE id = $1`,
          [booking.availability_id]
        )
      }
    })

    if (booking.coach_id) {
      const coach = await getCoachEmail(booking.coach_id)
      await sendCoachCancellationEmail({
        coachEmail: coach.email,
        clientName: booking.client_name,
        date: booking.booking_date,
        time: booking.booking_time.slice(0, 5),
      })
    }

    await sendClientCancellationEmail({
      clientEmail: booking.client_email,
      date: booking.booking_date,
      time: booking.booking_time.slice(0, 5),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to cancel booking' }, { status: 500 })
  }
}
