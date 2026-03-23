import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { availabilityRuleSchema } from '@/lib/booking'

const weeklyAvailabilityReplaceSchema = z.object({
  rules: z.array(z.object({
    rule_type: z.literal('weekly').default('weekly'),
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().trim().min(1),
    end_time: z.string().trim().min(1),
    slot_duration_minutes: z.number().int().min(15).max(240),
    is_active: z.boolean().default(true),
  })),
})

type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>

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

function pickAvailabilityInsertColumns(columns: Set<string>, data: AvailabilityRuleInput) {
  const valuesByColumn: Record<string, unknown> = {
    rule_type: data.rule_type,
    day_of_week: data.day_of_week ?? null,
    start_time: data.start_time ?? null,
    end_time: data.end_time ?? null,
    slot_duration_minutes: data.slot_duration_minutes ?? null,
    buffer_minutes: data.buffer_minutes ?? null,
    minimum_notice_hours: data.minimum_notice_hours ?? null,
    blackout_date: data.blackout_date ?? null,
    settings_key: data.settings_key ?? null,
    settings_value: data.settings_value ?? null,
    is_active: data.is_active,
  }

  return Object.entries(valuesByColumn).filter(([column]) => columns.has(column))
}

export async function GET() {
  try {
    const rules = await db.query(
      `SELECT *
       FROM availability_rules
       WHERE is_active = true
       ORDER BY day_of_week ASC NULLS LAST, start_time ASC NULLS LAST`
    )
    return NextResponse.json({ rules })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load availability' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = availabilityRuleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const columns = await getAvailabilityColumns()
    const selectedColumns = pickAvailabilityInsertColumns(columns, data)
    const columnNames = selectedColumns.map(([column]) => column)
    const placeholders = selectedColumns.map((_, index) => `$${index + 1}`)
    const values = selectedColumns.map(([, value]) => value)

    const rule = await db.queryOne(
      `INSERT INTO availability_rules (${columnNames.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      values
    )

    return NextResponse.json({ rule }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create availability rule' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = weeklyAvailabilityReplaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const insertedRules = await db.transaction(async (client) => {
      await client.query(`DELETE FROM availability_rules WHERE rule_type = 'weekly'`)

      const inserted: Array<Record<string, unknown>> = []
      for (const rule of parsed.data.rules) {
        const result = await client.query(
          `INSERT INTO availability_rules (
            rule_type, day_of_week, start_time, end_time, slot_duration_minutes, is_active
          ) VALUES (
            $1, $2, $3, $4, $5, $6
          )
          RETURNING *`,
          [
            'weekly',
            rule.day_of_week,
            rule.start_time,
            rule.end_time,
            rule.slot_duration_minutes,
            rule.is_active,
          ]
        )
        inserted.push(result.rows[0] as Record<string, unknown>)
      }

      return inserted
    })

    return NextResponse.json({ success: true, rules: insertedRules })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to replace weekly availability' }, { status: 500 })
  }
}
