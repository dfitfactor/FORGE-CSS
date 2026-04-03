import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const templatePatchSchema = z.object({
  template_type: z.enum(['movement', 'nutrition', 'habit_coaching']).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  template_text: z.string().trim().min(1).max(50000).optional(),
  template_payload: z.unknown().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

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

  const updates: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(parsed.data)) {
    updates.push(`${key} = $${values.length + 1}`)
    values.push(value ?? null)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  values.push(params.templateId)
  values.push(session.id)

  try {
    const template = await db.queryOne(
      `UPDATE coach_protocol_templates
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND coach_id = $${values.length}
       RETURNING id, coach_id, template_type, name, description, template_text, template_payload,
                 is_active, sort_order, created_at::text, updated_at::text`,
      values
    )

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
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
    await db.query(
      `DELETE FROM coach_protocol_templates
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
