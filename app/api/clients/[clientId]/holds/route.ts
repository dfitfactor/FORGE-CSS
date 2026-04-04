import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { placeOnHold } from '@/lib/session-bank'

const holdSchema = z.object({
  holdType: z.enum(['vacation', 'illness', 'medical', 'administrative']),
  reason: z.string().trim().min(10),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const holds = await db.query(
      `SELECT mh.*, p.name AS package_name
       FROM membership_holds mh
       JOIN package_enrollments pe ON pe.id = mh.enrollment_id
       JOIN packages p ON p.id = pe.package_id
       WHERE mh.client_id = $1
       ORDER BY mh.start_date DESC`,
      [params.clientId]
    )

    return NextResponse.json({ holds })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load holds' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = holdSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const enrollment = await db.queryOne<{ id: string }>(
      `SELECT *
       FROM package_enrollments
       WHERE client_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.clientId]
    )

    if (!enrollment) {
      return NextResponse.json({ error: 'No active enrollment found' }, { status: 404 })
    }

    const result = await placeOnHold({
      clientId: params.clientId,
      enrollmentId: enrollment.id,
      holdType: parsed.data.holdType,
      reason: parsed.data.reason,
      startDate: new Date(`${parsed.data.startDate}T00:00:00`),
      endDate: new Date(`${parsed.data.endDate}T00:00:00`),
      requestedBy: session.id,
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to place hold' }, { status: 500 })
  }
}
