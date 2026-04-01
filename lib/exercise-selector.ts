import { db } from '@/lib/db'

export interface ExerciseBlock {
  activation: Exercise[]
  primary: Exercise[]
  accessory: Exercise[]
  finisher: Exercise[]
}

export interface Exercise {
  exercise_name: string
  body_region: string
  movement_pattern: string
  equipment: string
  equipment_normalized: string
  intensity: string
  complexity_tier: number
  default_block: string
}

export interface SessionParams {
  movementPatterns: string[]
  complexityCeiling: number
  volumeLevel: 'full' | 'moderate' | 'reduced' | 'minimum'
  availableEquipment: string[]
  excludePatterns?: string[]
  generationState: string
}

const DEFAULT_EQUIPMENT = [
  'bodyweight',
  'dumbbell',
  'barbell',
  'cable',
  'kettlebell',
  'band',
  'machine',
  'trx',
  'other',
  'mat',
]

export async function selectExercisesForSession(
  params: SessionParams
): Promise<ExerciseBlock> {
  const {
    movementPatterns,
    complexityCeiling,
    volumeLevel,
    availableEquipment,
    excludePatterns = [],
    generationState,
  } = params

  const counts = {
    full: { activation: 2, primary: 4, accessory: 3, finisher: 1 },
    moderate: { activation: 2, primary: 3, accessory: 2, finisher: 0 },
    reduced: { activation: 2, primary: 3, accessory: 1, finisher: 0 },
    minimum: { activation: 1, primary: 2, accessory: 1, finisher: 0 },
  }[volumeLevel]

  const equipmentFilter = availableEquipment.length > 0 ? availableEquipment : DEFAULT_EQUIPMENT

  const activationQuery = `
    SELECT exercise_name, body_region, movement_pattern, equipment,
           equipment_normalized, intensity, complexity_tier, default_block
    FROM exercises
    WHERE default_block = 'activation'
    AND complexity_tier <= 2
    AND equipment_normalized = ANY($1::text[])
    AND is_active = true
    ORDER BY RANDOM()
    LIMIT $2
  `

  const primaryQuery = `
    SELECT exercise_name, body_region, movement_pattern, equipment,
           equipment_normalized, intensity, complexity_tier, default_block
    FROM exercises
    WHERE default_block = 'primary'
    AND movement_pattern = ANY($1::text[])
    AND complexity_tier <= $2
    AND equipment_normalized = ANY($3::text[])
    AND is_active = true
    ${excludePatterns.length > 0 ? 'AND movement_pattern != ALL($4::text[])' : ''}
    ORDER BY RANDOM()
    LIMIT $${excludePatterns.length > 0 ? 5 : 4}
  `

  const accessoryQuery = `
    SELECT exercise_name, body_region, movement_pattern, equipment,
           equipment_normalized, intensity, complexity_tier, default_block
    FROM exercises
    WHERE default_block = 'accessory'
    AND complexity_tier <= $1
    AND equipment_normalized = ANY($2::text[])
    AND is_active = true
    ORDER BY RANDOM()
    LIMIT $3
  `

  const finisherQuery = `
    SELECT exercise_name, body_region, movement_pattern, equipment,
           equipment_normalized, intensity, complexity_tier, default_block
    FROM exercises
    WHERE default_block = 'finisher'
    AND complexity_tier <= $1
    AND equipment_normalized = ANY($2::text[])
    AND is_active = true
    ORDER BY RANDOM()
    LIMIT $3
  `

  const activationEquipment = equipmentFilter.filter((item) =>
    ['bodyweight', 'band', 'mat'].includes(item)
  )

  const activation = await db.query<Exercise>(activationQuery, [
    activationEquipment.length > 0 ? activationEquipment : ['bodyweight', 'band', 'mat'],
    counts.activation,
  ])

  const primaryParams =
    excludePatterns.length > 0
      ? [movementPatterns, complexityCeiling, equipmentFilter, excludePatterns, counts.primary]
      : [movementPatterns, complexityCeiling, equipmentFilter, counts.primary]

  const primary = await db.query<Exercise>(primaryQuery, primaryParams)

  const accessory = await db.query<Exercise>(accessoryQuery, [
    Math.max(complexityCeiling - 1, 1),
    equipmentFilter,
    counts.accessory,
  ])

  const finisher =
    (generationState === 'A' || generationState === 'B') && counts.finisher > 0
      ? await db.query<Exercise>(finisherQuery, [complexityCeiling, equipmentFilter, counts.finisher])
      : []

  return { activation, primary, accessory, finisher }
}

export async function getSwapOptions(
  exerciseName: string
): Promise<{ equipment: string; bodyweight: string; recovery: string } | null> {
  const swap = await db.queryOne<{
    swap_a_equipment: string
    swap_b_bodyweight: string
    swap_c_recovery: string
  }>(
    `SELECT swap_a_equipment, swap_b_bodyweight, swap_c_recovery
     FROM exercise_swaps
     WHERE primary_exercise_name ILIKE $1`,
    [exerciseName]
  )

  if (!swap) return null

  return {
    equipment: swap.swap_a_equipment,
    bodyweight: swap.swap_b_bodyweight,
    recovery: swap.swap_c_recovery,
  }
}
