import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getClientBankStatus } from '@/lib/session-bank'

type Enrollment = {
  id: string
  client_id: string
  status: string
  package_id: string | null
  package_name: string | null
  billing_type: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const enrollment = await db.queryOne<Enrollment>(
      `SELECT pe.id,
              pe.client_id,
              pe.status,
              pe.package_id,
              p.name AS package_name,
              p.billing_type
       FROM package_enrollments pe
       LEFT JOIN packages p ON p.id = pe.package_id
       WHERE pe.client_id = $1 AND pe.status = 'active'
       ORDER BY pe.created_at DESC
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

