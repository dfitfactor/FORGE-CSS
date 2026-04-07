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
  status: 'pending' | 'approved' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show'
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

let cachedBookingColumns: Set<string> | null = null

async function getBookingColumns() {
  if (cachedBookingColumns) return cachedBookingColumns

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'bookings'`
  )

  cachedBookingColumns = new Set(rows.map((row) => row.column_name))
  return cachedBookingColumns
}

async function getBookingWithDetails(bookingId: string) {
  const columns = await getBookingColumns()
  const selectColumns = [
    'b.id',
    columns.has('client_id') ? 'b.client_id' : 'NULL::uuid as client_id',
    columns.has('enrollment_id') ? 'b.enrollment_id' : 'NULL::uuid as enrollment_id',
    columns.has('entitlement_id') ? 'b.entitlement_id' : 'NULL::uuid as entitlement_id',
    'b.client_name',
    'b.client_email',
    'b.client_phone',
    'b.booking_date::text as booking_date',
    'b.booking_time::text as booking_time',
    'b.notes',
    'b.status',
    'b.payment_status',
    'b.service_id',
    'b.package_id',
    columns.has('google_calendar_event_id') ? 'b.google_calendar_event_id' : 'NULL::text as google_calendar_event_id',
    'b.duration_minutes',
    'COALESCE(s.name, p.name) as item_name',
    'COALESCE(s.duration_minutes, p.duration_minutes) as duration',
  ]

  return db.queryOne<BookingWithDetails>(
    `SELECT ${selectColumns.join(', ')}
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

async function writeBookingAuditLog(userId: string, bookingId: string, payload: Record<string, unknown>) {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
       VALUES ($1, $2, 'booking', $3, $4)`,
      [userId, 'booking.updated', bookingId, JSON.stringify(payload)]
    )
  } catch (auditError) {
    console.error('Failed to write booking audit log', auditError)
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
    const columns = await getBookingColumns()
    const originalBooking = await getBookingWithDetails(params.bookingId)
    if (!originalBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (data.status === 'approved') {
      await db.query(
        `UPDATE bookings
         SET status = 'approved', updated_at = NOW()
         WHERE id = $1`,
        [params.bookingId]
      )

      await writeBookingAuditLog(session.id, params.bookingId, {
        status: 'approved',
        previousStatus: originalBooking.status,
      })

      return NextResponse.json({
        success: true,
        action: 'approved',
        message: 'Booking approved. Awaiting client confirmation.',
      })
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

      if (columns.has('client_id') && booking.client_id) {
        try {
          const enrollment = await db.queryOne<{ id: string }>(
            `SELECT id
             FROM package_enrollments
             WHERE client_id = $1 AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1`,
            [booking.client_id]
          )

          if (enrollment && (!columns.has('entitlement_id') || !booking.entitlement_id)) {
            const itemName = (booking.item_name ?? '').toLowerCase()
            const entitlementType = itemName.includes('makeup') ? 'makeup' : 'standard'
            const entitlementId = await consumeSession(enrollment.id, booking.client_id, params.bookingId, entitlementType)

            if (columns.has('entitlement_id') || columns.has('enrollment_id')) {
              const entitlementUpdates: string[] = []
              const entitlementValues: unknown[] = [params.bookingId]
              if (columns.has('entitlement_id')) {
                entitlementUpdates.push(`entitlement_id = $${entitlementValues.length + 1}`)
                entitlementValues.push(entitlementId)
              }
              if (columns.has('enrollment_id')) {
                entitlementUpdates.push(`enrollment_id = COALESCE(enrollment_id, $${entitlementValues.length + 1})`)
                entitlementValues.push(enrollment.id)
              }
              entitlementUpdates.push('updated_at = NOW()')

              await db.query(
                `UPDATE bookings
                 SET ${entitlementUpdates.join(', ')}
                 WHERE id = $1`,
                entitlementValues
              )
            }
          }
        } catch (sessionBankError) {
          console.error('Failed to consume session entitlement for confirmed booking', sessionBankError)
        }
      }

      try {
        if (booking.google_calendar_event_id) {
          await deleteCalendarEvent(booking.google_calendar_event_id)
        }

        const calendarEvent = await createCalendarEvent({
          summary: `${booking.item_name ?? 'Booking'} - ${booking.client_name}`,
          description: `Client: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone ?? ''}`,
          date: booking.booking_date,
          time: booking.booking_time,
          durationMinutes: Number(booking.duration ?? booking.duration_minutes ?? 60),
          attendeeEmail: booking.client_email,
          attendeeName: booking.client_name,
        })

        if (calendarEvent.id && columns.has('google_calendar_event_id')) {
          await db.query(
            `UPDATE bookings
             SET google_calendar_event_id = $2, updated_at = NOW()
             WHERE id = $1`,
            [params.bookingId, calendarEvent.id]
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

      await writeBookingAuditLog(session.id, params.bookingId, {
        status: 'confirmed',
        previousStatus: originalBooking.status,
      })

      return NextResponse.json({ success: true, action: 'confirmed' })
    }

    if (data.status === 'rescheduled') {
      await db.query(
        `UPDATE bookings
         SET status = 'rescheduled', attended = NULL, updated_at = NOW()
         WHERE id = $1`,
        [params.bookingId]
      )

      if (originalBooking.google_calendar_event_id) {
        try {
          await deleteCalendarEvent(originalBooking.google_calendar_event_id)
          if (columns.has('google_calendar_event_id')) {
            await db.query(
              `UPDATE bookings
               SET google_calendar_event_id = NULL, updated_at = NOW()
               WHERE id = $1`,
              [params.bookingId]
            )
          }
        } catch (calendarError) {
          console.error('Failed to delete Google Calendar event for rescheduled booking', calendarError)
        }
      }

      await writeBookingAuditLog(session.id, params.bookingId, {
        status: 'rescheduled',
        previousStatus: originalBooking.status,
      })

      return NextResponse.json({
        success: true,
        action: 'rescheduled',
        message: 'Booking marked for reschedule. Update the date/time and re-confirm when ready.',
      })
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
          if (columns.has('google_calendar_event_id')) {
            await db.query(
              `UPDATE bookings
               SET google_calendar_event_id = NULL, updated_at = NOW()
               WHERE id = $1`,
              [params.bookingId]
            )
          }
        } catch (calendarError) {
          console.error('Failed to delete Google Calendar event for cancelled booking', calendarError)
        }
      }

      const requiresEntitlementHandling = booking.status === 'confirmed' || booking.status === 'completed' || Boolean(booking.entitlement_id)
      const result = requiresEntitlementHandling
        ? await handleCancellation(params.bookingId, new Date(`${booking.booking_date}T${booking.booking_time}:00`), new Date())
        : { action: 'returned' as const, hoursBeforeSession: 0 }

      await writeBookingAuditLog(session.id, params.bookingId, {
        status: 'cancelled',
        action: result.action,
        previousStatus: originalBooking.status,
      })

      return NextResponse.json({
        success: true,
        action: result.action,
        message: !requiresEntitlementHandling
          ? 'Booking request cancelled'
          : result.action === 'forfeited'
            ? 'Session forfeited - cancelled within 24 hours'
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

      await writeBookingAuditLog(session.id, params.bookingId, {
        status: 'no_show',
        previousStatus: originalBooking.status,
      })

      return NextResponse.json({ success: true, action: 'no_show' })
    }

    if (data.status === 'completed') {
      await db.query(
        `UPDATE bookings
         SET status = 'completed', attended = true, updated_at = NOW()
         WHERE id = $1`,
        [params.bookingId]
      )

      await writeBookingAuditLog(session.id, params.bookingId, {
        status: 'completed',
        previousStatus: originalBooking.status,
      })

      return NextResponse.json({ success: true, action: 'completed' })
    }

    const updates: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(data)) {
      if (!columns.has(key)) continue
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

    await writeBookingAuditLog(session.id, params.bookingId, {
      ...data,
      previousStatus: originalBooking.status,
    })

    return NextResponse.json({ success: true, booking })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update booking' }, { status: 500 })
  }
}

