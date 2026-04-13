import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { getIntegrationSetting } from '@/lib/integration-settings'
import { getStripe } from '@/lib/stripe'
import { fetchZohoBooksJson, getZohoBooksConfig } from '@/lib/zoho-books'

type RangeKey =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'year_to_date'
  | 'last_4_weeks'

type SummaryMetrics = {
  stripe_gross_cents: number
  stripe_pending_cents: number
  zoho_money_in_cents: number
  zoho_money_out_cents: number
  profit_cents: number
  known_pending_cents: number
  paid_booking_count: number
  active_subscription_count: number
}

type ComparisonMetric = {
  current: number
  previous: number
  delta: number
  delta_percent: number | null
}

type SummaryRow = {
  paid_revenue_cents: string | null
  pending_revenue_cents: string | null
  paid_booking_count: string | null
  active_subscription_count: string | null
}

type TopCustomerRow = {
  customer_name: string | null
  customer_email: string | null
  paid_total_cents: string | null
}

type ZohoBankTransaction = {
  date?: string | null
  amount?: number | string | null
  debit_or_credit?: string | null
  transaction_type?: string | null
  type?: string | null
  is_internal_transfer?: boolean | null
}

type ZohoBankTransactionsResponse = {
  banktransactions?: ZohoBankTransaction[]
  page_context?: {
    has_more_page?: boolean
  }
}

type StripePoint = {
  paidCents: number
  pendingCents: number
}

type ZohoPoint = {
  moneyInCents: number
  moneyOutCents: number
}

type TableName = 'bookings' | 'package_enrollments'

let cachedBookingColumns: Set<string> | null = null
let cachedEnrollmentColumns: Set<string> | null = null

function toNumber(value: string | null | undefined) {
  return Number(value ?? '0')
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function startOfWeek(date: Date) {
  const next = startOfDay(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  return next
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfQuarter(date: Date) {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), quarterMonth, 1)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function addYears(date: Date, years: number) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function differenceInDays(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay))
}

function safePercentDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

function parseRangeKey(value: string | null): RangeKey {
  const allowed: RangeKey[] = ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'year_to_date', 'last_4_weeks']
  return allowed.includes(value as RangeKey) ? (value as RangeKey) : 'year_to_date'
}

function resolveRange(range: RangeKey) {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)

  switch (range) {
    case 'today':
      return {
        key: range,
        label: 'Today',
        start: todayStart,
        end: todayEnd,
        granularity: 'hour' as const,
      }
    case 'this_week':
      return {
        key: range,
        label: 'This Week',
        start: startOfWeek(now),
        end: todayEnd,
        granularity: 'day' as const,
      }
    case 'this_month':
      return {
        key: range,
        label: 'This Month',
        start: startOfMonth(now),
        end: todayEnd,
        granularity: 'day' as const,
      }
    case 'this_quarter':
      return {
        key: range,
        label: 'This Quarter',
        start: startOfQuarter(now),
        end: todayEnd,
        granularity: 'week' as const,
      }
    case 'this_year':
    case 'year_to_date':
      return {
        key: range,
        label: 'Year To Date',
        start: new Date(now.getFullYear(), 0, 1),
        end: todayEnd,
        granularity: 'month' as const,
      }
    case 'last_4_weeks':
      return {
        key: range,
        label: 'Last 4 Weeks',
        start: addDays(todayStart, -27),
        end: todayEnd,
        granularity: 'week' as const,
      }
  }
}

function getPreviousRange(start: Date, end: Date) {
  const days = differenceInDays(start, end)
  const previousEnd = addDays(start, -1)
  const previousStart = addDays(previousEnd, -(days - 1))
  return {
    start: startOfDay(previousStart),
    end: endOfDay(previousEnd),
  }
}

async function getTableColumns(tableName: TableName) {
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

  if (transaction.is_internal_transfer || rawType.includes('transfer')) {
    return { moneyInCents: 0, moneyOutCents: 0 }
  }

  const moneyOutTypes = new Set(['expense', 'card_payment', 'vendor_payment', 'owner_drawings', 'bill_payment', 'refund', 'purchase', 'debit', 'withdrawal', 'service_charge'])
  const moneyInTypes = new Set(['deposit', 'credit', 'customer_payment', 'sales_without_invoices', 'owner_contribution', 'interest_income', 'other_income', 'income'])

  if (moneyOutTypes.has(rawType) || direction === 'debit') {
    return { moneyInCents: 0, moneyOutCents: amountCents }
  }

  if (moneyInTypes.has(rawType) || direction === 'credit') {
    return { moneyInCents: amountCents, moneyOutCents: 0 }
  }

  return { moneyInCents: 0, moneyOutCents: 0 }
}

function formatBucket(date: Date, granularity: 'hour' | 'day' | 'week' | 'month') {
  if (granularity === 'hour') {
    return `${String(date.getHours()).padStart(2, '0')}:00`
  }

  if (granularity === 'day') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (granularity === 'week') {
    const weekStart = startOfWeek(date)
    return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return date.toLocaleDateString('en-US', { month: 'short' })
}

function sortKey(date: Date, granularity: 'hour' | 'day' | 'week' | 'month') {
  if (granularity === 'hour') return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`
  if (granularity === 'day') return date.toISOString().slice(0, 10)
  if (granularity === 'week') return startOfWeek(date).toISOString().slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function generateBuckets(start: Date, end: Date, granularity: 'hour' | 'day' | 'week' | 'month') {
  const buckets: Array<{ label: string; sort_key: string }> = []
  const cursor = new Date(start)

  while (cursor <= end) {
    buckets.push({
      label: formatBucket(cursor, granularity),
      sort_key: sortKey(cursor, granularity),
    })

    if (granularity === 'hour') cursor.setHours(cursor.getHours() + 1)
    else if (granularity === 'day') cursor.setDate(cursor.getDate() + 1)
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7)
    else cursor.setMonth(cursor.getMonth() + 1)
  }

  return buckets
}

async function loadZohoRange(start: Date, end: Date, granularity: 'hour' | 'day' | 'week' | 'month') {
  const config = await getZohoBooksConfig()

  if (!config.isEnabled || !config.clientId || !config.clientSecret || !config.refreshToken || !config.organizationId) {
    return {
      connected: false,
      moneyInCents: 0,
      moneyOutCents: 0,
      buckets: new Map<string, ZohoPoint>(),
    }
  }

  const buckets = new Map<string, ZohoPoint>()
  let moneyInCents = 0
  let moneyOutCents = 0
  let page = 1
  let hasMore = true

  while (hasMore && page <= 10) {
    const response = await fetchZohoBooksJson<ZohoBankTransactionsResponse>(config, '/banktransactions', {
      page,
      per_page: 200,
      date_start: start.toISOString().slice(0, 10),
      date_end: end.toISOString().slice(0, 10),
    })

    for (const transaction of response.banktransactions ?? []) {
      const date = transaction.date ? new Date(transaction.date) : null
      if (!date || Number.isNaN(date.getTime())) continue

      const bucketKey = sortKey(date, granularity)
      const current = buckets.get(bucketKey) ?? { moneyInCents: 0, moneyOutCents: 0 }
      const classified = classifyZohoTransaction(transaction)

      current.moneyInCents += classified.moneyInCents
      current.moneyOutCents += classified.moneyOutCents
      moneyInCents += classified.moneyInCents
      moneyOutCents += classified.moneyOutCents
      buckets.set(bucketKey, current)
    }

    hasMore = Boolean(response.page_context?.has_more_page)
    page += 1
  }

  return {
    connected: true,
    moneyInCents,
    moneyOutCents,
    buckets,
  }
}

async function loadStripeRange(start: Date, end: Date, granularity: 'hour' | 'day' | 'week' | 'month') {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      connected: false,
      paidCents: 0,
      pendingCents: 0,
      failedCount: 0,
      buckets: new Map<string, StripePoint>(),
    }
  }

  const stripe = getStripe()
  const buckets = new Map<string, StripePoint>()
  let paidCents = 0
  let pendingCents = 0
  let failedCount = 0
  let startingAfter: string | undefined
  let pageCount = 0

  while (pageCount < 10) {
    const response = await stripe.paymentIntents.list({
      limit: 100,
      created: {
        gte: Math.floor(start.getTime() / 1000),
        lte: Math.floor(end.getTime() / 1000),
      },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const paymentIntent of response.data) {
      const createdDate = new Date(paymentIntent.created * 1000)
      const bucketKey = sortKey(createdDate, granularity)
      const bucket = buckets.get(bucketKey) ?? { paidCents: 0, pendingCents: 0 }

      if (paymentIntent.status === 'succeeded') {
        paidCents += paymentIntent.amount
        bucket.paidCents += paymentIntent.amount
      } else if (
        paymentIntent.status === 'processing' ||
        paymentIntent.status === 'requires_payment_method' ||
        paymentIntent.status === 'requires_action' ||
        paymentIntent.status === 'requires_confirmation'
      ) {
        pendingCents += paymentIntent.amount
        bucket.pendingCents += paymentIntent.amount
      } else if (paymentIntent.status === 'canceled') {
        failedCount += 1
      }

      buckets.set(bucketKey, bucket)
    }

    if (!response.has_more || !response.data.length) break
    startingAfter = response.data[response.data.length - 1]?.id
    pageCount += 1
  }

  return {
    connected: true,
    paidCents,
    pendingCents,
    failedCount,
    buckets,
  }
}

async function loadForgeSummary(start: Date, end: Date, bookingColumns: Set<string>, enrollmentColumns: Set<string>) {
  const bookingAmountSql = bookingColumns.has('amount_cents')
    ? 'COALESCE(b.amount_cents, s.price_cents, p.price_cents, 0)'
    : 'COALESCE(s.price_cents, p.price_cents, 0)'

  const bookingPaymentStatusSql = bookingColumns.has('payment_status')
    ? "COALESCE(b.payment_status, 'unpaid')"
    : "'unpaid'"

  const bookingDateSql = bookingColumns.has('booking_date')
    ? 'b.booking_date::date'
    : bookingColumns.has('scheduled_at')
      ? 'b.scheduled_at::date'
      : 'CURRENT_DATE'

  const enrollmentAmountSql = enrollmentColumns.has('amount_cents') ? 'COALESCE(amount_cents, 0)' : '0'
  const enrollmentPaymentStatusSql = enrollmentColumns.has('payment_status') ? "COALESCE(payment_status, 'unpaid')" : "'unpaid'"
  const enrollmentSubscriptionStatusSql = enrollmentColumns.has('subscription_status') ? "COALESCE(subscription_status, 'active')" : "'active'"
  const enrollmentDateSql = enrollmentColumns.has('last_renewed_at')
    ? 'COALESCE(last_renewed_at::date, billing_cycle_start, created_at::date)'
    : enrollmentColumns.has('billing_cycle_start')
      ? 'COALESCE(billing_cycle_start, created_at::date)'
      : enrollmentColumns.has('created_at')
        ? 'created_at::date'
        : 'CURRENT_DATE'

  const [summary, topCustomers] = await Promise.all([
    db.queryOne<SummaryRow>(
      `SELECT
         COALESCE(SUM(
           CASE WHEN ${bookingPaymentStatusSql} = 'paid' THEN ${bookingAmountSql} ELSE 0 END
         ), 0)::text AS paid_revenue_cents,
         COALESCE(SUM(
           CASE WHEN ${bookingPaymentStatusSql} = 'unpaid' THEN ${bookingAmountSql} ELSE 0 END
         ), 0)::text AS pending_revenue_cents,
         COALESCE(SUM(
           CASE WHEN ${bookingPaymentStatusSql} = 'paid' THEN 1 ELSE 0 END
         ), 0)::text AS paid_booking_count,
         (
           SELECT COALESCE(SUM(CASE WHEN ${enrollmentSubscriptionStatusSql} = 'active' THEN 1 ELSE 0 END), 0)::text
           FROM package_enrollments
           WHERE ${enrollmentDateSql} BETWEEN $1::date AND $2::date
         ) AS active_subscription_count
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN packages p ON b.package_id = p.id
       WHERE ${bookingDateSql} BETWEEN $1::date AND $2::date`,
      [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    ),
    db.query<TopCustomerRow>(
      `SELECT
         NULLIF(TRIM(COALESCE(b.client_name, '')), '') AS customer_name,
         NULLIF(TRIM(COALESCE(b.client_email, '')), '') AS customer_email,
         COALESCE(SUM(
           CASE WHEN ${bookingPaymentStatusSql} = 'paid' THEN ${bookingAmountSql} ELSE 0 END
         ), 0)::text AS paid_total_cents
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN packages p ON b.package_id = p.id
       WHERE ${bookingDateSql} BETWEEN $1::date AND $2::date
       GROUP BY 1, 2
       HAVING COALESCE(SUM(
         CASE WHEN ${bookingPaymentStatusSql} = 'paid' THEN ${bookingAmountSql} ELSE 0 END
       ), 0) > 0
       ORDER BY COALESCE(SUM(
         CASE WHEN ${bookingPaymentStatusSql} = 'paid' THEN ${bookingAmountSql} ELSE 0 END
       ), 0) DESC
       LIMIT 5`,
      [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    ),
  ])

  return {
    paidRevenueCents: toNumber(summary?.paid_revenue_cents),
    pendingRevenueCents: toNumber(summary?.pending_revenue_cents),
    paidBookingCount: toNumber(summary?.paid_booking_count),
    activeSubscriptionCount: toNumber(summary?.active_subscription_count),
    topCustomers: topCustomers.map((row) => ({
      name: row.customer_name || row.customer_email || 'Unknown customer',
      email: row.customer_email || '',
      paid_total_cents: toNumber(row.paid_total_cents),
    })),
  }
}

function buildComparisonMetric(current: number, previous: number): ComparisonMetric {
  return {
    current,
    previous,
    delta: current - previous,
    delta_percent: safePercentDelta(current, previous),
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
    const rangeKey = parseRangeKey(request.nextUrl.searchParams.get('range'))
    const compare = request.nextUrl.searchParams.get('compare') !== 'false'
    const currentRange = resolveRange(rangeKey)
    const previousRange = getPreviousRange(currentRange.start, currentRange.end)

    const [bookingColumns, enrollmentColumns] = await Promise.all([
      getTableColumns('bookings'),
      getTableColumns('package_enrollments'),
    ])

    const [currentForge, previousForge, currentStripe, previousStripe, currentZoho, previousZoho, zohoSetting] = await Promise.all([
      loadForgeSummary(currentRange.start, currentRange.end, bookingColumns, enrollmentColumns),
      compare
        ? loadForgeSummary(previousRange.start, previousRange.end, bookingColumns, enrollmentColumns)
        : Promise.resolve({
            paidRevenueCents: 0,
            pendingRevenueCents: 0,
            paidBookingCount: 0,
            activeSubscriptionCount: 0,
            topCustomers: [],
          }),
      loadStripeRange(currentRange.start, currentRange.end, currentRange.granularity).catch(() => ({
        connected: false,
        paidCents: 0,
        pendingCents: 0,
        failedCount: 0,
        buckets: new Map<string, StripePoint>(),
      })),
      compare
        ? loadStripeRange(previousRange.start, previousRange.end, currentRange.granularity).catch(() => ({
            connected: false,
            paidCents: 0,
            pendingCents: 0,
            failedCount: 0,
            buckets: new Map<string, StripePoint>(),
          }))
        : Promise.resolve({
            connected: false,
            paidCents: 0,
            pendingCents: 0,
            failedCount: 0,
            buckets: new Map<string, StripePoint>(),
          }),
      loadZohoRange(currentRange.start, currentRange.end, currentRange.granularity).catch(() => ({
        connected: false,
        moneyInCents: 0,
        moneyOutCents: 0,
        buckets: new Map<string, ZohoPoint>(),
      })),
      compare
        ? loadZohoRange(previousRange.start, previousRange.end, currentRange.granularity).catch(() => ({
            connected: false,
            moneyInCents: 0,
            moneyOutCents: 0,
            buckets: new Map<string, ZohoPoint>(),
          }))
        : Promise.resolve({
            connected: false,
            moneyInCents: 0,
            moneyOutCents: 0,
            buckets: new Map<string, ZohoPoint>(),
          }),
      getIntegrationSetting('zoho_books'),
    ])

    const currentBuckets = generateBuckets(currentRange.start, currentRange.end, currentRange.granularity)
    const previousBuckets = generateBuckets(previousRange.start, previousRange.end, currentRange.granularity)

    const charts = currentBuckets.map((bucket, index) => {
      const stripe = currentStripe.buckets.get(bucket.sort_key) ?? { paidCents: 0, pendingCents: 0 }
      const zoho = currentZoho.buckets.get(bucket.sort_key) ?? { moneyInCents: 0, moneyOutCents: 0 }
      const previousBucket = previousBuckets[index]
      const previousStripeBucket = previousBucket ? previousStripe.buckets.get(previousBucket.sort_key) : undefined
      const previousZohoBucket = previousBucket ? previousZoho.buckets.get(previousBucket.sort_key) : undefined

      return {
        label: bucket.label,
        sort_key: bucket.sort_key,
        stripe_paid_cents: stripe.paidCents,
        stripe_pending_cents: stripe.pendingCents,
        zoho_money_in_cents: zoho.moneyInCents,
        zoho_money_out_cents: zoho.moneyOutCents,
        profit_cents: zoho.moneyInCents - zoho.moneyOutCents,
        previous_stripe_paid_cents: previousStripeBucket?.paidCents ?? 0,
        previous_profit_cents: previousZohoBucket ? previousZohoBucket.moneyInCents - previousZohoBucket.moneyOutCents : 0,
      }
    })

    const metrics: SummaryMetrics = {
      stripe_gross_cents: currentStripe.paidCents || currentForge.paidRevenueCents,
      stripe_pending_cents: currentStripe.pendingCents || currentForge.pendingRevenueCents,
      zoho_money_in_cents: currentZoho.moneyInCents,
      zoho_money_out_cents: currentZoho.moneyOutCents,
      profit_cents: currentZoho.moneyInCents - currentZoho.moneyOutCents,
      known_pending_cents: currentForge.pendingRevenueCents,
      paid_booking_count: currentForge.paidBookingCount,
      active_subscription_count: currentForge.activeSubscriptionCount,
    }

    const previousMetrics: SummaryMetrics = {
      stripe_gross_cents: previousStripe.paidCents || previousForge.paidRevenueCents,
      stripe_pending_cents: previousStripe.pendingCents || previousForge.pendingRevenueCents,
      zoho_money_in_cents: previousZoho.moneyInCents,
      zoho_money_out_cents: previousZoho.moneyOutCents,
      profit_cents: previousZoho.moneyInCents - previousZoho.moneyOutCents,
      known_pending_cents: previousForge.pendingRevenueCents,
      paid_booking_count: previousForge.paidBookingCount,
      active_subscription_count: previousForge.activeSubscriptionCount,
    }

    const zohoConfig = (zohoSetting?.config ?? {}) as {
      organization_id?: string | null
      refresh_token?: string | null
      location?: string | null
    }

    return NextResponse.json({
      summary: {
        filters: {
          range: currentRange.key,
          label: currentRange.label,
          start: currentRange.start.toISOString(),
          end: currentRange.end.toISOString(),
          compare_start: compare ? previousRange.start.toISOString() : null,
          compare_end: compare ? previousRange.end.toISOString() : null,
          granularity: currentRange.granularity,
          compare_enabled: compare,
        },
        metrics,
        comparisons: {
          stripe_gross_cents: buildComparisonMetric(metrics.stripe_gross_cents, previousMetrics.stripe_gross_cents),
          stripe_pending_cents: buildComparisonMetric(metrics.stripe_pending_cents, previousMetrics.stripe_pending_cents),
          zoho_money_in_cents: buildComparisonMetric(metrics.zoho_money_in_cents, previousMetrics.zoho_money_in_cents),
          zoho_money_out_cents: buildComparisonMetric(metrics.zoho_money_out_cents, previousMetrics.zoho_money_out_cents),
          profit_cents: buildComparisonMetric(metrics.profit_cents, previousMetrics.profit_cents),
          paid_booking_count: buildComparisonMetric(metrics.paid_booking_count, previousMetrics.paid_booking_count),
          active_subscription_count: buildComparisonMetric(metrics.active_subscription_count, previousMetrics.active_subscription_count),
        },
        activity: {
          paid_booking_count: metrics.paid_booking_count,
          active_subscription_count: metrics.active_subscription_count,
          failed_payment_count: currentStripe.failedCount,
        },
        integrations: {
          stripe: {
            configured: Boolean(process.env.STRIPE_SECRET_KEY),
            label: currentStripe.connected ? 'Connected' : 'Missing credentials',
          },
          zoho_books: {
            configured: Boolean(zohoSetting),
            enabled: zohoSetting?.is_enabled ?? false,
            last_test_status: zohoSetting?.last_test_status ?? null,
            organization_id: zohoConfig.organization_id ?? '',
            has_refresh_token: Boolean(zohoConfig.refresh_token),
            location: zohoConfig.location ?? '',
          },
        },
        reporting: {
          expenses_available: currentZoho.connected,
          profit_loss_available: currentZoho.connected,
          notes: [
            'Finance view blends live Stripe revenue with Zoho Books cashflow for the selected date range.',
            currentZoho.connected
              ? 'Profit/loss is cashflow-based and reflects Zoho inflows minus outflows.'
              : 'Connect and test Zoho Books to unlock live money-out and profit/loss reporting.',
          ],
        },
        charts: {
          timeline: charts,
        },
        top_customers: currentForge.topCustomers,
      },
    })
  } catch (error) {
    console.error('[accounting/summary] GET error:', error)
    return NextResponse.json({ error: 'Failed to load accounting summary' }, { status: 500 })
  }
}
