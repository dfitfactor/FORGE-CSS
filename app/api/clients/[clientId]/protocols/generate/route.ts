import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import {
  computeBAR,
  computeGenerationState,
  computePPS,
  extractSignalsFromCheckIn,
} from '@/lib/bie-engine'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'
const MAX_CONTEXT_DOCS = 2
const MAX_CONTEXT_DOC_CHARS = 500

type GeneratedProtocolCompat = {
  name: string
  rationale?: string
  sessionStructure?: {
    frequency?: number
    sessionsPerWeek?: number
    sessionType?: string
    complexityCeiling?: number
    volumeLevel?: string
    activationBlock?: unknown[]
    primaryBlock?: unknown[]
    accessoryBlock?: unknown[]
    finisherBlock?: unknown[]
  }
  nutritionStructure?: {
    dailyCalories?: number
    proteinG?: number
    carbG?: number
    fatG?: number
    mealFrequency?: number
    mealTiming?: string
    complexityLevel?: string
    keyGuidelines?: string[]
    disruption_protocol?: string
    mealPlan?: unknown[]
  }
  recoveryStructure?: {
    sleepTarget?: string
    stressReductionProtocol?: string
    activeRecoveryDays?: number
    mobilityMinutes?: number
    keyRecoveryPractices?: string[]
  }
  coachNotes?: string
  clientFacingMessage?: string
  stateAnalysis?: {
    capacityClass?: string
    physiologicalFocus?: string
    adherenceRisk?: string
    summary?: string
  }
  protocolRationale?: {
    behaviorLink?: string
    physiologyLink?: string
    executionFocus?: string
  }
  movementProtocol?: {
    frequency?: number
    sessionsPerWeek?: number
    sessionType?: string
    complexityCeiling?: number
    volumeLevel?: string
    activationBlock?: unknown[]
    primaryBlock?: unknown[]
    accessoryBlock?: unknown[]
    finisherBlock?: unknown[]
    progressionModel?: string[]
    rationale?: string
  }
  nutritionProtocol?: {
    dailyCalories?: number
    proteinG?: number
    carbG?: number
    fatG?: number
    mealFrequency?: number
    caloriePhase?: string
    macroJustification?: string
    adherenceFallback?: string
    complexityLevel?: string
    keyGuidelines?: string[]
    disruptionProtocol?: string
    mealTiming?: string
    bsldsTemplate?: unknown
    mealPlan?: unknown[]
  }
  recoveryProtocol?: {
    sleepTarget?: string
    stressReductionProtocol?: string
    activeRecoveryDays?: number
    mobilityMinutes?: number
    keyRecoveryPractices?: string[]
    progressionNotes?: string
  }
  monitoringMetrics?: {
    primary?: string[]
    secondary?: string[]
    cadence?: string
  }
  decisionRules?: string[]
  phaseProgressionCriteria?: string[]
  coachIntelligence?: {
    progressionAssessment?: string
    gapsIdentified?: string[]
    oversights?: string[]
    riskFlags?: string[]
    nextIterationStrategy?: string[]
  }
}

function getAnthropicModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL
}

function normalizeBase64(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null
  let s = String(input).trim()
  // Strip common data-URL prefix if present
  s = s.replace(/^data:.*?;base64,/i, '')
  // Remove whitespace/newlines
  s = s.replace(/\s+/g, '')
  // Accept base64url variants
  s = s.replace(/-/g, '+').replace(/_/g, '/')

  if (s.length === 0) return null
  // Basic structural validation
  if (s.length % 4 !== 0) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null
  return s
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (nums.length === 0) return null
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

function countKeywordHits(text: string, patterns: RegExp[]) {
  const normalized = text.toLowerCase()
  return patterns.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0)
}

function normalizeGeneratedProtocol(input: GeneratedProtocolCompat): GeneratedProtocolCompat {
  if (!input.rationale) {
    input.rationale = [
      input.protocolRationale?.behaviorLink,
      input.protocolRationale?.physiologyLink,
      input.protocolRationale?.executionFocus,
      input.stateAnalysis?.summary,
    ].filter(Boolean).join(' ')
  }

  if (!input.sessionStructure && input.movementProtocol) {
    input.sessionStructure = {
      frequency: input.movementProtocol.frequency ?? input.movementProtocol.sessionsPerWeek,
      sessionsPerWeek: input.movementProtocol.sessionsPerWeek ?? input.movementProtocol.frequency,
      sessionType: input.movementProtocol.sessionType,
      complexityCeiling: input.movementProtocol.complexityCeiling,
      volumeLevel: input.movementProtocol.volumeLevel,
      activationBlock: input.movementProtocol.activationBlock,
      primaryBlock: input.movementProtocol.primaryBlock,
      accessoryBlock: input.movementProtocol.accessoryBlock,
      finisherBlock: input.movementProtocol.finisherBlock,
    }
  }

  if (!input.nutritionStructure && input.nutritionProtocol) {
    input.nutritionStructure = {
      dailyCalories: input.nutritionProtocol.dailyCalories,
      proteinG: input.nutritionProtocol.proteinG,
      carbG: input.nutritionProtocol.carbG,
      fatG: input.nutritionProtocol.fatG,
      mealFrequency: input.nutritionProtocol.mealFrequency,
      mealTiming: input.nutritionProtocol.mealTiming,
      complexityLevel: input.nutritionProtocol.complexityLevel,
      keyGuidelines: input.nutritionProtocol.keyGuidelines,
      disruption_protocol: input.nutritionProtocol.disruptionProtocol ?? input.nutritionProtocol.adherenceFallback,
      mealPlan: input.nutritionProtocol.mealPlan,
    }
  }

  if (!input.recoveryStructure && input.recoveryProtocol) {
    input.recoveryStructure = {
      sleepTarget: input.recoveryProtocol.sleepTarget,
      stressReductionProtocol: input.recoveryProtocol.stressReductionProtocol,
      activeRecoveryDays: input.recoveryProtocol.activeRecoveryDays,
      mobilityMinutes: input.recoveryProtocol.mobilityMinutes,
      keyRecoveryPractices: input.recoveryProtocol.keyRecoveryPractices,
    }
  }

  if (!input.coachNotes && input.coachIntelligence) {
    input.coachNotes = [
      input.coachIntelligence.progressionAssessment,
      input.coachIntelligence.gapsIdentified?.length ? `Gaps: ${input.coachIntelligence.gapsIdentified.join('; ')}` : '',
      input.coachIntelligence.oversights?.length ? `Oversights: ${input.coachIntelligence.oversights.join('; ')}` : '',
      input.coachIntelligence.riskFlags?.length ? `Risk Flags: ${input.coachIntelligence.riskFlags.join('; ')}` : '',
      input.coachIntelligence.nextIterationStrategy?.length ? `Next Iteration: ${input.coachIntelligence.nextIterationStrategy.join('; ')}` : '',
    ].filter(Boolean).join('\n')
  }

  if (!input.clientFacingMessage) {
    input.clientFacingMessage = [
      input.stateAnalysis?.summary,
      input.protocolRationale?.executionFocus,
      input.nutritionProtocol?.adherenceFallback,
    ].filter(Boolean).join(' ')
  }

  return input
}

const FORGE_SYSTEM_PROMPT = `You are the FORGË Behavioral Intelligence Engine AI component. You generate adaptive health and fitness protocols for the FORGË platform.

CORE PHILOSOPHY:
- Behavior drives programming. Behavioral capacity determines protocol complexity, not fitness level alone.
- Non-punitive adaptation: when behavioral capacity drops, simplify—never withhold progress.
- Complexity before load: movement coordination progresses before intensity.

FORGE STAGES: Foundations · Optimization · Resilience · Growth · Empowerment

BIE VARIABLES (0-100 scale):
- BAR: ≥80 progression eligible, 65-79 consolidation, 50-64 maintenance, <50 recovery
- BLI: <30 sustainable, 30-50 moderate, 50-70 elevated, >70 critical
- DBI: <30 low, 30-50 moderate, 50-70 high, >70 critical
- LSI: higher = more stable
- PPS: ≥70 advancement eligible

BSLDS MEAL STRUCTURE: Breakfast · Snack · Lunch · Dinner · Snack
- Carbohydrates front-loaded earlier in day
- Dinner is intentionally carb-reduced or carb-free
- Evening snack is protein-forward

You must ALWAYS respond with ONLY a valid JSON object. No markdown, no backticks, no explanation. Just raw JSON.`

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key is not configured. Set ANTHROPIC_API_KEY in the deployment environment.' },
        { status: 503 }
      )
    }

    const client = await db.queryOne<{
      coach_id: string
      full_name: string
      primary_goal: string | null
      motivation: string | null
      obstacles: string | null
      notes: string | null
      date_of_birth: string | null
      gender: string | null
      injuries: string[] | null
      program_tier: string | null
      current_stage: string | null
      available_equipment: string[] | null
      sessions_per_week: number | null
    }>(
      `SELECT coach_id, full_name, primary_goal, motivation, obstacles, notes,
              date_of_birth::text as date_of_birth, gender, injuries, program_tier,
              current_stage, available_equipment, sessions_per_week
       FROM clients WHERE id = $1`,
      [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const { protocolType, coachDirectives } = body
    const currentStage = client.current_stage ?? 'foundations'
    const normalizedProtocolType =
      protocolType === 'movement' ||
      protocolType === 'nutrition' ||
      protocolType === 'recovery' ||
      protocolType === 'composite'
        ? protocolType
        : 'composite'

    const snapshot = await db.queryOne<{
      bar: number; bli: number; dbi: number; cdi: number; lsi: number; pps: number
      generation_state: string
    }>(
      `SELECT bar_score AS bar, bli_score AS bli, dbi_score AS dbi, cdi, lsi, pps, generation_state
       FROM behavioral_snapshots WHERE client_id = $1
       ORDER BY snapshot_date DESC LIMIT 1`,
      [params.clientId]
    )

    const measurements = await db.queryOne<{
      weight_lbs: number | null; body_fat_pct: number | null
      lean_mass_lbs: number | null; waist_in: number | null
    }>(
      `SELECT weight_lbs, body_fat_pct, lean_mass_lbs, waist_in
       FROM client_measurements WHERE client_id = $1
       ORDER BY measurement_date DESC LIMIT 1`,
      [params.clientId]
    )

    const adherenceRecords = await db.query<{ record_type: string }>(
      `SELECT record_type FROM adherence_records WHERE client_id = $1
       AND record_date >= NOW() - INTERVAL '28 days'`,
      [params.clientId]
    )

    const journals = await db.query<{
      body: string | null; sleep_quality: number | null
      energy_level: number | null; stress_level: number | null; mood: number | null
    }>(
      `SELECT body, sleep_quality, energy_level, stress_level, mood
       FROM journal_entries WHERE client_id = $1
       ORDER BY entry_date DESC LIMIT 4`,
      [params.clientId]
    )

    const checkins = await db.query<{
      workout_consistency: number | null; nutrition_adherence: number | null
      sleep_quality: number | null; stress_rating: number | null
      what_worked: string | null; challenges: string | null
      grateful_for: string | null; did_for_self: string | null
    }>(
      `SELECT workout_consistency, nutrition_adherence, sleep_quality, stress_rating,
              what_worked, challenges, grateful_for, did_for_self
       FROM client_checkins WHERE client_id = $1
       ORDER BY checkin_date DESC LIMIT 2`,
      [params.clientId]
    )

    const aiDocs = await db.query<{
      title: string | null
      document_type: string | null
      file_data: string | null
      file_type: string | null
      file_name: string | null
    }>(
      `SELECT title, document_type, file_type, file_name,
              encode(file_data, 'base64') as file_data
       FROM client_documents
       WHERE client_id = $1 AND include_in_ai = true
       ORDER BY created_at DESC LIMIT 5`,
      [params.clientId]
    )

    // Extract text content from documents for AI context
    const docContexts: string[] = []

    for (const doc of aiDocs.slice(0, MAX_CONTEXT_DOCS)) {
      if (!doc.file_data) continue

      const fileType = doc.file_type?.toLowerCase() ?? ''
      const label = `[${doc.document_type?.toUpperCase() ?? 'DOCUMENT'}: ${doc.title ?? doc.file_name}]`

      // For text-based files, decode and include content directly
      if (
        fileType.includes('text') ||
        fileType.includes('plain') ||
        fileType.includes('csv') ||
        (doc.file_name?.endsWith('.txt') ?? false) ||
        (doc.file_name?.endsWith('.md') ?? false) ||
        (doc.file_name?.endsWith('.csv') ?? false)
      ) {
        try {
          const normalized = normalizeBase64(doc.file_data)
          if (!normalized) throw new Error('Invalid base64')
          const text = Buffer.from(normalized, 'base64')
            .toString('utf-8')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_CONTEXT_DOC_CHARS)
          docContexts.push(`${label}\n${text}`)
        } catch {
          docContexts.push(`${label}\n[Could not read content]`)
        }
      }
      // For PDFs and other binary files, note they exist with metadata
      else if (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false)) {
        docContexts.push(`${label}\n[PDF document uploaded — use title and document type as context]`)
      }
      // For images (progress photos, lab result screenshots etc)
      else if (
        fileType.includes('image') ||
        fileType.includes('jpeg') ||
        fileType.includes('png') ||
        (doc.file_name?.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ?? false)
      ) {
        docContexts.push(`${label}\n[Image document — ${doc.document_type} visual reference]`)
      } else {
        docContexts.push(`${label}\n[Document uploaded: ${doc.file_name}]`)
      }
    }

    const docSummary = docContexts.length > 0 ? docContexts.join('\n\n') : 'None'

    const equipmentText =
      Array.isArray(client.available_equipment)
        ? client.available_equipment.join(', ')
        : typeof (client as any).available_equipment === 'string'
          ? (client as any).available_equipment
          : 'Standard gym'
    const age =
      client.date_of_birth
        ? Math.max(
            0,
            new Date().getFullYear() -
              new Date(`${client.date_of_birth}T00:00:00`).getFullYear() -
              (
                (() => {
                  const today = new Date()
                  const birth = new Date(`${client.date_of_birth}T00:00:00`)
                  return today.getMonth() < birth.getMonth() ||
                    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
                    ? 1
                    : 0
                })()
              )
          )
        : null
    const priorProtocols = await db.query<{
      name: string
      protocol_type: string
      created_at: string
      notes: string | null
      coach_notes: string | null
    }>(
      `SELECT name, protocol_type, created_at::text, notes, coach_notes
       FROM protocols
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [params.clientId]
    )
    const priorProtocolSummary = priorProtocols.length > 0
      ? priorProtocols.map(protocol =>
          `${protocol.protocol_type}: ${protocol.name}${protocol.notes ? ` | notes: ${protocol.notes.slice(0, 120)}` : ''}${protocol.coach_notes ? ` | coach: ${protocol.coach_notes.slice(0, 120)}` : ''}`
        ).join(' // ')
      : 'No prior protocols'

    const journalSummary = journals.map(j => [
      j.body?.slice(0, 100),
      j.sleep_quality ? `sleep ${j.sleep_quality}/5` : '',
      j.energy_level ? `energy ${j.energy_level}/5` : '',
      j.stress_level ? `stress ${j.stress_level}/5` : '',
    ].filter(Boolean).join(' | ')).filter(Boolean).join(' // ')

    const checkinSummary = checkins.map(c => [
      c.workout_consistency ? `workout ${c.workout_consistency}/10` : '',
      c.nutrition_adherence ? `nutrition ${c.nutrition_adherence}/10` : '',
      c.what_worked ? `win: ${c.what_worked.slice(0, 80)}` : '',
      c.challenges ? `challenge: ${c.challenges.slice(0, 80)}` : '',
      c.grateful_for ? `grateful: ${c.grateful_for.slice(0, 60)}` : '',
      c.did_for_self ? `self-care: ${c.did_for_self.slice(0, 60)}` : '',
    ].filter(Boolean).join(' | ')).filter(Boolean).join(' // ')

    const completedSessions = adherenceRecords.filter(record =>
      record.record_type === 'session_completed' || record.record_type.includes('completed')
    ).length
    const partialSessions = adherenceRecords.filter(record =>
      record.record_type.includes('partial')
    ).length
    const loggedNutritionDays = adherenceRecords.filter(record =>
      record.record_type.includes('nutrition') || record.record_type.includes('meal')
    ).length
    const expectedSessions = Math.max((client.sessions_per_week ?? 3) * 4, 1)
    const expectedNutritionDays = 28
    const expectedCheckins = Math.max(journals.length > 0 || checkins.length > 0 ? 4 : 1, 1)

    const estimatedBar = clampScore(computeBAR({
      plannedSessions: expectedSessions,
      completedSessions,
      partialSessions,
      plannedNutritionDays: expectedNutritionDays,
      loggedNutritionDays: Math.min(loggedNutritionDays, expectedNutritionDays),
      checkInsCompleted: Math.min(checkins.length, expectedCheckins),
      checkInsPlanned: expectedCheckins,
    }))

    const journalSignalSamples = journals.map(journal =>
      extractSignalsFromCheckIn({
        sleepQuality: journal.sleep_quality ?? undefined,
        energyLevel: journal.energy_level ?? undefined,
        stressLevel: journal.stress_level ?? undefined,
        mood: journal.mood ?? undefined,
      })
    )

    const checkinSignalSamples = checkins.map(checkin =>
      extractSignalsFromCheckIn({
        sleepQuality: checkin.sleep_quality ?? undefined,
        stressLevel:
          typeof checkin.stress_rating === 'number'
            ? Math.max(1, Math.min(5, Math.round(checkin.stress_rating / 2)))
            : undefined,
        energyLevel:
          typeof checkin.workout_consistency === 'number'
            ? Math.max(1, Math.min(5, Math.round(checkin.workout_consistency / 2)))
            : undefined,
      })
    )

    const allSignals = [...journalSignalSamples, ...checkinSignalSamples]
    const baseDbi = average(allSignals.map(signal => signal.dbi_signal)) ?? 42
    const baseLsi = average(allSignals.map(signal => signal.lsi_signal)) ?? 58
    const baseCdi = average(allSignals.map(signal => signal.cdi_signal)) ?? 40

    const textCorpus = [
      ...journals.map(journal => journal.body ?? ''),
      ...checkins.flatMap(checkin => [
        checkin.what_worked ?? '',
        checkin.challenges ?? '',
        checkin.grateful_for ?? '',
        checkin.did_for_self ?? '',
      ]),
      docSummary === 'None' ? '' : docSummary,
    ].join('\n')

    const disruptionHits = countKeywordHits(textCorpus, [
      /\btravel\b/,
      /\bsick|ill|illness\b/,
      /\bstress|overwhelm|burnout\b/,
      /\bbusy|chaos|disrupt(?:ed|ion)?\b/,
      /\bpain|injury|flare\b/,
      /\bpoor sleep|insomnia|exhausted|fatigue\b/,
    ])
    const stabilityHits = countKeywordHits(textCorpus, [
      /\bconsistent|routine|steady|stable\b/,
      /\benergized|confident|focused|strong\b/,
      /\bwell-rested|slept well|good sleep\b/,
      /\bon track|momentum|dialed in\b/,
    ])

    const estimatedDbi = clampScore(baseDbi + (disruptionHits * 5) - (stabilityHits * 3))
    const estimatedLsi = clampScore(baseLsi + (stabilityHits * 6) - (disruptionHits * 5))
    const estimatedCdi = clampScore(baseCdi + (disruptionHits * 4) - (stabilityHits * 2))
    const estimatedBli = clampScore((estimatedDbi * 0.4) + ((100 - estimatedBar) * 0.25) + (estimatedCdi * 0.2) + ((100 - estimatedLsi) * 0.15))
    const estimatedPps = clampScore(computePPS(
      estimatedBar,
      estimatedBli,
      estimatedDbi,
      estimatedLsi,
      estimatedBar >= 65 ? 4 : estimatedBar >= 50 ? 2 : 0
    ))

    const resolvedBie = {
      bar: snapshot?.bar ?? estimatedBar,
      bli: snapshot?.bli ?? estimatedBli,
      dbi: snapshot?.dbi ?? estimatedDbi,
      cdi: snapshot?.cdi ?? estimatedCdi,
      lsi: snapshot?.lsi ?? estimatedLsi,
      pps: snapshot?.pps ?? estimatedPps,
    }
    const hasStoredSnapshot = Boolean(
      snapshot &&
      [snapshot.bar, snapshot.bli, snapshot.dbi, snapshot.cdi, snapshot.lsi, snapshot.pps].some(
        value => typeof value === 'number'
      )
    )
    const generationState =
      snapshot?.generation_state ??
      computeGenerationState({
        ...resolvedBie,
        cLsi: resolvedBie.lsi,
      }).state
    const bieSource = hasStoredSnapshot ? 'snapshot' : 'estimated'

    const prompt = `Generate a ${normalizedProtocolType} protocol for this FORGE client.

CLIENT: ${client.full_name}
Stage: ${currentStage.toUpperCase()}
Program Tier: ${client.program_tier ?? 'Not set'}
Primary Goal: ${client.primary_goal ?? 'General fitness and wellness'}
Injuries: ${Array.isArray(client.injuries) ? client.injuries.join(', ') : (client.injuries || '') || 'None'}
Age: ${age ?? 'unknown'}
Gender: ${client.gender ? client.gender.replace(/_/g, ' ') : 'not specified'}
Motivation: ${client.motivation ?? 'Not recorded'}
Obstacles: ${client.obstacles ?? 'Not recorded'}
Coach / intake notes: ${client.notes ?? 'None'}
Equipment: ${equipmentText}
Generation State: ${generationState}

BIE VARIABLES:
BAR: ${resolvedBie.bar} | BLI: ${resolvedBie.bli} | DBI: ${resolvedBie.dbi} | CDI: ${resolvedBie.cdi} | LSI: ${resolvedBie.lsi} | PPS: ${resolvedBie.pps}

MEASUREMENTS: Weight ${measurements?.weight_lbs ?? 'unknown'}lb | BF% ${measurements?.body_fat_pct ?? 'unknown'} | Lean mass ${measurements?.lean_mass_lbs ?? 'unknown'}lb | Waist ${measurements?.waist_in ?? 'unknown'}in

RECENT JOURNALS: ${journalSummary || 'No recent journal entries'}
RECENT CHECK-INS: ${checkinSummary || 'No recent check-ins'}
RECENT PROTOCOL HISTORY: ${priorProtocolSummary}
    ═══ CLIENT DOCUMENTS (AI-enabled) ═══
    ${docSummary}
${coachDirectives ? 'COACH DIRECTIVES: ' + coachDirectives : ''}

Protocol name must include ${client.full_name.split(' ')[0] || 'the client'}'s first name or their specific goal — never a generic name.

Respond with ONLY this JSON structure (no markdown, no backticks):
{
  "name": "Protocol name string",
  "rationale": "Why this protocol matches their behavioral state - 2-3 sentences",
  "sessionStructure": {
    "frequency": 3,
    "sessionsPerWeek": 3,
    "sessionType": "Session type name",
    "complexityCeiling": 2,
    "volumeLevel": "Moderate",
    "activationBlock": [{"exerciseName": "name", "sets": 2, "reps": "10", "tempo": "controlled", "coachingCue": "cue"}],
    "primaryBlock": [{"exerciseName": "name", "sets": 3, "reps": "10-12", "tempo": "3-1-1", "loadGuidance": "guidance", "coachingCue": "cue", "swapOption": "alternative"}],
    "accessoryBlock": [{"exerciseName": "name", "sets": 3, "reps": "12", "tempo": "2-1-1", "coachingCue": "cue"}]
  },
  "nutritionStructure": {
    "dailyCalories": 1650,
    "proteinG": 140,
    "carbG": 150,
    "fatG": 55,
    "mealFrequency": 5,
    "mealTiming": "Front-load carbs in B and L. Protein anchor at every meal. Dinner carb-free.",
    "complexityLevel": "Simple",
    "hydrationTargetOz": 90,
    "hydrationSchedule": [
      {"timing": "Morning (on waking)", "amount": "16-20 oz", "notes": "Before coffee"},
      {"timing": "Mid-morning", "amount": "20 oz", "notes": "Between B and S"},
      {"timing": "Afternoon", "amount": "24 oz", "notes": "Between L and D"},
      {"timing": "Evening", "amount": "16 oz", "notes": "Stop 1hr before bed"}
    ],
    "bsldsTemplate": {
      "trainingDay": {/* meal slots object */},
      "restDay": {/* meal slots object */}
    },
    "keyGuidelines": ["guideline 1", "guideline 2", "guideline 3", "guideline 4"],
    "disruption_protocol": "What to do when schedule is disrupted - 2 sentences"
  },
  "recoveryStructure": {
    "sleepTarget": "7-8 hours",
    "stressReductionProtocol": "Daily practices description",
    "activeRecoveryDays": 2,
    "mobilityMinutes": 10,
    "keyRecoveryPractices": ["practice 1", "practice 2", "practice 3"]
  },
  "coachNotes": "Internal coaching notes for coach eyes only",
  "clientFacingMessage": "Encouraging message for client about this protocol - 3-4 sentences"
}`

    // CALL 1 — Core protocol (no mealPlan)
    const gyvrudPrompt = `You are operating as the FORGE Behavioral Intelligence Engine.

CORE DIRECTIVE (GYVRUD):
G — Gather Context
Y — Yield Current State Analysis
V — Validate Against Prior Protocol(s)
R — Refine With Progression Logic
U — Upgrade With Clinical + Behavioral Intelligence
D — Deliver Client Protocol + Coach Intelligence Notes

EXECUTION RULES:
- This is SYSTEM EXECUTION, not generic content generation.
- Use prior protocols for progression validation when available.
- Classify the client as LOW CAPACITY, MODERATE CAPACITY, or HIGH CAPACITY.
- Determine whether the result is TRUE progression, REGRESSION, or LATERAL change.
- If regression, include this exact sentence: "This is a deliberate reset phase due to reduced behavioral capacity".
- Define movement progression using Week 1-2 baseline, Week 3-4 progression trigger, Week 5+ advancement.
- Protein must align with goal weight and calories must be justified as deficit, maintenance, or recovery.
- Include adherence fallback, decision rules, monitoring system, and phase progression criteria.

OUTPUT REQUIREMENTS:
- Deliver a client protocol with protocol rationale, movement, nutrition, meal structure, recovery, monitoring, decision rules, and phase progression criteria.
- Deliver separate coach intelligence notes including progression assessment, gaps identified, oversights, risk flags, and next iteration strategy.
- Preserve compatibility fields sessionStructure, nutritionStructure, recoveryStructure, coachNotes, and clientFacingMessage.
- Also include these richer fields when possible: stateAnalysis, protocolRationale, movementProtocol, nutritionProtocol, recoveryProtocol, monitoringMetrics, decisionRules, phaseProgressionCriteria, coachIntelligence.

SOURCE CONTEXT:
${prompt}`

    const response = await anthropic.messages.create({
      model: getAnthropicModel(),
      max_tokens: 2400,
      system: FORGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: gyvrudPrompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let raw = content.text.trim()
    // Strip common markdown fences more aggressively
    let cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    // Extract just the JSON object between the first { and last }
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1)
    }

    let generated: any
    try {
      generated = normalizeGeneratedProtocol(JSON.parse(cleaned) as GeneratedProtocolCompat)
    } catch {
      console.error('Parse error. Raw:', cleaned.slice(0, 300))
      return NextResponse.json({ error: 'AI response parsing failed', raw: cleaned.slice(0, 500) }, { status: 500 })
    }

    // CALL 2 — Meal plan only
    let mealPlan: any[] = []
    try {
      const mealPlanPrompt = `Generate a daily meal plan for this client.

Client: ${client.full_name}
Goal: ${client.primary_goal ?? 'General fitness'}
Weight: ${measurements?.weight_lbs ?? 'unknown'} lbs
Stage: ${currentStage}
Daily Targets: ${generated.nutritionStructure?.dailyCalories ?? generated.nutritionProtocol?.dailyCalories} cal | ${generated.nutritionStructure?.proteinG ?? generated.nutritionProtocol?.proteinG}g protein | ${generated.nutritionStructure?.carbG ?? generated.nutritionProtocol?.carbG}g carbs | ${generated.nutritionStructure?.fatG ?? generated.nutritionProtocol?.fatG}g fat
Meal Frequency: ${generated.nutritionStructure?.mealFrequency ?? generated.nutritionProtocol?.mealFrequency} meals
Meal Timing: ${generated.nutritionStructure?.mealTiming ?? generated.nutritionProtocol?.mealTiming}
Injuries: ${Array.isArray(client.injuries) && client.injuries.length > 0 ? client.injuries.join(', ') : 'None'}
${coachDirectives ? 'Coach notes: ' + coachDirectives : ''}

Return ONLY a JSON array (no markdown, no wrapper object):
[
  {
    "time": "8:00-9:00 a.m.",
    "meal": "Breakfast",
    "foods": "Specific foods with exact portions for this client",
    "notes": ""
  }
]

Include: Breakfast, Morning Snack (if applicable), Lunch, Afternoon Snack (if applicable), Training Carbs (training days), Dinner, Evening Snack (if applicable).
Use REAL foods and EXACT gram/oz portions based on the macro targets above.
The meal plan must match ${client.full_name}'s goal of "${client.primary_goal ?? 'General fitness'}".`

        const mealPlanResponse = await anthropic.messages.create({
          model: getAnthropicModel(),
          max_tokens: 1200,
        system: 'You generate meal plans. Respond with ONLY a raw JSON array. No markdown, no backticks, no explanation.',
        messages: [{ role: 'user', content: mealPlanPrompt }],
      })

      const mpContent = mealPlanResponse.content[0]
      if (mpContent.type === 'text') {
        let mpRaw = mpContent.text.trim()
        mpRaw = mpRaw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()

        const firstBracket = mpRaw.indexOf('[')
        const lastBracket = mpRaw.lastIndexOf(']')
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          mpRaw = mpRaw.slice(firstBracket, lastBracket + 1)
        }

        try {
          const parsed = JSON.parse(mpRaw)
          if (Array.isArray(parsed)) {
            mealPlan = parsed
          }
        } catch {
          console.error('Meal plan parse failed, falling back to empty array')
          mealPlan = []
        }
      }
    } catch (e) {
      console.error('Meal plan generation error:', e)
      mealPlan = []
    }

    if (generated && generated.nutritionStructure) {
      generated.nutritionStructure.mealPlan = mealPlan
    }

    return NextResponse.json({
      success: true,
      generated,
      context: {
        bie: resolvedBie,
        bieSource,
        generationState,
        stage: currentStage,
        measurements,
        dataPoints: {
          adherenceRecords: adherenceRecords.length,
          journalEntries: journals.length,
          checkins: checkins.length,
          biomarkers: 'none',
          aiDocs: aiDocs.length,
        }
      }
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Protocol generation error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
