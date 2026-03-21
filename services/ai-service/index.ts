/**
 * FORGÃ‹ AI Service
 * Claude API integration for protocol generation, signal extraction, and coaching insights
 */

import Anthropic from '@anthropic-ai/sdk'
import { BIEVariables, ForgeStage, GenerationState } from '../../lib/bie-engine'
import { db } from '../../lib/db'
import { buildOverrideIntelligenceSummary } from '../../lib/protocol-overrides'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'
const MAX_PROTOCOL_PDF_ATTACHMENTS = 1

function normalizeBase64(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null
  let s = String(input).trim()
  s = s.replace(/^data:.*?;base64,/i, '')
  s = s.replace(/\s+/g, '')
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  if (s.length === 0) return null
  const padding = s.length % 4
  if (padding !== 0) {
    s = s.padEnd(s.length + (4 - padding), '=')
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null
  return s
}

function canonicalizeDocumentBase64(
  input: string | null | undefined,
  expectedType?: 'pdf'
): string | null {
  const normalized = normalizeBase64(input)
  if (!normalized) return null

  const decoded = Buffer.from(normalized, 'base64')
  if (decoded.length === 0) return null

  if (expectedType === 'pdf') {
    if (decoded.subarray(0, 4).toString('utf8') === '%PDF') {
      return decoded.toString('base64')
    }

    // Legacy uploads may have stored the base64 text itself in bytea, which means
    // `encode(file_data, 'base64')` returns base64-of-base64 text. Decode once more.
    const nested = normalizeBase64(decoded.toString('utf8'))
    if (!nested) return null

    const nestedDecoded = Buffer.from(nested, 'base64')
    if (nestedDecoded.subarray(0, 4).toString('utf8') !== '%PDF') {
      return null
    }

    return nestedDecoded.toString('base64')
  }

  return decoded.toString('base64')
}

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ClientContext = {
  clientId: string
  fullName: string
  stage: ForgeStage
  programTier: string
  primaryGoal: string
  injuries: string[]
  currentBIE: BIEVariables
  generationState: GenerationState
  recentAdherence: {
    weeksTracked: number
    avgBAR: number
    sessionCompletionRate: number
  }
  recentJournalSummary?: string
  recentBiomarkers?: Record<string, number>
}

export type ProtocolGenerationRequest = {
  client: ClientContext
  protocolType: 'movement' | 'nutrition' | 'recovery' | 'composite'
  equipmentAvailable?: string[]
  previousProtocolSummary?: string
  coachDirectives?: string
}

export type GeneratedProtocol = {
  name: string
  rationale: string
  override_summary?: string
  influenced_by_overrides?: boolean
  sessionStructure?: {
    frequency: number
    sessionsPerWeek: number
    sessionType: string
    activationBlock: ExerciseBlock[]
    primaryBlock: ExerciseBlock[]
    accessoryBlock: ExerciseBlock[]
    finisherBlock?: ExerciseBlock[]
    complexityCeiling: number
    volumeLevel: string
  }
  nutritionStructure?: {
    dailyCalories: number
    proteinG: number
    carbG: number
    fatG: number
    mealFrequency: number
    mealTiming: string
    complexityLevel: string
    keyGuidelines: string[]
    disruption_protocol: string
  }
  recoveryStructure?: {
    sleepTarget: string
    stressReductionProtocol: string
    activeRecoveryDays: number
    mobilityMinutes: number
    keyRecoveryPractices: string[]
  }
  coachNotes: string
  clientFacingMessage: string
}

export type ExerciseBlock = {
  exerciseName: string
  sets: number
  reps: string
  tempo?: string
  rest?: string
  loadGuidance?: string
  coachingCue?: string
  swapOption?: string
}

// â”€â”€â”€ System Prompts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FORGE_SYSTEM_PROMPT = `You are the FORGÃ‹ Behavioral Intelligence Engine AI component. You generate adaptive health and fitness protocols for the FORGÃ‹ platform.

CORE PHILOSOPHY:
- Behavior drives programming. Behavioral capacity determines protocol complexity, not fitness level alone.
- Non-punitive adaptation: when behavioral capacity drops, simplifyâ€”never withhold progress.
- Complexity before load: movement coordination progresses before intensity.
- Resilience to disruption: all protocols include swap alternatives.

FORGE STAGES:
1. Foundations â€” Tier 1-2 complexity, 2-3x/week, pattern mastery
2. Optimization â€” Tier 1-3 complexity, 3-4x/week, progressive overload  
3. Resilience â€” Tier 1-4 complexity, 3-4x/week, whole-body adaptation
4. Growth â€” Tier 1-4 complexity, 4-5x/week, performance development
5. Empowerment â€” Tier 1-5 complexity, 4-5x/week, autonomous mastery

BIE VARIABLES (0-100 scale):
- BAR (Behavioral Adherence Rate): â‰¥80 = progression eligible, 65-79 = consolidation, 50-64 = maintenance, <50 = recovery
- BLI (Behavioral Load Index): <30 = sustainable, 30-50 = moderate, 50-70 = elevated, >70 = critical
- DBI (Decision Burden Index): <30 = low, 30-50 = moderate, 50-70 = high, >70 = critical  
- CDI (Cognitive Demand Index): <30 = low, 30-50 = moderate, â‰¥70 = restrict to Tier 1-2
- LSI (Lifestyle Stability Index): 0-100, higher = more stable
- PPS (Progression Probability Score): â‰¥70 = advancement eligible

GENERATION STATES:
- State A (Stable Progression): Full volume, complexity advancement eligible
- State B (Consolidation): Hold complexity, maintain or slightly reduce volume
- State C (Simplified Load): Reduce sets 20-30%, remove finisher, reduce complexity
- State D (Recovery/Disruption): Recovery template, minimum viable, Tier 1-2 only
- State E (Rebuild/Re-entry): Foundations protocol regardless of previous stage

Always output structured JSON matching the requested schema exactly.`

// â”€â”€â”€ Protocol Generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function generateProtocol(
  request: ProtocolGenerationRequest
): Promise<GeneratedProtocol> {
  const { client, protocolType, equipmentAvailable, previousProtocolSummary, coachDirectives } = request
  const priorProtocols = await db.query<{ protocol_payload: Record<string, unknown> | null }>(
    `SELECT protocol_payload
     FROM protocols
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 3`,
    [client.clientId]
  )
  const overrideIntelligence = buildOverrideIntelligenceSummary(
    priorProtocols.map(protocol => protocol.protocol_payload)
  )
  const coachAdjustmentSummary = overrideIntelligence.summary

  // Pull AI-enabled documents and decode content for better protocol generation context.
  // Note: we only inline-decoded text-based files; for PDFs/images we provide placeholders
  // and also attach PDFs as document blocks to Anthropic when available.
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
    [client.clientId]
  )

  const docContexts: string[] = []
  for (const doc of aiDocs) {
    if (!doc.file_data) continue

    const fileType = doc.file_type?.toLowerCase() ?? ''
    const label = `[${doc.document_type?.toUpperCase() ?? 'DOCUMENT'}: ${doc.title ?? doc.file_name}]`

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
          .slice(0, 700)
        docContexts.push(`${label}\n${text}`)
      } catch {
        docContexts.push(`${label}\n[Could not read content]`)
      }
    } else if (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false)) {
      docContexts.push(`${label}\n[PDF document uploaded — use title and document type as context]`)
    } else if (
      fileType.includes('image') ||
      fileType.includes('jpeg') ||
      fileType.includes('png') ||
      (doc.file_name?.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ?? false)
    ) {
      docContexts.push(`${label}\n[Image document — ${doc.document_type ?? 'visual reference'} visual reference]`)
    } else {
      docContexts.push(`${label}\n[Document uploaded: ${doc.file_name}]`)
    }
  }

  const docSummary = docContexts.length > 0 ? docContexts.join('\n\n') : 'None'

  const pdfDocs = aiDocs.filter(doc => {
    const fileType = doc.file_type?.toLowerCase() ?? ''
    return Boolean(doc.file_data) && (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false))
  })

  const userPrompt = `Generate a ${protocolType} protocol for the following FORGE client.

CLIENT CONTEXT:
- Name: ${client.fullName}
- Stage: ${client.stage.toUpperCase()}
- Program Tier: ${client.programTier}
- Primary Goal: ${client.primaryGoal}
- Injuries/Limitations: ${client.injuries.length > 0 ? client.injuries.join(', ') : 'None reported'}
- Generation State: ${client.generationState} (${getStateLabel(client.generationState)})

CURRENT BIE VARIABLES:
- BAR: ${client.currentBIE.bar.toFixed(1)}
- BLI: ${client.currentBIE.bli.toFixed(1)}  
- DBI: ${client.currentBIE.dbi.toFixed(1)}
- CDI: ${client.currentBIE.cdi.toFixed(1)}
- LSI: ${client.currentBIE.lsi.toFixed(1)}
- PPS: ${client.currentBIE.pps.toFixed(1)}

RECENT ADHERENCE:
- Weeks tracked: ${client.recentAdherence.weeksTracked}
- Average BAR: ${client.recentAdherence.avgBAR.toFixed(1)}
- Session completion rate: ${(client.recentAdherence.sessionCompletionRate * 100).toFixed(0)}%

${equipmentAvailable ? `AVAILABLE EQUIPMENT: ${equipmentAvailable.join(', ')}` : ''}
${previousProtocolSummary ? `PREVIOUS PROTOCOL SUMMARY: ${previousProtocolSummary}` : ''}
COACH ADJUSTMENT SUMMARY:
${coachAdjustmentSummary}
${client.recentJournalSummary ? `RECENT JOURNAL SIGNALS: ${client.recentJournalSummary}` : ''}
${coachDirectives ? `COACH DIRECTIVES: ${coachDirectives}` : ''}

CLIENT DOCUMENTS (AI-enabled):
${docSummary}

Generate a complete ${protocolType} protocol. Apply the correct generation state logic.
- Adapt to coach behavior rather than overriding it.
- If repeated volume reductions appear, lower base volume next.
- If repeated fatigue flags appear, reduce intensity, frequency, or complexity.
- If adherence issues appear, simplify the structure.
- If consistent progression signals appear, advance load or complexity conservatively.
Output ONLY valid JSON matching this schema:
{
  "name": "Protocol name",
  "rationale": "Why this protocol matches their current behavioral state",
  "sessionStructure": { ... } or "nutritionStructure": { ... } or "recoveryStructure": { ... },
  "coachNotes": "Internal notes for the coach",
  "clientFacingMessage": "Encouraging message for the client about this protocol",
  "override_summary": "Compact coach adjustment summary",
  "influenced_by_overrides": true
}`

  const response = await anthropic.messages.create({
    model: MODEL,
      max_tokens: 2600,
    system: FORGE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: ((): any[] => {
          const userMessageContent: any[] = [{ type: 'text', text: userPrompt }]
          for (const doc of pdfDocs.slice(0, MAX_PROTOCOL_PDF_ATTACHMENTS)) {
            if (!doc.file_data) continue
            const pdfB64 = canonicalizeDocumentBase64(doc.file_data, 'pdf')
            if (!pdfB64) continue
            userMessageContent.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfB64,
              },
            })
          }
          return userMessageContent
        })(),
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  try {
    const clean = content.text.replace(/```json\n?|\n?```/g, '').trim()
    const generated = JSON.parse(clean) as GeneratedProtocol
    generated.override_summary = coachAdjustmentSummary
    generated.influenced_by_overrides = overrideIntelligence.hasInfluence
    return generated
  } catch {
    throw new Error('Failed to parse protocol from AI response')
  }
}

// â”€â”€â”€ Journal Signal Extractor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function extractJournalSignals(
  journalEntry: string,
  clientContext: Pick<ClientContext, 'stage' | 'currentBIE'>
): Promise<{
  dbiImpact: number
  lsiImpact: number
  cdiImpact: number
  flags: string[]
  keyInsights: string[]
  coachingRecommendation: string
}> {
  const prompt = `Analyze this FORGE client journal entry and extract behavioral intelligence signals.

CURRENT CLIENT STATE:
- Stage: ${clientContext.stage}
- Current DBI: ${clientContext.currentBIE.dbi.toFixed(1)}
- Current LSI: ${clientContext.currentBIE.lsi.toFixed(1)}
- Current CDI: ${clientContext.currentBIE.cdi.toFixed(1)}

JOURNAL ENTRY:
${journalEntry}

Extract behavioral signals. Output ONLY JSON:
{
  "dbiImpact": <number 0-100, estimated DBI based on this entry>,
  "lsiImpact": <number 0-100, estimated LSI based on this entry>,
  "cdiImpact": <number 0-100, estimated CDI based on this entry>,
  "flags": [<string flags: "travel", "illness", "work_stress", "family_stress", "low_energy", "sleep_deprivation", "positive_momentum">],
  "keyInsights": [<2-4 brief bullet points about behavioral signals>],
  "coachingRecommendation": "<one sentence recommendation for coach>"
}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: FORGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const clean = content.text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(clean)
}

// â”€â”€â”€ Weekly Insight Generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function generateWeeklyInsight(
  client: ClientContext,
  weeklyData: {
    adherenceRecords: Array<{ type: string; completed: boolean; notes?: string }>
    biomarkerChanges?: Record<string, { previous: number; current: number }>
    journalHighlights: string[]
    currentVsPreviousBAR: { current: number; previous: number }
  }
): Promise<{
  title: string
  summary: string
  fullAnalysis: string
  recommendations: string[]
  confidenceScore: number
}> {
  // Pull AI-enabled documents and decode content for better insight context.
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
    [client.clientId]
  )

  const docContexts: string[] = []
  for (const doc of aiDocs) {
    if (!doc.file_data) continue

    const fileType = doc.file_type?.toLowerCase() ?? ''
    const label = `[${doc.document_type?.toUpperCase() ?? 'DOCUMENT'}: ${doc.title ?? doc.file_name}]`

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
          .slice(0, 350)
        docContexts.push(`${label}\n${text}`)
      } catch {
        docContexts.push(`${label}\n[Could not read content]`)
      }
    } else if (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false)) {
      docContexts.push(`${label}\n[PDF document uploaded — use title and document type as context]`)
    } else if (
      fileType.includes('image') ||
      fileType.includes('jpeg') ||
      fileType.includes('png') ||
      (doc.file_name?.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ?? false)
    ) {
      docContexts.push(`${label}\n[Image document — ${doc.document_type ?? 'visual reference'} visual reference]`)
    } else {
      docContexts.push(`${label}\n[Document uploaded: ${doc.file_name}]`)
    }
  }

  const docSummary = docContexts.length > 0 ? docContexts.join('\n\n') : 'None'

  const pdfDocs = aiDocs.filter(doc => {
    const fileType = doc.file_type?.toLowerCase() ?? ''
    return Boolean(doc.file_data) && (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false))
  })

  const prompt = `Generate a weekly behavioral intelligence insight for this FORGE client.

CLIENT: ${client.fullName} | Stage: ${client.stage} | State: ${client.generationState}

WEEKLY DATA:
BAR Change: ${weeklyData.currentVsPreviousBAR.previous.toFixed(1)} â†’ ${weeklyData.currentVsPreviousBAR.current.toFixed(1)}
Sessions completed: ${weeklyData.adherenceRecords.filter(r => r.completed).length}/${weeklyData.adherenceRecords.length}
Journal highlights: ${weeklyData.journalHighlights.join(' | ')}
${weeklyData.biomarkerChanges ? `Biomarker changes: ${JSON.stringify(weeklyData.biomarkerChanges)}` : ''}

CURRENT BIE:
BAR: ${client.currentBIE.bar.toFixed(1)}, BLI: ${client.currentBIE.bli.toFixed(1)}, DBI: ${client.currentBIE.dbi.toFixed(1)}, PPS: ${client.currentBIE.pps.toFixed(1)}

CLIENT DOCUMENTS (AI-enabled):
${docSummary}

Output ONLY JSON:
{
  "title": "Brief insight title",
  "summary": "2-3 sentence summary for coach dashboard",
  "fullAnalysis": "Full analysis paragraph for coach review",
  "recommendations": ["Action 1", "Action 2", "Action 3"],
  "confidenceScore": <0.0-1.0>
}`

  const response = await anthropic.messages.create({
    model: MODEL,
      max_tokens: 1200,
    system: FORGE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: ((): any[] => {
          const userMessageContent: any[] = [{ type: 'text', text: prompt }]
          for (const doc of pdfDocs.slice(0, 3)) {
            if (!doc.file_data) continue
            const pdfB64 = canonicalizeDocumentBase64(doc.file_data, 'pdf')
            if (!pdfB64) continue
            userMessageContent.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfB64,
              },
            })
          }
          return userMessageContent
        })(),
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const clean = content.text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(clean)
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getStateLabel(state: GenerationState): string {
  const labels: Record<GenerationState, string> = {
    A: 'Stable Progression',
    B: 'Consolidation',
    C: 'Simplified Load',
    D: 'Recovery/Disruption',
    E: 'Rebuild/Re-entry',
  }
  return labels[state]
}
