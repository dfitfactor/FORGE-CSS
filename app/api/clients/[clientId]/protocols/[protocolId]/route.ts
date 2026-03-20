import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

let protocolColumnCache: Set<string> | null = null
const tableColumnCache = new Map<string, Set<string>>()

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

async function getTableColumnSet(tableName: string) {
  const cached = tableColumnCache.get(tableName)
  if (cached) return cached

  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  )

  const columnSet = new Set(columns.map(column => column.column_name))
  tableColumnCache.set(tableName, columnSet)
  return columnSet
}

async function authorize(clientId: string, request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const client = await db.queryOne<{ coach_id: string; full_name: string; email: string }>(
    `SELECT coach_id, full_name, email FROM clients WHERE id = $1`,
    [clientId]
  )

  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
  }

  return { session, client }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string; protocolId: string } }
) {
  try {
    const auth = await authorize(params.clientId, request)
    if (auth.error) return auth.error

    const body = await request.json()
    const protocolColumns = await getProtocolColumnSet()

    const {
      name,
      stage,
      generation_state,
      effective_date,
      expiry_date,
      notes,
      coach_notes,
      is_active,
      sessions_per_week,
      complexity_ceiling,
      volume_target,
      calorie_target,
      protein_target_g,
      carb_target_g,
      fat_target_g,
      meal_frequency,
      nutrition_complexity,
      protocol_payload,
    } = body as Record<string, unknown>

    const existing = await db.queryOne<{ protocol_payload: Record<string, unknown> | null }>(
      `SELECT protocol_payload FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )
    if (!existing) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }

    const mergedPayload =
      protocol_payload && typeof protocol_payload === 'object'
        ? { ...(existing.protocol_payload ?? {}), ...protocol_payload }
        : existing.protocol_payload

    const updates: string[] = []
    const values: unknown[] = []
    let index = 1

    const pushField = (column: string, value: unknown) => {
      if (!protocolColumns.has(column) || value === undefined) return
      updates.push(`${column} = $${index}`)
      values.push(value)
      index += 1
    }

    pushField('name', name)
    pushField('stage', stage)
    pushField('generation_state', generation_state)
    pushField('effective_date', effective_date)
    pushField('expiry_date', expiry_date)
    pushField('notes', notes)
    pushField('coach_notes', coach_notes)
    pushField('is_active', is_active)
    pushField('sessions_per_week', sessions_per_week)
    pushField('complexity_ceiling', complexity_ceiling)
    pushField('volume_target', volume_target)
    pushField('calorie_target', calorie_target)
    pushField('protein_target_g', protein_target_g)
    pushField('carb_target_g', carb_target_g)
    pushField('fat_target_g', fat_target_g)
    pushField('meal_frequency', meal_frequency)
    pushField('nutrition_complexity', nutrition_complexity)
    pushField('protocol_payload', mergedPayload ? JSON.stringify(mergedPayload) : undefined)

    if (protocolColumns.has('updated_at')) {
      updates.push('updated_at = NOW()')
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(params.protocolId, params.clientId)
    const updated = await db.queryOne(
      `UPDATE protocols
       SET ${updates.join(', ')}
       WHERE id = $${index} AND client_id = $${index + 1}
       RETURNING *`,
      values
    )

    return NextResponse.json({ success: true, protocol: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { clientId: string; protocolId: string } }
) {
  try {
    const auth = await authorize(params.clientId, request)
    if (auth.error) return auth.error

    const protocol = await db.queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )
    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }

    const [
      adherenceColumns,
      changeLogColumns,
      timelineColumns,
      protocolColumns,
    ] = await Promise.all([
      getTableColumnSet('adherence_records'),
      getTableColumnSet('protocol_change_log'),
      getTableColumnSet('timeline_events'),
      getTableColumnSet('protocols'),
    ])

    const [adherenceRef, changeLogRef, timelineRef, supersededRef] = await Promise.all([
      adherenceColumns.has('protocol_id')
        ? db.queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM adherence_records WHERE protocol_id = $1`,
            [params.protocolId]
          )
        : Promise.resolve({ count: '0' }),
      changeLogColumns.has('protocol_id')
        ? db.queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM protocol_change_log WHERE protocol_id = $1`,
            [params.protocolId]
          )
        : Promise.resolve({ count: '0' }),
      timelineColumns.has('related_protocol_id')
        ? db.queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM timeline_events WHERE related_protocol_id = $1`,
            [params.protocolId]
          )
        : Promise.resolve({ count: '0' }),
      protocolColumns.has('superseded_by')
        ? db.queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM protocols WHERE superseded_by = $1`,
            [params.protocolId]
          )
        : Promise.resolve({ count: '0' }),
    ])

    const blockers = [
      { label: 'adherence records', count: Number(adherenceRef?.count ?? 0) },
      { label: 'protocol change log entries', count: Number(changeLogRef?.count ?? 0) },
      { label: 'timeline events', count: Number(timelineRef?.count ?? 0) },
      { label: 'newer protocol versions linked to it', count: Number(supersededRef?.count ?? 0) },
    ].filter(blocker => blocker.count > 0)

    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: `This protocol can't be deleted because it is referenced by ${blockers.map(blocker => `${blocker.count} ${blocker.label}`).join(', ')}. Deactivate it instead if you want to hide it.`,
          blockers,
        },
        { status: 409 }
      )
    }

    await db.query(
      `DELETE FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )

    return NextResponse.json({ success: true, deletedId: params.protocolId, name: protocol.name })
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
    const auth = await authorize(params.clientId, request)
    if (auth.error) return auth.error

    const protocol = await db.queryOne(
      `SELECT * FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )

    if (!protocol) return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    return NextResponse.json({ protocol, client: auth.client })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
