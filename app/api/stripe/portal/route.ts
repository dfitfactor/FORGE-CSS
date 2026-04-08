import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/client-auth'
import { createBillingPortalUrl, getActiveEnrollmentSubscriptionContextByClientId } from '@/lib/subscriptions'

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const enrollment = await getActiveEnrollmentSubscriptionContextByClientId(session.clientId)
    if (!enrollment?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe billing profile found for this client' }, { status: 400 })
    }

    const url = await createBillingPortalUrl(enrollment.stripe_customer_id)
    return NextResponse.json({ url })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
