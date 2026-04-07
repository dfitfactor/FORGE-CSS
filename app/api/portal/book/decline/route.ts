import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { restoreSession } from '@/lib/session-bank'
import { sendClientBookingDeclinedEmail } from '@/lib/portal-booking'

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
      client_email: string
      booking_date: string
      booking_time: string
      availability_id: string | null
    }>(
      `SELECT id,
              client_id,
              client_email,
              booking_date::text AS booking_date,
              booking_time::text AS booking_time,
              availability_id
       FROM bookings
       WHERE id = $1
       LIMIT 1`,
      [parsed.data.bookingId]
    )

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const restore = await db.transaction(async (client) => {
      await client.query(
        `UPDATE bookings
         SET status = 'declined',
             declined_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [parsed.data.bookingId]
      )

      const restored = await restoreSession(booking.client_id, client)

      if (booking.availability_id) {
        await client.query(
          `UPDATE coach_availability
           SET is_booked = false
           WHERE id = $1`,
          [booking.availability_id]
        )
      }

      return restored
    })

    await sendClientBookingDeclinedEmail({
      clientEmail: booking.client_email,
      date: booking.booking_date,
      time: booking.booking_time.slice(0, 5),
      sessionsRemaining: restore.remaining,
    })

    return NextResponse.json({ success: true, sessions_remaining: restore.remaining })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to decline booking' }, { status: 500 })
  }
}


