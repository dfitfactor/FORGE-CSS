import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { bookingPatchSchema } from '@/lib/booking'
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '@/lib/google-calendar'

type BookingWithDetails = {
  id: string
  client_name: string
  client_email: string
  client_phone: string | null
  booking_date: string
  booking_time: string
  notes: string | null
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
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

  try {
    const booking = await db.queryOne(
      `UPDATE bookings
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    )

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
          JSON.stringify(data),
        ]
      )
    } catch (auditError) {
      console.error('Failed to write booking audit log', auditError)
    }

    return NextResponse.json({ booking })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update booking' }, { status: 500 })
  }
}
