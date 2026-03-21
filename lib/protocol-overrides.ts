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
      id: createExerciseId(block, index, exercise.exerciseName),
      block,
      original: { ...exercise },
      adjusted: false,
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
