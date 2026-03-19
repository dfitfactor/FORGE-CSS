import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string; sessions_per_week: number }>(
      `SELECT coach_id, COALESCE(sessions_per_week, 3) as sessions_per_week FROM clients WHERE id = $1`,
      [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const records = await db.query(
      `SELECT id, record_date::text, record_type, session_type,
              rpe, energy_level, mood_rating,
              swaps_applied, client_notes, coach_notes,
              created_at::text
       FROM adherence_records
       WHERE client_id = $1
       ORDER BY record_date DESC, created_at DESC
       LIMIT 50`,
      [params.clientId]
    )

    return NextResponse.json({ records, sessionsPerWeek: client.sessions_per_week })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string }>(
      `SELECT coach_id FROM clients WHERE id = $1`, [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const {
      recordDate, recordType, sessionType,
      // completionPct,  // Not persisted on some staging DBs
      rpe, energyLevel, moodRating,
      swapsApplied, clientNotes, coachNotes
    } = body

    const result = await db.queryOne<{ id: string }>(
      `INSERT INTO adherence_records
         (client_id, record_date, record_type, session_type,
          rpe, energy_level, mood_rating,
          swaps_applied, client_notes, coach_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        params.clientId,
        recordDate || new Date().toISOString().split('T')[0],
        recordType || 'session_completed',
        sessionType || null,
        rpe || null,
        energyLevel || null,
        moodRating || null,
        swapsApplied || false,
        clientNotes || null,
        coachNotes || null,
      ]
    )

    return NextResponse.json({ success: true, id: result?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}