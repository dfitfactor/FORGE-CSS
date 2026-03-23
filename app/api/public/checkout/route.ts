import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

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

    const stripe = getStripe()
    const baseUrl = getBaseUrl(request)
    const successUrl = `${baseUrl}/thank-you?name=${encodeURIComponent(data.client_name)}&payment=paid`
    const cancelUrl = `${baseUrl}/book/${encodeURIComponent(data.slug)}?cancelled=1`

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

    return NextResponse.json({ url: session.url, bookingId: booking.id, success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create checkout session' }, { status: 500 })
  }
}
