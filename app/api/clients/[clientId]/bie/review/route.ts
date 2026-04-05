import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

async function requireCoach(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!['coach', 'admin'].includes(session.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const auth = await requireCoach(request)
  if ('error' in auth) return auth.error

  const snapshots = await db.query<Record<string, unknown>>(
    `SELECT * FROM behavioral_snapshots
     WHERE client_id = $1
       AND review_status = 'pending_review'
     ORDER BY snapshot_date DESC`,
    [params.clientId]
  )

  const latestWeeklyCheckin = await db.queryOne<{ responses: unknown; submitted_at: string | null }>(
    `SELECT fs.responses, fs.submitted_at::text AS submitted_at
     FROM form_submissions fs
     JOIN form_templates ft ON ft.id = fs.form_template_id
     WHERE fs.client_id = $1
       AND ft.slug = 'weekly-checkin'
     ORDER BY fs.submitted_at DESC NULLS LAST, fs.created_at DESC NULLS LAST
     LIMIT 1`,
    [params.clientId]
  ).catch(() => null)

  return NextResponse.json({ snapshots, latestWeeklyCheckin })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const auth = await requireCoach(request)
  if ('error' in auth) return auth.error

  const body = await request.json()

  await db.query(
    `UPDATE behavioral_snapshots SET
      bar_score = $1,
      dbi_score = $2,
      bli_score = $3,
      cdi = $4,
      lsi = $5,
      pps = $6,
      generation_state = $7,
      coach_review_notes = $8,
      review_status = 'approved',
      reviewed_at = NOW(),
      reviewed_by = $9,
      updated_at = NOW()
     WHERE id = $10
       AND client_id = $11`,
    [
      body.bar_score,
      body.dbi_score,
      body.bli_score,
      body.cdi,
      body.lsi,
      body.pps,
      body.generation_state,
      body.coach_review_notes || null,
      auth.session.id,
      body.snapshotId,
      params.clientId,
    ]
  )

  return NextResponse.json({ success: true })
}
