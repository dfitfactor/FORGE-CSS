import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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
    agreementData,
  } = await request.json()

  if (!agreed || !String(signatureName || '').trim() || !String(printName || '').trim()) {
    return NextResponse.json({ error: 'Agreement consent and signatures are required' }, { status: 400 })
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
    [session.clientId, template.id, JSON.stringify({ ...agreementData, printName, agreed }), signatureName]
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
      const today = new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      })
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'FORGE <onboarding@resend.dev>',
        to: 'coach@dfitfactor.com',
        subject: `Coaching Agreement Signed - ${agreementData?.clientName || 'Client'}`,
        html: `<h2>Coaching Agreement Signed</h2>
<p><strong>${agreementData?.clientName || 'Client'}</strong> has signed their DFitFactor Coaching Agreement.</p>
<p><strong>Program:</strong> ${agreementData?.programName || 'Program'}</p>
<p><strong>Signed:</strong> ${today}</p>
<p><a href="https://forge-css.vercel.app/clients/${session.clientId}">View Client Profile &rarr;</a></p>`,
      })
    }
  } catch (emailErr) {
    console.error('[portal/agreement] coach email failed:', emailErr)
  }

  return NextResponse.json({ success: true })
}
