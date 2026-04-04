import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { createCalendarEvent } from '@/lib/google-calendar'
import { sendBookingConfirmation } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as any,
})

async function resolveCoachId() {
  const coachDee = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = 'coach@dfitfactor.com' LIMIT 1`
  )
  if (coachDee?.id) return coachDee.id

  const fallbackCoach = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('admin', 'coach') AND is_active = true ORDER BY role = 'admin' DESC, created_at ASC LIMIT 1`
  )
  return fallbackCoach?.id ?? null
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err.message)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const meta = session.metadata!

    try {
      let durationMinutes = 60
      let itemName = ''

      if (meta.serviceId) {
        const service = await db.queryOne<{
          name: string; duration_minutes: number
        }>(
          `SELECT name, duration_minutes FROM services WHERE id = $1`,
          [meta.serviceId]
        )
        if (service) {
          durationMinutes = Number(service.duration_minutes ?? 60)
          itemName = service.name
        }
      }

      if (meta.packageId) {
        const pkg = await db.queryOne<{
          name: string; duration_minutes: number
        }>(
          `SELECT name, duration_minutes FROM packages WHERE id = $1`,
          [meta.packageId]
        )
        if (pkg) {
          durationMinutes = Number(pkg.duration_minutes ?? 60)
          itemName = pkg.name
        }
      }

      let clientId: string | null = null
      const existingClient = await db.queryOne<{ id: string }>(
        `SELECT id FROM clients WHERE lower(email) = $1`,
        [meta.clientEmail.toLowerCase()]
      )

      if (existingClient) {
        clientId = existingClient.id
      } else {
        const coachId = await resolveCoachId()
        const newClient = coachId
          ? await db.queryOne<{ id: string }>(
              `INSERT INTO clients (coach_id, full_name, email, phone, status, intake_date, current_stage)
               VALUES ($1, $2, $3, $4, 'active', CURRENT_DATE, 'foundations')
               RETURNING id`,
              [coachId, meta.clientName, meta.clientEmail.toLowerCase(), meta.clientPhone || null]
            )
          : await db.queryOne<{ id: string }>(
              `INSERT INTO clients (full_name, email, phone, status)
               VALUES ($1, $2, $3, 'active')
               RETURNING id`,
              [meta.clientName, meta.clientEmail.toLowerCase(), meta.clientPhone || null]
            )
        clientId = newClient?.id || null
      }

      let bookingId: string | null = null
      if (meta.bookingDate && meta.bookingTime) {
        const booking = await db.queryOne<{ id: string }>(
          `INSERT INTO bookings (
            service_id, package_id, client_id,
            client_name, client_email, client_phone,
            booking_date, booking_time, duration_minutes,
            status, payment_status, amount_cents,
            stripe_payment_intent_id, notes
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            'confirmed', 'paid', $10, $11, $12
          ) RETURNING id`,
          [
            meta.serviceId || null,
            meta.packageId || null,
            clientId,
            meta.clientName,
            meta.clientEmail,
            meta.clientPhone || null,
            meta.bookingDate,
            meta.bookingTime,
            durationMinutes,
            session.amount_total || 0,
            session.payment_intent as string,
            meta.notes || null,
          ]
        )
        bookingId = booking?.id || null
      }

      if (meta.packageId && clientId) {
        const pkg = await db.queryOne<{
          session_count: number; sessions_per_week: number | null
        }>(
          `SELECT session_count,
                  COALESCE(
                    (SELECT sessions_per_week FROM package_enrollments
                     WHERE package_id = $1 LIMIT 1), 1
                  ) as sessions_per_week
           FROM packages WHERE id = $1`,
          [meta.packageId]
        )
        if (pkg) {
          await db.query(
            `INSERT INTO package_enrollments (
              client_id, package_id, sessions_total,
              sessions_per_week, sessions_remaining,
              payment_status, amount_cents,
              stripe_payment_intent_id, status
            ) VALUES ($1, $2, $3, $4, $3, 'paid', $5, $6, 'active')
            ON CONFLICT DO NOTHING`,
            [
              clientId,
              meta.packageId,
              pkg.session_count,
              pkg.sessions_per_week || 1,
              session.amount_total || 0,
              session.payment_intent as string,
            ]
          )
        }
      }

      try {
        await sendBookingConfirmation({
          clientName: meta.clientName,
          clientEmail: meta.clientEmail,
          serviceName: itemName,
          bookingDate: meta.bookingDate,
          bookingTime: meta.bookingTime,
          durationMinutes,
          isPaid: true,
          amountPaid: (session.amount_total || 0) / 100,
        })
      } catch (emailErr) {
        console.error('[webhook] email failed:', emailErr)
      }

      if (meta.bookingDate && meta.bookingTime) {
        try {
          const eventId = await createCalendarEvent({
            summary: `${itemName} — ${meta.clientName}`,
            description: `Client: ${meta.clientName}\nEmail: ${meta.clientEmail}\nPhone: ${meta.clientPhone || 'N/A'}\nNotes: ${meta.notes || 'None'}`,
            date: meta.bookingDate,
            time: meta.bookingTime,
            durationMinutes,
            attendeeEmail: meta.clientEmail,
            attendeeName: meta.clientName,
          })

          if (bookingId && eventId) {
            await db.query(
              `UPDATE bookings SET google_calendar_event_id = $1
               WHERE id = $2`,
              [eventId, bookingId]
            )
          }
        } catch (calErr) {
          console.error('[webhook] calendar failed:', calErr)
        }
      }

    } catch (err) {
      console.error('[webhook] processing failed:', err)
    }
  }

  return NextResponse.json({ received: true })
}
