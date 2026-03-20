import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

let protocolColumnCache: Set<string> | null = null

async function getProtocolColumnSet() {
  if (protocolColumnCache) return protocolColumnCache

  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'protocols'`
  )

  protocolColumnCache = new Set(columns.map(column => column.column_name))
  return protocolColumnCache
}

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
    const protocolColumns = await getProtocolColumnSet()
    const updates: string[] = []
    const values: Array<string | boolean | null> = []

    if (isActive !== undefined) {
      values.push(Boolean(isActive))
      updates.push(`is_active = $${values.length}`)
    }

    if (coachNotes !== undefined) {
      values.push(coachNotes ?? null)
      updates.push(`coach_notes = $${values.length}`)
    }

    if (protocolColumns.has('updated_at')) {
      updates.push('updated_at = NOW()')
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: true, skipped: true })
    }

    values.push(id, params.clientId)
    await db.query(
      `UPDATE protocols
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND client_id = $${values.length}`,
      values
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
