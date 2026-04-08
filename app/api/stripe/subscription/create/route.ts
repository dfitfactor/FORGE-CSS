import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendSubscriptionActivatedEmail } from '@/lib/email'
import { getStripe } from '@/lib/stripe'
import {
  buildCycleDates,
  ensureStripeCustomerForClient,
  getEnrollmentSubscriptionContextByEnrollmentId,
} from '@/lib/subscriptions'

const schema = z.object({
  enrollmentId: z.string().uuid(),
  priceId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enrollment id and Stripe price id are required' }, { status: 400 })
  }

  try {
    const enrollment = await getEnrollmentSubscriptionContextByEnrollmentId(parsed.data.enrollmentId)
    if (!enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    if (enrollment.stripe_subscription_id && enrollment.subscription_status !== 'cancelled') {
      return NextResponse.json({ error: 'This enrollment already has a Stripe subscription attached' }, { status: 400 })
    }

    const stripe = getStripe()
    const customerId = await ensureStripeCustomerForClient({
      clientId: enrollment.client_id,
      email: enrollment.client_email,
      name: enrollment.client_name,
      existingCustomerId: enrollment.stripe_customer_id,
    })

    const price = await stripe.prices.retrieve(parsed.data.priceId)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: parsed.data.priceId }],
      proration_behavior: 'none',
      expand: ['latest_invoice.confirmation_secret'],
      metadata: {
        clientId: enrollment.client_id,
        packageEnrollmentId: enrollment.enrollment_id,
      },
    } as Stripe.SubscriptionCreateParams)

    const cycleDates = buildCycleDates(new Date())
    const nextRenewalAt = cycleDates.nextRenewalAt

    await db.query(
      `UPDATE package_enrollments
       SET stripe_subscription_id = $2,
           stripe_customer_id = $3,
           subscription_status = 'active',
           next_renewal_at = $4::timestamptz,
           updated_at = NOW()
       WHERE id = $1`,
      [enrollment.enrollment_id, subscription.id, customerId, nextRenewalAt]
    )

    const unitAmount = price.unit_amount ?? null
    const billingAmount = unitAmount === null
      ? 'See Stripe'
      : `$${(unitAmount / 100).toFixed(2)}`

    await sendSubscriptionActivatedEmail({
      clientEmail: enrollment.client_email,
      packageName: enrollment.package_name,
      billingAmount,
      renewalDate: new Date(nextRenewalAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      sessionsIncluded: enrollment.sessions_total,
    })

    return NextResponse.json({ subscription })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create subscription' },
      { status: 500 }
    )
  }
}
