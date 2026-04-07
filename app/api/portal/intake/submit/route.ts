import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'
import { getCoachSettings } from '@/lib/coach-settings'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await request.json()

    const firstName = String(data.first_name || '').trim()
    const lastName = String(data.last_name || '').trim()
    const fullName = `${firstName} ${lastName}`.trim()

    await db.query(
      `UPDATE clients SET
        full_name = $2,
        phone = $3,
        date_of_birth = $4,
        gender = $5,
        primary_goal = $6,
        motivation = $7,
        obstacles = $8,
        current_activity_level = $9,
        training_history = $10,
        training_location = $11,
        preferred_training_days = $12,
        meals_per_day = $13,
        typical_foods = $14,
        supplements = $15,
        sleep_avg_hours = $16,
        wellness_stage = $17,
        health_conditions = $18,
        notes = $19,
        emergency_contact_name = $20,
        emergency_contact_phone = $21,
        emergency_contact_relationship = $22,
        emergency_contact_email = $23,
        updated_at = NOW()
       WHERE id = $1`,
      [
        session.clientId,
        fullName,
        data.mobile_phone,
        data.date_of_birth,
        data.gender || null,
        data.goal_90_days,
        data.goal_importance || null,
        data.past_obstacles || null,
        data.fitness_level || null,
        data.training_history || null,
        data.training_location || null,
        data.preferred_training_days ?? [],
        data.meals_per_day || null,
        data.typical_foods || null,
        data.supplements_list || null,
        data.sleep_avg_hours || null,
        data.wellness_stage || null,
        data.medical_conditions || null,
        data.additional_health_notes || null,
        `${String(data.emergency_first_name || '').trim()} ${String(data.emergency_last_name || '').trim()}`.trim(),
        data.emergency_phone,
        data.emergency_relationship,
        data.emergency_email || null,
      ]
    )

    const todaySnapshot = await db.queryOne<{ id: string }>(
      `SELECT id FROM behavioral_snapshots
       WHERE client_id = $1 AND snapshot_date = CURRENT_DATE
       LIMIT 1`,
      [session.clientId]
    )

    if (!todaySnapshot) {
      const stressLevel = parseInt(String(data.stress_level), 10) || 5
      const activityLevel = parseInt(String(data.activity_level), 10) || 5
      const initialBLI = Math.round((stressLevel / 10) * 65)
      const initialDBI = stressLevel > 7 ? 45 : stressLevel > 4 ? 30 : 20
      const initialLSI =
        Math.round(((10 - stressLevel) / 10) * 65) +
        Math.round((activityLevel / 10) * 15)

      await db.query(
        `INSERT INTO behavioral_snapshots
          (client_id, bar_score, bli_score, dbi_score, lsi,
           generation_state, snapshot_date, review_status)
         VALUES ($1, 65, $2, $3, $4, 'B', CURRENT_DATE, 'approved')
         ON CONFLICT (client_id, snapshot_date) DO NOTHING`,
        [session.clientId, initialBLI, initialDBI, initialLSI]
      )
    }

    const template = await db.queryOne<{ id: string }>(
      `SELECT id FROM form_templates WHERE slug = 'intake' LIMIT 1`
    )

    if (template) {
      await db.query(
        `INSERT INTO form_submissions (
          client_id, form_template_id, responses,
          signature_data, status, submitted_at
        ) VALUES ($1, $2, $3, $4, 'submitted', NOW())`,
        [session.clientId, template.id, JSON.stringify(data), data.signature]
      )
    }

    try {
      if (resend) {
        const coachSettings = await getCoachSettings()
        const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin || 'https://forge-css.vercel.app'
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'FORGE <onboarding@resend.dev>',
          to: coachSettings.coachEmail,
          subject: `New Intake Form: ${fullName || 'Client'}`,
          text: `${fullName || 'A client'} completed their intake form.\nView their profile at: ${baseUrl}/clients/${session.clientId}`,
        })
      }
    } catch (emailErr) {
      console.error('[portal/intake] coach email failed:', emailErr)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[portal/intake]', err)
    return NextResponse.json(
      { error: err.message || 'Submission failed' },
      { status: 500 }
    )
  }
}