import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'
import { getCoachSettings } from '@/lib/coach-settings'
import { calculateBIEScores } from '@/lib/bie-calculator'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await request.json() as Record<string, unknown>

    const workoutKey = String(data.workouts_completed ?? '')
    const proteinKey = String(data.protein_adherence ?? '')
    const sleepKey = String(data.sleep_hours ?? '')
    const energyKey = String(data.energy_level ?? '')
    const recoveryKey = String(data.recovery_quality ?? '')

    const workoutScore = ({
      'All planned workouts': 10,
      'Missed 1 workout': 7,
      'Missed 2+ workouts': 4,
      'No workouts completed': 0,
    } as Record<string, number>)[workoutKey] ?? 5

    const nutritionScore = ({
      '>95%': 10,
      '85-95%': 8,
      '70-85%': 6,
      '<70%': 3,
      unsure: 5,
    } as Record<string, number>)[proteinKey] ?? 5

    const sleepScore = ({
      '8+': 10,
      '7-8': 8,
      '5-6': 5,
      '<5': 2,
    } as Record<string, number>)[sleepKey] ?? 5

    const energyScore = ({
      High: 9,
      Steady: 7,
      Inconsistent: 5,
      Low: 3,
    } as Record<string, number>)[energyKey] ?? 5

    const recoveryScore = ({
      'Good - felt ready for next session': 9,
      'Good – felt ready for next session': 9,
      'Moderate - some lingering soreness but manageable': 6,
      'Moderate – some lingering soreness but manageable': 6,
      'Slow - persistent soreness or fatigue affected training': 3,
      'Slow – persistent soreness or fatigue affected training': 3,
    } as Record<string, number>)[recoveryKey] ?? 5

    const client = await db.queryOne<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM clients WHERE id = $1`,
      [session.clientId]
    )

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    await db.query(
      `INSERT INTO client_checkins (
        client_id, checkin_type,
        checkin_date, week_ending_date,
        workout_consistency, nutrition_adherence,
        sleep_quality, energy_level,
        recovery_quality, stress_rating,
        mindset_rating, food_journaling_days,
        protein_adherence, hydration_range,
        sleep_hours, sleep_response,
        sleep_hygiene, movement_vs_usual,
        workouts_completed, workout_types,
        digestion_quality, what_worked,
        challenges, grateful_for,
        did_for_self, nutrition_challenges,
        based_on_logs, coach_notes
      ) VALUES (
        $1, 'weekly',
        $2, $2,
        $3, $4,
        $5, $6,
        $7, $8,
        $9, $10,
        $11, $12,
        $13, $14,
        $15, $16,
        $17, $18,
        $19, $20,
        $21, $22,
        $23, $24,
        $25, NULL
      )`,
      [
        session.clientId,
        String(data.week_ending_date ?? ''),
        workoutScore,
        nutritionScore,
        sleepScore,
        energyScore,
        recoveryScore,
        Number(data.stress_rating) || 0,
        Number(data.mindset_rating) || 0,
        String(data.food_journaling_days ?? ''),
        proteinKey,
        String(data.hydration_range ?? ''),
        sleepKey,
        String(data.sleep_response ?? ''),
        String(data.sleep_hygiene ?? ''),
        String(data.movement_vs_usual ?? ''),
        workoutKey,
        Array.isArray(data.workout_types) ? data.workout_types : [],
        String(data.digestion_quality ?? ''),
        String(data.one_win ?? ''),
        String(data.one_obstacle ?? ''),
        String(data.grateful_for ?? '') || null,
        String(data.did_for_self ?? '') || null,
        String(data.nutrition_challenges ?? '') || null,
        String(data.based_on_logs ?? '') === 'Yes',
      ]
    )

    const scores = await calculateBIEScores(session.clientId)

    await db.query(
      `INSERT INTO behavioral_snapshots
        (client_id, bar_score, dbi_score, bli_score,
         cdi, lsi, pps, gps, generation_state,
         snapshot_date, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, 'pending_review')
       ON CONFLICT (client_id, snapshot_date)
       DO UPDATE SET
         bar_score = EXCLUDED.bar_score,
         dbi_score = EXCLUDED.dbi_score,
         bli_score = EXCLUDED.bli_score,
         cdi = EXCLUDED.cdi,
         lsi = EXCLUDED.lsi,
         pps = EXCLUDED.pps,
         gps = EXCLUDED.gps,
         generation_state = EXCLUDED.generation_state,
         review_status = 'pending_review',
         updated_at = NOW()`,
      [
        session.clientId,
        scores.bar ?? 0,
        scores.dbi,
        scores.bli,
        scores.cdi,
        scores.lsi,
        scores.pps,
        scores.gps,
        scores.generation_state,
      ]
    )

    try {
      if (resend) {
        const coachSettings = await getCoachSettings()
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'FORGE <onboarding@resend.dev>',
          to: coachSettings.coachEmail,
          subject: `New Check-In: ${client.full_name} - Review Required`,
          text: `${client.full_name} submitted their weekly check-in for the week ending ${String(data.week_ending_date ?? '')}.\n\nAuto-calculated scores:\nBAR: ${scores.bar ?? 0} | DBI: ${scores.dbi} | BLI: ${scores.bli}\nLSI: ${scores.lsi} | PPS: ${scores.pps}\nGeneration State: ${scores.generation_state}\n\nReview and approve at:\nhttps://forge-css.vercel.app/clients/${session.clientId}`,
        })
      }
    } catch (emailErr) {
      console.error('[portal/checkin] coach email failed:', emailErr)
    }

    const template = await db.queryOne<{ id: string }>(
      `SELECT id FROM form_templates WHERE slug = 'weekly-checkin' LIMIT 1`
    )

    if (template) {
      await db.query(
        `INSERT INTO form_submissions (client_id, form_template_id, responses, status, submitted_at)
         VALUES ($1, $2, $3, 'submitted', NOW())`,
        [session.clientId, template.id, JSON.stringify(data)]
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[portal/checkin]', err)
    return NextResponse.json(
      { error: err.message || 'Submission failed' },
      { status: 500 }
    )
  }
}
