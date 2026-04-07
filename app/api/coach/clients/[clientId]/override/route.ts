import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'

const schema = z.object({
  override_limits: z.boolean(),
  override_expiration: z.boolean(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  requireRole(session, 'coach', 'admin')

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await db.query(
      `UPDATE package_enrollments
       SET override_limits = $2,
           override_expiration = $3,
           override_set_by = $4,
           override_set_at = NOW(),
           updated_at = NOW()
       WHERE client_id = $1
         AND status = 'active'`,
      [params.clientId, parsed.data.override_limits, parsed.data.override_expiration, session.id]
    )

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update client overrides' }, { status: 500 })
  }
}


