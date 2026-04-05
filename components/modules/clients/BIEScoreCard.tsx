"use client"

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, PencilLine, RefreshCw } from 'lucide-react'
import { BIEReviewWidget } from '@/components/modules/clients/BIEReviewWidget'

type Scores = {
  bar: number
  dbi: number
  bli: number
  cdi: number
  lsi: number
  pps: number
  gps: number | null
}

function chipColor(key: keyof Omit<Scores, 'gps'>, value: number) {
  if (key === 'bar') return value >= 65 ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' : value >= 50 ? 'text-[#D4AF37] border-[#D4AF37]/25 bg-[#D4AF37]/10' : 'text-red-400 border-red-500/25 bg-red-500/10'
  if (key === 'dbi') return value < 30 ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' : value <= 60 ? 'text-[#D4AF37] border-[#D4AF37]/25 bg-[#D4AF37]/10' : 'text-red-400 border-red-500/25 bg-red-500/10'
  if (key === 'bli') return value < 50 ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' : value <= 65 ? 'text-[#D4AF37] border-[#D4AF37]/25 bg-[#D4AF37]/10' : 'text-red-400 border-red-500/25 bg-red-500/10'
  return 'text-white/70 border-white/10 bg-white/5'
}

function toInput(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return String(Math.round(value))
}

function getGpsLabel(gps: number) {
  if (gps >= 80) return 'On Track'
  if (gps >= 65) return 'Good Progress'
  if (gps >= 50) return 'Needs Attention'
  if (gps >= 35) return 'At Risk'
  return 'Intervention Needed'
}

function getGpsColor(gps: number | null) {
  if (gps === null) return 'text-white/70 border-white/10 bg-white/5 stroke-white/20'
  if (gps >= 80) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 stroke-emerald-400'
  if (gps >= 65) return 'text-[#D4AF37] border-[#D4AF37]/30 bg-[#D4AF37]/10 stroke-[#D4AF37]'
  if (gps >= 50) return 'text-amber-400 border-amber-500/30 bg-amber-500/10 stroke-amber-400'
  if (gps >= 35) return 'text-orange-400 border-orange-500/30 bg-orange-500/10 stroke-orange-400'
  return 'text-red-400 border-red-500/30 bg-red-500/10 stroke-red-400'
}

function truncateGoal(goal: string | null | undefined) {
  if (!goal) return 'Goal not recorded'
  return goal.length > 60 ? `${goal.slice(0, 57)}...` : goal
}

export function BIEScoreCard({
  clientId,
  primaryGoal,
  initialScores,
  pendingReviewCount = 0,
}: {
  clientId: string
  primaryGoal?: string | null
  initialScores: Scores | null
  pendingReviewCount?: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [recalcLoading, setRecalcLoading] = useState(false)
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null)
  const [recalcError, setRecalcError] = useState<string | null>(null)

  const [form, setForm] = useState({
    bar: toInput(initialScores?.bar),
    dbi: toInput(initialScores?.dbi),
    bli: toInput(initialScores?.bli),
    cdi: toInput(initialScores?.cdi),
    lsi: toInput(initialScores?.lsi),
    pps: toInput(initialScores?.pps),
    gps: toInput(initialScores?.gps),
  })

  const scoreEntries = useMemo(() => {
    if (!initialScores) return null
    const { gps: _gps, ...rest } = initialScores
    return Object.entries(rest) as Array<[keyof Omit<Scores, 'gps'>, number]>
  }, [initialScores])

  const gpsValue = initialScores?.gps ?? null
  const gpsDisplayColor = getGpsColor(gpsValue)
  const gpsCircumference = 2 * Math.PI * 34
  const gpsOffset = gpsValue === null ? gpsCircumference : gpsCircumference * (1 - gpsValue / 100)

  const onRecalculate = async () => {
    setRecalcMessage(null)
    setRecalcError(null)
    setRecalcLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/bie`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        minimum_required?: string
        data_quality?: string
      }
      if (res.status === 422) {
        setRecalcError('Not enough data yet - add check-ins, journals, or AI-enabled documents first')
        return
      }
      if (!res.ok) {
        setRecalcError(data.error || 'Failed to recalculate scores')
        return
      }
      setRecalcMessage('Recalculated')
      setTimeout(() => {
        router.refresh()
      }, 600)
    } catch {
      setRecalcError('Failed to recalculate scores')
    } finally {
      setRecalcLoading(false)
    }
  }

  const onSave = () => {
    setSaved(false)
    startTransition(async () => {
      const payload = {
        bar: form.bar === '' ? null : Number(form.bar),
        dbi: form.dbi === '' ? null : Number(form.dbi),
        bli: form.bli === '' ? null : Number(form.bli),
        cdi: form.cdi === '' ? null : Number(form.cdi),
        lsi: form.lsi === '' ? null : Number(form.lsi),
        pps: form.pps === '' ? null : Number(form.pps),
        gps: form.gps === '' ? null : Number(form.gps),
      }
      const res = await fetch(`/api/clients/${clientId}/snapshots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        console.error('Failed to save scores', await res.text())
        return
      }
      setSaved(true)
      setEditing(false)
      setTimeout(() => {
        router.refresh()
      }, 1000)
    })
  }

  return (
    <div className="forge-card">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="forge-section-title">Behavioral Intelligence Scores</h2>
          {!initialScores && !editing && (
            <p className="text-sm text-forge-text-muted mt-1">No BIE scores recorded - click Update to add</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              title="Auto-calculate from check-ins, journals, and AI-enabled documents"
              onClick={onRecalculate}
              disabled={recalcLoading || isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              {recalcLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="w-4 h-4" aria-hidden />
              )}
              Recalculate Stats
            </button>
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="forge-btn-secondary text-sm flex items-center gap-2"
            >
              <PencilLine className="w-4 h-4" /> Update
            </button>
          </div>
          <span className="text-[10px] text-forge-text-muted max-w-[14rem] text-right leading-tight">
            Auto-calculate from check-ins, journals, and AI-enabled documents
          </span>
        </div>
      </div>

      {pendingReviewCount > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-300">Pending coach review</p>
              <p className="text-xs text-amber-100/80 mt-1">
                {pendingReviewCount} snapshot{pendingReviewCount > 1 ? 's are' : ' is'} waiting for coach approval.
              </p>
            </div>
            <BIEReviewWidget clientId={clientId} triggerLabel="Review & Approve" inline />
          </div>
        </div>
      )}

      {(recalcMessage || recalcError) && (
        <p className={`text-sm mb-2 ${recalcError ? 'text-amber-400' : 'text-emerald-400'}`} role="status">
          {recalcError ?? recalcMessage}
        </p>
      )}

      <div className={`mb-5 rounded-2xl border p-4 ${gpsDisplayColor}`}>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 flex-shrink-0">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80" aria-hidden>
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="8" />
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={gpsCircumference}
                strokeDashoffset={gpsOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono">{gpsValue === null ? '--' : `${gpsValue}%`}</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest font-mono opacity-80">Goal Probability Score</p>
            <p className="text-lg font-semibold mt-1">{gpsValue === null ? 'Insufficient data' : getGpsLabel(gpsValue)}</p>
            <p className="text-sm opacity-80 mt-1">{truncateGoal(primaryGoal)}</p>
          </div>
        </div>
      </div>

      {scoreEntries && !editing && (
        <div className="flex flex-wrap gap-2">
          {scoreEntries.map(([key, value]) => (
            <div key={key} className={`px-3 py-2 rounded-xl border ${chipColor(key, value)}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest opacity-80">{key.toUpperCase()}</div>
              <div className="text-lg font-bold font-mono leading-tight">{Math.round(value)}</div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            {(['bar', 'dbi', 'bli', 'cdi', 'lsi', 'pps', 'gps'] as Array<keyof Scores>).map((key) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">{key.toUpperCase()}</label>
                <input
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={100}
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="forge-input w-full py-2 text-sm"
                  placeholder="-"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onSave} disabled={isPending} className="forge-btn-gold text-sm">
              Save Scores
            </button>
            {saved && (
              <span className="text-sm text-emerald-400 flex items-center gap-1">
                Saved <Check className="w-4 h-4" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
