import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { bookingPatchSchema } from '@/lib/booking'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { sendBookingConfirmation } from '@/lib/email'
import { consumeSession, handleCancellation, handleNoShow } from '@/lib/session-bank'

type BookingWithDetails = {
  id: string
  client_id: string | null
  enrollment_id: string | null
  entitlement_id: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  booking_date: string
  booking_time: string
  notes: string | null
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  payment_status: 'unpaid' | 'paid' | 'waived'
  service_id: string | null
  package_id: string | null
  google_calendar_event_id: string | null
  duration_minutes: number | null
  item_name: string | null
  duration: number | null
}

type AuditEntry = {
  id: string
  action: string
  payload: Record<string, unknown> | null
  created_at: string
}

async function getBookingWithDetails(bookingId: string) {
  return db.queryOne<BookingWithDetails>(
    `SELECT b.*,
            COALESCE(s.name, p.name) as item_name,
            COALESCE(s.duration_minutes, p.duration_minutes) as duration
     FROM bookings b
     LEFT JOIN services s ON b.service_id = s.id
     LEFT JOIN packages p ON b.package_id = p.id
     WHERE b.id = $1`,
    [bookingId]
  )
}

async function getBookingHistory(bookingId: string) {
  try {
    return await db.query<AuditEntry>(
      `SELECT id, action, payload, created_at
       FROM audit_log
       WHERE resource_type = 'booking'
         AND resource_id = $1
       ORDER BY created_at DESC
       LIMIT 12`,
      [bookingId]
    )
  } catch {
    return []
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [booking, history] = await Promise.all([
      getBookingWithDetails(params.bookingId),
      getBookingHistory(params.bookingId),
    ])

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    return NextResponse.json({ booking, history })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load booking details' }, { status: 500 })
  }
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

  try {
    const originalBooking = await getBookingWithDetails(params.bookingId)
    if (!originalBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (data.status === 'confirmed') {
      const updatedBooking = await db.queryOne(
        `UPDATE bookings
         SET status = 'confirmed', updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [params.bookingId]
      )

      if (!updatedBooking) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      }

      const booking = await getBookingWithDetails(params.bookingId)
      if (!booking) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      }

      if (booking.client_id) {
        try {
          const enrollment = await db.queryOne<{ id: string }>(
            `SELECT id
             FROM package_enrollments
             WHERE client_id = $1 AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1`,
            [booking.client_id]
          )

          if (enrollment && !booking.entitlement_id) {
            const itemName = (booking.item_name ?? '').toLowerCase()
            const entitlementType = itemName.includes('makeup') ? 'makeup' : 'standard'
            const entitlementId = await consumeSession(enrollment.id, booking.client_id, params.bookingId, entitlementType)
            await db.query(
              `UPDATE bookings
               SET entitlement_id = $2, enrollment_id = COALESCE(enrollment_id, $3), updated_at = NOW()
               WHERE id = $1`,
              [params.bookingId, entitlementId, enrollment.id]
            )
          }
        } catch (sessionBankError) {
          console.error('Failed to consume session entitlement for confirmed booking', sessionBankError)
        }
      }

      try {
        const eventId = await createCalendarEvent({
          summary: `${booking.item_name ?? 'Booking'} — ${booking.client_name}`,
          description: `Client: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone ?? ''}`,
          date: booking.booking_date,
          time: booking.booking_time,
          durationMinutes: Number(booking.duration ?? booking.duration_minutes ?? 60),
          attendeeEmail: booking.client_email,
          attendeeName: booking.client_name,
        })

        if (eventId) {
          await db.query(
            `UPDATE bookings
             SET google_calendar_event_id = $2, updated_at = NOW()
             WHERE id = $1`,
            [params.bookingId, eventId]
          )
        }
      } catch (calendarError) {
        console.error('Failed to create Google Calendar event for confirmed booking', calendarError)
      }

      try {
        await sendBookingConfirmation({
          clientName: booking.client_name,
          clientEmail: booking.client_email,
          serviceName: booking.item_name ?? 'Booking',
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          durationMinutes: Number(booking.duration ?? booking.duration_minutes ?? 60),
          isPaid: booking.payment_status === 'paid',
        })
      } catch (emailError) {
        console.error('Failed to send booking confirmation email for confirmed booking', emailError)
      }

      try {
        await db.query(
          `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
           VALUES ($1, $2, 'booking', $3, $4)`,
          [session.id, 'booking.updated', params.bookingId, JSON.stringify({ status: 'confirmed', previousStatus: originalBooking.status })]
        )
      } catch (auditError) {
        console.error('Failed to write booking audit log', auditError)
      }

      return NextResponse.json({ success: true, action: 'confirmed' })
    }

    if (data.status === 'cancelled') {
      const booking = await getBookingWithDetails(params.bookingId)
      if (!booking) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      }

      await db.query(
        `UPDATE bookings
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
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
          console.error('Failed to delete Google Calendar event for cancelled booking', calendarError)
        }
      }

      const sessionDateTime = new Date(`${booking.booking_date}T${booking.booking_time}:00`)
      const result = await handleCancellation(params.bookingId, sessionDateTime, new Date())

      try {
        await db.query(
          `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
           VALUES ($1, $2, 'booking', $3, $4)`,
          [session.id, 'booking.updated', params.bookingId, JSON.stringify({ status: 'cancelled', action: result.action, previousStatus: originalBooking.status })]
        )
      } catch (auditError) {
        console.error('Failed to write booking audit log', auditError)
      }

      return NextResponse.json({
        success: true,
        action: result.action,
        message: result.action === 'forfeited'
          ? 'Session forfeited — cancelled within 24 hours'
          : 'Session returned to bank',
      })
    }

    if (data.status === 'no_show') {
      await db.query(
        `UPDATE bookings
         SET status = 'no_show', attended = false, updated_at = NOW()
         WHERE id = $1`,
        [params.bookingId]
      )

      await handleNoShow(params.bookingId)

      try {
        await db.query(
          `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
           VALUES ($1, $2, 'booking', $3, $4)`,
          [session.id, 'booking.updated', params.bookingId, JSON.stringify({ status: 'no_show', previousStatus: originalBooking.status })]
        )
      } catch (auditError) {
        console.error('Failed to write booking audit log', auditError)
      }

      return NextResponse.json({ success: true, action: 'no_show' })
    }

    if (data.status === 'completed') {
      await db.query(
        `UPDATE bookings
         SET status = 'completed', attended = true, updated_at = NOW()
         WHERE id = $1`,
        [params.bookingId]
      )

      try {
        await db.query(
          `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
           VALUES ($1, $2, 'booking', $3, $4)`,
          [session.id, 'booking.updated', params.bookingId, JSON.stringify({ status: 'completed', previousStatus: originalBooking.status })]
        )
      } catch (auditError) {
        console.error('Failed to write booking audit log', auditError)
      }

      return NextResponse.json({ success: true, action: 'completed' })
    }

    const updates: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(data)) {
      updates.push(`${key} = $${values.length + 1}`)
      values.push(value ?? null)
    }

    updates.push('updated_at = NOW()')

    if (updates.length === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(params.bookingId)

    const booking = await db.queryOne(
      `UPDATE bookings
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    )

    try {
      await db.query(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
         VALUES ($1, $2, 'booking', $3, $4)`,
        [session.id, 'booking.updated', params.bookingId, JSON.stringify({ ...data, previousStatus: originalBooking.status })]
      )
    } catch (auditError) {
      console.error('Failed to write booking audit log', auditError)
    }

    return NextResponse.json({ success: true, booking })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update booking' }, { status: 500 })
  }
}
