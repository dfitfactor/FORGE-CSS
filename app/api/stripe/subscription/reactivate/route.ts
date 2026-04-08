import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'

const schema = z.object({
  enrollmentId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enrollment id is required' }, { status: 400 })
  }

  try {
    await db.query(
      `UPDATE package_enrollments
       SET subscription_status = 'active',
           grace_period_ends_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [parsed.data.enrollmentId]
    )

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reactivate subscription' },
      { status: 500 }
    )
  }
}
