import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string; protocolId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`,
      [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()

    const {
      sessions_per_week,
      complexity_ceiling,
      volume_target,
      coach_notes,
      calorie_target,
      protein_target_g,
      carb_target_g,
      fat_target_g,
      meal_frequency,
      protocol_payload,
    } = body as Record<string, unknown>

    // Start from existing payload and merge overrides if provided
    const existing = await db.queryOne<{ protocol_payload: any }>(
      `SELECT protocol_payload FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )
    if (!existing) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }

    const mergedPayload =
      protocol_payload && typeof protocol_payload === 'object'
        ? { ...existing.protocol_payload, ...protocol_payload }
        : existing.protocol_payload

    const updates: string[] = []
    const values: unknown[] = []
    let idx = 1

    const pushField = (col: string, value: unknown) => {
      if (value !== undefined) {
        updates.push(`${col} = $${idx}`)
        values.push(value)
        idx++
      }
    }

    pushField('sessions_per_week', sessions_per_week)
    pushField('complexity_ceiling', complexity_ceiling)
    pushField('volume_target', volume_target)
    pushField('coach_notes', coach_notes)
    pushField('calorie_target', calorie_target)
    pushField('protein_target_g', protein_target_g)
    pushField('carb_target_g', carb_target_g)
    pushField('fat_target_g', fat_target_g)
    pushField('meal_frequency', meal_frequency)
    pushField('protocol_payload', JSON.stringify(mergedPayload))

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push('updated_at = NOW()')
    values.push(params.protocolId, params.clientId)

    await db.query(
      `UPDATE protocols
       SET ${updates.join(', ')}
       WHERE id = $${idx} AND client_id = $${idx + 1}`,
      values
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string; protocolId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client = await db.queryOne<{ coach_id: string; full_name: string; email: string }>(
      `SELECT coach_id, full_name, email FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const protocol = await db.queryOne(
      `SELECT * FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )
    if (!protocol) return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    return NextResponse.json({ protocol, client })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}