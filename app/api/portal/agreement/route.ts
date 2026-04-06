import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'

const stageDescriptions: Record<string, string> = {
  foundations: 'Foundations - Semi-Private Training & App Support',
  optimization: 'Optimization - Semi-Private Training & App Support',
  resilience: 'Resilience - Health & Performance Coaching',
  growth: 'Growth - Health, Habit & Performance Coaching',
  empowerment: 'Empowerment - Concierge Health & Performance Advocacy',
  youth: 'Youth Performance Program',
  nutrition: 'Nutrition Coaching - FuelMap Program',
  flex: 'Flex Training Pack',
}

export async function GET(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = await db.queryOne<{
    id: string
    full_name: string
    email: string
    phone: string | null
  }>(
    `SELECT id, full_name, email, phone
     FROM clients WHERE id = $1`,
    [session.clientId]
  )

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const enrollment = await db.queryOne<{
    id: string
    sessions_total: number | null
    sessions_per_week: number | null
    amount_cents: number | null
    billing_type: string | null
    agreement_signed: boolean | null
    package_name: string
    duration_minutes: number | null
    billing_period_months: number | null
    forge_stage: string | null
    session_count: number | null
  }>(
    `SELECT pe.id, pe.sessions_total, pe.sessions_per_week,
      pe.amount_cents, pe.billing_type, pe.agreement_signed,
      p.name as package_name, p.duration_minutes,
      p.billing_period_months, p.forge_stage,
      p.session_count
     FROM package_enrollments pe
     JOIN packages p ON p.id = pe.package_id
     WHERE pe.client_id = $1
       AND pe.status = 'active'
       AND (pe.agreement_signed = false OR pe.agreement_signed IS NULL)
     ORDER BY pe.created_at DESC
     LIMIT 1`,
    [session.clientId]
  )

  const booking = !enrollment
    ? await db.queryOne<{
        id: string
        booking_date: string
        agreement_signed: boolean | null
        item_name: string
        duration: number
        price_cents: number | null
      }>(
        `SELECT b.id, b.booking_date::text, b.agreement_signed,
          COALESCE(s.name, p2.name) as item_name,
          COALESCE(s.duration_minutes, p2.duration_minutes, 60) as duration,
          COALESCE(s.price_cents, p2.price_cents, 0) as price_cents
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         LEFT JOIN packages p2 ON b.package_id = p2.id
         WHERE b.client_id = $1
           AND b.status IN ('pending','confirmed')
           AND (b.agreement_signed = false OR b.agreement_signed IS NULL)
         ORDER BY b.created_at DESC
         LIMIT 1`,
        [session.clientId]
      )
    : null

  if (enrollment) {
    return NextResponse.json({
      agreementData: {
        type: 'enrollment',
        enrollmentId: enrollment.id,
        bookingId: null,
        clientName: client.full_name,
        clientEmail: client.email,
        clientPhone: client.phone || '',
        programName: stageDescriptions[String(enrollment.forge_stage || '').toLowerCase()] || enrollment.package_name,
        packageName: enrollment.package_name,
        sessionDuration: enrollment.duration_minutes,
        sessionsTotal: enrollment.sessions_total,
        sessionsPerWeek: enrollment.sessions_per_week,
        billingAmount: (((enrollment.amount_cents ?? 0) / 100)).toFixed(2),
        billingType: enrollment.billing_type,
        billingDisplay: enrollment.billing_type === 'monthly'
          ? 'Monthly - billed on enrollment anniversary date'
          : enrollment.billing_type === 'pif'
          ? `Pay in Full - ${enrollment.billing_period_months} months`
          : 'One-time payment',
        commitmentPeriod: enrollment.billing_type === 'pif'
          ? `${enrollment.billing_period_months}-month commitment - non-refundable`
          : enrollment.billing_type === 'monthly'
          ? 'Month-to-month - 30 days written cancellation notice required'
          : 'Per enrollment - non-refundable',
        startDate: new Date().toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        }),
      },
    })
  }

  if (booking) {
    return NextResponse.json({
      agreementData: {
        type: 'booking',
        enrollmentId: null,
        bookingId: booking.id,
        clientName: client.full_name,
        clientEmail: client.email,
        clientPhone: client.phone || '',
        programName: booking.item_name,
        packageName: booking.item_name,
        sessionDuration: booking.duration,
        sessionsTotal: 1,
        sessionsPerWeek: null,
        billingAmount: (((booking.price_cents ?? 0) / 100)).toFixed(2),
        billingType: 'single',
        billingDisplay: 'Per session',
        commitmentPeriod: 'Per session - no minimum commitment',
        startDate: new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        }),
      },
    })
  }

  return NextResponse.json({ agreementData: null })
}
