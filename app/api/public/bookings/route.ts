import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { publicBookingSchema } from '@/lib/booking'
import { createCalendarEvent } from '@/lib/google-calendar'

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
          description: `Client: ${data.client_name}\nEmail: ${data.client_email}\nPhone: ${data.client_phone ?? ''}\nNotes: ${data.notes ?? ''}`,
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
      } catch (calendarError) {
        console.error('Failed to create Google Calendar event for public booking', calendarError)
      }
    }

    const html = `
      <h2>Thank you, ${data.client_name}!</h2>
      <p>We've received your booking request for <strong>${bookingName}</strong>.</p>
      <p>Requested appointment: <strong>${data.booking_date}</strong> at <strong>${data.booking_time}</strong>.</p>
      <p>${priceCents === 0 ? "We've confirmed your booking and sent a calendar invite." : "We'll confirm within 24 hours."}</p>
      <p>DFitFactor</p>
    `

    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: process.env.BOOKING_FROM_EMAIL || 'DFitFactor <onboarding@resend.dev>',
          to: data.client_email,
          subject: 'Booking Request Received — DFitFactor',
          html,
        })
      } catch (emailError) {
        console.error('Failed to send booking confirmation email', emailError)
      }
    } else {
      console.log('Booking confirmation email skipped (missing RESEND_API_KEY)', {
        to: data.client_email,
        subject: 'Booking Request Received — DFitFactor',
        html,
      })
    }

    return NextResponse.json({ bookingId: booking?.id, success: true }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create booking' }, { status: 500 })
  }
}
