import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'
import { getCoachSettings } from '@/lib/coach-settings'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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

async function getAgreementPayload(clientId: string, enrollmentId: string | null, bookingId: string | null) {
  const client = await db.queryOne<{
    id: string
    full_name: string
    email: string
    phone: string | null
  }>(
    `SELECT id, full_name, email, phone
     FROM clients WHERE id = $1`,
    [clientId]
  )

  if (!client) return null

  if (enrollmentId) {
    const enrollment = await db.queryOne<{
      id: string
      sessions_total: number | null
      sessions_per_week: number | null
      amount_cents: number | null
      billing_type: string | null
      package_name: string
      duration_minutes: number | null
      billing_period_months: number | null
      forge_stage: string | null
    }>(
      `SELECT pe.id, pe.sessions_total, pe.sessions_per_week,
              pe.amount_cents, pe.billing_type,
              p.name as package_name, p.duration_minutes,
              p.billing_period_months, p.forge_stage
       FROM package_enrollments pe
       JOIN packages p ON p.id = pe.package_id
       WHERE pe.id = $1
         AND pe.client_id = $2
       LIMIT 1`,
      [enrollmentId, clientId]
    )

    if (!enrollment) return null

    return {
      type: 'enrollment' as const,
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
        month: 'long', day: 'numeric', year: 'numeric',
      }),
    }
  }

  if (bookingId) {
    const booking = await db.queryOne<{
      id: string
      booking_date: string
      item_name: string
      duration: number
      price_cents: number | null
    }>(
      `SELECT b.id,
              b.booking_date::text,
              COALESCE(s.name, p.name) as item_name,
              COALESCE(s.duration_minutes, p.duration_minutes, 60) as duration,
              COALESCE(s.price_cents, p.price_cents, 0) as price_cents
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN packages p ON b.package_id = p.id
       WHERE b.id = $1
         AND b.client_email = $2
       LIMIT 1`,
      [bookingId, client.email]
    )

    if (!booking) return null

    return {
      type: 'booking' as const,
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
        month: 'long', day: 'numeric', year: 'numeric',
      }),
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    signatureName,
    printName,
    agreed,
    enrollmentId,
    bookingId,
  } = await request.json()

  if (!agreed || !String(signatureName || '').trim() || !String(printName || '').trim()) {
    return NextResponse.json({ error: 'Agreement consent and signatures are required' }, { status: 400 })
  }

  const authoritativeAgreementData = await getAgreementPayload(
    session.clientId,
    enrollmentId ?? null,
    bookingId ?? null
  )

  if (!authoritativeAgreementData) {
    return NextResponse.json({ error: 'Agreement details not found' }, { status: 404 })
  }

  const template = await db.queryOne<{ id: string }>(
    `SELECT id FROM form_templates WHERE slug = 'coaching-agreement' LIMIT 1`
  )

  if (!template) {
    return NextResponse.json({ error: 'Agreement template not found' }, { status: 404 })
  }

  const submission = await db.queryOne<{ id: string }>(
    `INSERT INTO form_submissions (
      client_id, form_template_id, responses,
      signature_data, status, submitted_at
    ) VALUES (
      $1, $2, $3, $4, 'submitted', NOW()
    ) RETURNING id`,
    [session.clientId, template.id, JSON.stringify({ ...authoritativeAgreementData, printName, agreed }), signatureName]
  )

  if (enrollmentId) {
    await db.query(
      `UPDATE package_enrollments SET
        agreement_signed = true,
        agreement_signed_at = NOW(),
        agreement_form_submission_id = $2
       WHERE id = $1
         AND client_id = $3`,
      [enrollmentId, submission?.id, session.clientId]
    )
  }

  if (bookingId) {
    await db.query(
      `UPDATE bookings SET
        agreement_signed = true,
        agreement_signed_at = NOW()
       WHERE id = $1
         AND client_email = (
           SELECT email FROM clients WHERE id = $2
         )`,
      [bookingId, session.clientId]
    )
  }

  try {
    if (resend) {
      const coachSettings = await getCoachSettings()
      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin || 'https://forge-css.vercel.app'
      const today = new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      })
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'FORGE <onboarding@resend.dev>',
        to: coachSettings.coachEmail,
        subject: `Coaching Agreement Signed - ${authoritativeAgreementData.clientName}`,
        html: `<h2>Coaching Agreement Signed</h2>
<p><strong>${authoritativeAgreementData.clientName}</strong> has signed their DFitFactor Coaching Agreement.</p>
<p><strong>Program:</strong> ${authoritativeAgreementData.programName}</p>
<p><strong>Signed:</strong> ${today}</p>
<p><a href="${baseUrl}/clients/${session.clientId}">View Client Profile &rarr;</a></p>`,
      })
    }
  } catch (emailErr) {
    console.error('[portal/agreement] coach email failed:', emailErr)
  }

  return NextResponse.json({ success: true })
}