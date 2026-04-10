import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'

const statusSchema = z.enum(['pending', 'approved', 'rejected', 'all'])
const actionSchema = z.object({
  candidateId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
})

type ReviewCountRow = {
  manual_review_status: 'pending' | 'approved' | 'rejected'
  count: string
}

type ReviewCandidateRow = {
  id: string
  primary_exercise_id: string
  primary_exercise_name: string
  reference_record_id: string
  reference_display_name: string | null
  reference_category: string | null
  reference_movement_pattern: string | null
  reference_equipment_required: string | null
  reference_difficulty_level: string | null
  duplicate_status: string
  review_status: string
  approved_for_fallback: boolean
  match_confidence: number | string | null
  match_reason: string | null
  enrichment_recommendation: string | null
  manual_review_status: 'pending' | 'approved' | 'rejected' | 'enriched'
  created_at: string
  updated_at: string
}

function normalizeCandidate(row: ReviewCandidateRow) {
  return {
    ...row,
    match_confidence:
      row.match_confidence === null || row.match_confidence === undefined
        ? null
        : Number(row.match_confidence),
  }
}

async function loadCounts() {
  const rows = await db.query<ReviewCountRow>(
    `SELECT manual_review_status, COUNT(*)::text AS count
     FROM exercise_match_candidates
     GROUP BY manual_review_status`
  )

  return rows.reduce(
    (acc, row) => {
      if (row.manual_review_status === 'pending') acc.pending = Number(row.count)
      if (row.manual_review_status === 'approved') acc.approved = Number(row.count)
      if (row.manual_review_status === 'rejected') acc.rejected = Number(row.count)
      return acc
    },
    { pending: 0, approved: 0, rejected: 0 }
  )
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const statusParam = request.nextUrl.searchParams.get('status') ?? 'pending'
  const status = statusSchema.safeParse(statusParam)

  if (!status.success) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  try {
    const counts = await loadCounts()
    const candidates = await db.query<ReviewCandidateRow>(
      `SELECT emc.id,
              emc.primary_exercise_id,
              e.exercise_name AS primary_exercise_name,
              emc.reference_record_id,
              err.display_name AS reference_display_name,
              err.category AS reference_category,
              err.movement_pattern AS reference_movement_pattern,
              err.equipment_required AS reference_equipment_required,
              err.difficulty_level AS reference_difficulty_level,
              err.duplicate_status,
              err.review_status,
              err.approved_for_fallback,
              emc.match_confidence,
              emc.match_reason,
              emc.enrichment_recommendation,
              emc.manual_review_status,
              emc.created_at::text AS created_at,
              emc.updated_at::text AS updated_at
       FROM exercise_match_candidates emc
       JOIN exercises e
         ON e.id = emc.primary_exercise_id
       JOIN exercise_reference_records err
         ON err.id = emc.reference_record_id
       WHERE ($1 = 'all' OR emc.manual_review_status = $1)
       ORDER BY CASE emc.manual_review_status
                  WHEN 'pending' THEN 0
                  WHEN 'approved' THEN 1
                  WHEN 'rejected' THEN 2
                  ELSE 3
                END,
                emc.match_confidence DESC NULLS LAST,
                emc.created_at DESC`,
      [status.data]
    )

    return NextResponse.json({
      candidates: candidates.map(normalizeCandidate),
      counts,
    })
  } catch (error) {
    console.error('[exercises/review] GET error:', error)
    return NextResponse.json({ error: 'Failed to load exercise review queue' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = actionSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const nextStatus = parsed.data.action === 'approve' ? 'approved' : 'rejected'

  try {
    const result = await db.transaction(async (client) => {
      const candidateResult = await client.query<{
        id: string
        reference_record_id: string
      }>(
        `UPDATE exercise_match_candidates
         SET manual_review_status = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, reference_record_id`,
        [nextStatus, parsed.data.candidateId]
      )

      const candidate = candidateResult.rows[0]
      if (!candidate) {
        return null
      }

      if (parsed.data.action === 'approve') {
        await client.query(
          `UPDATE exercise_reference_records
           SET duplicate_status = 'confirmed_duplicate',
               review_status = 'approved',
               approved_for_fallback = false,
               updated_at = NOW()
           WHERE id = $1`,
          [candidate.reference_record_id]
        )
      } else {
        const approvedSiblingResult = await client.query<{ id: string }>(
          `SELECT id
           FROM exercise_match_candidates
           WHERE reference_record_id = $1
             AND manual_review_status = 'approved'
             AND id <> $2
           LIMIT 1`,
          [candidate.reference_record_id, parsed.data.candidateId]
        )

        if (!approvedSiblingResult.rows[0]) {
          await client.query(
            `UPDATE exercise_reference_records
             SET duplicate_status = CASE
                 WHEN duplicate_status = 'confirmed_duplicate' THEN 'likely_duplicate'
                 ELSE duplicate_status
               END,
                 review_status = 'pending',
                 updated_at = NOW()
             WHERE id = $1`,
            [candidate.reference_record_id]
          )
        }
      }

      return candidate
    })

    if (!result) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, candidateId: result.id, manual_review_status: nextStatus })
  } catch (error) {
    console.error('[exercises/review] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update review decision' }, { status: 500 })
  }
}
