import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string; protocolId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client = await db.queryOne<{ coach_id: string; full_name: string; email: string }>(
      `SELECT coach_id, full_name, email FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const protocol = await db.queryOne(
      `SELECT * FROM protocols WHERE id = $1 AND client_id = $2`,
      [params.protocolId, params.clientId]
    )
    if (!protocol) return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    return NextResponse.json({ protocol, client })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}