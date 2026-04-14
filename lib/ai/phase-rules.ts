import type { BIEVariables, ForgeStage, GenerationState } from '@/lib/bie-engine'
import { THRESHOLDS } from '@/lib/bie-engine'

export type HealthCoachingPhase = 'regulation' | 'restoration' | 'optimization'

export type HealthCoachingPhaseRecommendation = {
  phase: HealthCoachingPhase
  intent: string
  rationale: string
  primaryDrivers: string[]
  holdConstant: string[]
  monitoringFocus: string[]
}

type ResolveHealthPhaseInput = {
  bie: BIEVariables
  generationState: GenerationState
  currentStage?: ForgeStage | null
}

function dedupe(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

export function resolveHealthCoachingPhase(
  input: ResolveHealthPhaseInput
): HealthCoachingPhaseRecommendation {
  const { bie, generationState, currentStage } = input
  const drivers: string[] = []

  if (generationState === 'D' || generationState === 'E') {
    drivers.push(`Generation state ${generationState} indicates recovery or re-entry conditions`)
  }
  if (bie.bar < THRESHOLDS.BAR.MODERATE) {
    drivers.push(`BAR ${bie.bar.toFixed(0)} shows adherence instability`)
  }
  if (bie.bli >= THRESHOLDS.BLI.ELEVATED) {
    drivers.push(`BLI ${bie.bli.toFixed(0)} suggests elevated life or training load`)
  }
  if (bie.dbi >= THRESHOLDS.DBI.HIGH) {
    drivers.push(`DBI ${bie.dbi.toFixed(0)} suggests decision fatigue and friction`)
  }
  if (bie.cdi >= THRESHOLDS.CDI.HIGH) {
    drivers.push(`CDI ${bie.cdi.toFixed(0)} suggests cognitive overload`)
  }
  if (bie.lsi < 50) {
    drivers.push(`LSI ${bie.lsi.toFixed(0)} suggests inconsistent routines or recovery anchors`)
  }
  if (bie.pps < THRESHOLDS.PPS.CONSOLIDATION) {
    drivers.push(`PPS ${bie.pps.toFixed(0)} does not support aggressive progression`)
  }

  if (
    generationState === 'D' ||
    generationState === 'E' ||
    bie.bar < THRESHOLDS.BAR.MODERATE ||
    bie.dbi >= THRESHOLDS.DBI.HIGH ||
    bie.bli >= THRESHOLDS.BLI.ELEVATED ||
    bie.cdi >= THRESHOLDS.CDI.HIGH
  ) {
    return {
      phase: 'regulation',
      intent: 'Reduce the energetic cost of living, stabilize physiology, and lower behavior friction before chasing downstream optimization.',
      rationale: 'Upstream instability is present. Recovery capacity, nervous system regulation, and adherence must improve before adding complexity or intensity.',
      primaryDrivers: dedupe(
        drivers.length > 0
          ? drivers
          : ['Behavioral and recovery instability require a regulation-first phase']
      ),
      holdConstant: [
        'Keep training simple and technique-driven',
        'Avoid aggressive calorie deficits or rapid progression',
        'Keep supplement strategy conservative and safety-first',
      ],
      monitoringFocus: [
        'Energy, sleep quality, stress, and session completion',
        'Meal consistency, hydration, and appetite regularity',
        'Any red flags that require medical referral',
      ],
    }
  }

  if (
    generationState === 'B' ||
    generationState === 'C' ||
    bie.bar < THRESHOLDS.BAR.HIGH ||
    bie.dbi >= THRESHOLDS.DBI.MODERATE ||
    bie.bli >= THRESHOLDS.BLI.MODERATE ||
    bie.pps < THRESHOLDS.PPS.PROGRESSION ||
    currentStage === 'foundations'
  ) {
    return {
      phase: 'restoration',
      intent: 'Rebuild consistency, restore repeatable recovery patterns, and create a stable base that can tolerate progression.',
      rationale: 'The client has enough stability to build, but not enough to justify full optimization. Restore routine quality before adding more demand.',
      primaryDrivers: dedupe(
        drivers.length > 0
          ? drivers
          : ['Signals support rebuilding consistency and recovery before optimization']
      ),
      holdConstant: [
        'Keep exercise selection mostly stable while execution quality improves',
        'Use modest nutritional structure instead of frequent target changes',
        'Prioritize repeatability over novelty',
      ],
      monitoringFocus: [
        'Weekly adherence trend and recovery quality',
        'Performance stability, mood, and disruption frequency',
        'Body composition or symptom trends without overreacting to single data points',
      ],
    }
  }

  return {
    phase: 'optimization',
    intent: 'Progress body composition, strength, performance, and resilience while protecting adherence and recovery stability.',
    rationale: 'Upstream stability is strong enough to support deliberate optimization. Progress can be earned without abandoning safeguards.',
    primaryDrivers: dedupe(
      drivers.length > 0
        ? drivers
        : [
            `BAR ${bie.bar.toFixed(0)} and PPS ${bie.pps.toFixed(0)} support forward progress`,
            'Load, recovery, and decision burden are stable enough for optimization',
          ]
    ),
    holdConstant: [
      'Protect sleep, protein, hydration, and recovery anchors',
      'Only increase one major training or nutrition lever at a time',
      'Do not trade consistency for novelty',
    ],
    monitoringFocus: [
      'Performance trend, waist or weight trend, and recovery quality',
      'Subjective readiness versus objective progress markers',
      'Early signs of overload, friction, or regression',
    ],
  }
}

export function formatHealthPhaseForPrompt(
  recommendation: HealthCoachingPhaseRecommendation
) {
  return `HEALTH COACHING PHASE:
- Phase: ${recommendation.phase.toUpperCase()}
- Intent: ${recommendation.intent}
- Rationale: ${recommendation.rationale}
- Primary drivers: ${recommendation.primaryDrivers.join('; ')}
- Hold constant: ${recommendation.holdConstant.join('; ')}
- Monitoring focus: ${recommendation.monitoringFocus.join('; ')}`
}

