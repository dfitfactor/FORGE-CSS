import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { computeGenerationState, computePPS, extractSignalsFromCheckIn } from '@/lib/bie-engine'
import { z } from 'zod'

const CreateSnapshotSchema = z.object({
  clientId: z.string().uuid(),
  bar: z.number().min(0).max(100).optional(),
  bli: z.number().min(0).max(100).optional(),
  dbi: z.number().min(0).max(100).optional(),
  cdi: z.number().min(0).max(100).optional(),
  lsi: z.number().min(0).max(100).optional(),
  // Can also compute from journal/adherence data
  fromJournalEntry: z.object({
    sleepHours: z.number().optional(),
    sleepQuality: z.number().min(1).max(5).optional(),
    stressLevel: z.number().min(1).max(5).optional(),
    energyLevel: z.number().min(1).max(5).optional(),
    mood: z.number().min(1).max(5).optional(),
    travelFlag: z.boolean().optional(),
    illnessFlag: z.boolean().optional(),
    workStressFlag: z.boolean().optional(),
    familyStressFlag: z.boolean().optional(),
  }).optional(),
  coachOverride: z.boolean().optional(),
  overrideNotes: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateSnapshotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { clientId, fromJournalEntry, coachOverride, overrideNotes } = parsed.data
  let { bar, bli, dbi, cdi, lsi } = parsed.data

  // Verify access
  const client = await db.queryOne<{ coach_id: string }>(
    `SELECT coach_id FROM clients WHERE id = $1`, [clientId]
  )
  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Extract signals from journal if provided
  let journalSignals = null
  if (fromJournalEntry) {
    journalSignals = extractSignalsFromCheckIn(fromJournalEntry)
    dbi = dbi ?? (journalSignals.dbi_signal ?? 50)
    lsi = lsi ?? (journalSignals.lsi_signal ?? 50)
    cdi = cdi ?? (journalSignals.cdi_signal ?? 50)
  }

  // Get BAR from recent adherence if not provided
  if (!bar) {
    const adherence = await db.queryOne<{
      planned: number; completed: number; partial: number
    }>(
      `SELECT 
         COUNT(*) FILTER (WHERE record_type LIKE 'session%') as planned,
         COUNT(*) FILTER (WHERE record_type = 'session_completed') as completed,
         COUNT(*) FILTER (WHERE record_type = 'session_partial') as partial
       FROM adherence_records 
       WHERE client_id = $1 
       AND record_date >= CURRENT_DATE - INTERVAL '7 days'
       AND contributes_to_bar = true`,
      [clientId]
    )
    if (adherence && Number(adherence.planned) > 0) {
      bar = ((Number(adherence.completed) + Number(adherence.partial) * 0.5) / Number(adherence.planned)) * 100
    } else {
      bar = 50 // neutral default
    }
  }

  // Set defaults
  bar = bar ?? 50
  bli = bli ?? 50
  dbi = dbi ?? 50
  cdi = cdi ?? 50
  lsi = lsi ?? 50

  // Compute derived values
  const cLsi = (lsi * 0.6 + (100 - dbi) * 0.4)
  const pps = computePPS(bar, bli, dbi, lsi, 0)

  const bieVars = { bar, bli, dbi, cdi, lsi, cLsi, pps }
  const { state, label, rationale } = computeGenerationState(bieVars)

  const snapshot = await db.queryOne<{ id: string }>(
    `INSERT INTO behavioral_snapshots (
       client_id, snapshot_date, snapshot_week,
       bar, bli, dbi, cdi, lsi, c_lsi, pps,
       generation_state, generation_state_label,
       computed_from, coach_override, override_notes, created_by
     ) VALUES (
       $1, CURRENT_DATE, EXTRACT(WEEK FROM CURRENT_DATE)::int,
       $2, $3, $4, $5, $6, $7, $8,
       $9, $10,
       $11, $12, $13, $14
     )
     ON CONFLICT (client_id, snapshot_date) 
     DO UPDATE SET
       bar = EXCLUDED.bar, bli = EXCLUDED.bli, dbi = EXCLUDED.dbi,
       cdi = EXCLUDED.cdi, lsi = EXCLUDED.lsi, c_lsi = EXCLUDED.c_lsi, pps = EXCLUDED.pps,
       generation_state = EXCLUDED.generation_state,
       generation_state_label = EXCLUDED.generation_state_label,
       coach_override = EXCLUDED.coach_override,
       override_notes = EXCLUDED.override_notes
     RETURNING id`,
    [
      clientId, bar, bli, dbi, cdi, lsi, cLsi, pps,
      state, label,
      journalSignals ? ['journal', 'computed'] : ['manual'],
      coachOverride || false, overrideNotes || null,
      session.id
    ]
  )

  return NextResponse.json({
    snapshotId: snapshot?.id,
    generationState: state,
    stateLabel: label,
    rationale,
    variables: bieVars,
  })
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const weeks = parseInt(searchParams.get('weeks') ?? '8')

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const snapshots = await db.query(
    `SELECT bs.*, u.full_name as created_by_name
     FROM behavioral_snapshots bs
     LEFT JOIN users u ON u.id = bs.created_by
     WHERE bs.client_id = $1
     AND bs.snapshot_date >= CURRENT_DATE - ($2 * INTERVAL '1 week')
     ORDER BY bs.snapshot_date DESC`,
    [clientId, weeks]
  )

  return NextResponse.json({ snapshots })
}
