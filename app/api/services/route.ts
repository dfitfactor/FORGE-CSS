import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { serviceSchema } from '@/lib/booking'

let cachedServiceColumns: Set<string> | null = null

async function getServiceColumns() {
  if (cachedServiceColumns) return cachedServiceColumns

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'services'`
  )

  cachedServiceColumns = new Set(rows.map((row) => row.column_name))
  return cachedServiceColumns
}

export async function GET() {
  try {
    const services = await db.query(
      `SELECT *
       FROM services
       ORDER BY sort_order NULLS LAST, name ASC`
    )
    return NextResponse.json({ services })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load services' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = serviceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const columns = await getServiceColumns()
    const supportsSection = columns.has('section')
    const insertColumns = [
      'name',
      'slug',
      'description',
      'duration_minutes',
      'price_cents',
      'category',
      ...(supportsSection ? ['section'] : []),
      'service_type',
      'booking_type',
      'required_forms',
      'forge_stage',
      'is_public',
      'sort_order',
    ]
    const values = [
      data.name,
      data.slug,
      data.description ?? null,
      data.duration_minutes,
      data.price_cents,
      data.category,
      ...(supportsSection ? [data.section ?? null] : []),
      data.service_type,
      data.booking_type,
      data.required_forms,
      data.forge_stage ?? null,
      data.is_public,
      data.sort_order,
    ]

    const service = await db.queryOne(
      `INSERT INTO services (${insertColumns.join(', ')})
       VALUES (${insertColumns.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values
    )

    return NextResponse.json({ service }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create service' }, { status: 500 })
  }
}
