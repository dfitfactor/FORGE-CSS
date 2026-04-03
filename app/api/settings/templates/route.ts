import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const templateCreateSchema = z.object({
  template_type: z.enum(['movement', 'nutrition', 'habit_coaching']),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  template_text: z.string().trim().min(1).max(50000),
  template_payload: z.unknown().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(9999).optional().default(0),
})

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const templates = await db.query(
      `SELECT id, coach_id, template_type, name, description, template_text, template_payload,
              is_active, sort_order, created_at::text, updated_at::text
       FROM coach_protocol_templates
       WHERE coach_id = $1
       ORDER BY template_type ASC, sort_order ASC, updated_at DESC`,
      [session.id]
    )
    return NextResponse.json({ templates })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load templates' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = templateCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const template = await db.queryOne(
      `INSERT INTO coach_protocol_templates (
         coach_id, template_type, name, description, template_text,
         template_payload, is_active, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, coach_id, template_type, name, description, template_text, template_payload,
                 is_active, sort_order, created_at::text, updated_at::text`,
      [
        session.id,
        data.template_type,
        data.name,
        data.description ?? null,
        data.template_text,
        data.template_payload ?? {},
        data.is_active,
        data.sort_order,
      ]
    )

    return NextResponse.json({ template })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create template' },
      { status: 500 }
    )
  }
}
