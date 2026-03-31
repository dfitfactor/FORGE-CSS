import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

function calcGenerationState(bar: number, dbi: number) {
  if (bar >= 80 && dbi < 30) return 'A'
  if (bar >= 65 && dbi < 50) return 'B'
  if (bar >= 50 && dbi < 70) return 'C'
  if (dbi >= 70 || bar < 35) return 'D'
  return 'E'
}

function toScore(v: unknown) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, n))
}

function calculateManualGps({
  bli,
  dbi,
  pps,
  lsi,
}: {
  bli: number | null
  dbi: number | null
  pps: number | null
  lsi: number | null
}) {
  let score = 0
  score += ((pps ?? 0) / 100) * 40

  if ((dbi ?? 0) > 70) score -= 15
  else if ((dbi ?? 0) > 50) score -= 10
  else if ((dbi ?? 0) > 30) score -= 5

  score += ((lsi ?? 50) / 100) * 10
  score += ((100 - (bli ?? 45)) / 100) * 10

  return Math.min(Math.max(Math.round(score), 0), 100)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM clients WHERE id = $1`,
    [params.clientId]
  )
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Enforce coach ownership when possible; if coach_id is missing, only allow admin.
  if (typeof (client as any).coach_id === 'string') {
    if ((client as any).coach_id !== session.id && session.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  } else if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const bar = toScore(body?.bar)
  const dbi = toScore(body?.dbi)
  const bli = toScore(body?.bli)
  const cdi = toScore(body?.cdi)
  const lsi = toScore(body?.lsi)
  const pps = toScore(body?.pps)
  const gps = toScore(body?.gps) ?? calculateManualGps({ bli, dbi, pps, lsi })

  if (bar === null || dbi === null) {
    return NextResponse.json({ error: 'BAR and DBI are required' }, { status: 400 })
  }

  const generation_state = calcGenerationState(bar, dbi)

  try {
    await db.query(
      `INSERT INTO behavioral_snapshots
        (client_id, bar_score, dbi_score, bli_score, cdi, lsi, pps, gps,
         generation_state, snapshot_date, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, NOW())
       ON CONFLICT (client_id, snapshot_date)
       DO UPDATE SET
         bar_score = EXCLUDED.bar_score,
         dbi_score = EXCLUDED.dbi_score,
         bli_score = EXCLUDED.bli_score,
         cdi = EXCLUDED.cdi,
         lsi = EXCLUDED.lsi,
         pps = EXCLUDED.pps,
         gps = EXCLUDED.gps,
         generation_state = EXCLUDED.generation_state,
         updated_at = NOW()`,
      [params.clientId, bar, dbi, bli, cdi, lsi, pps, gps, generation_state]
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('gps')) {
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    try {
      await db.query(
        `INSERT INTO behavioral_snapshots
          (client_id, bar_score, dbi_score, bli_score, cdi, lsi, pps,
           generation_state, snapshot_date, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, NOW())
         ON CONFLICT (client_id, snapshot_date)
         DO UPDATE SET
           bar_score = EXCLUDED.bar_score,
           dbi_score = EXCLUDED.dbi_score,
           bli_score = EXCLUDED.bli_score,
           cdi = EXCLUDED.cdi,
           lsi = EXCLUDED.lsi,
           pps = EXCLUDED.pps,
           generation_state = EXCLUDED.generation_state,
           updated_at = NOW()`,
        [params.clientId, bar, dbi, bli, cdi, lsi, pps, generation_state]
      )
    } catch (fallbackErr: unknown) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      return NextResponse.json({ error: fallbackMsg }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, generation_state, gps })
}
