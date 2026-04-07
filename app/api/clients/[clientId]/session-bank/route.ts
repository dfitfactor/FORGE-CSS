import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getClientBankStatus } from '@/lib/session-bank'

type Enrollment = {
  id: string
  client_id: string
  status: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const enrollment = await db.queryOne<Enrollment>(
      `SELECT id, client_id, status
       FROM package_enrollments
       WHERE client_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.clientId]
    )

    if (!enrollment) {
      return NextResponse.json({ bank: null, enrollment: null })
    }

    const bank = await getClientBankStatus(enrollment.id)
    return NextResponse.json({ bank, enrollment })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load session bank' }, { status: 500 })
  }
}

