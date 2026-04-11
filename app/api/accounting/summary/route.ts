import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { getIntegrationSetting } from '@/lib/integration-settings'

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

function toNumber(value: string | null | undefined) {
  return Number(value ?? '0')
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const [bookingRevenue, enrollmentRevenue, zohoSetting] = await Promise.all([
      db.queryOne<BookingRevenueRow>(
        `SELECT
           COALESCE(SUM(
             CASE
               WHEN b.payment_status = 'paid'
               THEN COALESCE(b.amount_cents, s.price_cents, p.price_cents, 0)
               ELSE 0
             END
           ), 0)::text AS paid_revenue_cents,
           COALESCE(SUM(
             CASE
               WHEN b.payment_status = 'unpaid'
               THEN COALESCE(b.amount_cents, s.price_cents, p.price_cents, 0)
               ELSE 0
             END
           ), 0)::text AS pending_revenue_cents,
           COALESCE(SUM(
             CASE
               WHEN b.payment_status = 'waived'
               THEN COALESCE(b.amount_cents, s.price_cents, p.price_cents, 0)
               ELSE 0
             END
           ), 0)::text AS waived_revenue_cents,
           COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN 1 ELSE 0 END), 0)::text AS paid_booking_count,
           COALESCE(SUM(CASE WHEN b.payment_status = 'unpaid' THEN 1 ELSE 0 END), 0)::text AS pending_booking_count,
           COALESCE(SUM(CASE WHEN b.payment_status = 'waived' THEN 1 ELSE 0 END), 0)::text AS waived_booking_count
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         LEFT JOIN packages p ON b.package_id = p.id`
      ),
      db.queryOne<EnrollmentRevenueRow>(
        `SELECT
           COALESCE(SUM(
             CASE
               WHEN COALESCE(payment_status, 'unpaid') = 'paid'
               THEN COALESCE(amount_cents, 0)
               ELSE 0
             END
           ), 0)::text AS paid_revenue_cents,
           COALESCE(SUM(
             CASE
               WHEN COALESCE(payment_status, 'unpaid') <> 'paid'
               THEN COALESCE(amount_cents, 0)
               ELSE 0
             END
           ), 0)::text AS pending_revenue_cents,
           COALESCE(SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END), 0)::text AS active_subscription_count,
           COALESCE(SUM(CASE WHEN subscription_status = 'grace_period' THEN 1 ELSE 0 END), 0)::text AS grace_period_count
         FROM package_enrollments`
      ),
      getIntegrationSetting('zoho_books'),
    ])

    const zohoConfig = (zohoSetting?.config ?? {}) as {
      organization_id?: string | null
      refresh_token?: string | null
      location?: string | null
    }

    const summary = {
      revenue: {
        stripe_paid_cents: toNumber(bookingRevenue?.paid_revenue_cents),
        stripe_pending_cents: toNumber(bookingRevenue?.pending_revenue_cents),
        waived_cents: toNumber(bookingRevenue?.waived_revenue_cents),
        package_paid_cents: toNumber(enrollmentRevenue?.paid_revenue_cents),
        package_pending_cents: toNumber(enrollmentRevenue?.pending_revenue_cents),
        known_money_in_cents:
          toNumber(bookingRevenue?.paid_revenue_cents) + toNumber(enrollmentRevenue?.paid_revenue_cents),
        known_pending_cents:
          toNumber(bookingRevenue?.pending_revenue_cents) + toNumber(enrollmentRevenue?.pending_revenue_cents),
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
          configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
          label: process.env.STRIPE_SECRET_KEY ? 'Connected' : 'Missing credentials',
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
        expenses_available: false,
        profit_loss_available: false,
        notes: [
          'Money out and profit/loss stay unavailable until Zoho expense or bill data is wired.',
          'Current revenue totals reflect FORGE-recorded bookings and package enrollments only.',
        ],
      },
    }

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('[accounting/summary] GET error:', error)
    return NextResponse.json({ error: 'Failed to load accounting summary' }, { status: 500 })
  }
}
