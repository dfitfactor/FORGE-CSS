import { db } from '@/lib/db'
import type { ForgeStage, GenerationState } from '@/lib/bie-engine'
import type { ClientContext } from '@/services/ai-service'

function toStage(value: string | null | undefined): ForgeStage {
  if (value === 'optimization' || value === 'resilience' || value === 'growth' || value === 'empowerment') {
    return value
  }
  return 'foundations'
}

function toState(value: string | null | undefined): GenerationState {
  if (value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'E') {
    return value
  }
  return 'B'
}

export async function buildClientAiContext(clientId: string) {
  const [client, latestSnapshot, previousSnapshot, adherenceRows, journalRows] = await Promise.all([
    db.queryOne<{
      id: string
      full_name: string
      current_stage: string | null
      program_tier: string | null
      primary_goal: string | null
      injuries: string[] | null
    }>(
      `SELECT id, full_name, current_stage, program_tier, primary_goal, injuries
       FROM clients
       WHERE id = $1`,
      [clientId]
    ),
    db.queryOne<{
      bar: number | null
      bli: number | null
      dbi: number | null
      cdi: number | null
      lsi: number | null
      pps: number | null
      generation_state: string | null
    }>(
      `SELECT bar_score as bar, bli_score as bli, dbi_score as dbi, cdi, lsi, pps, generation_state
       FROM behavioral_snapshots
       WHERE client_id = $1
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [clientId]
    ),
    db.queryOne<{ bar: number | null }>(
      `SELECT bar_score as bar
       FROM behavioral_snapshots
       WHERE client_id = $1
       ORDER BY snapshot_date DESC
       OFFSET 1
       LIMIT 1`,
      [clientId]
    ),
    db.query<{
      record_type: string
      completion_pct: number | null
      client_notes: string | null
    }>(
      `SELECT record_type, completion_pct, client_notes
       FROM adherence_records
       WHERE client_id = $1
         AND record_date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY record_date DESC`,
      [clientId]
    ),
    db.query<{ body: string | null }>(
      `SELECT body
       FROM journal_entries
       WHERE client_id = $1
         AND entry_date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY entry_date DESC
       LIMIT 5`,
      [clientId]
    ),
  ])

  if (!client) return null

  const currentBIE = {
    bar: Number(latestSnapshot?.bar ?? 50),
    bli: Number(latestSnapshot?.bli ?? 40),
    dbi: Number(latestSnapshot?.dbi ?? 35),
    cdi: Number(latestSnapshot?.cdi ?? 35),
    lsi: Number(latestSnapshot?.lsi ?? 60),
    cLsi: Number(latestSnapshot?.lsi ?? 60),
    pps: Number(latestSnapshot?.pps ?? 55),
  }

  const adherenceRecords = adherenceRows.map((row) => ({
    type: row.record_type,
    completed: row.record_type === 'session_completed' || (row.completion_pct ?? 0) >= 80,
    notes: row.client_notes ?? undefined,
  }))

  const completedCount = adherenceRecords.filter((record) => record.completed).length
  const previousBAR = Number(previousSnapshot?.bar ?? currentBIE.bar)
  const journalHighlights = journalRows
    .map((row) => row.body?.trim())
    .filter((body): body is string => Boolean(body))
    .slice(0, 4)

  const context: ClientContext = {
    clientId: client.id,
    fullName: client.full_name,
    stage: toStage(client.current_stage),
    programTier: client.program_tier ?? 'forge_core',
    primaryGoal: client.primary_goal ?? 'General wellness',
    injuries: client.injuries ?? [],
    currentBIE,
    generationState: toState(latestSnapshot?.generation_state),
    recentAdherence: {
      weeksTracked: 1,
      avgBAR: currentBIE.bar,
      sessionCompletionRate: adherenceRecords.length > 0 ? completedCount / adherenceRecords.length : 0,
    },
    recentJournalSummary: journalHighlights.join(' | '),
  }

  return {
    client: context,
    weeklyData: {
      adherenceRecords,
      journalHighlights,
      currentVsPreviousBAR: {
        current: currentBIE.bar,
        previous: previousBAR,
      },
    },
  }
}

export async function getFocusedInsightInputs(clientId: string) {
  const [journalRows, adherenceRows, checkinRows] = await Promise.all([
    db.query<{ body: string | null; title: string | null; entry_date: string }>(
      `SELECT body, title, entry_date::text
       FROM journal_entries
       WHERE client_id = $1
       ORDER BY entry_date DESC
       LIMIT 8`,
      [clientId]
    ),
    db.query<{ record_type: string; completion_pct: number | null; client_notes: string | null }>(
      `SELECT record_type, completion_pct, client_notes
       FROM adherence_records
       WHERE client_id = $1
       ORDER BY record_date DESC
       LIMIT 8`,
      [clientId]
    ),
    db.query<{
      nutrition_adherence: number | null
      protein_adherence: string | null
      food_journaling_days: string | null
      nutrition_drift: string | null
      what_worked: string | null
      challenges: string | null
      goals_next_week: string | null
      additional_notes: string | null
      checkin_date: string
    }>(
      `SELECT nutrition_adherence, protein_adherence, food_journaling_days, nutrition_drift,
              what_worked, challenges, goals_next_week, additional_notes, checkin_date::text
       FROM client_checkins
       WHERE client_id = $1
       ORDER BY checkin_date DESC, created_at DESC
       LIMIT 6`,
      [clientId]
    ),
  ])

  return {
    journalHighlights: journalRows
      .map((row) => [row.title, row.body].filter(Boolean).join(': ').trim())
      .filter(Boolean),
    adherenceNotes: adherenceRows
      .map((row) => [row.record_type, row.completion_pct !== null ? `${row.completion_pct}%` : null, row.client_notes].filter(Boolean).join(' | '))
      .filter(Boolean),
    checkinSummary: checkinRows
      .map((row) =>
        [
          row.checkin_date,
          row.nutrition_adherence !== null ? `nutrition adherence ${row.nutrition_adherence}/10` : null,
          row.protein_adherence,
          row.food_journaling_days ? `food journaling ${row.food_journaling_days}` : null,
          row.nutrition_drift,
          row.what_worked,
          row.challenges,
          row.goals_next_week,
          row.additional_notes,
        ]
          .filter(Boolean)
          .join(' | ')
      )
      .filter(Boolean),
  }
}
