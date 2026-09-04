import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendBookingConfirmation } from '@/lib/email'
import {
  buildCycleDates,
} from '@/lib/subscriptions'
import {
  extractSquarePaymentFromWebhook,
  getSquareConfig,
  verifySquareWebhookSignature,
} from '@/lib/square'

let cachedBookingColumns: Set<string> | null = null
let cachedEnrollmentColumns: Set<string> | null = null

type BookingRecord = {
  id: string
  client_id: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  booking_date: string | null
  booking_time: string | null
  duration_minutes: number | null
  payment_status: string | null
  square_payment_id: string | null
  service_id: string | null
  package_id: string | null
}

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

async function getEnrollmentColumns() {
  if (cachedEnrollmentColumns) return cachedEnrollmentColumns

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'package_enrollments'`
  )

  cachedEnrollmentColumns = new Set(rows.map((row) => row.column_name))
  return cachedEnrollmentColumns
}

async function resolveCoachId() {
  const fallbackCoach = await db.queryOne<{ id: string }>(
    `SELECT id
     FROM users
     WHERE role IN ('admin', 'coach') AND is_active = true
     ORDER BY role = 'admin' DESC, created_at ASC
     LIMIT 1`
  )

  return fallbackCoach?.id ?? null
}

async function ensureClientForBooking(booking: BookingRecord) {
  if (booking.client_id) return booking.client_id

  const existingClient = await db.queryOne<{ id: string }>(
    `SELECT id FROM clients WHERE lower(email) = $1`,
    [booking.client_email.toLowerCase()]
  )

  if (existingClient) {
    return existingClient.id
  }

  const coachId = await resolveCoachId()
  const newClient = coachId
    ? await db.queryOne<{ id: string }>(
        `INSERT INTO clients (coach_id, full_name, email, phone, status, intake_date, current_stage)
         VALUES ($1, $2, $3, $4, 'active', CURRENT_DATE, 'foundations')
         RETURNING id`,
        [coachId, booking.client_name, booking.client_email.toLowerCase(), booking.client_phone]
      )
    : await db.queryOne<{ id: string }>(
        `INSERT INTO clients (full_name, email, phone, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING id`,
        [booking.client_name, booking.client_email.toLowerCase(), booking.client_phone]
      )

  return newClient?.id ?? null
}

async function getBookingDisplayName(booking: BookingRecord) {
  if (booking.service_id) {
    const service = await db.queryOne<{ name: string }>(
      `SELECT name FROM services WHERE id = $1`,
      [booking.service_id]
    )
    if (service?.name) return service.name
  }

  if (booking.package_id) {
    const pkg = await db.queryOne<{ name: string }>(
      `SELECT name FROM packages WHERE id = $1`,
      [booking.package_id]
    )
    if (pkg?.name) return pkg.name
  }

  return 'Booking request'
}

async function createPackageEnrollmentForBooking(booking: BookingRecord, paymentId: string | null, amountCents: number, clientId: string) {
  if (!booking.package_id) return

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
    [booking.package_id]
  )

  if (!pkg) return

  const existing = await db.queryOne<{ id: string }>(
    `SELECT id
     FROM package_enrollments
     WHERE package_id = $1
       AND client_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [booking.package_id, clientId]
  )

  if (existing?.id) return

  const columns = await getEnrollmentColumns()
  const cycleDates = buildCycleDates(new Date())
  const insertColumns = [
    'client_id',
    'package_id',
    'sessions_total',
    'sessions_per_week',
    'sessions_remaining',
    'payment_status',
    'amount_cents',
    'status',
    'subscription_status',
    'billing_cycle_start',
    'billing_cycle_end',
    'sessions_expire_at',
    'last_renewed_at',
    'next_renewal_at',
    ...(columns.has('payment_provider') ? ['payment_provider'] : []),
    ...(columns.has('square_payment_id') ? ['square_payment_id'] : []),
  ]

  const values = [
    clientId,
    booking.package_id,
    pkg.session_count,
    pkg.sessions_per_week || 1,
    pkg.session_count,
    'paid',
    amountCents,
    'active',
    'active',
    cycleDates.billingCycleStart,
    cycleDates.billingCycleEnd,
    cycleDates.sessionsExpireAt,
    cycleDates.renewedAt,
    cycleDates.nextRenewalAt,
    ...(columns.has('payment_provider') ? ['square'] : []),
    ...(columns.has('square_payment_id') ? [paymentId] : []),
  ]

  await db.query(
    `INSERT INTO package_enrollments (${insertColumns.join(', ')})
     VALUES (${insertColumns.map((_, index) => `$${index + 1}`).join(', ')})`,
    values
  )
}

async function handleCompletedSquarePayment(payment: {
  amountCents: number
  id: string | null
  orderId: string | null
}) {
  const columns = await getBookingColumns()
  if (!payment.orderId || !columns.has('square_order_id')) return

  const booking = await db.queryOne<BookingRecord>(
    `SELECT id,
            client_id,
            client_name,
            client_email,
            client_phone,
            booking_date::text AS booking_date,
            booking_time::text AS booking_time,
            duration_minutes,
            payment_status,
            ${columns.has('square_payment_id') ? 'square_payment_id,' : 'NULL::text AS square_payment_id,'}
            service_id,
            package_id
     FROM bookings
     WHERE square_order_id = $1
     LIMIT 1`,
    [payment.orderId]
  )

  if (!booking) return
  if (booking.payment_status === 'paid' && (!payment.id || booking.square_payment_id === payment.id)) return

  const clientId = await ensureClientForBooking(booking)
  const updates: string[] = ["payment_status = 'paid'"]
  const values: unknown[] = []

  if (columns.has('amount_cents')) {
    updates.push(`amount_cents = $${values.length + 1}`)
    values.push(payment.amountCents)
  }
  if (columns.has('payment_provider')) {
    updates.push(`payment_provider = 'square'`)
  }
  if (columns.has('square_payment_id')) {
    updates.push(`square_payment_id = $${values.length + 1}`)
    values.push(payment.id)
  }
  if (columns.has('client_id') && clientId) {
    updates.push(`client_id = COALESCE(client_id, $${values.length + 1})`)
    values.push(clientId)
  }
  if (columns.has('updated_at')) {
    updates.push('updated_at = NOW()')
  }

  values.push(booking.id)

  await db.query(
    `UPDATE bookings
     SET ${updates.join(', ')}
     WHERE id = $${values.length}`,
    values
  )

  if (clientId) {
    await createPackageEnrollmentForBooking(booking, payment.id, payment.amountCents, clientId)
  }

  const bookingName = await getBookingDisplayName(booking)
  await sendBookingConfirmation({
    clientName: booking.client_name,
    clientEmail: booking.client_email,
    serviceName: bookingName,
    bookingDate: booking.booking_date ?? undefined,
    bookingTime: booking.booking_time ?? undefined,
    durationMinutes: Number(booking.duration_minutes ?? 60),
    isPaid: true,
    amountPaid: payment.amountCents / 100,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature =
    request.headers.get('x-square-hmacsha256-signature') ??
    request.headers.get('x-square-signature')

  const square = await getSquareConfig()

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  if (!square.webhookSignatureKey) {
    return NextResponse.json({ error: 'Webhook signature key not configured' }, { status: 500 })
  }

  const notificationUrl =
    square.webhookNotificationUrl ??
    `${request.nextUrl.origin}/api/square/webhook`

  const valid = verifySquareWebhookSignature({
    body,
    notificationUrl,
    signature,
    signatureKey: square.webhookSignatureKey,
  })

  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: Record<string, any>

  try {
    payload = JSON.parse(body) as Record<string, any>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  if (payload.type !== 'payment.updated') {
    return NextResponse.json({ received: true, ignored: true })
  }

  try {
    const payment = extractSquarePaymentFromWebhook(payload)
    if (!payment || payment.status !== 'COMPLETED') {
      return NextResponse.json({ received: true, ignored: true })
    }

    await handleCompletedSquarePayment(payment)
  } catch (error) {
    console.error('[square/webhook] processing failed:', error)
  }

  return NextResponse.json({ received: true })
}
