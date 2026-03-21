import { db } from '@/lib/db'
import {
  applyMovementOverrides,
  applyNutritionOverrides,
  buildOverrideIntelligenceSummary,
  type MovementExecutionLogEntry,
  type NutritionStructure,
  type ProtocolOverride,
  type SessionStructure,
  sanitizeExecutionLog,
  sanitizeProtocolOverrides,
} from '@/lib/protocol-overrides'

type SupportedProtocolType = 'movement' | 'nutrition'

type ProtocolRow = {
  id: string
  client_id: string
  version: number | null
  is_active: boolean
  name: string
  protocol_type: string
  stage: string
  generation_state: string | null
  sessions_per_week: number | null
  session_frequency: number | null
  complexity_ceiling: number | null
  volume_target: string | null
  calorie_target: number | null
  protein_target_g: number | null
  carb_target_g: number | null
  fat_target_g: number | null
  meal_frequency: number | null
  nutrition_complexity: string | null
  bar_at_generation: number | null
  effective_date: string
  created_at: string
  generated_by: string | null
  notes: string | null
  coach_notes: string | null
  protocol_payload: Record<string, unknown> | null
  activation_block: unknown[] | null
  primary_block: unknown[] | null
  accessory_block: unknown[] | null
  finisher_block: unknown[] | null
}

type ProtocolHistoryItem = {
  id: string
  version: number | null
  is_active: boolean
  name: string
  protocol_type: string
  stage: string
  generation_state: string | null
  effective_date: string
  created_at: string
  sessions_per_week: number | null
  volume_target: string | null
  calorie_target: number | null
  protein_target_g: number | null
  carb_target_g: number | null
  fat_target_g: number | null
  override_count: number
  execution_log_count: number
}

type ChangeLogEntry = {
  id: string
  action: string
  change_summary: string | null
  payload_diff: Record<string, unknown> | null
  created_at: string
}

type BaseProtocolSummary = {
  id: string
  name: string
  protocolType: string
  stage: string
  generationState: string | null
  effectiveDate: string
  createdAt: string
  generatedBy: string | null
  notes: string | null
  coachNotes: string | null
  rationale: string | null
  clientFacingMessage: string | null
}

export type MovementWorkspaceData = {
  protocol: (BaseProtocolSummary & {
    sessionStructure: SessionStructure | null
    adjustedSessionStructure: SessionStructure | null
    displayBlocks: ReturnType<typeof applyMovementOverrides>['displayBlocks']
    activeOverrides: ProtocolOverride[]
    executionLog: MovementExecutionLogEntry[]
  }) | null
  history: ProtocolHistoryItem[]
  changeLog: ChangeLogEntry[]
  overrideIntelligence: ReturnType<typeof buildOverrideIntelligenceSummary>
}

export type NutritionWorkspaceData = {
  protocol: (BaseProtocolSummary & {
    nutritionStructure: NutritionStructure | null
    adjustedNutritionStructure: NutritionStructure | null
    activeOverrides: ProtocolOverride[]
  }) | null
  history: ProtocolHistoryItem[]
  changeLog: ChangeLogEntry[]
}

const tableColumnCache = new Map<string, Set<string>>()

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function deriveSessionStructure(protocol: ProtocolRow) {
  const payload = asRecord(protocol.protocol_payload)
  const payloadSession = asRecord(payload.sessionStructure)

  if (Object.keys(payloadSession).length > 0) {
    return payloadSession as unknown as SessionStructure
  }

  if (!protocol.activation_block && !protocol.primary_block && !protocol.accessory_block && !protocol.finisher_block) {
    return null
  }

  return {
    frequency: protocol.session_frequency ?? undefined,
    sessionsPerWeek: protocol.sessions_per_week ?? undefined,
    sessionType: typeof payload.sessionType === 'string' ? String(payload.sessionType) : undefined,
    complexityCeiling: protocol.complexity_ceiling ?? undefined,
    volumeLevel: protocol.volume_target ?? undefined,
    activationBlock: asArray(protocol.activation_block),
    primaryBlock: asArray(protocol.primary_block),
    accessoryBlock: asArray(protocol.accessory_block),
    finisherBlock: asArray(protocol.finisher_block),
  } as SessionStructure
}

function deriveNutritionStructure(protocol: ProtocolRow) {
  const payload = asRecord(protocol.protocol_payload)
  const payloadNutrition = asRecord(payload.nutritionStructure)

  if (Object.keys(payloadNutrition).length > 0) {
    return payloadNutrition as unknown as NutritionStructure
  }

  if (
    protocol.calorie_target === null &&
    protocol.protein_target_g === null &&
    protocol.carb_target_g === null &&
    protocol.fat_target_g === null &&
    protocol.meal_frequency === null &&
    protocol.nutrition_complexity === null
  ) {
    return null
  }

  return {
    dailyCalories: protocol.calorie_target ?? undefined,
    proteinG: protocol.protein_target_g ?? undefined,
    carbG: protocol.carb_target_g ?? undefined,
    fatG: protocol.fat_target_g ?? undefined,
    mealFrequency: protocol.meal_frequency ?? undefined,
    complexityLevel: protocol.nutrition_complexity ?? undefined,
    mealPlan: asArray(payload.mealPlan),
    keyGuidelines: asArray(payload.keyGuidelines),
    mealTiming: typeof payload.mealTiming === 'string' ? String(payload.mealTiming) : undefined,
  } as NutritionStructure
}

async function getTableColumnSet(tableName: string) {
  const cached = tableColumnCache.get(tableName)
  if (cached) return cached

  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  )

  const set = new Set(columns.map(column => column.column_name))
  tableColumnCache.set(tableName, set)
  return set
}

async function getActiveProtocolRow(clientId: string, section: SupportedProtocolType) {
  const types = section === 'movement' ? ['movement', 'composite'] : ['nutrition', 'composite']
  const preferred = section

  return db.queryOne<ProtocolRow>(
    `SELECT id, client_id, version, is_active, name, protocol_type, stage, generation_state,
            sessions_per_week, session_frequency, complexity_ceiling, volume_target,
            calorie_target, protein_target_g, carb_target_g, fat_target_g,
            meal_frequency, nutrition_complexity, bar_at_generation,
            effective_date::text, created_at::text, generated_by, notes, coach_notes,
            protocol_payload, activation_block, primary_block, accessory_block, finisher_block
     FROM protocols
     WHERE client_id = $1
       AND is_active = true
       AND protocol_type = ANY($2::text[])
     ORDER BY CASE WHEN protocol_type = $3 THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [clientId, types, preferred]
  )
}

async function getProtocolHistory(clientId: string, section: SupportedProtocolType) {
  const types = section === 'movement' ? ['movement', 'composite'] : ['nutrition', 'composite']

  const rows = await db.query<ProtocolRow>(
    `SELECT id, client_id, version, is_active, name, protocol_type, stage, generation_state,
            sessions_per_week, session_frequency, complexity_ceiling, volume_target,
            calorie_target, protein_target_g, carb_target_g, fat_target_g,
            meal_frequency, nutrition_complexity, bar_at_generation,
            effective_date::text, created_at::text, generated_by, notes, coach_notes,
            protocol_payload, activation_block, primary_block, accessory_block, finisher_block
     FROM protocols
     WHERE client_id = $1
       AND protocol_type = ANY($2::text[])
     ORDER BY effective_date DESC, created_at DESC`,
    [clientId, types]
  )

  return rows.map(protocol => {
    const payload = asRecord(protocol.protocol_payload)
    const overrides = sanitizeProtocolOverrides([
      ...asArray(payload.movementOverrides),
      ...asArray(payload.nutritionOverrides),
    ])
    const executionLog = sanitizeExecutionLog(payload.movementExecutionLog)

    return {
      id: protocol.id,
      version: protocol.version,
      is_active: protocol.is_active,
      name: protocol.name,
      protocol_type: protocol.protocol_type,
      stage: protocol.stage,
      generation_state: protocol.generation_state,
      effective_date: protocol.effective_date,
      created_at: protocol.created_at,
      sessions_per_week: protocol.sessions_per_week,
      volume_target: protocol.volume_target,
      calorie_target: protocol.calorie_target,
      protein_target_g: protocol.protein_target_g,
      carb_target_g: protocol.carb_target_g,
      fat_target_g: protocol.fat_target_g,
      override_count: overrides.filter(override => override.section === section).length,
      execution_log_count: section === 'movement' ? executionLog.length : 0,
    } satisfies ProtocolHistoryItem
  })
}

async function getChangeLog(protocolId: string) {
  const columns = await getTableColumnSet('protocol_change_log')
  if (!columns.has('protocol_id')) return []

  return db.query<ChangeLogEntry>(
    `SELECT id, action, change_summary, payload_diff, created_at::text
     FROM protocol_change_log
     WHERE protocol_id = $1
     ORDER BY created_at DESC
     LIMIT 25`,
    [protocolId]
  )
}

function buildBaseProtocolSummary(protocol: ProtocolRow): BaseProtocolSummary {
  const payload = asRecord(protocol.protocol_payload)

  return {
    id: protocol.id,
    name: protocol.name,
    protocolType: protocol.protocol_type,
    stage: protocol.stage,
    generationState: protocol.generation_state,
    effectiveDate: protocol.effective_date,
    createdAt: protocol.created_at,
    generatedBy: protocol.generated_by,
    notes: protocol.notes,
    coachNotes: protocol.coach_notes,
    rationale: typeof payload.rationale === 'string' ? payload.rationale : null,
    clientFacingMessage: typeof payload.clientFacingMessage === 'string' ? payload.clientFacingMessage : null,
  }
}

export async function loadMovementWorkspace(clientId: string): Promise<MovementWorkspaceData> {
  const protocol = await getActiveProtocolRow(clientId, 'movement')
  const history = await getProtocolHistory(clientId, 'movement')

  if (!protocol) {
    return {
      protocol: null,
      history,
      changeLog: [],
      overrideIntelligence: buildOverrideIntelligenceSummary([]),
    }
  }

  const payload = asRecord(protocol.protocol_payload)
  const sessionStructure = deriveSessionStructure(protocol)
  const overrides = sanitizeProtocolOverrides([
    ...asArray(payload.movementOverrides),
    ...asArray(payload.nutritionOverrides),
  ])
  const executionLog = sanitizeExecutionLog(payload.movementExecutionLog)
  const movementView = applyMovementOverrides(sessionStructure, overrides)
  const changeLog = await getChangeLog(protocol.id)
  const intelligencePayloads = await db.query<{ protocol_payload: Record<string, unknown> | null }>(
    `SELECT protocol_payload
     FROM protocols
     WHERE client_id = $1
       AND protocol_type = ANY($2::text[])
     ORDER BY created_at DESC
     LIMIT 5`,
    [clientId, ['movement', 'composite']]
  )
  const overrideIntelligence = buildOverrideIntelligenceSummary(
    intelligencePayloads.map(item => item.protocol_payload)
  )

  return {
    protocol: {
      ...buildBaseProtocolSummary(protocol),
      sessionStructure,
      adjustedSessionStructure: movementView.adjustedStructure,
      displayBlocks: movementView.displayBlocks,
      activeOverrides: movementView.activeOverrides,
      executionLog,
    },
    history,
    changeLog,
    overrideIntelligence,
  }
}

export async function loadNutritionWorkspace(clientId: string): Promise<NutritionWorkspaceData> {
  const protocol = await getActiveProtocolRow(clientId, 'nutrition')
  const history = await getProtocolHistory(clientId, 'nutrition')

  if (!protocol) {
    return { protocol: null, history, changeLog: [] }
  }

  const payload = asRecord(protocol.protocol_payload)
  const nutritionStructure = deriveNutritionStructure(protocol)
  const overrides = sanitizeProtocolOverrides([
    ...asArray(payload.movementOverrides),
    ...asArray(payload.nutritionOverrides),
  ])
  const nutritionView = applyNutritionOverrides(nutritionStructure, overrides)
  const changeLog = await getChangeLog(protocol.id)

  return {
    protocol: {
      ...buildBaseProtocolSummary(protocol),
      nutritionStructure,
      adjustedNutritionStructure: nutritionView.adjustedStructure,
      activeOverrides: nutritionView.activeOverrides,
    },
    history,
    changeLog,
  }
}

type SaveOverrideInput = {
  clientId: string
  protocolId: string
  section: 'movement' | 'nutrition'
  target: string
  change: Record<string, unknown>
  reason: string
  createdBy: string
}

type SaveExecutionLogInput = {
  clientId: string
  protocolId: string
  exerciseId: string
  exerciseName: string
  completedSessions?: number | null
  completedSets?: number | null
  completedReps?: string | null
  load?: string | null
  notes?: string | null
  createdBy: string
}

type RevertOverrideInput = {
  clientId: string
  protocolId: string
  section: 'movement' | 'nutrition'
  overrideId: string
  revertedBy: string
  reason?: string | null
}

function createNutritionDelta(
  target: string,
  change: Record<string, unknown>,
  nutritionStructure: NutritionStructure | null
) {
  if (!nutritionStructure) return {}

  if (target === 'macro') {
    const delta: Record<string, unknown> = {}
    const numericFields: Array<keyof NutritionStructure> = ['dailyCalories', 'proteinG', 'carbG', 'fatG', 'mealFrequency']

    for (const field of numericFields) {
      if (typeof change[field] === 'number' && typeof nutritionStructure[field] === 'number') {
        delta[field] = (change[field] as number) - (nutritionStructure[field] as number)
      }
    }

    if (typeof change.mealTiming === 'string' && typeof nutritionStructure.mealTiming === 'string') {
      delta.mealTiming = { from: nutritionStructure.mealTiming, to: change.mealTiming }
    }

    if (typeof change.complexityLevel === 'string' && typeof nutritionStructure.complexityLevel === 'string') {
      delta.complexityLevel = { from: nutritionStructure.complexityLevel, to: change.complexityLevel }
    }

    return delta
  }

  if (target.startsWith('mealPlan:')) {
    const index = Number(target.split(':')[1] ?? -1)
    const meal = nutritionStructure.mealPlan?.[index]
    if (!meal) return {}

    const delta: Record<string, unknown> = {}
    for (const key of ['time', 'meal', 'foods', 'notes'] as const) {
      if (typeof change[key] === 'string') {
        delta[key] = { from: meal[key] ?? '', to: change[key] }
      }
    }
    return delta
  }

  return {}
}

async function appendChangeLog(protocolId: string, clientId: string, performedBy: string, summary: string, payloadDiff: Record<string, unknown>) {
  try {
    const columns = await getTableColumnSet('protocol_change_log')
    if (!columns.has('protocol_id')) return

    await db.query(
      `INSERT INTO protocol_change_log (protocol_id, client_id, action, performed_by, change_summary, payload_diff)
       VALUES ($1, $2, 'coach_modified', $3, $4, $5)`,
      [protocolId, clientId, performedBy, summary, JSON.stringify(payloadDiff)]
    )
  } catch (error) {
    console.error('Unable to append protocol change log entry', error)
  }
}

export async function saveProtocolOverride(input: SaveOverrideInput) {
  return db.transaction(async client => {
    const current = await client.query(
      `SELECT protocol_payload,
              calorie_target,
              protein_target_g,
              carb_target_g,
              fat_target_g,
              meal_frequency,
              nutrition_complexity
       FROM protocols
       WHERE id = $1 AND client_id = $2
       FOR UPDATE`,
      [input.protocolId, input.clientId]
    )

    const row = current.rows[0]
    if (!row) throw new Error('Protocol not found')

    const payload = asRecord(row.protocol_payload)
    const key = input.section === 'movement' ? 'movementOverrides' : 'nutritionOverrides'
    const overrides = sanitizeProtocolOverrides(payload[key])
    const timestamp = new Date().toISOString()
    const protocolOverride: ProtocolOverride = {
      id: crypto.randomUUID(),
      protocol_id: input.protocolId,
      section: input.section,
      target: input.target,
      change: input.change,
      reason: input.reason,
      created_by: input.createdBy,
      timestamp,
      coach_note: input.reason,
    }

    if (input.section === 'nutrition') {
      const nutritionStructure = deriveNutritionStructure({
        ...row,
        id: input.protocolId,
        client_id: input.clientId,
        version: 0,
        is_active: true,
        name: '',
        protocol_type: 'nutrition',
        stage: '',
        generation_state: null,
        sessions_per_week: null,
        session_frequency: null,
        complexity_ceiling: null,
        volume_target: null,
        effective_date: '',
        created_at: '',
        generated_by: null,
        notes: null,
        coach_notes: null,
        protocol_payload: payload,
        activation_block: null,
        primary_block: null,
        accessory_block: null,
        finisher_block: null,
      } as ProtocolRow)

      protocolOverride.change = {
        ...input.change,
        delta: createNutritionDelta(input.target, input.change, nutritionStructure),
      }
    }

    overrides.push(protocolOverride)
    payload[key] = overrides

    await client.query(
      `UPDATE protocols
       SET protocol_payload = $1
       WHERE id = $2 AND client_id = $3`,
      [JSON.stringify(payload), input.protocolId, input.clientId]
    )

    return protocolOverride
  }).then(async override => {
    await appendChangeLog(
      input.protocolId,
      input.clientId,
      input.createdBy,
      `${input.section} override applied to ${input.target}`,
      {
        section: input.section,
        target: input.target,
        overrideId: override.id,
        change: override.change,
        reason: input.reason,
      }
    )

    return override
  })
}

export async function revertProtocolOverride(input: RevertOverrideInput) {
  return db.transaction(async client => {
    const current = await client.query(
      `SELECT protocol_payload
       FROM protocols
       WHERE id = $1 AND client_id = $2
       FOR UPDATE`,
      [input.protocolId, input.clientId]
    )

    const row = current.rows[0]
    if (!row) throw new Error('Protocol not found')

    const payload = asRecord(row.protocol_payload)
    const key = input.section === 'movement' ? 'movementOverrides' : 'nutritionOverrides'
    const overrides = sanitizeProtocolOverrides(payload[key])
    const index = overrides.findIndex(override => override.id === input.overrideId)

    if (index === -1) throw new Error('Override not found')

    const timestamp = new Date().toISOString()
    overrides[index] = {
      ...overrides[index],
      reverted_at: timestamp,
      reverted_by: input.revertedBy,
      revert_reason: input.reason ?? 'Reverted to protocol defaults',
    }

    payload[key] = overrides

    await client.query(
      `UPDATE protocols
       SET protocol_payload = $1
       WHERE id = $2 AND client_id = $3`,
      [JSON.stringify(payload), input.protocolId, input.clientId]
    )

    return overrides[index]
  }).then(async override => {
    await appendChangeLog(
      input.protocolId,
      input.clientId,
      input.revertedBy,
      `${input.section} override reverted for ${override.target}`,
      {
        section: input.section,
        target: override.target,
        overrideId: override.id,
        revertedAt: override.reverted_at,
        revertReason: override.revert_reason,
      }
    )

    return override
  })
}

export async function saveMovementExecutionLog(input: SaveExecutionLogInput) {
  return db.transaction(async client => {
    const current = await client.query(
      `SELECT protocol_payload
       FROM protocols
       WHERE id = $1 AND client_id = $2
       FOR UPDATE`,
      [input.protocolId, input.clientId]
    )

    const row = current.rows[0]
    if (!row) throw new Error('Protocol not found')

    const payload = asRecord(row.protocol_payload)
    const log = sanitizeExecutionLog(payload.movementExecutionLog)
    const entry: MovementExecutionLogEntry = {
      id: crypto.randomUUID(),
      protocol_id: input.protocolId,
      section: 'movement',
      exercise_id: input.exerciseId,
      exercise_name: input.exerciseName,
      completed_sessions: input.completedSessions ?? null,
      completed_sets: input.completedSets ?? null,
      completed_reps: input.completedReps ?? null,
      load: input.load ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy,
      timestamp: new Date().toISOString(),
    }

    log.unshift(entry)
    payload.movementExecutionLog = log

    await client.query(
      `UPDATE protocols
       SET protocol_payload = $1
       WHERE id = $2 AND client_id = $3`,
      [JSON.stringify(payload), input.protocolId, input.clientId]
    )

    return entry
  }).then(async entry => {
    await appendChangeLog(
      input.protocolId,
      input.clientId,
      input.createdBy,
      `movement execution logged for ${input.exerciseName}`,
      {
        exerciseId: input.exerciseId,
        exerciseName: input.exerciseName,
        completedSessions: input.completedSessions ?? null,
        completedSets: input.completedSets ?? null,
        completedReps: input.completedReps ?? null,
        load: input.load ?? null,
      }
    )

    return entry
  })
}
