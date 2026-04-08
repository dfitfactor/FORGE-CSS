import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import {
  sendBookingConfirmation,
  sendCoachPaymentFailedEmail,
  sendPaymentFailedEmail,
  sendSubscriptionEndedEmail,
  sendSubscriptionRenewedEmail,
} from '@/lib/email'
import { getCoachSettings } from '@/lib/coach-settings'
import { getStripe } from '@/lib/stripe'
import {
  buildCycleDates,
  createBillingPortalUrl,
  getEnrollmentSubscriptionContextByEnrollmentId,
  getEnrollmentSubscriptionContextByStripeSubscriptionId,
  insertReminderLog,
} from '@/lib/subscriptions'

const stripe = getStripe()

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
  const coachSettings = await getCoachSettings()
  if (coachSettings.coachId) return coachSettings.coachId

  const fallbackCoach = await db.queryOne<{ id: string }>(
    `SELECT id
     FROM users
     WHERE role IN ('admin', 'coach') AND is_active = true
     ORDER BY role = 'admin' DESC, created_at ASC
     LIMIT 1`
  )
  return fallbackCoach?.id ?? null
}

async function hasPaymentFailedReminder(invoiceId: string) {
  const row = await db.queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM reminder_log
       WHERE reminder_type = 'payment_failed'
         AND metadata ->> 'invoice_id' = $1
     ) AS exists`,
    [invoiceId]
  )

  return Boolean(row?.exists)
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {}
  const columns = await getBookingColumns()
  const bookingId = meta.bookingId || null

  let durationMinutes = 60
  let itemName = ''

  if (meta.serviceId) {
    const service = await db.queryOne<{ name: string; duration_minutes: number }>(
      `SELECT name, duration_minutes FROM services WHERE id = $1`,
      [meta.serviceId]
    )
    if (service) {
      durationMinutes = Number(service.duration_minutes ?? 60)
      itemName = service.name
    }
  }

  if (meta.packageId) {
    const pkg = await db.queryOne<{ name: string; duration_minutes: number }>(
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
      clientId = newClient?.id ?? null
    }
  }

  if (bookingId) {
    const updates: string[] = ["payment_status = 'paid'"]
    const values: unknown[] = []

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
      session_count: number
      sessions_per_week: number | null
    }>(
      `SELECT session_count,
              COALESCE(
                (SELECT sessions_per_week
                 FROM package_enrollments
                 WHERE package_id = $1
                 LIMIT 1), 1
              ) AS sessions_per_week
       FROM packages
       WHERE id = $1`,
      [meta.packageId]
    )

    if (pkg) {
      const cycleDates = buildCycleDates(new Date())
      await db.query(
        `INSERT INTO package_enrollments (
          client_id,
          package_id,
          sessions_total,
          sessions_per_week,
          sessions_remaining,
          payment_status,
          amount_cents,
          stripe_payment_intent_id,
          status,
          subscription_status,
          billing_cycle_start,
          billing_cycle_end,
          sessions_expire_at,
          last_renewed_at,
          next_renewal_at
        ) VALUES (
          $1, $2, $3, $4, $3, 'paid', $5, $6, 'active',
          'active', $7::date, $8::date, $9::timestamptz, $10::timestamptz, $11::timestamptz
        )
        ON CONFLICT DO NOTHING`,
        [
          clientId,
          meta.packageId,
          pkg.session_count,
          pkg.sessions_per_week || 1,
          session.amount_total || 0,
          session.payment_intent as string,
          cycleDates.billingCycleStart,
          cycleDates.billingCycleEnd,
          cycleDates.sessionsExpireAt,
          cycleDates.renewedAt,
          cycleDates.nextRenewalAt,
        ]
      )
    }
  }

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
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const invoiceRecord = invoice as Stripe.Invoice & { subscription?: string | { id?: string } }
  const subscriptionId = typeof invoiceRecord.subscription === 'string' ? invoiceRecord.subscription : invoiceRecord.subscription?.id
  if (!subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const enrollmentId = subscription.metadata?.packageEnrollmentId
  if (!enrollmentId) return

  const enrollment = await getEnrollmentSubscriptionContextByEnrollmentId(enrollmentId)
  if (!enrollment) return

  const cycleDates = buildCycleDates(new Date())
  await db.query(
    `UPDATE package_enrollments
     SET sessions_remaining = sessions_total,
         billing_cycle_start = $2::date,
         billing_cycle_end = $3::date,
         sessions_expire_at = $4::timestamptz,
         last_renewed_at = $5::timestamptz,
         next_renewal_at = $6::timestamptz,
         subscription_status = 'active',
         grace_period_ends_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [
      enrollmentId,
      cycleDates.billingCycleStart,
      cycleDates.billingCycleEnd,
      cycleDates.sessionsExpireAt,
      cycleDates.renewedAt,
      cycleDates.nextRenewalAt,
    ]
  )

  await sendSubscriptionRenewedEmail({
    clientEmail: enrollment.client_email,
    refreshedCount: enrollment.sessions_total,
    expirationDate: new Date(cycleDates.sessionsExpireAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    nextRenewalDate: new Date(cycleDates.nextRenewalAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const invoiceRecord = invoice as Stripe.Invoice & { subscription?: string | { id?: string } }
  const subscriptionId = typeof invoiceRecord.subscription === 'string' ? invoiceRecord.subscription : invoiceRecord.subscription?.id
  if (!subscriptionId) return

  if (await hasPaymentFailedReminder(invoice.id)) {
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const enrollmentId = subscription.metadata?.packageEnrollmentId
  if (!enrollmentId) return

  const enrollment = await getEnrollmentSubscriptionContextByEnrollmentId(enrollmentId)
  if (!enrollment) return

  const graceEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.query(
    `UPDATE package_enrollments
     SET subscription_status = 'grace_period',
         grace_period_ends_at = $2::timestamptz,
         updated_at = NOW()
     WHERE id = $1`,
    [enrollmentId, graceEndsAt.toISOString()]
  )

  const updatePaymentUrl = enrollment.stripe_customer_id
    ? await createBillingPortalUrl(enrollment.stripe_customer_id)
    : null

  const graceDateLabel = graceEndsAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const coachSettings = await getCoachSettings()
  await Promise.all([
    sendPaymentFailedEmail({
      clientEmail: enrollment.client_email,
      gracePeriodEndDate: graceDateLabel,
      updatePaymentUrl,
    }),
    sendCoachPaymentFailedEmail({
      coachEmail: coachSettings.coachEmail,
      clientName: enrollment.client_name,
      packageName: enrollment.package_name,
      gracePeriodEndDate: graceDateLabel,
    }),
    insertReminderLog({
      clientId: enrollment.client_id,
      reminderType: 'payment_failed',
      metadata: {
        invoice_id: invoice.id,
        subscription_id: subscriptionId,
      },
    }),
  ])
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const enrollment = await getEnrollmentSubscriptionContextByStripeSubscriptionId(subscription.id)
  if (!enrollment) return

  await db.query(
    `UPDATE package_enrollments
     SET subscription_status = 'cancelled',
         updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  )

  await sendSubscriptionEndedEmail({
    clientEmail: enrollment.client_email,
    sessionsRemaining: enrollment.sessions_remaining,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      default:
        break
    }
  } catch (err) {
    console.error('[webhook] processing failed:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
