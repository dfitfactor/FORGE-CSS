/**
 * FORGÃ‹ AI Service
 * Claude API integration for protocol generation, signal extraction, and coaching insights
 */

import Anthropic from '@anthropic-ai/sdk'
import { BIEVariables, ForgeStage, GenerationState } from '../lib/bie-engine'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-opus-4-6'

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
${client.recentJournalSummary ? `RECENT JOURNAL SIGNALS: ${client.recentJournalSummary}` : ''}
${coachDirectives ? `COACH DIRECTIVES: ${coachDirectives}` : ''}

Generate a complete ${protocolType} protocol. Apply the correct generation state logic. 
Output ONLY valid JSON matching this schema:
{
  "name": "Protocol name",
  "rationale": "Why this protocol matches their current behavioral state",
  "sessionStructure": { ... } or "nutritionStructure": { ... } or "recoveryStructure": { ... },
  "coachNotes": "Internal notes for the coach",
  "clientFacingMessage": "Encouraging message for the client about this protocol"
}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: FORGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  try {
    const clean = content.text.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(clean) as GeneratedProtocol
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
  const prompt = `Generate a weekly behavioral intelligence insight for this FORGE client.

CLIENT: ${client.fullName} | Stage: ${client.stage} | State: ${client.generationState}

WEEKLY DATA:
BAR Change: ${weeklyData.currentVsPreviousBAR.previous.toFixed(1)} â†’ ${weeklyData.currentVsPreviousBAR.current.toFixed(1)}
Sessions completed: ${weeklyData.adherenceRecords.filter(r => r.completed).length}/${weeklyData.adherenceRecords.length}
Journal highlights: ${weeklyData.journalHighlights.join(' | ')}
${weeklyData.biomarkerChanges ? `Biomarker changes: ${JSON.stringify(weeklyData.biomarkerChanges)}` : ''}

CURRENT BIE:
BAR: ${client.currentBIE.bar.toFixed(1)}, BLI: ${client.currentBIE.bli.toFixed(1)}, DBI: ${client.currentBIE.dbi.toFixed(1)}, PPS: ${client.currentBIE.pps.toFixed(1)}

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
    max_tokens: 2048,
    system: FORGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
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
