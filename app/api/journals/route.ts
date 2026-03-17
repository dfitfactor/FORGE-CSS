import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { extractJournalSignals } from '@/services/ai-service'
import { z } from 'zod'

const CreateJournalSchema = z.object({
  clientId: z.string().uuid(),
  entryType: z.enum(['weekly_check_in', 'daily_log', 'session_note', 'milestone', 'disruption_report', 'free_form', 'coach_note']),
  title: z.string().optional(),
  body: z.string().optional(),
  // Check-in fields
  sleepHours: z.number().optional(),
  sleepQuality: z.number().min(1).max(5).optional(),
  stressLevel: z.number().min(1).max(5).optional(),
  energyLevel: z.number().min(1).max(5).optional(),
  hungerLevel: z.number().min(1).max(5).optional(),
  mood: z.number().min(1).max(5).optional(),
  digestionQuality: z.number().min(1).max(5).optional(),
  // Flags
  travelFlag: z.boolean().optional(),
  illnessFlag: z.boolean().optional(),
  workStressFlag: z.boolean().optional(),
  familyStressFlag: z.boolean().optional(),
  // Settings
  isPrivate: z.boolean().optional(),
  extractSignals: z.boolean().default(true),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateJournalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Verify access
  const client = await db.queryOne<{ coach_id: string; current_stage: string }>(
    `SELECT coach_id, current_stage FROM clients WHERE id = $1`, [data.clientId]
  )
  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Insert journal entry
  const entry = await db.queryOne<{ id: string }>(
    `INSERT INTO journal_entries (
       client_id, entry_date, entry_type, title, body,
       sleep_hours, sleep_quality, stress_level, energy_level,
       hunger_level, mood, digestion_quality,
       travel_flag, illness_flag, work_stress_flag, family_stress_flag,
       is_private, signals_extracted
     ) VALUES (
       $1, CURRENT_DATE, $2, $3, $4,
       $5, $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, false
     ) RETURNING id`,
    [
      data.clientId, data.entryType, data.title || null, data.body || null,
      data.sleepHours || null, data.sleepQuality || null, data.stressLevel || null,
      data.energyLevel || null, data.hungerLevel || null, data.mood || null,
      data.digestionQuality || null,
      data.travelFlag || false, data.illnessFlag || false,
      data.workStressFlag || false, data.familyStressFlag || false,
      data.isPrivate || false,
    ]
  )

  if (!entry) return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })

  // AI signal extraction (async, non-blocking)
  let extractedSignals = null
  if (data.extractSignals && data.body && data.body.length > 50) {
    try {
      const snapshot = await db.queryOne<{ bar: number; bli: number; dbi: number; cdi: number; lsi: number; pps: number }>(
        `SELECT bar, bli, dbi, cdi, lsi, c_lsi as cLsi, pps
         FROM behavioral_snapshots WHERE client_id = $1
         ORDER BY snapshot_date DESC LIMIT 1`,
        [data.clientId]
      )

      const bieVars = snapshot ? {
        bar: Number(snapshot.bar) || 50,
        bli: Number(snapshot.bli) || 50,
        dbi: Number(snapshot.dbi) || 50,
        cdi: Number(snapshot.cdi) || 50,
        lsi: Number(snapshot.lsi) || 50,
        cLsi: 50, pps: Number(snapshot.pps) || 50,
      } : { bar: 50, bli: 50, dbi: 50, cdi: 50, lsi: 50, cLsi: 50, pps: 50 }

      extractedSignals = await extractJournalSignals(data.body, {
        stage: client.current_stage as any,
        currentBIE: bieVars,
      })

      // Update journal entry with signals
      await db.query(
        `UPDATE journal_entries SET
           signals_extracted = true,
           extracted_signals = $1,
           extraction_model = 'claude-opus-4-6',
           extracted_at = NOW(),
           dbi_signal = $2,
           lsi_signal = $3,
           cdi_signal = $4
         WHERE id = $5`,
        [
          JSON.stringify(extractedSignals),
          extractedSignals.dbiImpact,
          extractedSignals.lsiImpact,
          extractedSignals.cdiImpact,
          entry.id,
        ]
      )
    } catch (err) {
      console.error('Signal extraction failed:', err)
      // Non-critical — don't fail the request
    }
  }

  // Create timeline event for milestone/disruption types
  if (['milestone', 'disruption_report'].includes(data.entryType)) {
    await db.query(
      `INSERT INTO timeline_events (client_id, event_type, title, event_date, related_journal_id)
       VALUES ($1, $2, $3, CURRENT_DATE, $4)`,
      [
        data.clientId,
        data.entryType === 'milestone' ? 'milestone_reached' : 'disruption',
        data.title || `${data.entryType.replace(/_/g, ' ')} logged`,
        entry.id,
      ]
    )
  }

  return NextResponse.json({
    entryId: entry.id,
    extractedSignals,
  }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const entryType = searchParams.get('entryType')
  const limit = parseInt(searchParams.get('limit') ?? '20')

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const typeFilter = entryType ? 'AND je.entry_type = $3' : ''
  const params = entryType ? [clientId, limit, entryType] : [clientId, limit]

  const entries = await db.query(
    `SELECT je.*, 
       je.entry_date::text as entry_date
     FROM journal_entries je
     WHERE je.client_id = $1 ${typeFilter}
     ORDER BY je.entry_date DESC, je.created_at DESC
     LIMIT $2`,
    params
  )

  return NextResponse.json({ entries })
}
