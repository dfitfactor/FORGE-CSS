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
    const protocols = await db.query(
      `SELECT id, version, is_active, name, protocol_type, stage, generation_state,
              bar_at_generation, bli_at_generation, dbi_at_generation,
              movement_template, sessions_per_week, complexity_ceiling, volume_target,
              activation_block, primary_block, accessory_block, finisher_block,
              calorie_target, protein_target_g, carb_target_g, fat_target_g,
              meal_frequency, nutrition_complexity,
              protocol_payload, generated_by, effective_date::text, expiry_date::text,
              notes, coach_notes, created_at::text
       FROM protocols
       WHERE client_id = $1
       ORDER BY is_active DESC, created_at DESC`,
      [params.clientId]
    )
    return NextResponse.json({ protocols })
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

    const maxVersion = await db.queryOne<{ max: number }>(
      `SELECT COALESCE(MAX(version), 0) as max FROM protocols WHERE client_id = $1 AND protocol_type = $2`,
      [params.clientId, body.protocolType]
    )
    const version = (maxVersion?.max ?? 0) + 1

    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO protocols (
        client_id, version, name, protocol_type, stage, generation_state,
        bar_at_generation, bli_at_generation, dbi_at_generation,
        movement_template, sessions_per_week, complexity_ceiling, volume_target,
        activation_block, primary_block, accessory_block, finisher_block,
        calorie_target, protein_target_g, carb_target_g, fat_target_g,
        meal_frequency, nutrition_complexity,
        protocol_payload, generated_by, generated_by_user,
        effective_date, notes, coach_notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      RETURNING id`,
      [
        params.clientId, version,
        body.name, body.protocolType, body.stage, body.generationState || null,
        body.barAtGeneration || null, body.bliAtGeneration || null, body.dbiAtGeneration || null,
        body.movementTemplate || null, body.sessionsPerWeek || null,
        body.complexityCeiling || null, body.volumeTarget || null,
        body.activationBlock ? JSON.stringify(body.activationBlock) : null,
        body.primaryBlock ? JSON.stringify(body.primaryBlock) : null,
        body.accessoryBlock ? JSON.stringify(body.accessoryBlock) : null,
        body.finisherBlock ? JSON.stringify(body.finisherBlock) : null,
        body.calorieTarget || null, body.proteinTargetG || null,
        body.carbTargetG || null, body.fatTargetG || null,
        body.mealFrequency || null, body.nutritionComplexity || null,
        body.protocolPayload ? JSON.stringify(body.protocolPayload) : '{}',
        body.generatedBy || 'coach', session.id,
        body.effectiveDate || new Date().toISOString().split('T')[0],
        body.notes || null, body.coachNotes || null,
      ]
    )
    return NextResponse.json({ success: true, id: result?.id, version })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const { id, isActive, coachNotes } = body
    await db.query(
      `UPDATE protocols SET is_active = COALESCE($1, is_active), coach_notes = COALESCE($2, coach_notes), updated_at = NOW() WHERE id = $3 AND client_id = $4`,
      [isActive ?? null, coachNotes ?? null, id, params.clientId]
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}