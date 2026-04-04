import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { publicBookingSchema } from '@/lib/booking'
import { createCalendarEvent } from '@/lib/google-calendar'
import { sendBookingConfirmation } from '@/lib/email'

type BookingTarget = {
  duration_minutes: number
  name: string
  price_cents: number
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = publicBookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    let durationMinutes: number | null = null
    let bookingName = 'your session'
    let priceCents = 0

    if (data.service_id) {
      const service = await db.queryOne<BookingTarget>(
        `SELECT duration_minutes, name, price_cents
         FROM services
         WHERE id = $1 AND is_active = true`,
        [data.service_id]
      )
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 })
      }
      durationMinutes = service.duration_minutes
      bookingName = service.name
      priceCents = Number(service.price_cents ?? 0)
    }

    if (data.package_id) {
      const pkg = await db.queryOne<BookingTarget>(
        `SELECT duration_minutes, name, price_cents
         FROM packages
         WHERE id = $1 AND is_active = true`,
        [data.package_id]
      )
      if (!pkg) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      }
      durationMinutes = pkg.duration_minutes
      bookingName = pkg.name
      priceCents = Number(pkg.price_cents ?? 0)
    }

    const initialStatus = priceCents === 0 ? 'confirmed' : 'pending'

    const booking = await db.queryOne<{ id: string }>(
      `INSERT INTO bookings (
        service_id, package_id, client_name, client_email, client_phone,
        booking_date, booking_time, duration_minutes, notes,
        status, payment_status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, 'unpaid'
      )
      RETURNING id`,
      [
        data.service_id ?? null,
        data.package_id ?? null,
        data.client_name,
        data.client_email,
        data.client_phone,
        data.booking_date,
        data.booking_time,
        durationMinutes,
        data.notes ?? null,
        initialStatus,
      ]
    )

    if (priceCents === 0 && booking?.id) {
      try {
        const eventId = await createCalendarEvent({
          summary: `${bookingName} — ${data.client_name}`,
          description: `Client: ${data.client_name}\nEmail: ${data.client_email}\nPhone: ${data.client_phone ?? ''}`,
          date: data.booking_date,
          time: data.booking_time,
          durationMinutes: Number(durationMinutes ?? 60),
          attendeeEmail: data.client_email,
          attendeeName: data.client_name,
        })

        if (eventId) {
          await db.query(
            `UPDATE bookings SET google_calendar_event_id = $1 WHERE id = $2`,
            [eventId, booking.id]
          )
        }

        await sendBookingConfirmation({
          clientName: data.client_name,
          clientEmail: data.client_email,
          serviceName: bookingName,
          bookingDate: data.booking_date,
          bookingTime: data.booking_time,
          durationMinutes: Number(durationMinutes ?? 60),
          isPaid: false,
        })
      } catch (calendarError) {
        console.error('Failed to create Google Calendar event or send confirmation email for public booking', calendarError)
      }
    }

    return NextResponse.json({ bookingId: booking?.id, success: true }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create booking' }, { status: 500 })
  }
}
