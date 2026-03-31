"use client"

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, PencilLine, RefreshCw } from 'lucide-react'

type Scores = { bar: number; dbi: number; bli: number; cdi: number; lsi: number; pps: number }

function chipColor(key: keyof Scores, v: number) {
  if (key === 'bar') return v >= 65 ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' : v >= 50 ? 'text-[#D4AF37] border-[#D4AF37]/25 bg-[#D4AF37]/10' : 'text-red-400 border-red-500/25 bg-red-500/10'
  if (key === 'dbi') return v < 30 ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' : v <= 60 ? 'text-[#D4AF37] border-[#D4AF37]/25 bg-[#D4AF37]/10' : 'text-red-400 border-red-500/25 bg-red-500/10'
  if (key === 'bli') return v < 50 ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' : v <= 65 ? 'text-[#D4AF37] border-[#D4AF37]/25 bg-[#D4AF37]/10' : 'text-red-400 border-red-500/25 bg-red-500/10'
  return 'text-white/70 border-white/10 bg-white/5'
}

function toInput(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return ''
  return String(Math.round(v))
}

export function BIEScoreCard({
  clientId,
  initialScores,
}: {
  clientId: string
  initialScores: Scores | null
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
  })

  const scoreEntries = useMemo(() => {
    if (!initialScores) return null
    return (Object.entries(initialScores) as Array<[keyof Scores, number]>)
  }, [initialScores])

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
        setRecalcError('Not enough data yet — add check-ins or journal entries first')
        return
      }
      if (!res.ok) {
        setRecalcError(data.error || 'Failed to recalculate scores')
        return
      }
      setRecalcMessage('Recalculated ✓')
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
            <p className="text-sm text-forge-text-muted mt-1">No BIE scores recorded — click Update to add</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            type="button"
            title="Auto-calculate from check-ins and journals"
            onClick={onRecalculate}
            disabled={recalcLoading || isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            {recalcLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="w-4 h-4" aria-hidden />
            )}
            Recalculate from Data
          </button>
          <button
            type="button"
            onClick={() => setEditing(v => !v)}
            className="forge-btn-secondary text-sm flex items-center gap-2"
          >
            <PencilLine className="w-4 h-4" /> Update
          </button>
          </div>
          <span className="text-[10px] text-forge-text-muted max-w-[14rem] text-right leading-tight">
            Auto-calculate from check-ins and journals
          </span>
        </div>
      </div>

      {(recalcMessage || recalcError) && (
        <p
          className={`text-sm mb-2 ${recalcError ? 'text-amber-400' : 'text-emerald-400'}`}
          role="status"
        >
          {recalcError ?? recalcMessage}
        </p>
      )}

      {scoreEntries && !editing && (
        <div className="flex flex-wrap gap-2">
          {scoreEntries.map(([k, v]) => (
            <div key={k} className={`px-3 py-2 rounded-xl border ${chipColor(k, v)}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest opacity-80">{k.toUpperCase()}</div>
              <div className="text-lg font-bold font-mono leading-tight">{Math.round(v)}</div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {(['bar', 'dbi', 'bli', 'cdi', 'lsi', 'pps'] as Array<keyof Scores>).map((k) => (
              <div key={k} className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">{k.toUpperCase()}</label>
                <input
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={100}
                  value={form[k]}
                  onChange={(e) => setForm(prev => ({ ...prev, [k]: e.target.value }))}
                  className="forge-input w-full py-2 text-sm"
                  placeholder="—"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={isPending}
              className="forge-btn-gold text-sm"
            >
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

