import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  calculateBIEScores,
  upsertBIESnapshot,
  bieScoresForPersistence,
} from '@/lib/bie-calculator'

async function assertClientAccess(clientId: string, session: { id: string; role: string }) {
  const client = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM clients WHERE id = $1`,
    [clientId]
  )
  if (!client) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (typeof (client as { coach_id?: string }).coach_id === 'string') {
    if ((client as { coach_id: string }).coach_id !== session.id && session.role !== 'admin') {
      return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
    }
  } else if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
  }
  return { client }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertClientAccess(params.clientId, session)
  if ('error' in access) return access.error

  const scores = await calculateBIEScores(params.clientId)

  if (scores.data_quality === 'insufficient') {
    return NextResponse.json(
      {
        error: 'Insufficient data to calculate scores',
        data_quality: 'insufficient',
        minimum_required: 'At least 1 check-in or 3 journal entries',
      },
      { status: 422 }
    )
  }

  const persisted = bieScoresForPersistence(scores)
  try {
    await upsertBIESnapshot(params.clientId, persisted)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    scores,
    generation_state: scores.generation_state,
    data_quality: scores.data_quality,
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(_request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertClientAccess(params.clientId, session)
  if ('error' in access) return access.error

  const scores = await calculateBIEScores(params.clientId)

  return NextResponse.json({
    scores,
    generation_state: scores.generation_state,
    data_quality: scores.data_quality,
  })
}
