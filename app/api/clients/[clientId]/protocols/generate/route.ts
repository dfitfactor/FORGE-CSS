import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { buildCoachInsightTemplateInstructions } from '@/lib/ai/coach-insight-template'
import { formatHealthPhaseForPrompt, resolveHealthCoachingPhase } from '@/lib/ai/phase-rules'
import { buildUnifiedForgeSystemPrompt } from '@/lib/ai/system-prompt'
import {
  computeBAR,
  computeGenerationState,
  computePPS,
  extractSignalsFromCheckIn,
  type ForgeStage,
  type GenerationState,
} from '@/lib/bie-engine'
import { getGPSLabel } from '@/lib/bie-calculator'
import { selectExercisesForSession, type ExerciseBlock as SelectedExerciseBlock } from '@/lib/exercise-selector'
import { formatFoodsForPrompt, selectFoodsForMealPlan } from '@/lib/usda-food-selector'
import { buildOverrideIntelligenceSummary, normalizeLoad } from '@/lib/protocol-overrides'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'
const MAX_CONTEXT_DOCS = 2
const MAX_CONTEXT_DOC_CHARS = 500

type GeneratedProtocolCompat = {
  name: string
  rationale?: string
  override_summary?: string
  influenced_by_overrides?: boolean
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
    dailyCaloriesDisplay?: string
    proteinDisplay?: string
    carbDisplay?: string
    fatDisplay?: string
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
    dailyCaloriesDisplay?: string
    proteinDisplay?: string
    carbDisplay?: string
    fatDisplay?: string
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
    healthCoachingLens?: {
      redFlagsMedicalBaseline?: string[]
      workingAssessment?: string[]
      phaseAndIntent?: string
      minimalInterventionSet?: string[]
      monitoringPlan?: string[]
      decisionRules?: string[]
      disclaimer?: string
    }
  }
}

type ExerciseLike = { exerciseName?: string; loadGuidance?: string }
type MealPlanRow = {
  time?: string
  meal?: string
  foods?: string
  notes?: string
  calories?: number
  proteinG?: number
  carbG?: number
  fatG?: number
  complianceLabel?: string
}
type NutritionQaResult = {
  nutritionStructure?: NonNullable<GeneratedProtocolCompat['nutritionStructure']>
  nutritionProtocol?: NonNullable<GeneratedProtocolCompat['nutritionProtocol']>
  mealPlan?: MealPlanRow[]
  qaSummary?: string
}

const NUTRITION_QA_RULES = `Mandatory nutrition QA checks:
1. phase appropriateness
2. active food and clinical constraints
3. behavioral realism
4. macro and calorie alignment
5. internal consistency across all sections

Do not finalize unless the sample meal plan has been cross-checked against displayed calories, protein, carbohydrate, and fat targets.
If the sample day does not match targets within reasonable tolerance, revise the meal plan, revise portions, revise the targets, or clearly label it as a phase-constrained compliance example.
Sample meals must not violate GI reintroduction rules, elimination rules, medical restrictions, religious fasting practices, coach-assigned test foods, or behavioral capacity limitations.
If the client is in a restricted or testing phase, symptom clarity and compliance take priority over full macro optimization.
If nutrition adherence is weak, simplify the protocol rather than increasing complexity.
Priority order: safety, phase compliance, behavioral feasibility, internal consistency, macro accuracy, presentation.`

function roundToWhole(value: number) {
  return Math.round(value)
}

function sumMealPlanNutrition(mealPlan: MealPlanRow[]) {
  return mealPlan.reduce<{
    calories: number
    proteinG: number
    carbG: number
    fatG: number
    countedMeals: number
  }>(
    (totals, meal) => ({
      calories: totals.calories + (typeof meal.calories === 'number' ? meal.calories : 0),
      proteinG: totals.proteinG + (typeof meal.proteinG === 'number' ? meal.proteinG : 0),
      carbG: totals.carbG + (typeof meal.carbG === 'number' ? meal.carbG : 0),
      fatG: totals.fatG + (typeof meal.fatG === 'number' ? meal.fatG : 0),
      countedMeals:
        totals.countedMeals +
        (typeof meal.calories === 'number' || typeof meal.proteinG === 'number' || typeof meal.carbG === 'number' || typeof meal.fatG === 'number'
          ? 1
          : 0),
    }),
    { calories: 0, proteinG: 0, carbG: 0, fatG: 0, countedMeals: 0 }
  )
}

function isRestrictedNutritionPhase(parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join('\n').toLowerCase()
  return /(elimination|reintroduction|re-introduction|test food|testing phase|restricted phase|symptom|gi|low fodmap|fasting|ramadan|medical restriction|allergy|intolerance)/i.test(text)
}

function formatNutritionDisplays(args: {
  calories: number
  proteinG: number
  carbG: number
  fatG: number
  restrictedPhase: boolean
  optimizationPhase: boolean
}) {
  if (args.restrictedPhase) {
    return {
      dailyCaloriesDisplay: `${Math.max(0, args.calories - 100)}-${args.calories + 100} kcal estimated`,
      proteinDisplay: `>= ${Math.max(0, args.proteinG - 5)} g`,
      carbDisplay: `${Math.max(0, args.carbG - 10)}-${args.carbG + 10} g controlled`,
      fatDisplay: `${Math.max(0, args.fatG - 5)}-${args.fatG + 5} g`,
    }
  }

  if (args.optimizationPhase) {
    return {
      dailyCaloriesDisplay: `${args.calories} kcal`,
      proteinDisplay: `${args.proteinG} g`,
      carbDisplay: `${args.carbG} g`,
      fatDisplay: `${args.fatG} g`,
    }
  }

  return {
    dailyCaloriesDisplay: `${Math.max(0, args.calories - 50)}-${args.calories + 50} kcal`,
    proteinDisplay: `${args.proteinG}-${args.proteinG + 5} g`,
    carbDisplay: `${Math.max(0, args.carbG - 5)}-${args.carbG + 5} g`,
    fatDisplay: `${Math.max(0, args.fatG - 3)}-${args.fatG + 3} g`,
  }
}

function nutritionTargetsNeedReconciliation(args: {
  mealPlan: MealPlanRow[]
  dailyCalories?: number
  proteinG?: number
  carbG?: number
  fatG?: number
  restrictedPhase: boolean
}) {
  const totals = sumMealPlanNutrition(args.mealPlan)
  if (totals.countedMeals === 0) return { needsRepair: true, totals, reason: 'Meal plan has no numeric macro breakdown.' }

  const calorieTolerance = args.restrictedPhase ? Math.max(200, (args.dailyCalories ?? 0) * 0.15) : Math.max(150, (args.dailyCalories ?? 0) * 0.1)
  const macroTolerance = args.restrictedPhase ? 15 : 10

  const mismatches = [
    typeof args.dailyCalories === 'number' && Math.abs(totals.calories - args.dailyCalories) > calorieTolerance ? 'calories' : null,
    typeof args.proteinG === 'number' && Math.abs(totals.proteinG - args.proteinG) > macroTolerance ? 'protein' : null,
    typeof args.carbG === 'number' && Math.abs(totals.carbG - args.carbG) > macroTolerance ? 'carbs' : null,
    typeof args.fatG === 'number' && Math.abs(totals.fatG - args.fatG) > macroTolerance ? 'fat' : null,
  ].filter(Boolean)

  return {
    needsRepair: mismatches.length > 0,
    totals,
    reason: mismatches.length > 0 ? `Mismatch across ${mismatches.join(', ')}.` : null,
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

function buildSearchCorpus(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join('\n').toLowerCase()
}

function detectPhysiqueFocus(corpus: string) {
  return /(npc|bikini|figure|wellness|physique|show prep|stage lean|posing|glute|hamstring|delts|upper back)/i.test(corpus)
}

function ensureExerciseLoads(exercises: unknown[] | undefined) {
  if (!Array.isArray(exercises)) return exercises

  return exercises.map((exercise) => {
    if (!exercise || typeof exercise !== 'object') return exercise
    const typedExercise = exercise as ExerciseLike & Record<string, unknown>

    return {
      ...typedExercise,
      loadGuidance: normalizeLoad(
        typeof typedExercise.loadGuidance === 'string' ? typedExercise.loadGuidance : null,
        typedExercise.exerciseName ?? ''
      ),
    }
  })
}

function alignGeneratedSessionToSelectedExercises(
  generated: GeneratedProtocolCompat,
  exerciseBlocks: SelectedExerciseBlock
) {
  const sessionStructure = generated.sessionStructure
  if (!sessionStructure) return generated

  const alignBlock = (
    currentBlock: unknown[] | undefined,
    selectedExercises: SelectedExerciseBlock[keyof SelectedExerciseBlock],
    defaults: { sets: number; reps: string; tempo: string }
  ) => {
    return selectedExercises.map((exercise, index) => {
      const current =
        Array.isArray(currentBlock) && currentBlock[index] && typeof currentBlock[index] === 'object'
          ? (currentBlock[index] as Record<string, unknown>)
          : {}

      return {
        ...current,
        exerciseName: exercise.exercise_name,
        sets:
          typeof current.sets === 'number' && Number.isFinite(current.sets)
            ? current.sets
            : defaults.sets,
        reps: typeof current.reps === 'string' && current.reps.trim() ? current.reps : defaults.reps,
        tempo: typeof current.tempo === 'string' && current.tempo.trim() ? current.tempo : defaults.tempo,
      }
    })
  }

  sessionStructure.activationBlock = alignBlock(sessionStructure.activationBlock, exerciseBlocks.activation, {
    sets: 2,
    reps: '8-10',
    tempo: 'controlled',
  })
  sessionStructure.primaryBlock = alignBlock(sessionStructure.primaryBlock, exerciseBlocks.primary, {
    sets: 3,
    reps: '8-12',
    tempo: '3-1-1',
  })
  sessionStructure.accessoryBlock = alignBlock(sessionStructure.accessoryBlock, exerciseBlocks.accessory, {
    sets: 2,
    reps: '10-15',
    tempo: '2-1-1',
  })
  sessionStructure.finisherBlock = alignBlock(sessionStructure.finisherBlock, exerciseBlocks.finisher, {
    sets: 1,
    reps: '30-60 seconds',
    tempo: 'steady',
  })

  return generated
}


function collectTextContent(blocks: Array<{ type: string; text?: string }>) {
  return blocks
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function extractJsonObject(raw: string) {
  const withoutFences = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  const firstBrace = withoutFences.indexOf('{')
  const lastBrace = withoutFences.lastIndexOf('}')

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1)
  }

  return withoutFences
}

function sanitizeJsonCandidate(raw: string) {
  return raw
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function tryParseJsonObject<T>(raw: string): T | null {
  const candidates = [
    raw.trim(),
    extractJsonObject(raw),
    sanitizeJsonCandidate(raw),
    sanitizeJsonCandidate(extractJsonObject(raw)),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue

    try {
      return JSON.parse(candidate) as T
    } catch {
      // Keep trying the next candidate.
    }
  }

  return null
}

function isDinnerCarbRestricted(mealTiming: string | undefined) {
  const normalized = String(mealTiming ?? '').toLowerCase()
  return normalized.includes('dinner carb-free') || normalized.includes('dinner carb free') || normalized.includes('dinner carb-reduced')
}

function dinnerViolatesCarbTimingRule(mealPlan: MealPlanRow[]) {
  const dinnerRow = mealPlan.find((meal) => String(meal.meal ?? '').toLowerCase().includes('dinner'))
  if (!dinnerRow?.foods) return false

  const foods = dinnerRow.foods.toLowerCase()
  const restrictedDinnerKeywords = [
    'potato', 'potatoes', 'rice', 'pasta', 'bread', 'quinoa', 'oats',
    'granola', 'cereal', 'beans', 'lentils', 'wrap', 'tortilla',
    'bagel', 'fruit', 'banana', 'apple', 'sweet potato', 'mashed'
  ]

  return restrictedDinnerKeywords.some((keyword) => foods.includes(keyword))
}

async function repairMealPlanForCarbTiming(rawMealPlan: string, mealTiming: string) {
  const repairPrompt = `Rewrite this meal plan JSON so it follows the meal timing rule exactly.

Meal timing rule:
${mealTiming}

Requirements:
- Return ONLY a valid raw JSON array.
- Keep the same meal slots and general calories/macros intent.
- Breakfast and lunch can carry the structured carbs.
- Dinner must be protein + non-starchy vegetables only when the rule says dinner is carb-free.
- Evening snack must stay protein-forward and low-carb.
- Remove starchy dinner foods like potatoes, rice, pasta, wraps, bread, fruit, beans, or quinoa.

SOURCE MEAL PLAN:
${rawMealPlan}`

  const response = await anthropic.messages.create({
    model: getAnthropicModel(),
    max_tokens: 1200,
    system: 'You repair meal plan JSON. Return only a valid raw JSON array.',
    messages: [{ role: 'user', content: repairPrompt }],
  })

  return collectTextContent(response.content as Array<{ type: string; text?: string }>)
}

async function repairProtocolJson(raw: string) {
  const repairPrompt = `Convert the following protocol response into a single valid JSON object.

Rules:
- Return ONLY raw JSON.
- No markdown, no backticks, no explanation.
- Preserve the original meaning.
- Ensure property names are quoted.
- Remove trailing commas.
- Keep the structure compatible with a FORGE generated protocol.

SOURCE:
${raw.slice(0, 12000)}`

  const repairResponse = await anthropic.messages.create({
    model: getAnthropicModel(),
    max_tokens: 2600,
    system: 'You repair malformed JSON. Return only valid raw JSON.',
    messages: [{ role: 'user', content: repairPrompt }],
  })

  return collectTextContent(repairResponse.content as Array<{ type: string; text?: string }>)
}

async function runNutritionQaValidation(args: {
  clientName: string
  stage: string
  protocolFrame: string
  generationState: string
  primaryGoal: string
  nutritionStructure: GeneratedProtocolCompat['nutritionStructure']
  nutritionProtocol: GeneratedProtocolCompat['nutritionProtocol']
  mealPlan: MealPlanRow[]
  coachDirectives?: string | null
  clientNotes?: string | null
  journalSummary?: string
  checkinSummary?: string
  docSummary?: string
}) {
  const prompt = `Run the final FORGE nutrition QA validation and revise the nutrition output if needed.

${NUTRITION_QA_RULES}

Client: ${args.clientName}
Stage: ${args.stage}
Protocol framing: ${args.protocolFrame}
Generation state: ${args.generationState}
Primary goal: ${args.primaryGoal}

CONSTRAINT SIGNALS:
Coach directives: ${args.coachDirectives ?? 'None'}
Client notes: ${args.clientNotes ?? 'None'}
Recent journals: ${args.journalSummary ?? 'None'}
Recent check-ins: ${args.checkinSummary ?? 'None'}
AI document summary: ${args.docSummary ?? 'None'}

CURRENT NUTRITION STRUCTURE:
${JSON.stringify(args.nutritionStructure ?? {}, null, 2)}

CURRENT NUTRITION PROTOCOL:
${JSON.stringify(args.nutritionProtocol ?? {}, null, 2)}

CURRENT SAMPLE DAY:
${JSON.stringify(args.mealPlan ?? [], null, 2)}

Validation requirements:
- Cross-check the sample day against calories, protein, carbs, and fat targets.
- Use reasonable tolerance: calories within about 10% and macros within about 10g when the phase is not explicitly restricted or testing.
- If the phase is restricted, elimination-based, testing-based, or symptom-driven, it is acceptable to prioritize compliance and clarity over perfect macro matching, but the sample day must be explicitly labeled as a compliance example in notes or guidelines.
- Preserve the overall phase logic and behavioral realism.
- Reduce complexity if adherence looks weak.
- Return revised values only when needed, but always return a complete final payload.

Return ONLY raw JSON in this shape:
{
  "nutritionStructure": {
    "dailyCalories": 0,
    "proteinG": 0,
    "carbG": 0,
    "fatG": 0,
    "dailyCaloriesDisplay": "",
    "proteinDisplay": "",
    "carbDisplay": "",
    "fatDisplay": "",
    "mealFrequency": 0,
    "mealTiming": "",
    "complexityLevel": "",
    "keyGuidelines": [],
    "disruption_protocol": "",
    "mealPlan": []
  },
  "nutritionProtocol": {
    "dailyCalories": 0,
    "proteinG": 0,
    "carbG": 0,
    "fatG": 0,
    "dailyCaloriesDisplay": "",
    "proteinDisplay": "",
    "carbDisplay": "",
    "fatDisplay": "",
    "mealFrequency": 0,
    "caloriePhase": "",
    "macroJustification": "",
    "adherenceFallback": "",
    "complexityLevel": "",
    "keyGuidelines": [],
    "disruptionProtocol": "",
    "mealTiming": "",
    "mealPlan": []
  },
  "mealPlan": [],
  "qaSummary": "One short coach-facing sentence explaining what was verified or revised."
}`

  const response = await anthropic.messages.create({
    model: getAnthropicModel(),
    max_tokens: 2200,
    system: 'You are the FORGE nutrition QA validator. Return only valid raw JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = collectTextContent(response.content as Array<{ type: string; text?: string }>)
  if (!raw) return null

  let parsed = tryParseJsonObject<NutritionQaResult>(raw)
  if (!parsed) {
    const repaired = await repairProtocolJson(raw)
    parsed = repaired ? tryParseJsonObject<NutritionQaResult>(repaired) : null
  }

  return parsed
}

async function repairNutritionCoherence(args: {
  clientName: string
  stage: string
  protocolFrame: string
  restrictedPhase: boolean
  nutritionStructure: GeneratedProtocolCompat['nutritionStructure']
  nutritionProtocol: GeneratedProtocolCompat['nutritionProtocol']
  mealPlan: MealPlanRow[]
  totals: { calories: number; proteinG: number; carbG: number; fatG: number; countedMeals: number }
  mismatchReason: string
  constraintSummary: string
}) {
  const prompt = `Repair this FORGE nutrition output so it is internally coherent.

${NUTRITION_QA_RULES}

This is a coherence repair, not a food creativity task.
Your job is to reconcile:
- stated macro targets
- actual meal composition
- allowed food rules
- phase-specific restrictions
- fallback/disruption instructions

Client: ${args.clientName}
Stage: ${args.stage}
Protocol framing: ${args.protocolFrame}
Restricted or testing phase: ${args.restrictedPhase ? 'yes' : 'no'}
Mismatch detected: ${args.mismatchReason}

Constraint summary:
${args.constraintSummary}

CURRENT TARGETS:
${JSON.stringify(args.nutritionStructure ?? {}, null, 2)}

CURRENT SAMPLE DAY:
${JSON.stringify(args.mealPlan ?? [], null, 2)}

CURRENT SUMMED TOTALS FROM SAMPLE DAY:
${JSON.stringify(args.totals, null, 2)}

Repair rules:
- Every meal row must include calories, proteinG, carbG, and fatG.
- The sum of meal rows must reconcile with displayed daily targets.
- If phase restrictions prevent exact target matching, revise the displayed targets and clearly label the sample day as a phase-constrained compliance example.
- Keep the plan behaviorally realistic.
- Do not leave targets that the sample day cannot actually produce.

Return ONLY raw JSON:
{
  "nutritionStructure": {
    "dailyCalories": 0,
    "proteinG": 0,
    "carbG": 0,
    "fatG": 0,
    "dailyCaloriesDisplay": "",
    "proteinDisplay": "",
    "carbDisplay": "",
    "fatDisplay": "",
    "mealFrequency": 0,
    "mealTiming": "",
    "complexityLevel": "",
    "keyGuidelines": [],
    "disruption_protocol": "",
    "mealPlan": []
  },
  "nutritionProtocol": {
    "dailyCalories": 0,
    "proteinG": 0,
    "carbG": 0,
    "fatG": 0,
    "dailyCaloriesDisplay": "",
    "proteinDisplay": "",
    "carbDisplay": "",
    "fatDisplay": "",
    "mealFrequency": 0,
    "caloriePhase": "",
    "macroJustification": "",
    "adherenceFallback": "",
    "complexityLevel": "",
    "keyGuidelines": [],
    "disruptionProtocol": "",
    "mealTiming": "",
    "mealPlan": []
  },
  "mealPlan": [],
  "qaSummary": "Short explanation of how coherence was repaired."
}`

  const response = await anthropic.messages.create({
    model: getAnthropicModel(),
    max_tokens: 2200,
    system: 'You repair FORGE nutrition coherence. Return only valid raw JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = collectTextContent(response.content as Array<{ type: string; text?: string }>)
  if (!raw) return null

  let parsed = tryParseJsonObject<NutritionQaResult>(raw)
  if (!parsed) {
    const repaired = await repairProtocolJson(raw)
    parsed = repaired ? tryParseJsonObject<NutritionQaResult>(repaired) : null
  }

  return parsed
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

  if (input.sessionStructure) {
    input.sessionStructure.activationBlock = ensureExerciseLoads(input.sessionStructure.activationBlock)
    input.sessionStructure.primaryBlock = ensureExerciseLoads(input.sessionStructure.primaryBlock)
    input.sessionStructure.accessoryBlock = ensureExerciseLoads(input.sessionStructure.accessoryBlock)
    input.sessionStructure.finisherBlock = ensureExerciseLoads(input.sessionStructure.finisherBlock)
  }

  if (input.movementProtocol) {
    input.movementProtocol.activationBlock = ensureExerciseLoads(input.movementProtocol.activationBlock)
    input.movementProtocol.primaryBlock = ensureExerciseLoads(input.movementProtocol.primaryBlock)
    input.movementProtocol.accessoryBlock = ensureExerciseLoads(input.movementProtocol.accessoryBlock)
    input.movementProtocol.finisherBlock = ensureExerciseLoads(input.movementProtocol.finisherBlock)
  }

  if (!input.nutritionStructure && input.nutritionProtocol) {
    input.nutritionStructure = {
      dailyCalories: input.nutritionProtocol.dailyCalories,
      proteinG: input.nutritionProtocol.proteinG,
      carbG: input.nutritionProtocol.carbG,
      fatG: input.nutritionProtocol.fatG,
      dailyCaloriesDisplay: input.nutritionProtocol.dailyCaloriesDisplay,
      proteinDisplay: input.nutritionProtocol.proteinDisplay,
      carbDisplay: input.nutritionProtocol.carbDisplay,
      fatDisplay: input.nutritionProtocol.fatDisplay,
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
      input.coachIntelligence.healthCoachingLens?.phaseAndIntent ? `Phase: ${input.coachIntelligence.healthCoachingLens.phaseAndIntent}` : '',
      input.coachIntelligence.healthCoachingLens?.redFlagsMedicalBaseline?.length ? `Red Flags: ${input.coachIntelligence.healthCoachingLens.redFlagsMedicalBaseline.join('; ')}` : '',
      input.coachIntelligence.healthCoachingLens?.workingAssessment?.length ? `Working Assessment: ${input.coachIntelligence.healthCoachingLens.workingAssessment.join('; ')}` : '',
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

const FORGE_SYSTEM_PROMPT = buildUnifiedForgeSystemPrompt()

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
    const currentStage: ForgeStage =
      client.current_stage === 'optimization' ||
      client.current_stage === 'resilience' ||
      client.current_stage === 'growth' ||
      client.current_stage === 'empowerment'
        ? client.current_stage
        : 'foundations'
    const normalizedProtocolType =
      protocolType === 'movement' ||
      protocolType === 'nutrition' ||
      protocolType === 'recovery' ||
      protocolType === 'composite'
        ? protocolType
        : 'composite'

    const snapshot = await (async () => {
      try {
        return await db.queryOne<{
          bar: number; bli: number; dbi: number; cdi: number; lsi: number; pps: number; gps: number | null
          generation_state: string
        }>(
          `SELECT bar_score AS bar, bli_score AS bli, dbi_score AS dbi, cdi, lsi, pps, gps, generation_state
           FROM behavioral_snapshots WHERE client_id = $1
           ORDER BY snapshot_date DESC LIMIT 1`,
          [params.clientId]
        )
      } catch {
        return db.queryOne<{
          bar: number; bli: number; dbi: number; cdi: number; lsi: number; pps: number; gps: number | null
          generation_state: string
        }>(
          `SELECT bar_score AS bar, bli_score AS bli, dbi_score AS dbi, cdi, lsi, pps,
                  NULL::INTEGER AS gps, generation_state
           FROM behavioral_snapshots WHERE client_id = $1
           ORDER BY snapshot_date DESC LIMIT 1`,
          [params.clientId]
        )
      }
    })()

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
      protocol_payload: Record<string, unknown> | null
    }>(
      `SELECT name, protocol_type, created_at::text, notes, coach_notes, protocol_payload
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
    const overrideIntelligence = buildOverrideIntelligenceSummary(
      priorProtocols.map(protocol => protocol.protocol_payload)
    )
    const coachAdjustmentSummary = overrideIntelligence.summary

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
    const generationState: GenerationState =
      snapshot?.generation_state === 'A' ||
      snapshot?.generation_state === 'B' ||
      snapshot?.generation_state === 'C' ||
      snapshot?.generation_state === 'D' ||
      snapshot?.generation_state === 'E'
        ? snapshot.generation_state
        : computeGenerationState({
            ...resolvedBie,
            cLsi: resolvedBie.lsi,
          }).state
    const bieSource = hasStoredSnapshot ? 'snapshot' : 'estimated'
    const physiqueCorpus = buildSearchCorpus([
      client.primary_goal,
      client.motivation,
      client.notes,
      client.obstacles,
      priorProtocolSummary,
      docSummary,
      journalSummary,
      checkinSummary,
    ])
    const isPhysiqueFocused = detectPhysiqueFocus(physiqueCorpus)
    const requiresBridgePhase =
      isPhysiqueFocused &&
      (resolvedBie.bar < 75 || resolvedBie.dbi >= 45 || resolvedBie.bli >= 45 || resolvedBie.lsi < 65)
    const protocolFrame = requiresBridgePhase
      ? 'Restoration-to-Development bridge'
      : currentStage
    const sportSpecificPriorities = isPhysiqueFocused
      ? 'Glute and hamstring density, capped delts, upper-back shaping, waist illusion, performance-supportive carbs, and protective protein.'
      : 'No special physique-sport emphasis detected.'
    const healthCoachingPhase = resolveHealthCoachingPhase({
      bie: {
        bar: resolvedBie.bar,
        bli: resolvedBie.bli,
        dbi: resolvedBie.dbi,
        cdi: resolvedBie.cdi,
        lsi: resolvedBie.lsi,
        cLsi: resolvedBie.lsi,
        pps: resolvedBie.pps,
      },
      generationState,
      currentStage,
    })
    const complexityCeiling = {
      A: Math.min(resolvedBie.pps >= 70 ? 4 : 3, 5),
      B: 3,
      C: 2,
      D: 2,
      E: 1,
    }[generationState] ?? 2
    const volumeLevel = {
      A: 'full',
      B: 'moderate',
      C: 'reduced',
      D: 'minimum',
      E: 'minimum',
    }[generationState] as 'full' | 'moderate' | 'reduced' | 'minimum'
    const movementPatterns = normalizedProtocolType === 'movement'
      ? ['Squat', 'Hinge', 'Lunge', 'Push', 'Pull', 'Core']
      : ['Core', 'Hinge', 'Squat']
    const rawEquipment = Array.isArray(client.available_equipment)
      ? client.available_equipment
      : []
    const equipmentMap: Record<string, string> = {
      Barbell: 'barbell',
      Dumbbells: 'dumbbell',
      Kettlebell: 'kettlebell',
      'Cable Machine': 'cable',
      'Resistance Bands': 'band',
      TRX: 'trx',
      'Full Gym': 'bodyweight,dumbbell,barbell,cable,kettlebell,machine,trx,band',
      'Bodyweight Only': 'bodyweight',
    }
    const normalizedEquipment = rawEquipment.length === 0
      ? ['bodyweight', 'dumbbell', 'barbell', 'cable', 'kettlebell', 'band', 'machine', 'trx']
      : Array.from(new Set(rawEquipment.flatMap((equipment) => (equipmentMap[equipment] || 'other').split(','))))
    const injuryPatterns = Array.isArray(client.injuries) &&
      client.injuries.some((injury: string) => injury.toLowerCase().includes('knee'))
      ? ['Lunge', 'Squat']
      : []
    const exerciseBlocks = await selectExercisesForSession({
      movementPatterns,
      complexityCeiling,
      volumeLevel,
      availableEquipment: normalizedEquipment,
      excludePatterns: injuryPatterns,
      generationState,
    })
    const exerciseContext = `
SELECTED EXERCISES FROM FORGË LIBRARY:

ACTIVATION BLOCK (${exerciseBlocks.activation.length} exercises):
${exerciseBlocks.activation.map((exercise) =>
  `- ${exercise.exercise_name} (${exercise.movement_pattern}, ${exercise.equipment}, Tier ${exercise.complexity_tier})`
).join('\n')}

PRIMARY BLOCK (${exerciseBlocks.primary.length} exercises):
${exerciseBlocks.primary.map((exercise) =>
  `- ${exercise.exercise_name} (${exercise.movement_pattern}, ${exercise.equipment}, Tier ${exercise.complexity_tier})`
).join('\n')}

ACCESSORY BLOCK (${exerciseBlocks.accessory.length} exercises):
${exerciseBlocks.accessory.map((exercise) =>
  `- ${exercise.exercise_name} (${exercise.movement_pattern}, ${exercise.equipment}, Tier ${exercise.complexity_tier})`
).join('\n')}

${exerciseBlocks.finisher.length > 0 ? `FINISHER BLOCK (${exerciseBlocks.finisher.length} exercises):
${exerciseBlocks.finisher.map((exercise) =>
  `- ${exercise.exercise_name} (${exercise.movement_pattern}, ${exercise.equipment}, Tier ${exercise.complexity_tier})`
).join('\n')}` : 'FINISHER: None (generation state does not permit finisher)'}

INSTRUCTION: Use THESE EXACT exercises in the sessionStructure.
Do not substitute or invent different exercises.
Use the exercises exactly as named above.
Assign each to its correct block: activation/primary/accessory/finisher.
`

    const prompt = `Generate a ${normalizedProtocolType} protocol for this FORGE client.

CLIENT: ${client.full_name}
Stage: ${currentStage.toUpperCase()}
Protocol Framing: ${protocolFrame}
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
GOAL PROBABILITY SCORE: ${snapshot?.gps ?? 'not calculated'}% — ${typeof snapshot?.gps === 'number' ? getGPSLabel(snapshot.gps) : 'insufficient data'}

MEASUREMENTS: Weight ${measurements?.weight_lbs ?? 'unknown'}lb | BF% ${measurements?.body_fat_pct ?? 'unknown'} | Lean mass ${measurements?.lean_mass_lbs ?? 'unknown'}lb | Waist ${measurements?.waist_in ?? 'unknown'}in

SPORT CONTEXT:
Physique athlete focus detected: ${isPhysiqueFocused ? 'yes' : 'no'}
Sport-specific priorities: ${sportSpecificPriorities}
If physique athlete focus is detected with unstable adherence, use a Restoration-to-Development bridge instead of a generic Foundations reset.
${formatHealthPhaseForPrompt(healthCoachingPhase)}

RECENT JOURNALS: ${journalSummary || 'No recent journal entries'}
RECENT CHECK-INS: ${checkinSummary || 'No recent check-ins'}
RECENT PROTOCOL HISTORY: ${priorProtocolSummary}
COACH ADJUSTMENT SUMMARY:
${coachAdjustmentSummary}
    ═══ CLIENT DOCUMENTS (AI-enabled) ═══
    ${docSummary}
${coachDirectives ? 'COACH DIRECTIVES: ' + coachDirectives : ''}

${exerciseContext}

Protocol name must include ${client.full_name.split(' ')[0] || 'the client'}'s first name or their specific goal — never a generic name.

Simplify execution by reducing decision burden and recovery cost, not by stripping away physique-specific architecture.
For physique athletes, macros and meal structure must translate coherently into the meal plan and BSLDS structure.
${NUTRITION_QA_RULES}
Build the session using the exercises listed in SELECTED EXERCISES above.
Use the DFitFactor hierarchy: Safety -> Feasibility -> Recovery capacity -> Adherence/constraints -> Optimization.
If the signal does not support Optimization, stay in Regulation or Restoration.
Before recommending supplements or aggressive nutrition changes, check for contraindications, interactions, pregnancy considerations, and major comorbidities when relevant.

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
    "activationBlock": [{"exerciseName": "selected exercise name", "sets": 2, "reps": "10", "tempo": "controlled", "coachingCue": "cue"}],
    "primaryBlock": [{"exerciseName": "selected exercise name", "sets": 3, "reps": "10-12", "tempo": "3-1-1", "loadGuidance": "guidance", "coachingCue": "cue", "swapOption": "alternative"}],
    "accessoryBlock": [{"exerciseName": "selected exercise name", "sets": 3, "reps": "12", "tempo": "2-1-1", "coachingCue": "cue"}]
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
  "clientFacingMessage": "Encouraging message for client about this protocol - 3-4 sentences",
  "coachIntelligence": {
    "progressionAssessment": "string",
    "gapsIdentified": ["string"],
    "oversights": ["string"],
    "riskFlags": ["string"],
    "nextIterationStrategy": ["string"],
    "healthCoachingLens": {
      "redFlagsMedicalBaseline": ["string"],
      "workingAssessment": ["string"],
      "phaseAndIntent": "string",
      "minimalInterventionSet": ["string"],
      "monitoringPlan": ["string"],
      "decisionRules": ["string"],
      "disclaimer": "Educational coaching guidance only, not medical advice."
    }
  }
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
- Every exercise must include a load value expressed as intent, not a final prescription.
- Allowed load values only: "bodyweight", "light", "moderate", "moderate-heavy", "technique", "light dumbbells", "moderate dumbbells", "light band", "moderate band".
- Do not use pound ranges, percentages, or vague phrasing. Load must never be blank.
- Use the exact selected FORGË library exercises provided in the source context for the sessionStructure.
- Do not invent substitute exercise names when the selected exercises are available.
- Protein must align with goal weight and calories must be justified as deficit, maintenance, or recovery.
- Include adherence fallback, decision rules, monitoring system, and phase progression criteria.
- For physique athletes with unstable adherence, use a Restoration-to-Development bridge instead of generic Foundations while preserving bodybuilding specificity.
- Preserve glute/hamstring density, capped delts, upper-back shaping, waist illusion, performance-supportive carbs, protective protein, and macro-to-meal coherence.
- Use the Coach Adjustment Summary as an authority signal. Do not override coach intent; adapt the next protocol around observed coach behavior.
- If repeated volume reductions are present, lower base volume in the next protocol.
- If repeated fatigue or recovery flags are present, reduce intensity, complexity, or frequency before adding more load.
- If adherence issues are present, simplify the structure and reduce decision burden.
- If consistent progression signals are present, advance load, progression, or complexity cautiously within behavioral capacity.
- Apply the health coaching phase ladder Regulation -> Restoration -> Optimization and justify the active phase.
- Use the health coaching output template for coach-facing intelligence: red flags, ranked drivers, phase + intent, minimal intervention set, monitoring plan, decision rules, and disclaimer.
- Nutrition must pass the mandatory QA layer before finalization. Do not leave meal-plan macros, targets, phase rules, or restriction logic internally inconsistent.

HEALTH COACHING TEMPLATE:
${buildCoachInsightTemplateInstructions()}

OUTPUT REQUIREMENTS:
- Deliver a client protocol with protocol rationale, movement, nutrition, meal structure, recovery, monitoring, decision rules, and phase progression criteria.
- Deliver separate coach intelligence notes including progression assessment, gaps identified, oversights, risk flags, and next iteration strategy.
- Preserve compatibility fields sessionStructure, nutritionStructure, recoveryStructure, coachNotes, and clientFacingMessage.
- Also include these richer fields when possible: stateAnalysis, protocolRationale, movementProtocol, nutritionProtocol, recoveryProtocol, monitoringMetrics, decisionRules, phaseProgressionCriteria, coachIntelligence.
- When coachIntelligence is present, include coachIntelligence.healthCoachingLens using the DFitFactor template.
- Include "override_summary" and "influenced_by_overrides" in the JSON output.

SOURCE CONTEXT:
${prompt}`

    const response = await anthropic.messages.create({
      model: getAnthropicModel(),
      max_tokens: 2400,
      system: FORGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: gyvrudPrompt }],
    })

    const raw = collectTextContent(response.content as Array<{ type: string; text?: string }>)
    if (!raw) throw new Error('Unexpected response type')

    let parsedGenerated = tryParseJsonObject<GeneratedProtocolCompat>(raw)
    if (!parsedGenerated) {
      const repairedRaw = await repairProtocolJson(raw)
      parsedGenerated = repairedRaw ? tryParseJsonObject<GeneratedProtocolCompat>(repairedRaw) : null
    }

    if (!parsedGenerated) {
      const cleaned = sanitizeJsonCandidate(extractJsonObject(raw))
      console.error('Parse error. Raw:', cleaned.slice(0, 300))
      return NextResponse.json({ error: 'AI response parsing failed', raw: cleaned.slice(0, 500) }, { status: 500 })
    }

    const generated: any = alignGeneratedSessionToSelectedExercises(
      normalizeGeneratedProtocol(parsedGenerated),
      exerciseBlocks
    )

    generated.override_summary = coachAdjustmentSummary
    generated.influenced_by_overrides = overrideIntelligence.hasInfluence
    generated.health_coaching_phase = healthCoachingPhase.phase

    const selectedFoods = await selectFoodsForMealPlan({
      clientId: params.clientId,
      primaryGoal: client.primary_goal,
      dailyCalories: generated.nutritionStructure?.dailyCalories ?? generated.nutritionProtocol?.dailyCalories ?? null,
      proteinG: generated.nutritionStructure?.proteinG ?? generated.nutritionProtocol?.proteinG ?? null,
      carbG: generated.nutritionStructure?.carbG ?? generated.nutritionProtocol?.carbG ?? null,
      fatG: generated.nutritionStructure?.fatG ?? generated.nutritionProtocol?.fatG ?? null,
      mealFrequency: generated.nutritionStructure?.mealFrequency ?? generated.nutritionProtocol?.mealFrequency ?? null,
      physiqueFocus: isPhysiqueFocused,
    })
    const usdaFoodContext = formatFoodsForPrompt(selectedFoods)

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
Physique athlete focus: ${isPhysiqueFocused ? 'yes' : 'no'}
Protocol framing: ${protocolFrame}

SELECTED FOODS FROM USDA FOODDATA CENTRAL:
${usdaFoodContext}

Return ONLY a JSON array (no markdown, no wrapper object):
[
  {
    "time": "8:00-9:00 a.m.",
    "meal": "Breakfast",
    "foods": "Specific foods with exact portions for this client",
    "notes": "",
    "calories": 400,
    "proteinG": 35,
    "carbG": 40,
    "fatG": 12
  }
]

Include: Breakfast, Morning Snack (if applicable), Lunch, Afternoon Snack (if applicable), Training Carbs (training days), Dinner, Evening Snack (if applicable).
Use REAL foods and EXACT gram/oz portions based on the macro targets above.
Use the USDA-selected foods listed above as the primary ingredient pool.
Do not invent a completely different food list when USDA foods are available.
Vary meal choices across the selected USDA foods so plans do not feel repetitive.
If meal timing says dinner is carb-free or carb-reduced, do not place starches or fruit at dinner.
For carb-free dinner, dinner must be protein + non-starchy vegetables only.
Breakfast and lunch should hold the majority of structured carbs when front-loading is requested.
For physique-athlete clients, preserve bodybuilding specificity with performance-supportive carbs, protective protein, and a coherent BSLDS translation that still feels easy to execute.
Run a QA self-check before returning: phase appropriateness, active food and clinical constraints, behavioral realism, macro and calorie alignment, and internal consistency across all sections.
If the sample day cannot match targets within reasonable tolerance, revise the portions, revise the meals, revise the targets, or explicitly label the day as a phase-constrained compliance example.
Every meal row must include calories, proteinG, carbG, and fatG, and the full day must reconcile with the displayed daily targets unless you explicitly label it as a phase-constrained compliance example.
The meal plan must match ${client.full_name}'s goal of "${client.primary_goal ?? 'General fitness'}".`

        const mealPlanResponse = await anthropic.messages.create({
          model: getAnthropicModel(),
          max_tokens: 1200,
        system: 'You generate meal plans. Respond with ONLY a raw JSON array. No markdown, no backticks, no explanation.',
        messages: [{ role: 'user', content: mealPlanPrompt }],
      })

      const mpRawText = collectTextContent(mealPlanResponse.content as Array<{ type: string; text?: string }>)
      if (mpRawText) {
        let mpRaw = mpRawText.trim()
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
            mealPlan = parsed as MealPlanRow[]
          }
        } catch {
          console.error('Meal plan parse failed, falling back to empty array')
          mealPlan = []
        }
      }

      const mealTimingRule = generated.nutritionStructure?.mealTiming ?? generated.nutritionProtocol?.mealTiming
      if (
        Array.isArray(mealPlan) &&
        mealPlan.length > 0 &&
        isDinnerCarbRestricted(mealTimingRule) &&
        dinnerViolatesCarbTimingRule(mealPlan)
      ) {
        const repairedMealPlanRaw = await repairMealPlanForCarbTiming(JSON.stringify(mealPlan), mealTimingRule ?? '')
        if (repairedMealPlanRaw) {
          const firstBracket = repairedMealPlanRaw.indexOf('[')
          const lastBracket = repairedMealPlanRaw.lastIndexOf(']')
          const candidate = firstBracket !== -1 && lastBracket !== -1
            ? repairedMealPlanRaw.slice(firstBracket, lastBracket + 1)
            : repairedMealPlanRaw

          try {
            const repairedParsed = JSON.parse(candidate)
            if (Array.isArray(repairedParsed)) {
              mealPlan = repairedParsed as MealPlanRow[]
            }
          } catch {
            console.error('Meal plan carb-timing repair parse failed, keeping original meal plan')
          }
        }
      }
    } catch (e) {
      console.error('Meal plan generation error:', e)
      mealPlan = []
    }

    if (generated && generated.nutritionStructure) {
      generated.nutritionStructure.mealPlan = mealPlan
    }
    if (generated && generated.nutritionProtocol) {
      generated.nutritionProtocol.mealPlan = mealPlan
    }

    const restrictedNutritionPhase = isRestrictedNutritionPhase([
      currentStage,
      protocolFrame,
      coachDirectives,
      client.notes,
      journalSummary,
      checkinSummary,
      docSummary,
      generated.nutritionStructure?.mealTiming,
      generated.nutritionProtocol?.mealTiming,
      generated.nutritionProtocol?.macroJustification,
      generated.nutritionProtocol?.adherenceFallback,
    ])

    try {
      const nutritionQaResult = await runNutritionQaValidation({
        clientName: client.full_name,
        stage: currentStage,
        protocolFrame,
        generationState,
        primaryGoal: client.primary_goal ?? 'General fitness',
        nutritionStructure: generated.nutritionStructure,
        nutritionProtocol: generated.nutritionProtocol,
        mealPlan,
        coachDirectives,
        clientNotes: client.notes,
        journalSummary,
        checkinSummary,
        docSummary,
      })

      if (nutritionQaResult?.nutritionStructure) {
        generated.nutritionStructure = {
          ...generated.nutritionStructure,
          ...nutritionQaResult.nutritionStructure,
        }
      }

      if (nutritionQaResult?.nutritionProtocol) {
        generated.nutritionProtocol = {
          ...generated.nutritionProtocol,
          ...nutritionQaResult.nutritionProtocol,
        }
      }

      if (Array.isArray(nutritionQaResult?.mealPlan) && nutritionQaResult.mealPlan.length > 0) {
        mealPlan = nutritionQaResult.mealPlan
      } else if (Array.isArray(nutritionQaResult?.nutritionStructure?.mealPlan) && nutritionQaResult.nutritionStructure.mealPlan.length > 0) {
        mealPlan = nutritionQaResult.nutritionStructure.mealPlan as MealPlanRow[]
      } else if (Array.isArray(nutritionQaResult?.nutritionProtocol?.mealPlan) && nutritionQaResult.nutritionProtocol.mealPlan.length > 0) {
        mealPlan = nutritionQaResult.nutritionProtocol.mealPlan as MealPlanRow[]
      }

      if (generated.nutritionStructure) {
        generated.nutritionStructure.mealPlan = mealPlan
      }
      if (generated.nutritionProtocol) {
        generated.nutritionProtocol.mealPlan = mealPlan
      }

      if (nutritionQaResult?.qaSummary) {
        generated.coachNotes = [generated.coachNotes, `Nutrition QA: ${nutritionQaResult.qaSummary}`]
          .filter(Boolean)
          .join('\n')
      }
    } catch (qaError) {
      console.error('Nutrition QA validation error:', qaError)
    }

    try {
      const reconciliation = nutritionTargetsNeedReconciliation({
        mealPlan,
        dailyCalories: generated.nutritionStructure?.dailyCalories ?? generated.nutritionProtocol?.dailyCalories,
        proteinG: generated.nutritionStructure?.proteinG ?? generated.nutritionProtocol?.proteinG,
        carbG: generated.nutritionStructure?.carbG ?? generated.nutritionProtocol?.carbG,
        fatG: generated.nutritionStructure?.fatG ?? generated.nutritionProtocol?.fatG,
        restrictedPhase: restrictedNutritionPhase,
      })

      if (reconciliation.needsRepair) {
        const repaired = await repairNutritionCoherence({
          clientName: client.full_name,
          stage: currentStage,
          protocolFrame,
          restrictedPhase: restrictedNutritionPhase,
          nutritionStructure: generated.nutritionStructure,
          nutritionProtocol: generated.nutritionProtocol,
          mealPlan,
          totals: reconciliation.totals,
          mismatchReason: reconciliation.reason ?? 'Nutrition targets and sample day do not reconcile.',
          constraintSummary: [
            coachDirectives ? `Coach directives: ${coachDirectives}` : null,
            client.notes ? `Client notes: ${client.notes}` : null,
            journalSummary ? `Journals: ${journalSummary}` : null,
            checkinSummary ? `Check-ins: ${checkinSummary}` : null,
            docSummary ? `AI docs: ${docSummary}` : null,
          ].filter(Boolean).join('\n'),
        })

        if (repaired?.nutritionStructure) {
          generated.nutritionStructure = {
            ...generated.nutritionStructure,
            ...repaired.nutritionStructure,
          }
        }
        if (repaired?.nutritionProtocol) {
          generated.nutritionProtocol = {
            ...generated.nutritionProtocol,
            ...repaired.nutritionProtocol,
          }
        }
        if (Array.isArray(repaired?.mealPlan) && repaired.mealPlan.length > 0) {
          mealPlan = repaired.mealPlan
        }
      }

      const finalTotals = sumMealPlanNutrition(mealPlan)
      if (finalTotals.countedMeals > 0) {
        const optimizationPhase = /optimization/i.test([currentStage, protocolFrame, generated.nutritionProtocol?.caloriePhase].filter(Boolean).join(' '))
        const targetDisplays = formatNutritionDisplays({
          calories: roundToWhole(finalTotals.calories),
          proteinG: roundToWhole(finalTotals.proteinG),
          carbG: roundToWhole(finalTotals.carbG),
          fatG: roundToWhole(finalTotals.fatG),
          restrictedPhase: restrictedNutritionPhase,
          optimizationPhase,
        })

        if (generated.nutritionStructure) {
          generated.nutritionStructure.dailyCalories = roundToWhole(finalTotals.calories)
          generated.nutritionStructure.proteinG = roundToWhole(finalTotals.proteinG)
          generated.nutritionStructure.carbG = roundToWhole(finalTotals.carbG)
          generated.nutritionStructure.fatG = roundToWhole(finalTotals.fatG)
          generated.nutritionStructure.dailyCaloriesDisplay = targetDisplays.dailyCaloriesDisplay
          generated.nutritionStructure.proteinDisplay = targetDisplays.proteinDisplay
          generated.nutritionStructure.carbDisplay = targetDisplays.carbDisplay
          generated.nutritionStructure.fatDisplay = targetDisplays.fatDisplay
          generated.nutritionStructure.mealPlan = mealPlan
          if (restrictedNutritionPhase) {
            generated.nutritionStructure.keyGuidelines = [
              ...(generated.nutritionStructure.keyGuidelines ?? []),
              'Sample day is a phase-constrained compliance example when restriction rules limit full macro optimization.',
            ].filter((value, index, array) => array.indexOf(value) === index)
          }
        }
        if (generated.nutritionProtocol) {
          generated.nutritionProtocol.dailyCalories = roundToWhole(finalTotals.calories)
          generated.nutritionProtocol.proteinG = roundToWhole(finalTotals.proteinG)
          generated.nutritionProtocol.carbG = roundToWhole(finalTotals.carbG)
          generated.nutritionProtocol.fatG = roundToWhole(finalTotals.fatG)
          generated.nutritionProtocol.dailyCaloriesDisplay = targetDisplays.dailyCaloriesDisplay
          generated.nutritionProtocol.proteinDisplay = targetDisplays.proteinDisplay
          generated.nutritionProtocol.carbDisplay = targetDisplays.carbDisplay
          generated.nutritionProtocol.fatDisplay = targetDisplays.fatDisplay
          generated.nutritionProtocol.mealPlan = mealPlan
          if (restrictedNutritionPhase) {
            generated.nutritionProtocol.keyGuidelines = [
              ...(generated.nutritionProtocol.keyGuidelines ?? []),
              'Sample day is a phase-constrained compliance example when restriction rules limit full macro optimization.',
            ].filter((value, index, array) => array.indexOf(value) === index)
          }
        }
      }
    } catch (coherenceError) {
      console.error('Nutrition coherence reconciliation error:', coherenceError)
    }

    return NextResponse.json({
      success: true,
      generated,
      context: {
        bie: resolvedBie,
        bieSource,
        generationState,
        healthCoachingPhase,
        stage: currentStage,
        protocolFrame,
        physiqueFocus: isPhysiqueFocused,
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

