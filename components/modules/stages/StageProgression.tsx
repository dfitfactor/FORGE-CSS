'use client'

import { ForgeStage } from '@/lib/bie-engine'
import { ChevronRight, Lock, CheckCircle, Circle } from 'lucide-react'

type StageConfig = {
  id: ForgeStage
  label: string
  description: string
  color: string
  bgColor: string
  borderColor: string
}

const STAGES: StageConfig[] = [
  {
    id: 'foundations',
    label: 'Foundation',
    description: 'Pattern mastery & habit formation',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  {
    id: 'optimization',
    label: 'Optimization',
    description: 'Progressive overload & energy',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  {
    id: 'resilience',
    label: 'Resilience',
    description: 'Whole-body adaptation & stress handling',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
  },
  {
    id: 'growth',
    label: 'Growth',
    description: 'Performance development & mastery',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  {
    id: 'empowerment',
    label: 'Empowerment',
    description: 'Autonomous excellence & legacy',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
]

type StageProgressionProps = {
  currentStage: ForgeStage
  weeksInStage?: number
  barScore?: number
  ppsScore?: number
  compact?: boolean
}

export function StageProgression({
  currentStage,
  weeksInStage,
  barScore,
  ppsScore,
  compact = false,
}: StageProgressionProps) {
  const currentIndex = STAGES.findIndex(s => s.id === currentStage)

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {STAGES.map((stage, index) => {
          const isPast = index < currentIndex
          const isCurrent = index === currentIndex
          const config = STAGES[index]
          
          return (
            <div key={stage.id} className="flex items-center gap-1">
              <div className={`
                flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-all
                ${isCurrent ? `${config.bgColor} ${config.borderColor} ${config.color}` : ''}
                ${isPast ? 'bg-forge-surface-3 border-forge-border text-forge-text-muted' : ''}
                ${!isCurrent && !isPast ? 'bg-forge-surface border-forge-border/50 text-forge-text-muted/50' : ''}
              `}>
                {isPast ? <CheckCircle className="w-3 h-3" /> : 
                 isCurrent ? <Circle className="w-3 h-3 fill-current" /> : 
                 <Lock className="w-3 h-3" />}
                {stage.label}
              </div>
              {index < STAGES.length - 1 && (
                <ChevronRight className="w-3 h-3 text-forge-text-muted/30 flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stage steps */}
      <div className="relative">
        {/* Connection line */}
        <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-forge-border" />
        
        <div className="space-y-3">
          {STAGES.map((stage, index) => {
            const isPast = index < currentIndex
            const isCurrent = index === currentIndex
            const isFuture = index > currentIndex
            const config = stage

            return (
              <div key={stage.id} className={`
                relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200
                ${isCurrent ? `${config.bgColor} ${config.borderColor} glow-purple` : ''}
                ${isPast ? 'bg-forge-surface-3 border-forge-border' : ''}
                ${isFuture ? 'bg-forge-surface border-forge-border/50 opacity-60' : ''}
              `}>
                {/* Stage indicator */}
                <div className={`
                  relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2
                  ${isCurrent ? `${config.bgColor} ${config.borderColor}` : ''}
                  ${isPast ? 'bg-state-stable/20 border-state-stable/50' : ''}
                  ${isFuture ? 'bg-forge-surface-3 border-forge-border/50' : ''}
                `}>
                  {isPast ? (
                    <CheckCircle className="w-5 h-5 text-state-stable" />
                  ) : isCurrent ? (
                    <div className={`w-3 h-3 rounded-full ${config.color} bg-current animate-pulse`} />
                  ) : (
                    <span className="text-xs font-bold text-forge-text-muted">{index + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`font-semibold text-sm ${isCurrent ? config.color : isPast ? 'text-forge-text-secondary' : 'text-forge-text-muted'}`}>
                      {stage.label}
                      {isCurrent && (
                        <span className={`ml-2 forge-badge ${config.bgColor} ${config.color} ${config.borderColor} border text-xs`}>
                          Current
                        </span>
                      )}
                    </h4>
                    {isCurrent && weeksInStage !== undefined && (
                      <span className="text-xs text-forge-text-muted">
                        {weeksInStage}w in stage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-forge-text-muted mt-0.5">{stage.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Progression readiness */}
      {barScore !== undefined && ppsScore !== undefined && (
        <div className="forge-card p-4 space-y-3">
          <h5 className="text-sm font-medium text-forge-text-secondary">Advancement Readiness</h5>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-forge-text-muted">BAR Score</span>
              <span className={barScore >= 80 ? 'text-state-stable' : barScore >= 65 ? 'text-state-simplified' : 'text-state-recovery'}>
                {barScore.toFixed(0)} / 80 required
              </span>
            </div>
            <div className="bie-bar">
              <div
                className={`bie-bar-fill ${barScore >= 80 ? 'bg-state-stable' : barScore >= 65 ? 'bg-state-simplified' : 'bg-state-recovery'}`}
                style={{ width: `${Math.min(100, barScore)}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-forge-text-muted">PPS Score</span>
              <span className={ppsScore >= 70 ? 'text-state-stable' : ppsScore >= 50 ? 'text-state-simplified' : 'text-state-recovery'}>
                {ppsScore.toFixed(0)} / 70 required
              </span>
            </div>
            <div className="bie-bar">
              <div
                className={`bie-bar-fill ${ppsScore >= 70 ? 'bg-state-stable' : ppsScore >= 50 ? 'bg-state-simplified' : 'bg-state-recovery'}`}
                style={{ width: `${Math.min(100, ppsScore)}%` }}
              />
            </div>
          </div>

          {barScore >= 80 && ppsScore >= 70 ? (
            <div className="flex items-center gap-2 text-xs text-state-stable bg-state-stable/10 rounded-lg px-3 py-2 border border-state-stable/30">
              <CheckCircle className="w-3.5 h-3.5" />
              Eligible for stage advancement
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-forge-text-muted bg-forge-surface-3 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5" />
              Continue building consistency to unlock advancement
            </div>
          )}
        </div>
      )}
    </div>
  )
}
