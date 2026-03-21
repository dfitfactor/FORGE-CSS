export type OverrideSection = 'movement' | 'nutrition'

export type ProtocolOverride = {
  id: string
  protocol_id: string
  section: OverrideSection
  target: string
  change: Record<string, unknown>
  reason: string
  created_by: string
  timestamp: string
  coach_note?: string | null
  reverted_at?: string | null
  reverted_by?: string | null
  revert_reason?: string | null
}

export type MovementExecutionLogEntry = {
  id: string
  protocol_id: string
  section: 'movement'
  exercise_id: string
  exercise_name: string
  completed_sessions?: number | null
  completed_sets?: number | null
  completed_reps?: string | null
  load?: string | null
  notes?: string | null
  created_by: string
  timestamp: string
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

export type SessionStructure = {
  frequency?: number
  sessionsPerWeek?: number
  sessionType?: string
  complexityCeiling?: number
  volumeLevel?: string
  activationBlock?: ExerciseBlock[]
  primaryBlock?: ExerciseBlock[]
  accessoryBlock?: ExerciseBlock[]
  finisherBlock?: ExerciseBlock[]
}

export type MovementExercise = ExerciseBlock & {
  id: string
  block: keyof Pick<SessionStructure, 'activationBlock' | 'primaryBlock' | 'accessoryBlock' | 'finisherBlock'>
  original: ExerciseBlock
  adjusted: boolean
  removed?: boolean
  variation?: string
}

export type NutritionMealPlanEntry = {
  time: string
  meal: string
  foods: string
  notes?: string
}

export type NutritionStructure = {
  dailyCalories?: number
  proteinG?: number
  carbG?: number
  fatG?: number
  mealFrequency?: number
  mealTiming?: string
  complexityLevel?: string
  keyGuidelines?: string[]
  disruption_protocol?: string
  mealPlan?: NutritionMealPlanEntry[]
}

export function normalizeLoad(load: string | null | undefined, exerciseName: string) {
  if (load && load.trim() !== '') return load

  const normalizedExercise = exerciseName.toLowerCase()
  if (normalizedExercise.includes('band')) return 'Light band'
  if (normalizedExercise.includes('bridge')) return 'Bodyweight'
  if (normalizedExercise.includes('activation')) return 'Technique weight'

  return 'Bodyweight'
}

export type OverrideIntelligenceSummary = {
  summary: string
  bullets: string[]
  hasInfluence: boolean
  metrics: {
    volumeReductions: number
    volumeIncreases: number
    exerciseSwaps: number
    loadAdjustments: number
    fatigueFlags: number
    adherenceFlags: number
    calorieReductions: number
    calorieIncreases: number
    progressionSignals: number
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function sanitizeProtocolOverrides(value: unknown): ProtocolOverride[] {
  return asArray<Record<string, unknown>>(value)
    .filter(item => typeof item.id === 'string' && typeof item.protocol_id === 'string' && typeof item.section === 'string')
    .map(item => ({
      id: String(item.id),
      protocol_id: String(item.protocol_id),
      section: item.section === 'nutrition' ? 'nutrition' : 'movement',
      target: String(item.target ?? ''),
      change: asRecord(item.change),
      reason: String(item.reason ?? ''),
      created_by: String(item.created_by ?? 'coach'),
      timestamp: String(item.timestamp ?? new Date().toISOString()),
      coach_note: typeof item.coach_note === 'string' ? item.coach_note : null,
      reverted_at: typeof item.reverted_at === 'string' ? item.reverted_at : null,
      reverted_by: typeof item.reverted_by === 'string' ? item.reverted_by : null,
      revert_reason: typeof item.revert_reason === 'string' ? item.revert_reason : null,
    }))
}

export function sanitizeExecutionLog(value: unknown): MovementExecutionLogEntry[] {
  return asArray<Record<string, unknown>>(value)
    .filter(item => typeof item.id === 'string' && typeof item.exercise_id === 'string')
    .map(item => ({
      id: String(item.id),
      protocol_id: String(item.protocol_id ?? ''),
      section: 'movement' as const,
      exercise_id: String(item.exercise_id),
      exercise_name: String(item.exercise_name ?? ''),
      completed_sessions: typeof item.completed_sessions === 'number' ? item.completed_sessions : null,
      completed_sets: typeof item.completed_sets === 'number' ? item.completed_sets : null,
      completed_reps: typeof item.completed_reps === 'string' ? item.completed_reps : null,
      load: typeof item.load === 'string' ? item.load : null,
      notes: typeof item.notes === 'string' ? item.notes : null,
      created_by: String(item.created_by ?? 'coach'),
      timestamp: String(item.timestamp ?? new Date().toISOString()),
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

function countKeywordHits(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0)
}

export function buildOverrideIntelligenceSummary(protocolPayloads: unknown[]): OverrideIntelligenceSummary {
  const allOverrides = protocolPayloads.flatMap(payload => {
    const record = asRecord(payload)
    return [
      ...sanitizeProtocolOverrides(record.movementOverrides),
      ...sanitizeProtocolOverrides(record.nutritionOverrides),
    ]
  })
  const activeOverrides = allOverrides.filter(override => !override.reverted_at)
  const executionLogs = protocolPayloads.flatMap(payload => sanitizeExecutionLog(asRecord(payload).movementExecutionLog))

  let volumeReductions = 0
  let volumeIncreases = 0
  let exerciseSwaps = 0
  let loadAdjustments = 0
  let fatigueFlags = 0
  let adherenceFlags = 0
  let calorieReductions = 0
  let calorieIncreases = 0
  let progressionSignals = 0

  for (const override of activeOverrides) {
    const change = asRecord(override.change)
    const sourceText = `${override.reason} ${override.coach_note ?? ''} ${JSON.stringify(change)}`.toLowerCase()

    if (
      typeof change.sets === 'number' && change.sets < 3 ||
      typeof change.sessionsPerWeek === 'number' && change.sessionsPerWeek < 3 ||
      (typeof change.volumeLevel === 'string' && /(reduced|minimal|minim|minimum|deload|lower)/i.test(change.volumeLevel)) ||
      /reduce volume|lower volume|deload|back off|pull back/.test(sourceText)
    ) {
      volumeReductions += 1
    }

    if (
      typeof change.sets === 'number' && change.sets >= 4 ||
      typeof change.sessionsPerWeek === 'number' && change.sessionsPerWeek >= 4 ||
      /increase volume|add set|progress volume|advance volume/.test(sourceText)
    ) {
      volumeIncreases += 1
      progressionSignals += 1
    }

    if (
      typeof change.exerciseName === 'string' ||
      typeof change.swapOption === 'string' ||
      /swap|replace|substitute|alternative/.test(sourceText)
    ) {
      exerciseSwaps += 1
    }

    if (
      typeof change.loadGuidance === 'string' ||
      /load|weight|intensity|lighter|heavier|rpe/.test(sourceText)
    ) {
      loadAdjustments += 1
    }

    if (/fatigue|sore|recovery|sleep|stress|burnout|exhaust|pain|discomfort|flare/.test(sourceText)) {
      fatigueFlags += 1
    }

    if (/adherence|consistency|schedule|travel|busy|missed|overwhelm|compliance/.test(sourceText)) {
      adherenceFlags += 1
    }

    if (override.section === 'nutrition' && override.target === 'macro') {
      const delta = asRecord(change.delta)
      const calorieDelta = typeof delta.dailyCalories === 'number'
        ? delta.dailyCalories
        : typeof change.dailyCalories === 'number'
          ? change.dailyCalories
          : null

      if (typeof calorieDelta === 'number') {
        if (calorieDelta < 0) calorieReductions += 1
        if (calorieDelta > 0) calorieIncreases += 1
      }
    }
  }

  for (const entry of executionLogs) {
    const sourceText = `${entry.exercise_name} ${entry.notes ?? ''} ${entry.load ?? ''} ${entry.completed_reps ?? ''}`.toLowerCase()

    fatigueFlags += countKeywordHits(sourceText, [
      /fatigue/,
      /exhaust/,
      /gassed/,
      /poor sleep/,
      /stress/,
      /sore/,
      /pain/,
      /discomfort/,
    ])

    adherenceFlags += countKeywordHits(sourceText, [
      /missed/,
      /shortened/,
      /cut short/,
      /rushed/,
      /busy/,
      /schedule/,
      /travel/,
      /skipped/,
    ])

    progressionSignals += countKeywordHits(sourceText, [
      /progress/,
      /pr\b/,
      /added load/,
      /up in weight/,
      /strong/,
      /easy/,
      /hit top reps/,
    ])
  }

  const bullets: string[] = []

  if (volumeReductions > 0) bullets.push(`volume reduced ${volumeReductions}x across recent coaching adjustments`)
  if (exerciseSwaps > 0) bullets.push(`exercise swaps made ${exerciseSwaps}x due to coach-led execution changes`)
  if (loadAdjustments > 0) bullets.push(`load or intensity targets adjusted ${loadAdjustments}x`)
  if (fatigueFlags > 0) bullets.push(`fatigue or recovery flags surfaced ${fatigueFlags}x`)
  if (adherenceFlags > 0) bullets.push(`adherence or schedule issues surfaced ${adherenceFlags}x`)
  if (calorieReductions > 0) bullets.push(`calories adjusted downward ${calorieReductions}x by coach`)
  if (calorieIncreases > 0) bullets.push(`calories adjusted upward ${calorieIncreases}x by coach`)
  if (progressionSignals > 0) bullets.push(`consistent progression signals noted ${progressionSignals}x`)

  return {
    summary: bullets.length > 0
      ? bullets.map(item => `- ${item}`).join('\n')
      : 'No meaningful coach override or execution-log patterns were detected.',
    bullets,
    hasInfluence: bullets.length > 0,
    metrics: {
      volumeReductions,
      volumeIncreases,
      exerciseSwaps,
      loadAdjustments,
      fatigueFlags,
      adherenceFlags,
      calorieReductions,
      calorieIncreases,
      progressionSignals,
    },
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function createExerciseId(block: string, index: number, exerciseName: string) {
  return `${block}:${index}:${slugify(exerciseName)}`
}

export function getActiveOverrides(
  overrides: ProtocolOverride[] | null | undefined,
  section: OverrideSection
) {
  return (overrides ?? []).filter(override => override.section === section && !override.reverted_at)
}

export function buildMovementExercises(
  sessionStructure: SessionStructure | null | undefined
): Record<'activationBlock' | 'primaryBlock' | 'accessoryBlock' | 'finisherBlock', MovementExercise[]> {
  const blocks: Array<keyof Pick<SessionStructure, 'activationBlock' | 'primaryBlock' | 'accessoryBlock' | 'finisherBlock'>> = [
    'activationBlock',
    'primaryBlock',
    'accessoryBlock',
    'finisherBlock',
  ]

  return blocks.reduce((acc, block) => {
    const items = sessionStructure?.[block] ?? []
    acc[block] = items.map((exercise, index) => ({
      ...exercise,
      loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
      id: createExerciseId(block, index, exercise.exerciseName),
      block,
      original: {
        ...exercise,
        loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
      },
      adjusted: false,
      removed: false,
      variation: undefined,
    }))
    return acc
  }, {
    activationBlock: [],
    primaryBlock: [],
    accessoryBlock: [],
    finisherBlock: [],
  } as Record<'activationBlock' | 'primaryBlock' | 'accessoryBlock' | 'finisherBlock', MovementExercise[]>)
}

export function applyMovementOverrides(
  sessionStructure: SessionStructure | null | undefined,
  overrides: ProtocolOverride[] | null | undefined
) {
  const adjustedStructure: SessionStructure = {
    ...(sessionStructure ?? {}),
  }
  const blocks = buildMovementExercises(sessionStructure)
  const activeOverrides = getActiveOverrides(overrides, 'movement')

  for (const override of activeOverrides) {
    if (override.target === 'sessionStructure') {
      const change = override.change
      if (typeof change.sessionsPerWeek === 'number') adjustedStructure.sessionsPerWeek = change.sessionsPerWeek
      if (typeof change.frequency === 'number') adjustedStructure.frequency = change.frequency
      if (typeof change.complexityCeiling === 'number') adjustedStructure.complexityCeiling = change.complexityCeiling
      if (typeof change.volumeLevel === 'string') adjustedStructure.volumeLevel = change.volumeLevel
      continue
    }

    const allExercises = [
      ...blocks.activationBlock,
      ...blocks.primaryBlock,
      ...blocks.accessoryBlock,
      ...blocks.finisherBlock,
    ]
    const exercise = allExercises.find(item => item.id === override.target)
    if (!exercise) continue

    const change = override.change
    if (typeof change.exerciseName === 'string') exercise.exerciseName = change.exerciseName
    if (typeof change.sets === 'number') exercise.sets = change.sets
    if (typeof change.reps === 'string') exercise.reps = change.reps
    if (typeof change.tempo === 'string') exercise.tempo = change.tempo
    if (typeof change.rest === 'string') exercise.rest = change.rest
    if (typeof change.loadGuidance === 'string') exercise.loadGuidance = change.loadGuidance
    if (typeof change.coachingCue === 'string') exercise.coachingCue = change.coachingCue
    if (typeof change.swapOption === 'string') exercise.swapOption = change.swapOption
    if (typeof change.removed === 'boolean') exercise.removed = change.removed
    if (typeof change.variation === 'string') exercise.variation = change.variation
    exercise.adjusted = true
  }

  adjustedStructure.activationBlock = blocks.activationBlock.map(({ original: _original, adjusted: _adjusted, id: _id, block: _block, ...exercise }) => exercise)
  adjustedStructure.primaryBlock = blocks.primaryBlock.map(({ original: _original, adjusted: _adjusted, id: _id, block: _block, ...exercise }) => exercise)
  adjustedStructure.accessoryBlock = blocks.accessoryBlock.map(({ original: _original, adjusted: _adjusted, id: _id, block: _block, ...exercise }) => exercise)
  adjustedStructure.finisherBlock = blocks.finisherBlock.map(({ original: _original, adjusted: _adjusted, id: _id, block: _block, ...exercise }) => exercise)

  return {
    adjustedStructure,
    displayBlocks: blocks,
    activeOverrides,
  }
}

export function applyNutritionOverrides(
  nutritionStructure: NutritionStructure | null | undefined,
  overrides: ProtocolOverride[] | null | undefined
) {
  const adjustedStructure: NutritionStructure = {
    ...(nutritionStructure ?? {}),
    mealPlan: [...(nutritionStructure?.mealPlan ?? [])],
  }
  const activeOverrides = getActiveOverrides(overrides, 'nutrition')

  for (const override of activeOverrides) {
    const change = override.change

    if (override.target === 'macro') {
      if (typeof change.dailyCalories === 'number') adjustedStructure.dailyCalories = change.dailyCalories
      if (typeof change.proteinG === 'number') adjustedStructure.proteinG = change.proteinG
      if (typeof change.carbG === 'number') adjustedStructure.carbG = change.carbG
      if (typeof change.fatG === 'number') adjustedStructure.fatG = change.fatG
      if (typeof change.mealFrequency === 'number') adjustedStructure.mealFrequency = change.mealFrequency
      if (typeof change.mealTiming === 'string') adjustedStructure.mealTiming = change.mealTiming
      if (typeof change.complexityLevel === 'string') adjustedStructure.complexityLevel = change.complexityLevel
      continue
    }

    if (override.target.startsWith('mealPlan:')) {
      const index = Number(override.target.split(':')[1] ?? -1)
      const meal = adjustedStructure.mealPlan?.[index]
      if (!meal) continue
      if (typeof change.time === 'string') meal.time = change.time
      if (typeof change.meal === 'string') meal.meal = change.meal
      if (typeof change.foods === 'string') meal.foods = change.foods
      if (typeof change.notes === 'string') meal.notes = change.notes
    }
  }

  return {
    adjustedStructure,
    activeOverrides,
  }
}
