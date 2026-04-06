import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureCoachTemplatesTable } from '@/lib/coach-settings'

const templatePatchSchema = z.object({
  template_type: z.enum(['movement', 'nutrition', 'habit_coaching']).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  template_text: z.string().trim().min(1).max(50000).optional(),
  template_payload: z.unknown().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = templatePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    await ensureCoachTemplatesTable()

    const existing = await db.queryOne<Record<string, any>>(
      `SELECT id, coach_id, template_type, name, content, is_active,
              created_at::text, updated_at::text
       FROM coach_templates
       WHERE id = $1 AND coach_id = $2`,
      [params.templateId, session.id]
    )

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const existingContent = existing.content && typeof existing.content === 'object' ? existing.content : {}
    const nextContent = {
      ...existingContent,
      ...(parsed.data.description !== undefined ? { description: parsed.data.description ?? null } : {}),
      ...(parsed.data.template_text !== undefined ? { template_text: parsed.data.template_text } : {}),
      ...(parsed.data.template_payload !== undefined ? { template_payload: parsed.data.template_payload ?? {} } : {}),
      ...(parsed.data.sort_order !== undefined ? { sort_order: parsed.data.sort_order } : {}),
    }

    const template = await db.queryOne<Record<string, any>>(
      `UPDATE coach_templates
       SET template_type = $1,
           name = $2,
           content = $3::jsonb,
           is_active = $4,
           updated_at = NOW()
       WHERE id = $5 AND coach_id = $6
       RETURNING id, coach_id, template_type, name, content, is_active,
                 created_at::text, updated_at::text`,
      [
        parsed.data.template_type ?? existing.template_type,
        parsed.data.name ?? existing.name,
        JSON.stringify(nextContent),
        parsed.data.is_active ?? existing.is_active,
        params.templateId,
        session.id,
      ]
    )

    return NextResponse.json({ template: template ? mapTemplate(template) : null })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update template' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureCoachTemplatesTable()
    await db.query(
      `DELETE FROM coach_templates
       WHERE id = $1 AND coach_id = $2`,
      [params.templateId, session.id]
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete template' },
      { status: 500 }
    )
  }
}
