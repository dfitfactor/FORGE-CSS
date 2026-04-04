import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'
import { bookingDateTime, canClientModifyBooking } from '@/lib/client-portal'
import { deleteCalendarEvent } from '@/lib/google-calendar'
import { handleCancellation } from '@/lib/session-bank'

const portalBookingPatchSchema = z.object({
  action: z.enum(['cancel', 'reschedule']),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bookingTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  notes: z.string().max(5000).optional().nullable(),
})

type PortalBookingRecord = {
  id: string
  client_id: string | null
  client_email: string
  booking_date: string
  booking_time: string
  status: string
  notes: string | null
  google_calendar_event_id: string | null
  entitlement_id: string | null
}

async function getOwnedBooking(bookingId: string, clientId: string, email: string) {
  return db.queryOne<PortalBookingRecord>(
    `SELECT id,
            client_id,
            client_email,
            booking_date::text AS booking_date,
            booking_time::text AS booking_time,
            status,
            notes,
            google_calendar_event_id,
            entitlement_id
     FROM bookings
     WHERE id = $1
       AND (client_id = $2 OR LOWER(client_email) = LOWER($3))
     LIMIT 1`,
    [bookingId, clientId, email]
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = portalBookingPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const booking = await getOwnedBooking(params.bookingId, session.clientId, session.email)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (!canClientModifyBooking(booking)) {
      return NextResponse.json(
        { error: 'Bookings can only be updated at least 24 hours in advance.' },
        { status: 400 }
      )
    }

    if (parsed.data.action === 'cancel') {
      const requiresEntitlementHandling = booking.status === 'confirmed' || Boolean(booking.entitlement_id)
      const result = requiresEntitlementHandling
        ? await handleCancellation(params.bookingId, bookingDateTime(booking.booking_date, booking.booking_time), new Date())
        : { action: 'returned' as const, hoursBeforeSession: 0 }

      await db.query(
        `UPDATE bookings
         SET status = 'cancelled',
             cancellation_reason = 'client_cancelled',
             cancelled_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [params.bookingId]
      )

      if (booking.google_calendar_event_id) {
        try {
          await deleteCalendarEvent(booking.google_calendar_event_id)
          await db.query(
            `UPDATE bookings
             SET google_calendar_event_id = NULL, updated_at = NOW()
             WHERE id = $1`,
            [params.bookingId]
          )
        } catch (calendarError) {
          console.error('Failed to delete calendar event for portal cancellation', calendarError)
        }
      }

      return NextResponse.json({
        success: true,
        action: 'cancelled',
        message: requiresEntitlementHandling
          ? result.action === 'forfeited'
            ? 'Session forfeited due to cancellation inside 24 hours.'
            : 'Session cancelled and returned to your bank.'
          : 'Booking request cancelled.',
      })
    }

    if (!parsed.data.bookingDate || !parsed.data.bookingTime) {
      return NextResponse.json(
        { error: 'New booking date and time are required to reschedule.' },
        { status: 400 }
      )
    }

    await db.query(
      `UPDATE bookings
       SET booking_date = $2::date,
           booking_time = $3::time,
           status = 'rescheduled',
           notes = COALESCE($4, notes),
           updated_at = NOW()
       WHERE id = $1`,
      [
        params.bookingId,
        parsed.data.bookingDate,
        parsed.data.bookingTime,
        parsed.data.notes ?? booking.notes,
      ]
    )

    if (booking.google_calendar_event_id) {
      try {
        await deleteCalendarEvent(booking.google_calendar_event_id)
        await db.query(
          `UPDATE bookings
           SET google_calendar_event_id = NULL, updated_at = NOW()
           WHERE id = $1`,
          [params.bookingId]
        )
      } catch (calendarError) {
        console.error('Failed to delete calendar event for portal reschedule', calendarError)
      }
    }

    return NextResponse.json({
      success: true,
      action: 'rescheduled',
      message: 'Your reschedule request has been saved and is awaiting coach review.',
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update booking' },
      { status: 500 }
    )
  }
}
