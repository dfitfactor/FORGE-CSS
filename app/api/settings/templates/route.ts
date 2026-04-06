import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureCoachTemplatesTable } from '@/lib/coach-settings'

const templateCreateSchema = z.object({
  template_type: z.enum(['movement', 'nutrition', 'habit_coaching']),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  template_text: z.string().trim().min(1).max(50000),
  template_payload: z.unknown().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(9999).optional().default(0),
})

function mapTemplate(row: Record<string, any>) {
  const content = row.content && typeof row.content === 'object' ? row.content : {}
  return {
    id: row.id,
    coach_id: row.coach_id,
    template_type: row.template_type,
    name: row.name,
    description: typeof content.description === 'string' ? content.description : null,
    template_text: typeof content.template_text === 'string' ? content.template_text : '',
    template_payload: content.template_payload && typeof content.template_payload === 'object' ? content.template_payload : {},
    is_active: Boolean(row.is_active),
    sort_order: Number(content.sort_order ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureCoachTemplatesTable()

    const rows = await db.query<Record<string, any>>(
      `SELECT id, coach_id, template_type, name, content, is_active,
              created_at::text, updated_at::text
       FROM coach_templates
       WHERE coach_id = $1
       ORDER BY template_type ASC,
                COALESCE((content->>'sort_order')::int, 0) ASC,
                updated_at DESC`,
      [session.id]
    )

    return NextResponse.json({ templates: rows.map(mapTemplate) })
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
    await ensureCoachTemplatesTable()

    const content = {
      description: data.description ?? null,
      template_text: data.template_text,
      template_payload: data.template_payload ?? {},
      sort_order: data.sort_order,
    }

    const template = await db.queryOne<Record<string, any>>(
      `INSERT INTO coach_templates (
         coach_id, template_type, name, content, is_active
       ) VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, coach_id, template_type, name, content, is_active,
                 created_at::text, updated_at::text`,
      [session.id, data.template_type, data.name, JSON.stringify(content), data.is_active]
    )

    return NextResponse.json({ template: template ? mapTemplate(template) : null })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create template' },
      { status: 500 }
    )
  }
}
