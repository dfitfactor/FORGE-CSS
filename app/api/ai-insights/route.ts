import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  generateCoachQueryInsight,
  generateWeeklyInsight,
  type ClientContext,
  type CoachInsight,
} from '@/services/ai-service'
import type { ForgeStage, GenerationState } from '@/lib/bie-engine'

type InsightRow = {
  id: string
  client_id: string
  client_name: string
  insight_date: string
  insight_type: string
  title: string
  summary: string
  full_analysis: string | null
  recommendations: string[] | null
  confidence_score: number | null
  created_at: string
}

type InsightMetrics = {
  primary: string
  secondary: string
  tertiary: string
}

type ApiInsight = {
  id: string
  client_id: string
  client_name: string
  insight_date: string
  insight_type: string
  title: string
  metrics: InsightMetrics
  decision: string
  constraint: string
  actions: string[]
  context: string
  tags: string[]
  confidence_score: number | null
  created_at: string
}

type StoredInsightPayload = {
  metrics?: Partial<InsightMetrics>
  decision?: string
  constraint?: string
  actions?: string[]
  context?: string
  tags?: string[]
}

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

function truncateInsightContext(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function buildLegacyContext(row: InsightRow) {
  const parts = [row.summary?.trim(), row.full_analysis?.trim()].filter(Boolean)
  return truncateInsightContext(parts.join(' '))
}

function normalizeCoachInsight(insight: CoachInsight): CoachInsight {
  const actions = insight.actions
    .map(action => action.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)

  return {
    title: insight.title.trim(),
    confidence: Number.isFinite(insight.confidence) ? Math.max(0, Math.min(1, insight.confidence)) : 0.5,
    metrics: {
      primary: insight.metrics?.primary?.trim() || 'Metric unavailable',
      secondary: insight.metrics?.secondary?.trim() || 'No secondary metric provided',
      tertiary: insight.metrics?.tertiary?.trim() || 'No tertiary metric provided',
    },
    decision: insight.decision?.trim() || 'Review before progression',
    constraint: insight.constraint?.trim() || 'Primary constraint not clearly stated',
    actions: actions.length > 0 ? actions : ['Review current constraints before changing the plan'],
    context: truncateInsightContext(insight.context || ''),
    tags: Array.isArray(insight.tags)
      ? insight.tags.map(tag => tag.trim().toLowerCase()).filter(Boolean).slice(0, 4)
      : [],
  }
}

function serializeCoachInsight(insight: CoachInsight) {
  const normalized = normalizeCoachInsight(insight)
  return {
    summary: normalized.decision,
    fullAnalysis: JSON.stringify({
      metrics: normalized.metrics,
      decision: normalized.decision,
      constraint: normalized.constraint,
      actions: normalized.actions,
      context: normalized.context,
      tags: normalized.tags,
    }),
    recommendations: normalized.actions,
    confidenceScore: normalized.confidence,
    normalized,
  }
}

function parseStoredInsight(row: InsightRow): ApiInsight {
  let parsedPayload: StoredInsightPayload | null = null

  if (row.full_analysis) {
    try {
      parsedPayload = JSON.parse(row.full_analysis) as StoredInsightPayload
    } catch {
      parsedPayload = null
    }
  }

  const metrics: InsightMetrics = {
    primary: parsedPayload?.metrics?.primary?.trim() || row.summary?.trim() || 'Metric unavailable',
    secondary: parsedPayload?.metrics?.secondary?.trim() || row.recommendations?.[0]?.trim() || 'No secondary metric provided',
    tertiary: parsedPayload?.metrics?.tertiary?.trim() || 'No tertiary metric provided',
  }

  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.client_name,
    insight_date: row.insight_date,
    insight_type: row.insight_type,
    title: row.title,
    metrics,
    decision: parsedPayload?.decision?.trim() || row.summary?.trim() || 'Review insight',
    constraint: parsedPayload?.constraint?.trim() || 'Constraint not specified',
    actions: Array.isArray(parsedPayload?.actions) && parsedPayload.actions.length > 0
      ? parsedPayload.actions.map(action => action.trim()).filter(Boolean).slice(0, 3)
      : (row.recommendations ?? []).map(action => action.trim()).filter(Boolean).slice(0, 3),
    context: parsedPayload?.context?.trim() || buildLegacyContext(row),
    tags: Array.isArray(parsedPayload?.tags)
      ? parsedPayload.tags.map(tag => tag.trim().toLowerCase()).filter(Boolean).slice(0, 4)
      : [],
    confidence_score: row.confidence_score,
    created_at: row.created_at,
  }
}

async function getAiInsightsColumnSet() {
  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ai_insights'`
  )
  return new Set(columns.map(column => column.column_name))
}

async function ensureAiInsightsTable() {
  const exists = await db.queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'ai_insights'
     ) as exists`
  )

  return Boolean(exists?.exists)
}

async function getCoachClients(coachId: string, role: string) {
  const rows = await db.query<{
    id: string
    full_name: string
    current_stage: string | null
    program_tier: string | null
    primary_goal: string | null
    injuries: string[] | null
  }>(
    `SELECT id, full_name, current_stage, program_tier, primary_goal, injuries
     FROM clients
     ${role === 'admin' ? '' : 'WHERE coach_id = $1'}
     ORDER BY full_name ASC`,
    role === 'admin' ? [] : [coachId]
  )

  const byName = new Map<string, (typeof rows)[number]>()
  for (const client of rows) {
    const normalizedName = client.full_name?.trim().toLowerCase()
    if (!normalizedName) continue

    const existing = byName.get(normalizedName)
    if (!existing) {
      byName.set(normalizedName, client)
      continue
    }

    const existingScore = Number(Boolean(existing.primary_goal)) + Number(Boolean(existing.current_stage)) + Number(Boolean(existing.program_tier)) + Number((existing.injuries?.length ?? 0) > 0)
    const currentScore = Number(Boolean(client.primary_goal)) + Number(Boolean(client.current_stage)) + Number(Boolean(client.program_tier)) + Number((client.injuries?.length ?? 0) > 0)

    if (currentScore > existingScore) {
      byName.set(normalizedName, client)
    }
  }

  return Array.from(byName.values())
}

async function buildClientContext(clientId: string) {
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

  const adherenceRecords = adherenceRows.map(row => ({
    type: row.record_type,
    completed: row.record_type === 'session_completed' || (row.completion_pct ?? 0) >= 80,
    notes: row.client_notes ?? undefined,
  }))

  const completedCount = adherenceRecords.filter(record => record.completed).length
  const previousBAR = Number(previousSnapshot?.bar ?? currentBIE.bar)
  const journalHighlights = journalRows
    .map(row => row.body?.trim())
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

async function getFocusedInsightInputs(clientId: string) {
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
      .map(row => [row.title, row.body].filter(Boolean).join(': ').trim())
      .filter(Boolean),
    adherenceNotes: adherenceRows
      .map(row => [row.record_type, row.completion_pct !== null ? `${row.completion_pct}%` : null, row.client_notes].filter(Boolean).join(' | '))
      .filter(Boolean),
    checkinSummary: checkinRows
      .map(row =>
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

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const clients = await getCoachClients(session.id, session.role)
    const hasTable = await ensureAiInsightsTable()
    if (!hasTable) {
      return NextResponse.json({
        insights: [],
        clients: clients.map(client => ({ id: client.id, full_name: client.full_name })),
        available: false,
        error: 'ai_insights table is not available in this environment.',
      })
    }

    const insights = await db.query<InsightRow>(
      `SELECT ai.id,
              ai.client_id,
              c.full_name as client_name,
              ai.insight_date::text,
              ai.insight_type,
              ai.title,
              ai.summary,
              ai.full_analysis,
              ai.recommendations,
              CAST(ai.confidence_score AS FLOAT) as confidence_score,
              ai.created_at::text
       FROM ai_insights ai
       JOIN clients c ON c.id = ai.client_id
       ${session.role === 'admin' ? '' : 'WHERE c.coach_id = $1'}
       ORDER BY ai.insight_date DESC, ai.created_at DESC
       LIMIT 30`,
      session.role === 'admin' ? [] : [session.id]
    )

    return NextResponse.json({
      insights: insights.map(parseStoredInsight),
      clients: clients.map(client => ({ id: client.id, full_name: client.full_name })),
      available: true,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key is not configured.' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const mode = typeof body.mode === 'string' ? body.mode : 'generate'
    const requestedClientId = typeof body.clientId === 'string' ? body.clientId : null
    const allClients = await getCoachClients(session.id, session.role)

    if (mode === 'query') {
      if (!requestedClientId) {
        return NextResponse.json({ error: 'Client is required for targeted insight queries.' }, { status: 400 })
      }

      const coachQuery = typeof body.query === 'string' ? body.query.trim() : ''
      if (!coachQuery) {
        return NextResponse.json({ error: 'Insight question is required.' }, { status: 400 })
      }

      const client = allClients.find(item => item.id === requestedClientId)
      if (!client) {
        return NextResponse.json({ error: 'Client not found for this coach.' }, { status: 404 })
      }

      const context = await buildClientContext(client.id)
      if (!context) {
        return NextResponse.json({ error: 'Unable to build client context for this insight.' }, { status: 500 })
      }

      const focusedInputs = await getFocusedInsightInputs(client.id)
      const generatedInsight = await generateCoachQueryInsight(context.client, {
        query: coachQuery,
        ...focusedInputs,
      })
      const serialized = serializeCoachInsight(generatedInsight)

      const hasTable = await ensureAiInsightsTable()
      let storedInsight: InsightRow | null = null

      if (hasTable) {
        const aiInsightColumns = await getAiInsightsColumnSet()
        const insertColumns = ['client_id', 'insight_date', 'insight_type', 'title', 'summary']
        const insertValues: unknown[] = [client.id, new Date().toISOString().split('T')[0], 'coaching_suggestion', generatedInsight.title, serialized.summary]

        const optionalColumns: Array<[string, unknown]> = [
          ['full_analysis', serialized.fullAnalysis],
          ['recommendations', serialized.recommendations],
          ['confidence_score', serialized.confidenceScore],
          ['source_variables', ['journals', 'checkins', 'adherence', 'documents', 'coach_query']],
          ['model_used', process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'],
        ]

        for (const [column, value] of optionalColumns) {
          if (aiInsightColumns.has(column)) {
            insertColumns.push(column)
            insertValues.push(value)
          }
        }

        const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ')
        storedInsight = await db.queryOne<InsightRow>(
          `INSERT INTO ai_insights (${insertColumns.join(', ')})
           VALUES (${placeholders})
           RETURNING id,
                     client_id,
                     '' as client_name,
                     insight_date::text,
                     insight_type,
                     title,
                     summary,
                     full_analysis,
                     recommendations,
                     CAST(confidence_score AS FLOAT) as confidence_score,
                     created_at::text`,
          insertValues
        )
      }

      return NextResponse.json({
        success: true,
        insight: storedInsight
          ? parseStoredInsight({ ...storedInsight, client_name: client.full_name })
          : {
              id: `temp-${Date.now()}`,
              client_id: client.id,
              client_name: client.full_name,
              insight_date: new Date().toISOString().split('T')[0],
              insight_type: 'coaching_suggestion',
              title: generatedInsight.title,
              metrics: serialized.normalized.metrics,
              decision: serialized.normalized.decision,
              constraint: serialized.normalized.constraint,
              actions: serialized.normalized.actions,
              context: serialized.normalized.context,
              tags: serialized.normalized.tags ?? [],
              confidence_score: serialized.confidenceScore,
              created_at: new Date().toISOString(),
            },
      })
    }

    const hasTable = await ensureAiInsightsTable()
    if (!hasTable) {
      return NextResponse.json({ error: 'ai_insights table is not available in this environment.' }, { status: 503 })
    }

    const clients = requestedClientId
      ? allClients.filter(client => client.id === requestedClientId)
      : allClients.filter(client => true).slice(0, 8)

    if (clients.length === 0) {
      return NextResponse.json({ error: 'No eligible clients found for insight generation.' }, { status: 404 })
    }

    const aiInsightColumns = await getAiInsightsColumnSet()
    const generatedInsights: InsightRow[] = []

    for (const client of clients) {
      const context = await buildClientContext(client.id)
      if (!context) continue

      const generatedInsight = await generateWeeklyInsight(context.client, context.weeklyData)
      const serialized = serializeCoachInsight(generatedInsight)
      const sourceVariables = [
        'bar',
        'bli',
        'dbi',
        'cdi',
        'lsi',
        'pps',
        'journals',
        'adherence',
      ]

      const insertColumns = ['client_id', 'insight_date', 'insight_type', 'title', 'summary']
      const insertValues: unknown[] = [client.id, new Date().toISOString().split('T')[0], 'weekly_summary', generatedInsight.title, serialized.summary]

      const optionalColumns: Array<[string, unknown]> = [
        ['full_analysis', serialized.fullAnalysis],
        ['recommendations', serialized.recommendations],
        ['confidence_score', serialized.confidenceScore],
        ['source_variables', sourceVariables],
        ['model_used', process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'],
      ]

      for (const [column, value] of optionalColumns) {
        if (aiInsightColumns.has(column)) {
          insertColumns.push(column)
          insertValues.push(value)
        }
      }

      const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ')
      const inserted = await db.queryOne<InsightRow>(
        `INSERT INTO ai_insights (${insertColumns.join(', ')})
         VALUES (${placeholders})
         RETURNING id,
                   client_id,
                   '' as client_name,
                   insight_date::text,
                   insight_type,
                   title,
                   summary,
                   full_analysis,
                   recommendations,
                   CAST(confidence_score AS FLOAT) as confidence_score,
                   created_at::text`,
        insertValues
      )

      if (inserted) {
        generatedInsights.push({ ...inserted, client_name: client.full_name })
      }
    }

    return NextResponse.json({
      success: true,
      generatedCount: generatedInsights.length,
      insights: generatedInsights.map(parseStoredInsight),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

