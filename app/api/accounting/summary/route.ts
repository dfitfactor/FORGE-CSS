import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { getIntegrationSetting } from '@/lib/integration-settings'
import { getStripe } from '@/lib/stripe'
import { fetchZohoBooksJson, getZohoBooksConfig } from '@/lib/zoho-books'

type BookingRevenueRow = {
  paid_revenue_cents: string | null
  pending_revenue_cents: string | null
  waived_revenue_cents: string | null
  paid_booking_count: string | null
  pending_booking_count: string | null
  waived_booking_count: string | null
}

type EnrollmentRevenueRow = {
  paid_revenue_cents: string | null
  pending_revenue_cents: string | null
  active_subscription_count: string | null
  grace_period_count: string | null
}

type MonthlyRevenueRow = {
  month_label: string
  sort_month: string
  booking_paid_cents: string | null
  booking_pending_cents: string | null
  package_paid_cents: string | null
  package_pending_cents: string | null
}

type ZohoBankTransaction = {
  date?: string | null
  amount?: number | string | null
  debit_or_credit?: string | null
  transaction_type?: string | null
  type?: string | null
  status?: string | null
  is_internal_transfer?: boolean | null
}

type ZohoBankTransactionsResponse = {
  banktransactions?: ZohoBankTransaction[]
  page_context?: {
    has_more_page?: boolean
    page?: number
  }
}

type StripeRevenuePoint = {
  paidCents: number
  pendingCents: number
}

type MonthlyFinancePoint = {
  month: string
  sort_month: string
  booking_paid_cents: number
  booking_pending_cents: number
  package_paid_cents: number
  package_pending_cents: number
  total_paid_cents: number
  total_pending_cents: number
  zoho_money_in_cents: number
  zoho_money_out_cents: number
  profit_cents: number
}

let cachedBookingColumns: Set<string> | null = null
let cachedEnrollmentColumns: Set<string> | null = null

function toNumber(value: string | null | undefined) {
  return Number(value ?? '0')
}

async function getTableColumns(tableName: 'bookings' | 'package_enrollments') {
  if (tableName === 'bookings' && cachedBookingColumns) return cachedBookingColumns
  if (tableName === 'package_enrollments' && cachedEnrollmentColumns) return cachedEnrollmentColumns

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1`,
    [tableName]
  )

  const columns = new Set(rows.map((row) => row.column_name))

  if (tableName === 'bookings') cachedBookingColumns = columns
  if (tableName === 'package_enrollments') cachedEnrollmentColumns = columns

  return columns
}

function parseZohoAmount(value: number | string | null | undefined) {
  if (typeof value === 'number') return Math.round(value * 100)
  if (typeof value === 'string') return Math.round(Number(value || '0') * 100)
  return 0
}

function classifyZohoTransaction(transaction: ZohoBankTransaction) {
  const rawType = (transaction.transaction_type || transaction.type || '').toLowerCase().replace(/\s+/g, '_')
  const direction = (transaction.debit_or_credit || '').toLowerCase()
  const amountCents = Math.abs(parseZohoAmount(transaction.amount))

  const moneyOutTypes = new Set([
    'expense',
    'card_payment',
    'vendor_payment',
    'owner_drawings',
    'bill_payment',
    'refund',
    'purchase',
    'debit',
    'withdrawal',
    'service_charge',
  ])

  const moneyInTypes = new Set([
    'deposit',
    'credit',
    'customer_payment',
    'sales_without_invoices',
    'owner_contribution',
    'interest_income',
    'other_income',
    'income',
  ])

  if (transaction.is_internal_transfer || rawType.includes('transfer')) {
    return { moneyInCents: 0, moneyOutCents: 0 }
  }

  if (moneyOutTypes.has(rawType) || direction === 'debit') {
    return { moneyInCents: 0, moneyOutCents: amountCents }
  }

  if (moneyInTypes.has(rawType) || direction === 'credit') {
    return { moneyInCents: amountCents, moneyOutCents: 0 }
  }

  return { moneyInCents: 0, moneyOutCents: 0 }
}

async function loadZohoBankTransactions() {
  const config = await getZohoBooksConfig()

  if (!config.isEnabled || !config.clientId || !config.clientSecret || !config.refreshToken || !config.organizationId) {
    return {
      connected: false,
      moneyInCents: 0,
      moneyOutCents: 0,
      monthly: new Map<string, { moneyInCents: number; moneyOutCents: number }>(),
      note: 'Zoho Books connection is incomplete, so accounting-side cashflow is not available yet.',
    }
  }

  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 5)
  startDate.setDate(1)

  const monthly = new Map<string, { moneyInCents: number; moneyOutCents: number }>()
  let moneyInCents = 0
  let moneyOutCents = 0
  let page = 1
  let hasMore = true

  while (hasMore && page <= 5) {
    const response = await fetchZohoBooksJson<ZohoBankTransactionsResponse>(config, '/banktransactions', {
      page,
      per_page: 200,
      date_start: startDate.toISOString().slice(0, 10),
      date_end: new Date().toISOString().slice(0, 10),
    })

    const transactions = response.banktransactions ?? []

    for (const transaction of transactions) {
      const date = transaction.date ? new Date(transaction.date) : null
      const sortMonth =
        date && !Number.isNaN(date.getTime())
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          : null

      const classified = classifyZohoTransaction(transaction)
      moneyInCents += classified.moneyInCents
      moneyOutCents += classified.moneyOutCents

      if (sortMonth) {
        const existing = monthly.get(sortMonth) ?? { moneyInCents: 0, moneyOutCents: 0 }
        existing.moneyInCents += classified.moneyInCents
        existing.moneyOutCents += classified.moneyOutCents
        monthly.set(sortMonth, existing)
      }
    }

    hasMore = Boolean(response.page_context?.has_more_page)
    page += 1
  }

  return {
    connected: true,
    moneyInCents,
    moneyOutCents,
    monthly,
    note:
      moneyInCents || moneyOutCents
        ? 'Zoho Books cashflow is live from bank transactions.'
        : 'Zoho Books is connected, but no recent bank transactions were returned for the current six-month window.',
  }
}

async function loadStripeRevenue() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      connected: false,
      paidCents: 0,
      pendingCents: 0,
      monthly: new Map<string, StripeRevenuePoint>(),
      note: 'Stripe secret key is missing, so live Stripe revenue is unavailable.',
    }
  }

  const stripe = getStripe()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 5)
  startDate.setDate(1)
  startDate.setHours(0, 0, 0, 0)

  const monthly = new Map<string, StripeRevenuePoint>()
  let paidCents = 0
  let pendingCents = 0
  let startingAfter: string | undefined
  let pageCount = 0

  while (pageCount < 5) {
    const response = await stripe.paymentIntents.list({
      limit: 100,
      created: {
        gte: Math.floor(startDate.getTime() / 1000),
      },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const paymentIntent of response.data) {
      const createdDate = new Date(paymentIntent.created * 1000)
      const sortMonth = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`
      const monthBucket = monthly.get(sortMonth) ?? { paidCents: 0, pendingCents: 0 }

      if (paymentIntent.status === 'succeeded') {
        paidCents += paymentIntent.amount
        monthBucket.paidCents += paymentIntent.amount
      } else if (
        paymentIntent.status === 'processing' ||
        paymentIntent.status === 'requires_payment_method' ||
        paymentIntent.status === 'requires_action' ||
        paymentIntent.status === 'requires_confirmation'
      ) {
        pendingCents += paymentIntent.amount
        monthBucket.pendingCents += paymentIntent.amount
      }

      monthly.set(sortMonth, monthBucket)
    }

    if (!response.has_more || !response.data.length) break

    startingAfter = response.data[response.data.length - 1]?.id
    pageCount += 1
  }

  return {
    connected: true,
    paidCents,
    pendingCents,
    monthly,
    note:
      paidCents || pendingCents
        ? 'Stripe totals are live from recent payment intents.'
        : 'Stripe is connected, but no recent payment intents were returned for the current six-month window.',
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const [bookingColumns, enrollmentColumns] = await Promise.all([
      getTableColumns('bookings'),
      getTableColumns('package_enrollments'),
    ])

    const bookingAmountSql = bookingColumns.has('amount_cents')
      ? 'COALESCE(b.amount_cents, s.price_cents, p.price_cents, 0)'
      : 'COALESCE(s.price_cents, p.price_cents, 0)'

    const bookingPaymentStatusSql = bookingColumns.has('payment_status')
      ? "COALESCE(b.payment_status, 'unpaid')"
      : "'unpaid'"

    const bookingMonthSql = bookingColumns.has('booking_date')
      ? 'date_trunc(\'month\', b.booking_date)::date'
      : bookingColumns.has('scheduled_at')
        ? 'date_trunc(\'month\', b.scheduled_at)::date'
        : 'date_trunc(\'month\', NOW())::date'

    const enrollmentAmountSql = enrollmentColumns.has('amount_cents')
      ? 'COALESCE(amount_cents, 0)'
      : '0'

    const enrollmentPaymentStatusSql = enrollmentColumns.has('payment_status')
      ? "COALESCE(payment_status, 'unpaid')"
      : "'unpaid'"

    const enrollmentSubscriptionStatusSql = enrollmentColumns.has('subscription_status')
      ? "COALESCE(subscription_status, 'active')"
      : "'active'"

    const enrollmentMonthSql = enrollmentColumns.has('last_renewed_at')
      ? 'date_trunc(\'month\', COALESCE(last_renewed_at, billing_cycle_start, created_at))::date'
      : enrollmentColumns.has('billing_cycle_start')
        ? 'date_trunc(\'month\', COALESCE(billing_cycle_start, created_at))::date'
        : enrollmentColumns.has('created_at')
          ? 'date_trunc(\'month\', created_at)::date'
          : 'date_trunc(\'month\', NOW())::date'

    const [bookingRevenue, enrollmentRevenue, monthlyRevenue, zohoSetting, zohoBanking, stripeRevenue] = await Promise.all([
      db.queryOne<BookingRevenueRow>(
        `SELECT
           COALESCE(SUM(
             CASE
               WHEN ${bookingPaymentStatusSql} = 'paid'
               THEN ${bookingAmountSql}
               ELSE 0
             END
           ), 0)::text AS paid_revenue_cents,
           COALESCE(SUM(
             CASE
               WHEN ${bookingPaymentStatusSql} = 'unpaid'
               THEN ${bookingAmountSql}
               ELSE 0
             END
           ), 0)::text AS pending_revenue_cents,
           COALESCE(SUM(
             CASE
               WHEN ${bookingPaymentStatusSql} = 'waived'
               THEN ${bookingAmountSql}
               ELSE 0
             END
           ), 0)::text AS waived_revenue_cents,
           COALESCE(SUM(CASE WHEN ${bookingPaymentStatusSql} = 'paid' THEN 1 ELSE 0 END), 0)::text AS paid_booking_count,
           COALESCE(SUM(CASE WHEN ${bookingPaymentStatusSql} = 'unpaid' THEN 1 ELSE 0 END), 0)::text AS pending_booking_count,
           COALESCE(SUM(CASE WHEN ${bookingPaymentStatusSql} = 'waived' THEN 1 ELSE 0 END), 0)::text AS waived_booking_count
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         LEFT JOIN packages p ON b.package_id = p.id`
      ),
      db.queryOne<EnrollmentRevenueRow>(
        `SELECT
           COALESCE(SUM(
             CASE
               WHEN ${enrollmentPaymentStatusSql} = 'paid'
               THEN ${enrollmentAmountSql}
               ELSE 0
             END
           ), 0)::text AS paid_revenue_cents,
           COALESCE(SUM(
             CASE
               WHEN ${enrollmentPaymentStatusSql} <> 'paid'
               THEN ${enrollmentAmountSql}
               ELSE 0
             END
           ), 0)::text AS pending_revenue_cents,
           COALESCE(SUM(CASE WHEN ${enrollmentSubscriptionStatusSql} = 'active' THEN 1 ELSE 0 END), 0)::text AS active_subscription_count,
           COALESCE(SUM(CASE WHEN ${enrollmentSubscriptionStatusSql} = 'grace_period' THEN 1 ELSE 0 END), 0)::text AS grace_period_count
         FROM package_enrollments`
      ),
      db.query<MonthlyRevenueRow>(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', CURRENT_DATE) - interval '5 months',
             date_trunc('month', CURRENT_DATE),
             interval '1 month'
           )::date AS month_start
         ),
         booking_totals AS (
           SELECT
             ${bookingMonthSql} AS month_start,
             COALESCE(SUM(
               CASE
                 WHEN ${bookingPaymentStatusSql.replaceAll('b.', '')} = 'paid'
                 THEN ${bookingAmountSql.replaceAll('b.', '')}
                 ELSE 0
               END
             ), 0)::text AS booking_paid_cents,
             COALESCE(SUM(
               CASE
                 WHEN ${bookingPaymentStatusSql.replaceAll('b.', '')} = 'unpaid'
                 THEN ${bookingAmountSql.replaceAll('b.', '')}
                 ELSE 0
               END
             ), 0)::text AS booking_pending_cents
           FROM bookings b
           LEFT JOIN services s ON b.service_id = s.id
           LEFT JOIN packages p ON b.package_id = p.id
           GROUP BY 1
         ),
         package_totals AS (
           SELECT
             ${enrollmentMonthSql} AS month_start,
             COALESCE(SUM(
               CASE
                 WHEN ${enrollmentPaymentStatusSql} = 'paid'
                 THEN ${enrollmentAmountSql}
                 ELSE 0
               END
             ), 0)::text AS package_paid_cents,
             COALESCE(SUM(
               CASE
                 WHEN ${enrollmentPaymentStatusSql} <> 'paid'
                 THEN ${enrollmentAmountSql}
                 ELSE 0
               END
             ), 0)::text AS package_pending_cents
           FROM package_enrollments
           GROUP BY 1
         )
         SELECT
           to_char(months.month_start, 'Mon YYYY') AS month_label,
           to_char(months.month_start, 'YYYY-MM') AS sort_month,
           COALESCE(booking_totals.booking_paid_cents, '0') AS booking_paid_cents,
           COALESCE(booking_totals.booking_pending_cents, '0') AS booking_pending_cents,
           COALESCE(package_totals.package_paid_cents, '0') AS package_paid_cents,
           COALESCE(package_totals.package_pending_cents, '0') AS package_pending_cents
         FROM months
         LEFT JOIN booking_totals ON booking_totals.month_start = months.month_start
         LEFT JOIN package_totals ON package_totals.month_start = months.month_start
         ORDER BY months.month_start`
      ),
      getIntegrationSetting('zoho_books'),
      loadZohoBankTransactions().catch((error) => {
        console.error('[accounting/summary] Zoho banking sync error:', error)

        return {
          connected: false,
          moneyInCents: 0,
          moneyOutCents: 0,
          monthly: new Map<string, { moneyInCents: number; moneyOutCents: number }>(),
          note: 'Zoho Books could not be read right now, so accounting-side cashflow is temporarily unavailable.',
        }
      }),
      loadStripeRevenue().catch((error) => {
        console.error('[accounting/summary] Stripe revenue sync error:', error)

        return {
          connected: false,
          paidCents: 0,
          pendingCents: 0,
          monthly: new Map<string, StripeRevenuePoint>(),
          note: 'Stripe could not be read right now, so live Stripe totals are temporarily unavailable.',
        }
      }),
    ])

    const zohoConfig = (zohoSetting?.config ?? {}) as {
      organization_id?: string | null
      refresh_token?: string | null
      location?: string | null
    }

    const monthlyFinancials: MonthlyFinancePoint[] = monthlyRevenue.map((row) => {
      const zohoMonthly = zohoBanking.monthly.get(row.sort_month) ?? { moneyInCents: 0, moneyOutCents: 0 }
      const stripeMonthly = stripeRevenue.monthly.get(row.sort_month) ?? { paidCents: 0, pendingCents: 0 }
      const bookingPaid = toNumber(row.booking_paid_cents)
      const packagePaid = toNumber(row.package_paid_cents)
      const bookingPending = toNumber(row.booking_pending_cents)
      const packagePending = toNumber(row.package_pending_cents)

      return {
        month: row.month_label,
        sort_month: row.sort_month,
        booking_paid_cents: bookingPaid,
        booking_pending_cents: bookingPending,
        package_paid_cents: packagePaid,
        package_pending_cents: packagePending,
        total_paid_cents: stripeMonthly.paidCents || bookingPaid + packagePaid,
        total_pending_cents: stripeMonthly.pendingCents || bookingPending + packagePending,
        zoho_money_in_cents: zohoMonthly.moneyInCents,
        zoho_money_out_cents: zohoMonthly.moneyOutCents,
        profit_cents: zohoMonthly.moneyInCents - zohoMonthly.moneyOutCents,
      }
    })

    const summary = {
      revenue: {
        stripe_paid_cents: stripeRevenue.paidCents || toNumber(bookingRevenue?.paid_revenue_cents),
        stripe_pending_cents: stripeRevenue.pendingCents || toNumber(bookingRevenue?.pending_revenue_cents),
        waived_cents: toNumber(bookingRevenue?.waived_revenue_cents),
        package_paid_cents: toNumber(enrollmentRevenue?.paid_revenue_cents),
        package_pending_cents: toNumber(enrollmentRevenue?.pending_revenue_cents),
        known_money_in_cents:
          toNumber(bookingRevenue?.paid_revenue_cents) + toNumber(enrollmentRevenue?.paid_revenue_cents),
        known_pending_cents:
          toNumber(bookingRevenue?.pending_revenue_cents) + toNumber(enrollmentRevenue?.pending_revenue_cents),
        zoho_money_in_cents: zohoBanking.moneyInCents,
        zoho_money_out_cents: zohoBanking.moneyOutCents,
        zoho_net_cents: zohoBanking.moneyInCents - zohoBanking.moneyOutCents,
      },
      activity: {
        paid_booking_count: toNumber(bookingRevenue?.paid_booking_count),
        pending_booking_count: toNumber(bookingRevenue?.pending_booking_count),
        waived_booking_count: toNumber(bookingRevenue?.waived_booking_count),
        active_subscription_count: toNumber(enrollmentRevenue?.active_subscription_count),
        grace_period_count: toNumber(enrollmentRevenue?.grace_period_count),
      },
      integrations: {
        stripe: {
          configured: Boolean(process.env.STRIPE_SECRET_KEY),
          label: stripeRevenue.connected ? 'Connected' : 'Missing credentials',
        },
        zoho_books: {
          configured: Boolean(zohoSetting),
          enabled: zohoSetting?.is_enabled ?? false,
          last_test_status: zohoSetting?.last_test_status ?? null,
          last_test_message: zohoSetting?.last_test_message ?? null,
          last_tested_at: zohoSetting?.last_tested_at ?? null,
          organization_id: zohoConfig.organization_id ?? '',
          has_refresh_token: Boolean(zohoConfig.refresh_token),
          location: zohoConfig.location ?? '',
        },
      },
      reporting: {
        expenses_available: zohoBanking.connected,
        profit_loss_available: zohoBanking.connected,
        notes: [
          'Finance now combines live Stripe totals with FORGE booking/package context and Zoho Books cashflow when available.',
          stripeRevenue.note,
          zohoBanking.note,
          zohoBanking.connected
            ? 'Profit/Loss is currently based on Zoho Books bank transaction cashflow, not a full accrual accounting close.'
            : 'Connect and test Zoho Books to unlock accounting-side money in, money out, and profit/loss.',
        ],
      },
      charts: {
        monthly_revenue: monthlyFinancials,
      },
    }

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('[accounting/summary] GET error:', error)
    return NextResponse.json({ error: 'Failed to load accounting summary' }, { status: 500 })
  }
}
