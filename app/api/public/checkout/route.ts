import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { createSquarePaymentLink, getPreferredCheckoutProvider } from '@/lib/square'

const checkoutSchema = z.object({
  service_id: z.string().uuid().optional(),
  package_id: z.string().uuid().optional(),
  client_name: z.string().trim().min(1).max(255),
  client_email: z.string().trim().email().max(255),
  client_phone: z.string().trim().min(7).max(50),
  booking_date: z.string().trim().min(1),
  booking_time: z.string().trim().min(1),
  notes: z.string().trim().max(5000).optional().nullable(),
  slug: z.string().trim().min(1),
})
  .refine((value) => Boolean(value.service_id || value.package_id), {
    message: 'service_id or package_id is required',
    path: ['service_id'],
  })
  .refine((value) => !(value.service_id && value.package_id), {
    message: 'Provide only one of service_id or package_id',
    path: ['package_id'],
  })

type BookingTarget = {
  duration_minutes: number
  name: string
  price_cents: number
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

function getBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = checkoutSchema.safeParse(body)
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
      if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })
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
      if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      durationMinutes = pkg.duration_minutes
      bookingName = pkg.name
      priceCents = Number(pkg.price_cents ?? 0)
    }

    if (priceCents <= 0) {
      return NextResponse.json({ error: 'Use the standard booking flow for free offerings' }, { status: 400 })
    }

    const booking = await db.queryOne<{ id: string }>(
      `INSERT INTO bookings (
        service_id, package_id, client_name, client_email, client_phone,
        booking_date, booking_time, duration_minutes, notes,
        status, payment_status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        'pending', 'unpaid'
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
      ]
    )

    if (!booking?.id) {
      return NextResponse.json({ error: 'Failed to create pending booking' }, { status: 500 })
    }

    const baseUrl = getBaseUrl(request)
    const successUrl = `${baseUrl}/thank-you?name=${encodeURIComponent(data.client_name)}&payment=paid`
    const cancelUrl = `${baseUrl}/book/${encodeURIComponent(data.slug)}?cancelled=1`
    const provider = await getPreferredCheckoutProvider()
    const bookingColumns = await getBookingColumns()

    if (provider === 'square') {
      const paymentLink = await createSquarePaymentLink({
        amountCents: priceCents,
        bookingId: booking.id,
        bookingName,
        clientEmail: data.client_email,
        clientPhone: data.client_phone,
        description: `${bookingName} on ${data.booking_date} at ${data.booking_time}`,
        redirectUrl: successUrl,
      })

      const updates: string[] = []
      const values: unknown[] = []

      if (bookingColumns.has('payment_provider')) {
        updates.push(`payment_provider = 'square'`)
      }
      if (bookingColumns.has('square_payment_link_id')) {
        updates.push(`square_payment_link_id = $${values.length + 1}`)
        values.push(paymentLink.payment_link?.id ?? null)
      }
      if (bookingColumns.has('square_order_id')) {
        updates.push(`square_order_id = $${values.length + 1}`)
        values.push(paymentLink.payment_link?.order_id ?? null)
      }

      if (updates.length > 0) {
        values.push(booking.id)
        await db.query(
          `UPDATE bookings
           SET ${updates.join(', ')}
           WHERE id = $${values.length}`,
          values
        )
      }

      return NextResponse.json({
        bookingId: booking.id,
        provider: 'square',
        success: true,
        url: paymentLink.payment_link?.url ?? paymentLink.payment_link?.long_url ?? null,
      })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: data.client_email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: priceCents,
            product_data: {
              name: bookingName,
              description: `${data.booking_date} at ${data.booking_time}`,
            },
          },
        },
      ],
      metadata: {
        bookingId: booking.id,
        bookingName,
        clientName: data.client_name,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    if (bookingColumns.has('payment_provider')) {
      await db.query(
        `UPDATE bookings
         SET payment_provider = 'stripe'
         WHERE id = $1`,
        [booking.id]
      )
    }

    return NextResponse.json({ url: session.url, bookingId: booking.id, provider: 'stripe', success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create checkout session' }, { status: 500 })
  }
}
