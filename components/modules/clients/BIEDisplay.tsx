'use client'

import { BIEVariables, THRESHOLDS } from '@/lib/bie-engine'

type BIEDisplayProps = {
  variables: Partial<BIEVariables>
  generationState?: string
  compact?: boolean
}

type VariableConfig = {
  key: keyof BIEVariables
  label: string
  description: string
  invertColor?: boolean  // high = bad (BLI, DBI, CDI)
  thresholds: { danger: number; warning: number; good: number }
}

const VARIABLE_CONFIGS: VariableConfig[] = [
  {
    key: 'bar',
    label: 'BAR',
    description: 'Behavioral Adherence Rate',
    thresholds: { danger: 50, warning: 65, good: 80 },
  },
  {
    key: 'bli',
    label: 'BLI',
    description: 'Behavioral Load Index',
    invertColor: true,
    thresholds: { danger: 70, warning: 50, good: 30 },
  },
  {
    key: 'dbi',
    label: 'DBI',
    description: 'Decision Burden Index',
    invertColor: true,
    thresholds: { danger: 70, warning: 50, good: 30 },
  },
  {
    key: 'cdi',
    label: 'CDI',
    description: 'Cognitive Demand Index',
    invertColor: true,
    thresholds: { danger: 70, warning: 50, good: 30 },
  },
  {
    key: 'lsi',
    label: 'LSI',
    description: 'Lifestyle Stability Index',
    thresholds: { danger: 30, warning: 50, good: 70 },
  },
  {
    key: 'pps',
    label: 'PPS',
    description: 'Progression Probability Score',
    thresholds: { danger: 30, warning: 50, good: 70 },
  },
]

function getBarColor(value: number, config: VariableConfig): string {
  const { thresholds, invertColor } = config
  
  if (invertColor) {
    if (value >= thresholds.danger) return 'bg-state-recovery'
    if (value >= thresholds.warning) return 'bg-state-simplified'
    return 'bg-state-stable'
  } else {
    if (value >= thresholds.good) return 'bg-state-stable'
    if (value >= thresholds.warning) return 'bg-state-simplified'
    return 'bg-state-recovery'
  }
}

function getTextColor(value: number, config: VariableConfig): string {
  const { thresholds, invertColor } = config
  
  if (invertColor) {
    if (value >= thresholds.danger) return 'text-state-recovery'
    if (value >= thresholds.warning) return 'text-state-simplified'
    return 'text-state-stable'
  } else {
    if (value >= thresholds.good) return 'text-state-stable'
    if (value >= thresholds.warning) return 'text-state-simplified'
    return 'text-state-recovery'
  }
}

const STATE_CONFIG = {
  A: { label: 'Stable Progression', color: 'state-badge-a', dot: 'bg-state-stable' },
  B: { label: 'Consolidation', color: 'state-badge-b', dot: 'bg-state-consolidation' },
  C: { label: 'Simplified Load', color: 'state-badge-c', dot: 'bg-state-simplified' },
  D: { label: 'Recovery / Disruption', color: 'state-badge-d', dot: 'bg-state-recovery' },
  E: { label: 'Rebuild / Re-entry', color: 'state-badge-e', dot: 'bg-state-rebuild' },
}

export function BIEDisplay({ variables, generationState, compact = false }: BIEDisplayProps) {
  const stateInfo = generationState && generationState in STATE_CONFIG
    ? STATE_CONFIG[generationState as keyof typeof STATE_CONFIG]
    : null

  if (compact) {
    return (
      <div className="space-y-2">
        {generationState && stateInfo && (
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full ${stateInfo.dot}`} />
            <span className={`forge-badge ${stateInfo.color}`}>
              State {generationState}: {stateInfo.label}
            </span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {VARIABLE_CONFIGS.map((config) => {
            const value = variables[config.key]
            if (value === undefined || value === null) return null
            const numValue = Number(value)
            
            return (
              <div key={config.key} className="bg-forge-surface-3 rounded-lg p-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-mono text-forge-text-muted">{config.label}</span>
                  <span className={`text-xs font-bold ${getTextColor(numValue, config)}`}>
                    {numValue.toFixed(0)}
                  </span>
                </div>
                <div className="bie-bar">
                  <div
                    className={`bie-bar-fill ${getBarColor(numValue, config)}`}
                    style={{ width: `${numValue}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Generation State */}
      {generationState && stateInfo && (
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${stateInfo.color}`}>
          <div className={`w-2.5 h-2.5 rounded-full ${stateInfo.dot} animate-pulse`} />
          <span className="font-medium text-sm">
            State {generationState}: {stateInfo.label}
          </span>
        </div>
      )}

      {/* Variable bars */}
      <div className="space-y-3">
        {VARIABLE_CONFIGS.map((config) => {
          const value = variables[config.key]
          if (value === undefined || value === null) return null
          const numValue = Number(value)
          const barColor = getBarColor(numValue, config)
          const textColor = getTextColor(numValue, config)
          
          return (
            <div key={config.key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-forge-text-secondary w-8">
                    {config.label}
                  </span>
                  <span className="text-xs text-forge-text-muted">{config.description}</span>
                </div>
                <span className={`text-sm font-bold font-mono ${textColor}`}>
                  {numValue.toFixed(1)}
                </span>
              </div>
              <div className="bie-bar h-2.5">
                <div
                  className={`bie-bar-fill ${barColor} transition-all duration-700`}
                  style={{ width: `${numValue}%` }}
                />
              </div>
              {/* Threshold markers */}
              <div className="relative h-1 mt-0.5">
                {!config.invertColor ? (
                  <>
                    <div className="absolute top-0 h-2 w-0.5 bg-forge-text-muted/30" style={{ left: `${config.thresholds.warning}%` }} />
                    <div className="absolute top-0 h-2 w-0.5 bg-forge-text-muted/30" style={{ left: `${config.thresholds.good}%` }} />
                  </>
                ) : (
                  <>
                    <div className="absolute top-0 h-2 w-0.5 bg-forge-text-muted/30" style={{ left: `${config.thresholds.good}%` }} />
                    <div className="absolute top-0 h-2 w-0.5 bg-forge-text-muted/30" style={{ left: `${config.thresholds.warning}%` }} />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
