import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { sendBookingConfirmation } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as any,
})

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
    const meta = session.metadata ?? {}

    try {
      const columns = await getBookingColumns()
      const bookingId = meta.bookingId || null

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
      if (meta.clientEmail) {
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
      }

      if (bookingId) {
        const updates: string[] = ["payment_status = 'paid'"]
        const values: unknown[] = [bookingId]

        if (columns.has('amount_cents')) {
          updates.push(`amount_cents = $${values.length + 1}`)
          values.push(session.amount_total || 0)
        }
        if (columns.has('stripe_payment_intent_id')) {
          updates.push(`stripe_payment_intent_id = $${values.length + 1}`)
          values.push(session.payment_intent as string)
        }
        if (columns.has('client_id') && clientId) {
          updates.push(`client_id = COALESCE(client_id, $${values.length + 1})`)
          values.push(clientId)
        }
        if (columns.has('updated_at')) {
          updates.push('updated_at = NOW()')
        }

        values.push(bookingId)

        await db.query(
          `UPDATE bookings
           SET ${updates.join(', ')}
           WHERE id = $${values.length}`,
          values
        )
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
        const recipientEmail = meta.clientEmail || session.customer_email || ''
        if (recipientEmail) {
          await sendBookingConfirmation({
            clientName: meta.clientName || 'there',
            clientEmail: recipientEmail,
            serviceName: itemName || 'Booking request',
            bookingDate: meta.bookingDate,
            bookingTime: meta.bookingTime,
            durationMinutes,
            isPaid: false,
            amountPaid: (session.amount_total || 0) / 100,
          })
        }
      } catch (emailErr) {
        console.error('[webhook] email failed:', emailErr)
      }
    } catch (err) {
      console.error('[webhook] processing failed:', err)
    }
  }

  return NextResponse.json({ received: true })
}
