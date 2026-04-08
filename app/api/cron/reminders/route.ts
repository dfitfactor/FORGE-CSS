import { NextRequest, NextResponse } from 'next/server'
import {
  sendCoachPausedAccountEmail,
  sendGracePeriodEndingEmail,
  sendSessionExpiryReminderEmail,
  sendUpcomingSessionReminderEmail,
} from '@/lib/email'
import { getCoachSettings } from '@/lib/coach-settings'
import { db } from '@/lib/db'
import {
  createBillingPortalUrl,
  getAppBaseUrl,
  insertReminderLog,
} from '@/lib/subscriptions'

type UpcomingBookingRow = {
  id: string
  scheduled_at: string
  client_id: string
  email: string
  full_name: string
}

type ExpiringEnrollmentRow = {
  client_id: string
  sessions_remaining: number
  sessions_expire_at: string
  email: string
  full_name: string
  stripe_customer_id: string | null
}

type GracePeriodRow = {
  enrollment_id: string
  client_id: string
  grace_period_ends_at: string
  email: string
  full_name: string
  stripe_customer_id: string | null
}

function formatDateTimeLabel(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const coachSettings = await getCoachSettings()
    const portalDashboardUrl = `${getAppBaseUrl()}/portal/dashboard`
    const portalBookingUrl = `${getAppBaseUrl()}/portal/book`

    const [upcomingSessions, expiringSevenDays, expiringThreeDays, graceEnding, pauseCandidates] = await Promise.all([
      db.query<UpcomingBookingRow>(
        `SELECT b.id,
                b.scheduled_at::text AS scheduled_at,
                b.client_id,
                c.email,
                c.full_name
         FROM bookings b
         JOIN clients c ON c.id = b.client_id
         WHERE b.status = 'confirmed'
           AND b.scheduled_at BETWEEN NOW() + interval '23 hours' AND NOW() + interval '25 hours'
           AND NOT EXISTS (
             SELECT 1
             FROM reminder_log rl
             WHERE rl.booking_id = b.id
               AND rl.reminder_type = 'session_24h'
           )`
      ),
      db.query<ExpiringEnrollmentRow>(
        `SELECT pe.client_id,
                pe.sessions_remaining,
                pe.sessions_expire_at::text AS sessions_expire_at,
                pe.stripe_customer_id,
                c.email,
                c.full_name
         FROM package_enrollments pe
         JOIN clients c ON c.id = pe.client_id
         WHERE pe.subscription_status = 'active'
           AND pe.override_expiration = false
           AND pe.sessions_remaining > 0
           AND pe.sessions_expire_at BETWEEN NOW() + interval '6 days' AND NOW() + interval '8 days'
           AND NOT EXISTS (
             SELECT 1
             FROM reminder_log rl
             WHERE rl.client_id = pe.client_id
               AND rl.reminder_type = 'expiry_7d'
               AND rl.sent_at > NOW() - interval '8 days'
           )`
      ),
      db.query<ExpiringEnrollmentRow>(
        `SELECT pe.client_id,
                pe.sessions_remaining,
                pe.sessions_expire_at::text AS sessions_expire_at,
                pe.stripe_customer_id,
                c.email,
                c.full_name
         FROM package_enrollments pe
         JOIN clients c ON c.id = pe.client_id
         WHERE pe.subscription_status = 'active'
           AND pe.override_expiration = false
           AND pe.sessions_remaining > 0
           AND pe.sessions_expire_at BETWEEN NOW() + interval '2 days' AND NOW() + interval '4 days'
           AND NOT EXISTS (
             SELECT 1
             FROM reminder_log rl
             WHERE rl.client_id = pe.client_id
               AND rl.reminder_type = 'expiry_3d'
               AND rl.sent_at > NOW() - interval '4 days'
           )`
      ),
      db.query<GracePeriodRow>(
        `SELECT pe.id AS enrollment_id,
                pe.client_id,
                pe.grace_period_ends_at::text AS grace_period_ends_at,
                pe.stripe_customer_id,
                c.email,
                c.full_name
         FROM package_enrollments pe
         JOIN clients c ON c.id = pe.client_id
         WHERE pe.subscription_status = 'grace_period'
           AND pe.grace_period_ends_at BETWEEN NOW() + interval '23 hours' AND NOW() + interval '25 hours'
           AND NOT EXISTS (
             SELECT 1
             FROM reminder_log rl
             WHERE rl.client_id = pe.client_id
               AND rl.reminder_type = 'grace_period_ending'
               AND rl.sent_at > NOW() - interval '2 days'
           )`
      ),
      db.query<GracePeriodRow>(
        `SELECT pe.id AS enrollment_id,
                pe.client_id,
                pe.grace_period_ends_at::text AS grace_period_ends_at,
                pe.stripe_customer_id,
                c.email,
                c.full_name
         FROM package_enrollments pe
         JOIN clients c ON c.id = pe.client_id
         WHERE pe.subscription_status = 'grace_period'
           AND pe.grace_period_ends_at < NOW()`
      ),
    ])

    for (const booking of upcomingSessions) {
      await sendUpcomingSessionReminderEmail({
        clientEmail: booking.email,
        dateTimeLabel: formatDateTimeLabel(booking.scheduled_at),
        portalUrl: portalDashboardUrl,
      })

      await insertReminderLog({
        clientId: booking.client_id,
        reminderType: 'session_24h',
        bookingId: booking.id,
      })
    }

    for (const enrollment of expiringSevenDays) {
      await sendSessionExpiryReminderEmail({
        clientEmail: enrollment.email,
        daysUntilExpiry: 7,
        sessionsRemaining: Number(enrollment.sessions_remaining ?? 0),
        expirationDate: formatDateLabel(enrollment.sessions_expire_at),
        portalUrl: portalBookingUrl,
      })

      await insertReminderLog({
        clientId: enrollment.client_id,
        reminderType: 'expiry_7d',
      })
    }

    for (const enrollment of expiringThreeDays) {
      await sendSessionExpiryReminderEmail({
        clientEmail: enrollment.email,
        daysUntilExpiry: 3,
        sessionsRemaining: Number(enrollment.sessions_remaining ?? 0),
        expirationDate: formatDateLabel(enrollment.sessions_expire_at),
        portalUrl: portalBookingUrl,
      })

      await insertReminderLog({
        clientId: enrollment.client_id,
        reminderType: 'expiry_3d',
      })
    }

    for (const enrollment of graceEnding) {
      const updatePaymentUrl = enrollment.stripe_customer_id
        ? await createBillingPortalUrl(enrollment.stripe_customer_id)
        : null

      await sendGracePeriodEndingEmail({
        clientEmail: enrollment.email,
        updatePaymentUrl,
      })

      await insertReminderLog({
        clientId: enrollment.client_id,
        reminderType: 'grace_period_ending',
        metadata: {
          grace_period_ends_at: enrollment.grace_period_ends_at,
        },
      })
    }

    for (const enrollment of pauseCandidates) {
      await db.query(
        `UPDATE package_enrollments
         SET subscription_status = 'paused',
             updated_at = NOW()
         WHERE id = $1
           AND subscription_status = 'grace_period'`,
        [enrollment.enrollment_id]
      )

      await sendCoachPausedAccountEmail({
        coachEmail: coachSettings.coachEmail,
        clientName: enrollment.full_name,
      })
    }

    return NextResponse.json({
      success: true,
      sent: {
        session24h: upcomingSessions.length,
        expiry7d: expiringSevenDays.length,
        expiry3d: expiringThreeDays.length,
        gracePeriodEnding: graceEnding.length,
        paused: pauseCandidates.length,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process reminders' },
      { status: 500 }
    )
  }
}
