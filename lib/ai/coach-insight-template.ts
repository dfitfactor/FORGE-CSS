export type CoachHealthInsightTemplate = {
  redFlagsMedicalBaseline: string[]
  workingAssessment: string[]
  phaseAndIntent: string
  minimalInterventionSet: string[]
  monitoringPlan: string[]
  decisionRules: string[]
  disclaimer: string
}

export const COACH_INSIGHT_TEMPLATE_SECTION_TITLES = [
  'Red flags / medical baseline',
  'Working assessment',
  'Phase + intent',
  'Minimal intervention set',
  'Monitoring plan',
  'Decision rules',
  'Disclaimer',
] as const

export function buildCoachInsightTemplateInstructions() {
  return `HEALTH COACHING OUTPUT TEMPLATE:
- Red flags / medical baseline: note urgent referral triggers, medication or supplement interaction concerns, pregnancy considerations, and when coach should escalate.
- Working assessment: rank the top drivers or gates blocking progress.
- Phase + intent: explicitly state Regulation, Restoration, or Optimization and why that phase fits.
- Minimal intervention set: include only the smallest effective set across nutrition, training, recovery, mind-body work, and supplements when appropriate. Hold unnecessary variables constant.
- Monitoring plan: define weekly metrics plus any labs, vitals, or follow-up timing if relevant.
- Decision rules: specify when to adjust, hold, pause, escalate, or refer.
- Disclaimer: educational coaching guidance only, not medical advice.

Use the template as an internal and coach-facing lens even when the final response schema is compact. Safety, coherence, and sustainability outrank novelty.`
}

