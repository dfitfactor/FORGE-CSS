import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const checkins = await db.query(
      `SELECT * FROM client_checkins WHERE client_id = $1
       ORDER BY checkin_date DESC, created_at DESC`,
      [params.clientId]
    )
    return NextResponse.json({ checkins })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const body = await request.json()
    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO client_checkins (
        client_id, logged_by, checkin_type, checkin_date,
        workout_consistency, workout_types, workouts_enjoyed, workouts_completed,
        nutrition_adherence, meal_focus, nutrition_challenges, protein_adherence,
        food_journaling_days, nutrition_drift, hydration_range,
        digestion_rating, digestion_issues,
        sleep_quality, sleep_hours_avg, sleep_disturbances, sleep_response, sleep_hygiene,
        mindset_rating, positive_affirmations, stress_rating, stress_strategies,
        movement_vs_usual, recovery_quality, energy_level,
        what_worked, challenges, goals_next_week, one_win, one_obstacle,
        grateful_for, did_for_self, additional_notes, based_on_logs, coach_notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
        $33,$34,$35,$36,$37,$38,$39
      ) RETURNING id`,
      [
        params.clientId, session.id,
        body.checkinType || 'weekly',
        body.checkinDate || new Date().toISOString().split('T')[0],
        body.workoutConsistency || null,
        body.workoutTypes || null,
        body.workoutsEnjoyed || null,
        body.workoutsCompleted || null,
        body.nutritionAdherence || null,
        body.mealFocus || null,
        body.nutritionChallenges || null,
        body.proteinAdherence || null,
        body.foodJournalingDays || null,
        body.nutritionDrift || null,
        body.hydrationRange || null,
        body.digestionRating || null,
        body.digestionIssues ?? null,
        body.sleepQuality || null,
        body.sleepHoursAvg || null,
        body.sleepDisturbances ?? null,
        body.sleepResponse || null,
        body.sleepHygiene || null,
        body.mindsetRating || null,
        body.positiveAffirmations || null,
        body.stressRating || null,
        body.stressStrategies || null,
        body.movementVsUsual || null,
        body.recoveryQuality || null,
        body.energyLevel || null,
        body.whatWorked || null,
        body.challenges || null,
        body.goalsNextWeek || null,
        body.oneWin || null,
        body.oneObstacle || null,
        body.gratefulFor || null,
        body.didForSelf || null,
        body.additionalNotes || null,
        body.basedOnLogs ?? null,
        body.coachNotes || null,
      ]
    )
    return NextResponse.json({ success: true, id: result?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    await db.query(
      `DELETE FROM client_checkins WHERE id = $1 AND client_id = $2`,
      [id, params.clientId]
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}