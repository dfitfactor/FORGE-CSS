import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { packageSchema } from '@/lib/booking'

export async function GET() {
  try {
    const packages = await db.query(
      `SELECT *
       FROM packages
       ORDER BY forge_stage ASC, sort_order NULLS LAST, name ASC`
    )
    return NextResponse.json({ packages })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load packages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = packageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const pkg = await db.queryOne(
      `INSERT INTO packages (
        name, slug, description, session_count, duration_minutes,
        price_cents, billing_type, billing_period_months, forge_stage,
        is_public, sort_order
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11
      )
      RETURNING *`,
      [
        data.name,
        data.slug,
        data.description ?? null,
        data.session_count,
        data.duration_minutes,
        data.price_cents,
        data.billing_type,
        data.billing_period_months ?? null,
        data.forge_stage,
        data.is_public,
        data.sort_order,
      ]
    )

    return NextResponse.json({ package: pkg }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create package' }, { status: 500 })
  }
}
