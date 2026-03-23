import Stripe from 'stripe'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createCalendarEvent } from '@/lib/google-calendar'
import { getStripe } from '@/lib/stripe'

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

export async function POST(request: Request) {
  const stripe = getStripe()
  const body = await request.text()
  const signature = headers().get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing Stripe webhook configuration' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid webhook signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const bookingId = session.metadata?.bookingId

    if (bookingId) {
      try {
        await db.query(
          `UPDATE bookings
           SET payment_status = 'paid', status = 'confirmed'
           WHERE id = $1`,
          [bookingId]
        )

        const booking = await getBookingWithDetails(bookingId)

        if (booking && !booking.google_calendar_event_id) {
          const eventId = await createCalendarEvent({
            summary: `${booking.service_name ?? booking.package_name ?? 'Booking'} — ${booking.client_name}`,
            description: `Client: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone ?? ''}\nNotes: ${booking.notes ?? ''}`,
            date: booking.booking_date,
            time: booking.booking_time,
            durationMinutes: Number(booking.duration_minutes ?? booking.pkg_duration ?? 60),
            attendeeEmail: booking.client_email,
            attendeeName: booking.client_name,
          })

          if (eventId) {
            await db.query(
              `UPDATE bookings SET google_calendar_event_id = $1 WHERE id = $2`,
              [eventId, bookingId]
            )
          }
        }

        try {
          await db.query(
            `INSERT INTO audit_log (action, resource_type, resource_id, payload)
             VALUES ($1, 'booking', $2, $3)`,
            ['booking.payment_completed', bookingId, JSON.stringify({ stripe_session_id: session.id })]
          )
        } catch (auditError) {
          console.error('Failed to write booking payment audit log', auditError)
        }
      } catch (processingError) {
        console.error('Failed to process checkout.session.completed', processingError)
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}
