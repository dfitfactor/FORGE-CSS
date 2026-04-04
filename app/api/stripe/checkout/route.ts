import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { z } from 'zod'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as any,
})

const CheckoutSchema = z.object({
  serviceId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  clientPhone: z.string().optional(),
  bookingDate: z.string().optional(),
  bookingTime: z.string().optional(),
  notes: z.string().optional(),
}).refine((d) => d.serviceId || d.packageId, {
  message: 'serviceId or packageId required',
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    let priceInCents = 0
    let itemName = ''
    let itemDescription = ''

    if (data.serviceId) {
      const service = await db.queryOne<{
        name: string; price_cents: number; duration_minutes: number
      }>(
        `SELECT name, price_cents, duration_minutes
         FROM services WHERE id = $1 AND is_active = true`,
        [data.serviceId]
      )
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 })
      }
      priceInCents = Number(service.price_cents ?? 0)
      itemName = service.name
      itemDescription = `${service.duration_minutes} min session`
    }

    if (data.packageId) {
      const pkg = await db.queryOne<{
        name: string; price_cents: number; session_count: number
      }>(
        `SELECT name, price_cents, session_count
         FROM packages WHERE id = $1 AND is_active = true`,
        [data.packageId]
      )
      if (!pkg) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      }
      priceInCents = Number(pkg.price_cents ?? 0)
      itemName = pkg.name
      itemDescription = `${pkg.session_count} sessions`
    }

    if (priceInCents === 0) {
      return NextResponse.json(
        { error: 'Free services do not require payment' },
        { status: 400 }
      )
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://forge-css.vercel.app'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: data.clientEmail,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: itemName,
            description: itemDescription,
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      }],
      metadata: {
        serviceId: data.serviceId || '',
        packageId: data.packageId || '',
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone || '',
        bookingDate: data.bookingDate || '',
        bookingTime: data.bookingTime || '',
        notes: data.notes || '',
      },
      success_url: `${baseUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/book`,
    })

    return NextResponse.json({ checkoutUrl: session.url })
  } catch (err: any) {
    console.error('[stripe/checkout] error:', err)
    return NextResponse.json(
      { error: err.message || 'Checkout failed' },
      { status: 500 }
    )
  }
}
