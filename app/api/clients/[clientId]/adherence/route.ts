import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { calculateBIEScores, bieScoresForPersistence, upsertBIESnapshot } from '@/lib/bie-calculator'

type SnapshotRow = {
  snapshot_date: string
  bar: number | null
}

type AdherenceRecordRow = {
  id: string
  record_date: string
  record_type: string
  session_type: string | null
  completion_pct: number | null
  rpe: number | null
  energy_level: number | null
  mood_rating: number | null
  swaps_applied: boolean
  client_notes: string | null
  coach_notes: string | null
  created_at?: string
}

function getTodayDateString() {
  return new Date().toISOString().split('T')[0]
}

function toDateAtNoon(dateString: string) {
  return new Date(`${dateString}T12:00:00`)
}

function getWeekStart(dateString: string) {
  const date = toDateAtNoon(dateString)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  const weekStart = new Date(date)
  weekStart.setDate(diff)
  weekStart.setHours(12, 0, 0, 0)
  return weekStart
}

function formatDateOnly(date: Date) {
  return date.toISOString().split('T')[0]
}

function getRecordContribution(record: AdherenceRecordRow) {
  if (record.record_type === 'session_completed') return 1
  if (record.record_type === 'session_partial') {
    const pct = Number(record.completion_pct ?? 0)
    if (pct >= 80) return 1
    if (pct > 0) return 0.5
    return 0.5
  }
  return 0
}

function deriveBarFromRecords(records: AdherenceRecordRow[]) {
  const sessionRecords = records.filter((record) => record.record_type.startsWith('session_'))
  if (sessionRecords.length === 0) return null

  const earned = sessionRecords.reduce((sum, record) => sum + getRecordContribution(record), 0)
  return Math.round((earned / sessionRecords.length) * 100)
}

function buildTrendFromRecords(records: AdherenceRecordRow[], weeks = 8): SnapshotRow[] {
  const today = toDateAtNoon(getTodayDateString())
  const currentWeekStart = getWeekStart(getTodayDateString())
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const weekStart = new Date(currentWeekStart)
    weekStart.setDate(currentWeekStart.getDate() - (weeks - index - 1) * 7)
    return {
      snapshot_date: formatDateOnly(weekStart),
      rows: [] as AdherenceRecordRow[],
    }
  })

  const startBoundary = new Date(buckets[0].snapshot_date + 'T00:00:00')

  for (const record of records) {
    const recordDate = toDateAtNoon(record.record_date)
    if (recordDate < startBoundary || recordDate > today) continue

    const recordWeek = formatDateOnly(getWeekStart(record.record_date))
    const bucket = buckets.find((entry) => entry.snapshot_date === recordWeek)
    if (bucket) bucket.rows.push(record)
  }

  return buckets.map((bucket) => ({
    snapshot_date: bucket.snapshot_date,
    bar: deriveBarFromRecords(bucket.rows),
  }))
}

async function getAdherenceRecords(clientId: string): Promise<AdherenceRecordRow[]> {
  try {
    return await db.query(
      `SELECT id,
              record_date::text,
              record_type,
              session_type,
              completion_pct,
              rpe,
              energy_level,
              mood_rating,
              swaps_applied,
              client_notes,
              coach_notes,
              created_at::text
       FROM adherence_records
       WHERE client_id = $1
       ORDER BY record_date DESC, created_at DESC
       LIMIT 50`,
      [clientId]
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('completion_pct')) throw err

    return db.query(
      `SELECT id,
              record_date::text,
              record_type,
              session_type,
              NULL::numeric AS completion_pct,
              rpe,
              energy_level,
              mood_rating,
              swaps_applied,
              client_notes,
              coach_notes,
              created_at::text
       FROM adherence_records
       WHERE client_id = $1
       ORDER BY record_date DESC, created_at DESC
       LIMIT 50`,
      [clientId]
    )
  }
}

async function insertAdherenceRecord(clientId: string, values: {
  recordDate: string
  recordType: string
  sessionType: string | null
  completionPct: number | null
  rpe: number | null
  energyLevel: number | null
  moodRating: number | null
  swapsApplied: boolean
  clientNotes: string | null
  coachNotes: string | null
}) {
  try {
    return await db.queryOne<{ id: string }>(
      `INSERT INTO adherence_records
         (client_id, record_date, record_type, session_type,
          completion_pct, rpe, energy_level, mood_rating,
          swaps_applied, client_notes, coach_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        clientId,
        values.recordDate,
        values.recordType,
        values.sessionType,
        values.completionPct,
        values.rpe,
        values.energyLevel,
        values.moodRating,
        values.swapsApplied,
        values.clientNotes,
        values.coachNotes,
      ]
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('completion_pct')) throw err

    return db.queryOne<{ id: string }>(
      `INSERT INTO adherence_records
         (client_id, record_date, record_type, session_type,
          rpe, energy_level, mood_rating,
          swaps_applied, client_notes, coach_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        clientId,
        values.recordDate,
        values.recordType,
        values.sessionType,
        values.rpe,
        values.energyLevel,
        values.moodRating,
        values.swapsApplied,
        values.clientNotes,
        values.coachNotes,
      ]
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{ coach_id: string; sessions_per_week: number }>(
      `SELECT coach_id, COALESCE(sessions_per_week, 3) AS sessions_per_week
       FROM clients
       WHERE id = $1`,
      [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const [records, snapshotTrend, liveScores] = await Promise.all([
      getAdherenceRecords(params.clientId),
      (async () => {
        try {
          return await db.query<SnapshotRow>(
            `SELECT snapshot_date::text AS snapshot_date, bar_score AS bar
             FROM behavioral_snapshots
             WHERE client_id = $1
             ORDER BY snapshot_date DESC
             LIMIT 8`,
            [params.clientId]
          )
        } catch {
          try {
            return await db.query<SnapshotRow>(
              `SELECT snapshot_date::text AS snapshot_date, bar AS bar
               FROM behavioral_snapshots
               WHERE client_id = $1
               ORDER BY snapshot_date DESC
               LIMIT 8`,
              [params.clientId]
            )
          } catch {
            return []
          }
        }
      })(),
      calculateBIEScores(params.clientId).catch(() => null),
    ])

    const today = getTodayDateString()
    const adherenceBar = deriveBarFromRecords(
      records.filter((record) => toDateAtNoon(record.record_date) >= new Date(Date.now() - 28 * 86400000))
    )
    const derivedTrend = buildTrendFromRecords(records)
    const resolvedCurrentBar = liveScores?.bar ?? adherenceBar ?? snapshotTrend[0]?.bar ?? null
    const latestSnapshotDate = snapshotTrend[0]?.snapshot_date ?? null
    const latestSnapshotBar = snapshotTrend[0]?.bar ?? null
    const shouldOverlayCurrentBar =
      typeof resolvedCurrentBar === 'number' &&
      (latestSnapshotDate !== today || latestSnapshotBar !== resolvedCurrentBar)

    const resolvedTrend = shouldOverlayCurrentBar
      ? [
          { snapshot_date: today, bar: resolvedCurrentBar },
          ...snapshotTrend.filter((row) => row.snapshot_date !== today),
        ].slice(0, 8)
      : snapshotTrend.length > 0
        ? snapshotTrend
        : derivedTrend

    return NextResponse.json({
      records,
      sessionsPerWeek: client.sessions_per_week,
      currentBar: resolvedCurrentBar,
      snapshotTrend: [...resolvedTrend].reverse(),
    })
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
      `SELECT coach_id FROM clients WHERE id = $1`,
      [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const {
      recordDate, recordType, sessionType,
      completionPct,
      rpe, energyLevel, moodRating,
      swapsApplied, clientNotes, coachNotes,
    } = body

    const normalizedValues = {
      recordDate: recordDate || new Date().toISOString().split('T')[0],
      recordType: recordType || 'session_completed',
      sessionType: sessionType || null,
      completionPct: completionPct ?? null,
      rpe: rpe || null,
      energyLevel: energyLevel || null,
      moodRating: moodRating || null,
      swapsApplied: swapsApplied || false,
      clientNotes: clientNotes || null,
      coachNotes: coachNotes || null,
    }

    const result = await insertAdherenceRecord(params.clientId, normalizedValues)

    try {
      const scores = await calculateBIEScores(params.clientId)
      if (scores.data_quality !== 'insufficient' || typeof scores.bar === 'number') {
        await upsertBIESnapshot(params.clientId, bieScoresForPersistence(scores))
      }
    } catch (calcErr: unknown) {
      console.error('[BIE AUTO-CALC] Failed after adherence insert:', calcErr)
    }

    return NextResponse.json({ success: true, id: result?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
