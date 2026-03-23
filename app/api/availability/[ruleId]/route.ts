import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { availabilityRuleSchema } from '@/lib/booking'

const availabilityRulePatchSchema = availabilityRuleSchema.partial()

let cachedAvailabilityColumns: Set<string> | null = null

async function getAvailabilityColumns() {
  if (cachedAvailabilityColumns) return cachedAvailabilityColumns

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'availability_rules'`
  )

  cachedAvailabilityColumns = new Set(rows.map((row) => row.column_name))
  return cachedAvailabilityColumns
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { ruleId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = availabilityRulePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const columns = await getAvailabilityColumns()
    const updates: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(data)) {
      if (!columns.has(key)) continue
      updates.push(`${key} = $${values.length + 1}`)
      values.push(value ?? null)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(params.ruleId)

    const rule = await db.queryOne(
      `UPDATE availability_rules
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    )
    return NextResponse.json({ rule })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update availability rule' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { ruleId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await db.query(
      `UPDATE availability_rules
       SET is_active = false
       WHERE id = $1`,
      [params.ruleId]
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete availability rule' }, { status: 500 })
  }
}
