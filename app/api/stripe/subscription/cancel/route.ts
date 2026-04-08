import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendSubscriptionCancelledEmail } from '@/lib/email'
import { getStripe } from '@/lib/stripe'
import { getEnrollmentSubscriptionContextByEnrollmentId } from '@/lib/subscriptions'

const schema = z.object({
  enrollmentId: z.string().uuid(),
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
    return NextResponse.json({ error: 'Enrollment id is required' }, { status: 400 })
  }

  try {
    const enrollment = await getEnrollmentSubscriptionContextByEnrollmentId(parsed.data.enrollmentId)
    if (!enrollment?.stripe_subscription_id) {
      return NextResponse.json({ error: 'Subscription not found for this enrollment' }, { status: 404 })
    }

    const stripe = getStripe()
    const subscription = await stripe.subscriptions.update(enrollment.stripe_subscription_id, {
      cancel_at_period_end: true,
    }) as unknown as { current_period_end?: number | null }

    await db.query(
      `UPDATE package_enrollments
       SET subscription_status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [enrollment.enrollment_id]
    )

    const finalDate = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'the end of your current billing period'

    await sendSubscriptionCancelledEmail({
      clientEmail: enrollment.client_email,
      finalDate,
      sessionsRemaining: enrollment.sessions_remaining,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel subscription' },
      { status: 500 }
    )
  }
}
