/**
 * FORGË Behavioral Intelligence Engine
 * Core computation layer for behavioral variables and generation state
 */

export type BIEVariables = {
  bar: number   // Behavioral Adherence Rate (0-100)
  bli: number   // Behavioral Load Index (0-100)
  dbi: number   // Decision Burden Index (0-100)
  cdi: number   // Cognitive Demand Index (0-100)
  lsi: number   // Lifestyle Stability Index (0-100)
  cLsi: number  // Composite LSI (0-100)
  pps: number   // Progression Probability Score (0-100)
}

export type GenerationState = 'A' | 'B' | 'C' | 'D' | 'E'
export type GenerationStateLabel =
  | 'Stable Progression'
  | 'Consolidation'
  | 'Simplified Load'
  | 'Recovery / Disruption'
  | 'Rebuild / Re-entry'

export type VolumeLevel = 'full' | 'moderate' | 'reduced' | 'minimum_viable'

export type ForgeStage =
  | 'foundations'
  | 'optimization'
  | 'resilience'
  | 'growth'
  | 'empowerment'

export type ComplexityTier = 1 | 2 | 3 | 4 | 5

// ─── Thresholds ────────────────────────────────────────────────

export const THRESHOLDS = {
  BAR: {
    HIGH: 80,         // Progression eligible
    ACCEPTABLE: 65,   // Consolidation
    MODERATE: 50,     // Maintenance
    LOW: 35,          // Recovery
    CRITICAL: 20,     // Minimum viable only
  },
  BLI: {
    SUSTAINABLE: 30,
    MODERATE: 50,
    ELEVATED: 70,
    CRITICAL: 85,
  },
  DBI: {
    LOW: 30,
    MODERATE: 50,
    HIGH: 70,
    CRITICAL: 85,
  },
  CDI: {
    LOW: 30,
    MODERATE: 50,
    HIGH: 70,
  },
  PPS: {
    PROGRESSION: 70,
    CONSOLIDATION: 50,
    REGRESSION_FLOOR: 30,
  },
} as const

// ─── Generation State Computation ──────────────────────────────

export function computeGenerationState(vars: BIEVariables): {
  state: GenerationState
  label: GenerationStateLabel
  rationale: string
} {
  const { bar, bli, dbi, cLsi, pps } = vars

  // State E — Rebuild / Re-entry (takes highest precedence after safety)
  // Handled externally for new users / post-regression

  // State D — Recovery / Disruption Mode
  if (
    dbi >= THRESHOLDS.DBI.HIGH ||
    (cLsi <= 30 && dbi >= THRESHOLDS.DBI.MODERATE)
  ) {
    return {
      state: 'D',
      label: 'Recovery / Disruption',
      rationale: `DBI ${dbi.toFixed(0)} (${dbi >= THRESHOLDS.DBI.CRITICAL ? 'critical' : 'high'}) triggers recovery mode`,
    }
  }

  // State C — Simplified Load
  if (
    bli >= THRESHOLDS.BLI.ELEVATED ||
    (bar < THRESHOLDS.BAR.ACCEPTABLE && bar >= THRESHOLDS.BAR.LOW) ||
    dbi >= THRESHOLDS.DBI.MODERATE
  ) {
    return {
      state: 'C',
      label: 'Simplified Load',
      rationale: `Elevated BLI (${bli.toFixed(0)}) or declining BAR (${bar.toFixed(0)}) requires load reduction`,
    }
  }

  // State B — Consolidation
  if (bar >= THRESHOLDS.BAR.ACCEPTABLE && pps < THRESHOLDS.PPS.PROGRESSION) {
    return {
      state: 'B',
      label: 'Consolidation',
      rationale: `BAR acceptable (${bar.toFixed(0)}) but PPS (${pps.toFixed(0)}) below progression threshold`,
    }
  }

  // State A — Stable Progression
  if (
    bar >= THRESHOLDS.BAR.HIGH &&
    bli < THRESHOLDS.BLI.ELEVATED &&
    dbi < THRESHOLDS.DBI.LOW &&
    pps >= THRESHOLDS.PPS.PROGRESSION
  ) {
    return {
      state: 'A',
      label: 'Stable Progression',
      rationale: `All indicators optimal: BAR ${bar.toFixed(0)}, BLI ${bli.toFixed(0)}, DBI ${dbi.toFixed(0)}, PPS ${pps.toFixed(0)}`,
    }
  }

  // Default — Consolidation
  return {
    state: 'B',
    label: 'Consolidation',
    rationale: `Mixed signals — defaulting to consolidation for behavioral safety`,
  }
}

// ─── Volume Level ───────────────────────────────────────────────

export function computeVolumeLevel(state: GenerationState): VolumeLevel {
  const map: Record<GenerationState, VolumeLevel> = {
    A: 'full',
    B: 'moderate',
    C: 'reduced',
    D: 'minimum_viable',
    E: 'minimum_viable',
  }
  return map[state]
}

// ─── Complexity Ceiling ─────────────────────────────────────────

export function computeComplexityCeiling(
  stage: ForgeStage,
  state: GenerationState,
  cdi: number,
  hasPainFlag: boolean = false
): ComplexityTier {
  const stageCeilings: Record<ForgeStage, ComplexityTier> = {
    foundations: 2,
    optimization: 3,
    resilience: 4,
    growth: 4,
    empowerment: 5,
  }

  let ceiling = stageCeilings[stage]

  // State overrides
  if (state === 'D' || state === 'E') ceiling = Math.min(ceiling, 2) as ComplexityTier
  if (state === 'C') ceiling = Math.max(1, ceiling - 1) as ComplexityTier

  // CDI ceiling
  if (cdi >= THRESHOLDS.CDI.HIGH) ceiling = Math.min(ceiling, 2) as ComplexityTier
  else if (cdi >= THRESHOLDS.CDI.MODERATE) ceiling = Math.min(ceiling, 3) as ComplexityTier

  // Pain flag — reduces to Tier 1 (handled per pattern, this is global floor)
  if (hasPainFlag) ceiling = Math.min(ceiling, 2) as ComplexityTier

  return ceiling as ComplexityTier
}

// ─── BAR Computation ────────────────────────────────────────────

export type AdherenceWeekData = {
  plannedSessions: number
  completedSessions: number
  partialSessions: number
  plannedNutritionDays: number
  loggedNutritionDays: number
  checkInsCompleted: number
  checkInsPlanned: number
}

export function computeBAR(data: AdherenceWeekData): number {
  const { 
    plannedSessions, completedSessions, partialSessions,
    plannedNutritionDays, loggedNutritionDays,
    checkInsCompleted, checkInsPlanned
  } = data

  if (plannedSessions === 0 && plannedNutritionDays === 0) return 50

  let score = 0
  let weights = 0

  // Session adherence (weight: 0.5)
  if (plannedSessions > 0) {
    const sessionScore = ((completedSessions + (partialSessions * 0.5)) / plannedSessions) * 100
    score += sessionScore * 0.5
    weights += 0.5
  }

  // Nutrition adherence (weight: 0.3)
  if (plannedNutritionDays > 0) {
    const nutritionScore = (loggedNutritionDays / plannedNutritionDays) * 100
    score += nutritionScore * 0.3
    weights += 0.3
  }

  // Check-in adherence (weight: 0.2)
  if (checkInsPlanned > 0) {
    const checkInScore = (checkInsCompleted / checkInsPlanned) * 100
    score += checkInScore * 0.2
    weights += 0.2
  }

  if (weights === 0) return 50
  return Math.min(100, Math.max(0, score / weights))
}

// ─── Progression Eligibility ────────────────────────────────────

export type ProgressionCheck = {
  eligible: boolean
  direction: 'advance' | 'hold' | 'regress'
  reasons: string[]
}

export function checkProgressionEligibility(
  vars: BIEVariables,
  currentStage: ForgeStage,
  weeksInStage: number
): ProgressionCheck {
  const reasons: string[] = []

  // Regression check — takes priority
  if (vars.bar < THRESHOLDS.BAR.LOW && vars.dbi >= THRESHOLDS.DBI.HIGH) {
    return {
      eligible: true,
      direction: 'regress',
      reasons: [`BAR critically low (${vars.bar.toFixed(0)}) with high DBI (${vars.dbi.toFixed(0)})`]
    }
  }

  // Advancement check
  const advancementCriteria = [
    { met: vars.bar >= THRESHOLDS.BAR.HIGH, desc: `BAR ≥ ${THRESHOLDS.BAR.HIGH} (current: ${vars.bar.toFixed(0)})` },
    { met: vars.pps >= THRESHOLDS.PPS.PROGRESSION, desc: `PPS ≥ ${THRESHOLDS.PPS.PROGRESSION} (current: ${vars.pps.toFixed(0)})` },
    { met: vars.dbi < THRESHOLDS.DBI.MODERATE, desc: `DBI < ${THRESHOLDS.DBI.MODERATE} (current: ${vars.dbi.toFixed(0)})` },
    { met: vars.lsi >= 50, desc: `LSI stable (current: ${vars.lsi.toFixed(0)})` },
    { met: weeksInStage >= getMinWeeksForStage(currentStage), desc: `Minimum weeks in stage: ${weeksInStage}/${getMinWeeksForStage(currentStage)}` },
  ]

  const metCriteria = advancementCriteria.filter(c => c.met)
  const unmetCriteria = advancementCriteria.filter(c => !c.met)

  if (unmetCriteria.length === 0) {
    return {
      eligible: true,
      direction: 'advance',
      reasons: advancementCriteria.map(c => `✓ ${c.desc}`)
    }
  }

  return {
    eligible: false,
    direction: 'hold',
    reasons: [
      ...metCriteria.map(c => `✓ ${c.desc}`),
      ...unmetCriteria.map(c => `✗ ${c.desc}`)
    ]
  }
}

function getMinWeeksForStage(stage: ForgeStage): number {
  const map: Record<ForgeStage, number> = {
    foundations: 4,
    optimization: 6,
    resilience: 6,
    growth: 8,
    empowerment: 8,
  }
  return map[stage]
}

// ─── Signal Extraction from Journal ────────────────────────────

export type JournalSignals = {
  dbi_signal: number | null  // 0-100, higher = more disruption/burden
  lsi_signal: number | null  // 0-100, higher = more stability
  cdi_signal: number | null  // 0-100, higher = more cognitive demand
  flags: string[]
}

export function extractSignalsFromCheckIn(data: {
  sleepHours?: number
  sleepQuality?: number
  stressLevel?: number
  energyLevel?: number
  mood?: number
  travelFlag?: boolean
  illnessFlag?: boolean
  workStressFlag?: boolean
  familyStressFlag?: boolean
}): JournalSignals {
  const flags: string[] = []
  let dbiSignal = 50 // neutral baseline
  let lsiSignal = 50
  let cdiSignal = 50

  // Stress → DBI
  if (data.stressLevel) {
    dbiSignal += (data.stressLevel - 3) * 10
    if (data.stressLevel >= 4) flags.push('elevated_stress')
  }

  // Sleep quality → LSI, CDI
  if (data.sleepQuality) {
    const sleepImpact = (data.sleepQuality - 3) * 8
    lsiSignal += sleepImpact
    cdiSignal -= sleepImpact * 0.5
  }

  // Sleep hours → CDI
  if (data.sleepHours !== undefined) {
    if (data.sleepHours < 6) { cdiSignal += 20; flags.push('sleep_deprivation') }
    else if (data.sleepHours < 7) cdiSignal += 10
    else if (data.sleepHours >= 8) cdiSignal -= 10
  }

  // Energy → BLI proxy
  if (data.energyLevel) {
    if (data.energyLevel <= 2) { dbiSignal += 15; flags.push('low_energy') }
  }

  // Disruption flags
  if (data.travelFlag) { dbiSignal += 20; lsiSignal -= 20; flags.push('travel') }
  if (data.illnessFlag) { dbiSignal += 30; lsiSignal -= 25; flags.push('illness') }
  if (data.workStressFlag) { dbiSignal += 15; cdiSignal += 15; flags.push('work_stress') }
  if (data.familyStressFlag) { dbiSignal += 15; cdiSignal += 10; flags.push('family_stress') }

  return {
    dbi_signal: Math.min(100, Math.max(0, dbiSignal)),
    lsi_signal: Math.min(100, Math.max(0, lsiSignal)),
    cdi_signal: Math.min(100, Math.max(0, cdiSignal)),
    flags,
  }
}

// ─── PPS Computation ────────────────────────────────────────────

export function computePPS(
  bar: number,
  bli: number,
  dbi: number,
  lsi: number,
  weeksConsistentBAR: number
): number {
  // PPS is a weighted composite of readiness indicators
  let pps = 0
  pps += (bar / 100) * 35          // BAR has highest weight (35%)
  pps += ((100 - dbi) / 100) * 25  // DBI inverted (25%)
  pps += ((100 - bli) / 100) * 20  // BLI inverted (20%)
  pps += (lsi / 100) * 15          // LSI (15%)
  pps += Math.min(weeksConsistentBAR, 4) / 4 * 5  // Consistency bonus (5%)

  return Math.min(100, Math.max(0, pps * 100))
}
