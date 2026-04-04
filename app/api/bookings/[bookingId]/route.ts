import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { bookingPatchSchema } from '@/lib/booking'
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '@/lib/google-calendar'
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
  service_id: string | null
  package_id: string | null
  service_name: string | null
  package_name: string | null
  google_calendar_event_id: string | null
  duration_minutes: number | null
  pkg_duration: number | null
}

type AuditEntry = {
  id: string
  action: string
  payload: Record<string, unknown> | null
  created_at: string
}

async function getBookingWithDetails(bookingId: string) {
  return db.queryOne<BookingWithDetails>(
    `SELECT b.*, s.name as service_name, s.duration_minutes,
            p.name as package_name, p.duration_minutes as pkg_duration
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

  let sessionBankPayload: Record<string, unknown> = {}

  try {
    const originalBooking = await getBookingWithDetails(params.bookingId)
    if (!originalBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const booking = await db.queryOne(
      `UPDATE bookings
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    )

    if (data.status === 'confirmed') {
      try {
        const bookingDetails = await getBookingWithDetails(params.bookingId)
        if (bookingDetails?.client_id) {
          const enrollment = await db.queryOne<{ id: string }>(
            `SELECT *
             FROM package_enrollments
             WHERE client_id = $1 AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1`,
            [bookingDetails.client_id]
          )

          if (enrollment && !bookingDetails.entitlement_id) {
            const serviceName = (bookingDetails.service_name ?? '').toLowerCase()
            const entitlementType = serviceName.includes('makeup') ? 'makeup' : 'standard'
            const entitlementId = await consumeSession(enrollment.id, bookingDetails.client_id, params.bookingId, entitlementType)
            await db.query(
              `UPDATE bookings
               SET entitlement_id = $2, enrollment_id = COALESCE(enrollment_id, $3)
               WHERE id = $1`,
              [params.bookingId, entitlementId, enrollment.id]
            )
            sessionBankPayload = { entitlementId }
          }
        }
      } catch (sessionBankError) {
        console.error('Failed to consume session entitlement for confirmed booking', sessionBankError)
      }
    }

    if (data.status === 'cancelled') {
      try {
        const bookingDetails = await getBookingWithDetails(params.bookingId)
        if (bookingDetails) {
          const sessionDateTime = new Date(`${bookingDetails.booking_date}T${bookingDetails.booking_time}:00`)
          const result = await handleCancellation(params.bookingId, sessionDateTime, new Date())
          sessionBankPayload = {
            action: result.action,
            message: result.action === 'forfeited'
              ? 'Session forfeited - cancelled within 24 hours of appointment'
              : 'Session returned to your bank',
          }
        }
      } catch (sessionBankError) {
        console.error('Failed to handle booking cancellation entitlement logic', sessionBankError)
      }
    }

    if (data.status === 'no_show') {
      try {
        await handleNoShow(params.bookingId)
        sessionBankPayload = { success: true }
      } catch (sessionBankError) {
        console.error('Failed to handle booking no-show entitlement logic', sessionBankError)
      }
    }

    const requiresCalendarSync = Boolean(
      data.status === 'confirmed' ||
      data.status === 'cancelled' ||
      data.booking_date ||
      data.booking_time ||
      data.notes !== undefined
    )

    if (requiresCalendarSync) {
      try {
        const syncedBooking = await getBookingWithDetails(params.bookingId)

        if (syncedBooking) {
          const calendarDetails = {
            summary: `${syncedBooking.service_name ?? syncedBooking.package_name ?? 'Booking'} — ${syncedBooking.client_name}`,
            description: `Client: ${syncedBooking.client_name}\nEmail: ${syncedBooking.client_email}\nPhone: ${syncedBooking.client_phone ?? ''}\nNotes: ${syncedBooking.notes ?? ''}`,
            date: syncedBooking.booking_date,
            time: syncedBooking.booking_time,
            durationMinutes: Number(syncedBooking.duration_minutes ?? syncedBooking.pkg_duration ?? 60),
            attendeeEmail: syncedBooking.client_email,
            attendeeName: syncedBooking.client_name,
          }

          if (syncedBooking.status === 'cancelled' && syncedBooking.google_calendar_event_id) {
            await deleteCalendarEvent(syncedBooking.google_calendar_event_id)
            await db.query(
              `UPDATE bookings SET google_calendar_event_id = NULL WHERE id = $1`,
              [params.bookingId]
            )
          } else if (syncedBooking.status === 'confirmed' && syncedBooking.google_calendar_event_id) {
            await updateCalendarEvent(syncedBooking.google_calendar_event_id, calendarDetails)
          } else if (syncedBooking.status === 'confirmed') {
            const eventId = await createCalendarEvent(calendarDetails)

            if (eventId) {
              await db.query(
                `UPDATE bookings SET google_calendar_event_id = $1 WHERE id = $2`,
                [eventId, params.bookingId]
              )
            }
          }
        }
      } catch (calendarError) {
        console.error('Failed to sync Google Calendar event for booking update', calendarError)
      }
    }

    try {
      await db.query(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload)
         VALUES ($1, $2, 'booking', $3, $4)`,
        [
          session.id,
          'booking.updated',
          params.bookingId,
          JSON.stringify({ ...data, ...sessionBankPayload, previousStatus: originalBooking.status }),
        ]
      )
    } catch (auditError) {
      console.error('Failed to write booking audit log', auditError)
    }

    return NextResponse.json({ booking, ...sessionBankPayload })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update booking' }, { status: 500 })
  }
}
