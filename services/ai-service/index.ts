/**
 * FORGÃ‹ AI Service
 * Claude API integration for protocol generation, signal extraction, and coaching insights
 */

import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'
import { BIEVariables, ForgeStage, GenerationState } from '../../lib/bie-engine'
import { buildCoachInsightTemplateInstructions } from '../../lib/ai/coach-insight-template'
import { formatHealthPhaseForPrompt, resolveHealthCoachingPhase } from '../../lib/ai/phase-rules'
import { buildUnifiedForgeSystemPrompt } from '../../lib/ai/system-prompt'
import { db } from '../../lib/db'
import { buildOverrideIntelligenceSummary, normalizeLoad } from '../../lib/protocol-overrides'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'
const MAX_PROTOCOL_PDF_ATTACHMENTS = 1
const MAX_INSIGHT_PDF_ATTACHMENTS = 2

type AiDocumentContextRow = {
  title: string | null
  document_type: string | null
  notes: string | null
  file_data: string | null
  file_type: string | null
  file_name: string | null
}

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

function getDocumentPriority(document: Pick<AiDocumentContextRow, 'document_type' | 'title' | 'file_name'>) {
  const searchText = `${document.document_type ?? ''} ${document.title ?? ''} ${document.file_name ?? ''}`.toLowerCase()
  if (document.document_type === 'nutrition_log' || /food journal|nutrition log|meal log|macro log|diet log/.test(searchText)) return 0
  if (document.document_type === 'protocol_reference') return 1
  if (document.document_type === 'assessment' || document.document_type === 'intake_form' || document.document_type === 'questionnaire') return 2
  if (document.document_type === 'lab_report' || document.document_type === 'medical_history') return 3
  return 4
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/\s+/g, ' ').trim()
}

function parseSpreadsheetNumber(value: string) {
  const cleaned = value.replace(/[^0-9.\-]/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function buildDocumentSummary(doc: AiDocumentContextRow, charLimit: number) {
  const fileType = doc.file_type?.toLowerCase() ?? ''
  const label = `[${doc.document_type?.toUpperCase() ?? 'DOCUMENT'}: ${doc.title ?? doc.file_name}]`
  const noteText = doc.notes?.trim() ? `Notes: ${doc.notes.trim()}` : ''
  const searchText = `${doc.document_type ?? ''} ${doc.title ?? ''} ${doc.file_name ?? ''} ${doc.notes ?? ''}`.toLowerCase()
  const nutritionHint = /food journal|nutrition log|meal log|macro log|diet log/.test(searchText) || doc.document_type === 'nutrition_log'
  const nutritionContext = nutritionHint
    ? 'This is nutrition evidence. Use it to assess meal consistency, likely protein adequacy, calorie sufficiency, food quality, and coach follow-up gaps.'
    : ''
  const isSpreadsheet =
    fileType.includes('spreadsheet') ||
    fileType.includes('excel') ||
    fileType.includes('sheet') ||
    (doc.file_name?.toLowerCase().endsWith('.xls') ?? false) ||
    (doc.file_name?.toLowerCase().endsWith('.xlsx') ?? false)

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
        .slice(0, charLimit)
      return [label, noteText, nutritionContext, text].filter(Boolean).join('\n')
    } catch {
      return [label, noteText, nutritionContext, '[Could not read content]'].filter(Boolean).join('\n')
    }
  }

  if (isSpreadsheet) {
    try {
      const normalized = normalizeBase64(doc.file_data)
      if (!normalized) throw new Error('Invalid base64')
      const workbook = XLSX.read(Buffer.from(normalized, 'base64'), { type: 'buffer' })
      const targetColumns = [
        'entry date',
        'entry time',
        'type',
        'meal',
        'summary',
        'brand',
        'serving',
        'calories',
        'protein',
        'carbs',
        'fat',
      ]

      const sheetSummaries = workbook.SheetNames.slice(0, 3).map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
          header: 1,
          blankrows: false,
          raw: false,
          defval: '',
        })

        if (!rows.length) return ''

        const headerRowIndex = rows.findIndex((row) =>
          row.some((cell) => String(cell).trim().length > 0)
        )
        if (headerRowIndex === -1) return ''

        const headerRow = rows[headerRowIndex].map((cell) => String(cell).trim())
        const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell))
        const selectedIndexes = normalizedHeaders
          .map((header, index) => ({ header, index }))
          .filter(({ header }) => targetColumns.some((target) => header.includes(target)))
          .map(({ index }) => index)

        const effectiveIndexes = selectedIndexes.length > 0
          ? selectedIndexes
          : headerRow
              .map((cell, index) => ({ cell, index }))
              .filter(({ cell }) => cell)
              .slice(0, 8)
              .map(({ index }) => index)

        const entryRows = rows
          .slice(headerRowIndex + 1)
          .filter((row) => row.some((cell) => String(cell).trim().length > 0))
          .slice(0, 12)

        const caloriesIndex = normalizedHeaders.findIndex((header) => header.includes('calories'))
        const proteinIndex = normalizedHeaders.findIndex((header) => header.includes('protein'))
        const carbsIndex = normalizedHeaders.findIndex((header) => header.includes('carb'))
        const fatIndex = normalizedHeaders.findIndex((header) => header === 'fat' || header.includes('fat '))
        const mealIndex = normalizedHeaders.findIndex((header) => header.includes('meal'))
        const summaryIndex = normalizedHeaders.findIndex((header) => header.includes('summary'))
        const entryTypeIndex = normalizedHeaders.findIndex((header) => header === 'type' || header.includes('entry type'))

        if (!entryRows.length) {
          return `[Sheet: ${sheetName}] Columns: ${effectiveIndexes.map((index) => headerRow[index]).filter(Boolean).join(', ')}`
        }

        const nutritionRows = nutritionHint
          ? entryRows.filter((row) => {
              const typeValue = entryTypeIndex >= 0 ? String(row[entryTypeIndex] ?? '').toLowerCase() : ''
              return !typeValue || typeValue.includes('food intake') || typeValue.includes('meal') || typeValue.includes('food')
            })
          : entryRows

        const macroTotals = nutritionHint
          ? nutritionRows.reduce(
              (totals, row) => ({
                calories: totals.calories + (caloriesIndex >= 0 ? parseSpreadsheetNumber(String(row[caloriesIndex] ?? '')) ?? 0 : 0),
                protein: totals.protein + (proteinIndex >= 0 ? parseSpreadsheetNumber(String(row[proteinIndex] ?? '')) ?? 0 : 0),
                carbs: totals.carbs + (carbsIndex >= 0 ? parseSpreadsheetNumber(String(row[carbsIndex] ?? '')) ?? 0 : 0),
                fat: totals.fat + (fatIndex >= 0 ? parseSpreadsheetNumber(String(row[fatIndex] ?? '')) ?? 0 : 0),
              }),
              { calories: 0, protein: 0, carbs: 0, fat: 0 }
            )
          : null

        const uniqueMeals = nutritionHint && mealIndex >= 0
          ? Array.from(new Set(
              nutritionRows
                .map((row) => String(row[mealIndex] ?? '').trim())
                .filter(Boolean)
            ))
          : []

        const summarizedRows = entryRows.map((row) =>
          effectiveIndexes
            .map((index) => {
              const header = headerRow[index]
              const value = String(row[index] ?? '').replace(/\s+/g, ' ').trim()
              return header && value ? `${header}: ${value}` : ''
            })
            .filter(Boolean)
            .join(' | ')
        ).filter(Boolean)

        const nutritionSummaryLine = nutritionHint
          ? [
              `Entries: ${nutritionRows.length}`,
              macroTotals && macroTotals.calories > 0 ? `Calories logged: ${Math.round(macroTotals.calories)}` : '',
              macroTotals && macroTotals.protein > 0 ? `Protein logged: ${Math.round(macroTotals.protein)}g` : '',
              macroTotals && macroTotals.carbs > 0 ? `Carbs logged: ${Math.round(macroTotals.carbs)}g` : '',
              macroTotals && macroTotals.fat > 0 ? `Fat logged: ${Math.round(macroTotals.fat)}g` : '',
              uniqueMeals.length > 0 ? `Meals seen: ${uniqueMeals.slice(0, 6).join(', ')}` : '',
            ].filter(Boolean).join(' | ')
          : ''

        return [`[Sheet: ${sheetName}]`, nutritionSummaryLine, ...summarizedRows].filter(Boolean).join('\n')
      }).filter(Boolean)

      if (sheetSummaries.length > 0) {
        return [label, noteText, nutritionContext, ...sheetSummaries]
          .filter(Boolean)
          .join('\n')
          .slice(0, Math.max(charLimit * 3, 1200))
      }
    } catch {
      // Fall through to metadata-only spreadsheet summary.
    }

    return [
      label,
      noteText,
      nutritionContext,
      nutritionHint
        ? '[Spreadsheet nutrition/food journal uploaded - likely contains line-item meals, portions, and macro totals. Use it as primary dietary evidence even if workbook parsing is incomplete.]'
        : '[Spreadsheet document uploaded - use title, type, and notes as context.]',
    ].filter(Boolean).join('\n')
  }

  if (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false)) {
    return [
      label,
      noteText,
      nutritionContext,
      nutritionHint
        ? '[PDF nutrition/food journal uploaded - treat as primary dietary evidence even when only metadata is available.]'
        : '[PDF document uploaded - use title, document type, and notes as context.]',
    ].filter(Boolean).join('\n')
  }

  if (
    fileType.includes('image') ||
    fileType.includes('jpeg') ||
    fileType.includes('png') ||
    (doc.file_name?.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ?? false)
  ) {
    return [label, noteText, nutritionContext, `[Image document - ${doc.document_type ?? 'visual reference'} visual reference]`].filter(Boolean).join('\n')
  }

  return [label, noteText, nutritionContext, `[Document uploaded: ${doc.file_name}]`].filter(Boolean).join('\n')
}

async function fetchAiDocumentContext(clientId: string, summaryCharLimit: number) {
  const aiDocs = await db.query<AiDocumentContextRow>(
    `SELECT title, document_type, notes, file_type, file_name,
            encode(file_data, 'base64') as file_data
     FROM client_documents
     WHERE client_id = $1 AND include_in_ai = true
     ORDER BY created_at DESC
     LIMIT 8`,
    [clientId]
  )

  const prioritizedDocs = [...aiDocs].sort((a, b) => getDocumentPriority(a) - getDocumentPriority(b))
  const docContexts = prioritizedDocs
    .slice(0, 5)
    .map(doc => buildDocumentSummary(doc, summaryCharLimit))
    .filter(Boolean)
  const pdfDocs = prioritizedDocs.filter(doc => {
    const fileType = doc.file_type?.toLowerCase() ?? ''
    return Boolean(doc.file_data) && (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false))
  })

  return {
    summary: docContexts.length > 0 ? docContexts.join('\n\n') : 'None',
    pdfDocs,
    hasNutritionLog: prioritizedDocs.some(doc => getDocumentPriority(doc) === 0),
  }
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

export type CoachInsightMetrics = {
  primary: string
  secondary: string
  tertiary: string
}

export type CoachInsight = {
  title: string
  confidence: number
  metrics: CoachInsightMetrics
  decision: string
  constraint: string
  actions: string[]
  context: string
  tags?: string[]
}

function ensureExerciseLoads(exercises: ExerciseBlock[] | undefined) {
  if (!Array.isArray(exercises)) return exercises

  return exercises.map(exercise => ({
    ...exercise,
    loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
  }))
}

// â”€â”€â”€ System Prompts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FORGE_SYSTEM_PROMPT = buildUnifiedForgeSystemPrompt()

// â”€â”€â”€ Protocol Generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function generateProtocol(
  request: ProtocolGenerationRequest
): Promise<GeneratedProtocol> {
  const { client, protocolType, equipmentAvailable, previousProtocolSummary, coachDirectives } = request
  const healthPhase = resolveHealthCoachingPhase({
    bie: client.currentBIE,
    generationState: client.generationState,
    currentStage: client.stage,
  })
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
${formatHealthPhaseForPrompt(healthPhase)}

CLIENT DOCUMENTS (AI-enabled):
${docSummary}

Generate a complete ${protocolType} protocol. Apply the correct generation state logic.
- Adapt to coach behavior rather than overriding it.
- If repeated volume reductions appear, lower base volume next.
- If repeated fatigue flags appear, reduce intensity, frequency, or complexity.
- If adherence issues appear, simplify the structure.
- If consistent progression signals appear, advance load or complexity conservatively.
- Every exercise must include a load value expressed as intent, not a final prescription.
- Allowed load values only: "bodyweight", "light", "moderate", "moderate-heavy", "technique", "light dumbbells", "moderate dumbbells", "light band", "moderate band".
- Do not use pound ranges, percentages, or vague phrasing. Load must never be blank.
- Use the DFitFactor hierarchy: Safety -> Feasibility -> Recovery capacity -> Adherence/constraints -> Optimization.
- Honor the active health-coaching phase of Regulation, Restoration, or Optimization while staying aligned with FORGE state logic.
- Before recommending supplements, training escalation, or nutritional tightening, check for contraindications, interactions, pregnancy considerations, and major comorbidities when relevant.
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
    if (generated.sessionStructure) {
      generated.sessionStructure.activationBlock = ensureExerciseLoads(generated.sessionStructure.activationBlock) ?? []
      generated.sessionStructure.primaryBlock = ensureExerciseLoads(generated.sessionStructure.primaryBlock) ?? []
      generated.sessionStructure.accessoryBlock = ensureExerciseLoads(generated.sessionStructure.accessoryBlock) ?? []
      generated.sessionStructure.finisherBlock = ensureExerciseLoads(generated.sessionStructure.finisherBlock)
    }
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
): Promise<CoachInsight> {
  const documentContext = await fetchAiDocumentContext(client.clientId, 350)
  const docSummary = documentContext.summary
  const pdfDocs = documentContext.pdfDocs
  const healthPhase = resolveHealthCoachingPhase({
    bie: client.currentBIE,
    generationState: client.generationState,
    currentStage: client.stage,
  })

  const prompt = `Generate a weekly behavioral intelligence insight for this FORGE client.

CLIENT: ${client.fullName} | Stage: ${client.stage} | State: ${client.generationState}

WEEKLY DATA:
BAR Change: ${weeklyData.currentVsPreviousBAR.previous.toFixed(1)} -> ${weeklyData.currentVsPreviousBAR.current.toFixed(1)}
Sessions completed: ${weeklyData.adherenceRecords.filter(r => r.completed).length}/${weeklyData.adherenceRecords.length}
Journal highlights: ${weeklyData.journalHighlights.join(' | ')}
${weeklyData.biomarkerChanges ? `Biomarker changes: ${JSON.stringify(weeklyData.biomarkerChanges)}` : ''}

CURRENT BIE:
BAR: ${client.currentBIE.bar.toFixed(1)}, BLI: ${client.currentBIE.bli.toFixed(1)}, DBI: ${client.currentBIE.dbi.toFixed(1)}, PPS: ${client.currentBIE.pps.toFixed(1)}
${formatHealthPhaseForPrompt(healthPhase)}

CLIENT DOCUMENTS (AI-enabled):
${docSummary}

${documentContext.hasNutritionLog ? 'A nutrition or food-journal document is present in the AI-enabled documents. Treat it as a primary evidence source for dietary pattern analysis.' : ''}
${buildCoachInsightTemplateInstructions()}

Output ONLY JSON:
{
  "title": "Brief insight title",
  "confidence": <0.0-1.0>,
  "metrics": {
    "primary": "Most important metric line",
    "secondary": "Second metric line",
    "tertiary": "Third metric line"
  },
  "decision": "Clear coach decision",
  "constraint": "Primary limiting factor",
  "actions": ["Action 1", "Action 2", "Action 3"],
  "context": "Short explanation of why this decision fits. Maximum 2-3 lines.",
  "tags": ["intake", "adherence"]
}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: FORGE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: (() => {
          const userMessageContent: any[] = [{ type: 'text', text: prompt }]
          for (const doc of pdfDocs.slice(0, MAX_INSIGHT_PDF_ATTACHMENTS)) {
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

export async function generateCoachQueryInsight(
  client: ClientContext,
  insightRequest: {
    query: string
    journalHighlights: string[]
    adherenceNotes: string[]
    checkinSummary: string[]
  }
): Promise<CoachInsight> {
  const documentContext = await fetchAiDocumentContext(client.clientId, 350)
  const docSummary = documentContext.summary
  const pdfDocs = documentContext.pdfDocs
  const healthPhase = resolveHealthCoachingPhase({
    bie: client.currentBIE,
    generationState: client.generationState,
    currentStage: client.stage,
  })

  const prompt = `You are answering a coach's targeted insight request for a FORGE client.

CLIENT: ${client.fullName} | Stage: ${client.stage} | State: ${client.generationState}
PRIMARY GOAL: ${client.primaryGoal}

COACH QUESTION:
${insightRequest.query}

CURRENT BIE:
BAR: ${client.currentBIE.bar.toFixed(1)}, BLI: ${client.currentBIE.bli.toFixed(1)}, DBI: ${client.currentBIE.dbi.toFixed(1)}, CDI: ${client.currentBIE.cdi.toFixed(1)}, LSI: ${client.currentBIE.lsi.toFixed(1)}, PPS: ${client.currentBIE.pps.toFixed(1)}
${formatHealthPhaseForPrompt(healthPhase)}

RECENT JOURNAL HIGHLIGHTS:
${insightRequest.journalHighlights.length > 0 ? insightRequest.journalHighlights.join(' | ') : 'None'}

RECENT ADHERENCE / COACHING NOTES:
${insightRequest.adherenceNotes.length > 0 ? insightRequest.adherenceNotes.join(' | ') : 'None'}

RECENT CHECK-IN SIGNALS:
${insightRequest.checkinSummary.length > 0 ? insightRequest.checkinSummary.join(' | ') : 'None'}

CLIENT DOCUMENTS (AI-enabled):
${docSummary}

${documentContext.hasNutritionLog ? 'A nutrition or food-journal document is present. Prioritize it when answering food-intake, meal-pattern, protein-target, calorie-sufficiency, and nutrition-adherence questions.' : ''}
${buildCoachInsightTemplateInstructions()}

Return a focused coach-facing answer. Be specific about food-pattern gaps, under-target intake, journal themes, and what should be addressed next when the evidence supports it. If nutrition-log evidence is available, reference it before broader inference.
- Always give a clear decision.
- Keep actions concise and capped at 3.
- Keep context short and only explain why.

Output ONLY JSON:
{
  "title": "Brief insight title",
  "confidence": <0.0-1.0>,
  "metrics": {
    "primary": "Most important metric line",
    "secondary": "Second metric line",
    "tertiary": "Third metric line"
  },
  "decision": "Clear coach decision",
  "constraint": "Primary limiting factor",
  "actions": ["Action 1", "Action 2", "Action 3"],
  "context": "Short explanation of why this decision fits. Maximum 2-3 lines.",
  "tags": ["intake", "adherence"]
}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system: FORGE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: (() => {
          const userMessageContent: any[] = [{ type: 'text', text: prompt }]
          for (const doc of pdfDocs.slice(0, MAX_INSIGHT_PDF_ATTACHMENTS)) {
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

