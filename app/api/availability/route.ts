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
    const rule = await db.queryOne(
      `INSERT INTO availability_rules (
        rule_type, day_of_week, start_time, end_time, slot_duration_minutes,
        buffer_minutes, minimum_notice_hours, blackout_date,
        settings_key, settings_value, is_active
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11
      )
      RETURNING *`,
      [
        data.rule_type,
        data.day_of_week ?? null,
        data.start_time ?? null,
        data.end_time ?? null,
        data.slot_duration_minutes ?? null,
        data.buffer_minutes ?? null,
        data.minimum_notice_hours ?? null,
        data.blackout_date ?? null,
        data.settings_key ?? null,
        data.settings_value ?? null,
        data.is_active,
      ]
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
