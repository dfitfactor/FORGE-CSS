import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

export type EnrollmentSubscriptionContext = {
  enrollment_id: string
  client_id: string
  client_name: string
  client_email: string
  package_id: string | null
  package_name: string
  sessions_total: number
  sessions_remaining: number
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  subscription_status: string | null
  grace_period_ends_at: string | null
  last_renewed_at: string | null
  next_renewal_at: string | null
  sessions_expire_at: string | null
  override_expiration: boolean | null
  billing_cycle_start: string | null
  billing_cycle_end: string | null
}

export type ReminderLogInsert = {
  clientId: string
  reminderType: 'session_24h' | 'expiry_7d' | 'expiry_3d' | 'payment_failed' | 'grace_period_ending'
  bookingId?: string | null
  metadata?: Record<string, unknown> | null
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function getAppBaseUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function addMonthsKeepingAnniversary(anchor: Date, months: number) {
  const year = anchor.getUTCFullYear()
  const monthIndex = anchor.getUTCMonth() + months
  const targetYear = year + Math.floor(monthIndex / 12)
  const normalizedMonth = ((monthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  const day = Math.min(anchor.getUTCDate(), lastDay)
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  )
}

export function buildCycleDates(reference = new Date()) {
  const cycleStartDate = toDateOnly(reference)
  const nextRenewalAt = addMonthsKeepingAnniversary(reference, 1)
  const cycleEndDate = toDateOnly(nextRenewalAt)
  const expiresAt = new Date(nextRenewalAt.getTime() + 7 * 24 * 60 * 60 * 1000)

  return {
    billingCycleStart: cycleStartDate,
    billingCycleEnd: cycleEndDate,
    sessionsExpireAt: expiresAt.toISOString(),
    nextRenewalAt: nextRenewalAt.toISOString(),
    renewedAt: reference.toISOString(),
  }
}

export async function getEnrollmentSubscriptionContextByEnrollmentId(enrollmentId: string) {
  return db.queryOne<EnrollmentSubscriptionContext>(
    `SELECT pe.id AS enrollment_id,
            pe.client_id,
            c.full_name AS client_name,
            c.email AS client_email,
            pe.package_id,
            COALESCE(p.name, 'FORGË Subscription') AS package_name,
            COALESCE(pe.sessions_total, 0) AS sessions_total,
            COALESCE(pe.sessions_remaining, 0) AS sessions_remaining,
            pe.stripe_subscription_id,
            pe.stripe_customer_id,
            pe.subscription_status,
            pe.grace_period_ends_at::text AS grace_period_ends_at,
            pe.last_renewed_at::text AS last_renewed_at,
            pe.next_renewal_at::text AS next_renewal_at,
            pe.sessions_expire_at::text AS sessions_expire_at,
            pe.override_expiration,
            pe.billing_cycle_start::text AS billing_cycle_start,
            pe.billing_cycle_end::text AS billing_cycle_end
     FROM package_enrollments pe
     JOIN clients c ON c.id = pe.client_id
     LEFT JOIN packages p ON p.id = pe.package_id
     WHERE pe.id = $1
     LIMIT 1`,
    [enrollmentId]
  )
}

export async function getActiveEnrollmentSubscriptionContextByClientId(clientId: string) {
  return db.queryOne<EnrollmentSubscriptionContext>(
    `SELECT pe.id AS enrollment_id,
            pe.client_id,
            c.full_name AS client_name,
            c.email AS client_email,
            pe.package_id,
            COALESCE(p.name, 'FORGË Subscription') AS package_name,
            COALESCE(pe.sessions_total, 0) AS sessions_total,
            COALESCE(pe.sessions_remaining, 0) AS sessions_remaining,
            pe.stripe_subscription_id,
            pe.stripe_customer_id,
            pe.subscription_status,
            pe.grace_period_ends_at::text AS grace_period_ends_at,
            pe.last_renewed_at::text AS last_renewed_at,
            pe.next_renewal_at::text AS next_renewal_at,
            pe.sessions_expire_at::text AS sessions_expire_at,
            pe.override_expiration,
            pe.billing_cycle_start::text AS billing_cycle_start,
            pe.billing_cycle_end::text AS billing_cycle_end
     FROM package_enrollments pe
     JOIN clients c ON c.id = pe.client_id
     LEFT JOIN packages p ON p.id = pe.package_id
     WHERE pe.client_id = $1
       AND pe.status = 'active'
     ORDER BY pe.created_at DESC
     LIMIT 1`,
    [clientId]
  )
}

export async function getEnrollmentSubscriptionContextByStripeSubscriptionId(subscriptionId: string) {
  return db.queryOne<EnrollmentSubscriptionContext>(
    `SELECT pe.id AS enrollment_id,
            pe.client_id,
            c.full_name AS client_name,
            c.email AS client_email,
            pe.package_id,
            COALESCE(p.name, 'FORGË Subscription') AS package_name,
            COALESCE(pe.sessions_total, 0) AS sessions_total,
            COALESCE(pe.sessions_remaining, 0) AS sessions_remaining,
            pe.stripe_subscription_id,
            pe.stripe_customer_id,
            pe.subscription_status,
            pe.grace_period_ends_at::text AS grace_period_ends_at,
            pe.last_renewed_at::text AS last_renewed_at,
            pe.next_renewal_at::text AS next_renewal_at,
            pe.sessions_expire_at::text AS sessions_expire_at,
            pe.override_expiration,
            pe.billing_cycle_start::text AS billing_cycle_start,
            pe.billing_cycle_end::text AS billing_cycle_end
     FROM package_enrollments pe
     JOIN clients c ON c.id = pe.client_id
     LEFT JOIN packages p ON p.id = pe.package_id
     WHERE pe.stripe_subscription_id = $1
     LIMIT 1`,
    [subscriptionId]
  )
}

export async function ensureStripeCustomerForClient({
  clientId,
  email,
  name,
  existingCustomerId,
}: {
  clientId: string
  email: string
  name: string
  existingCustomerId?: string | null
}) {
  if (existingCustomerId) {
    return existingCustomerId
  }

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      clientId,
    },
  })

  return customer.id
}

export async function createBillingPortalUrl(customerId: string, returnPath = '/portal/dashboard') {
  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getAppBaseUrl()}${returnPath}`,
  })

  return session.url
}

export async function insertReminderLog({ clientId, reminderType, bookingId = null, metadata = null }: ReminderLogInsert) {
  await db.query(
    `INSERT INTO reminder_log (
       client_id,
       reminder_type,
       booking_id,
       metadata
     ) VALUES ($1, $2, $3, $4::jsonb)`,
    [clientId, reminderType, bookingId, metadata ? JSON.stringify(metadata) : null]
  )
}
