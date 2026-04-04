import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as any,
})

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id')
  if (!sessionId) {
    return NextResponse.json({ error: 'No session ID' }, { status: 400 })
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    })
    return NextResponse.json({
      clientName: session.metadata?.clientName,
      clientEmail: session.customer_email,
      serviceName: session.line_items?.data?.[0]?.description || session.line_items?.data?.[0]?.price?.product || '',
      bookingDate: session.metadata?.bookingDate,
      bookingTime: session.metadata?.bookingTime,
      amountPaid: (session.amount_total || 0) / 100,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
