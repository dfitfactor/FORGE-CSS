'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle, XCircle, MinusCircle,
  Plus, Loader2, AlertCircle, X, Activity,
} from 'lucide-react'

type RecordRow = {
  id: string
  record_date: string
  record_type: string
  session_type: string | null
  completion_pct: number | null
  rpe: number | null
  energy_level: number | null
  mood_rating: number | null
  swaps_applied: boolean
  client_notes: string | null
  coach_notes: string | null
}

type SnapshotTrendRow = {
  snapshot_date: string
  bar: number | null
}

const RECORD_TYPES = [
  { value: 'session_completed', label: 'Session Completed' },
  { value: 'session_missed', label: 'Session Missed' },
  { value: 'session_partial', label: 'Session Partial' },
  { value: 'nutrition_logged', label: 'Nutrition Logged' },
  { value: 'nutrition_missed', label: 'Nutrition Missed' },
  { value: 'check_in_completed', label: 'Check-in Completed' },
]

const SESSION_TYPES = [
  'Lower A', 'Lower B', 'Upper A', 'Upper B',
  'Full Body', 'Recovery', 'Cardio', 'Custom',
]

function RecordIcon({ type }: { type: string }) {
  if (type === 'session_completed' || type === 'nutrition_logged' || type === 'check_in_completed') {
    return <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
  }
  if (type === 'session_missed' || type === 'nutrition_missed') {
    return <XCircle size={16} className="text-red-400 flex-shrink-0" />
  }
  return <MinusCircle size={16} className="text-amber-400 flex-shrink-0" />
}

function BARBar({ value, label }: { value: number; label: string }) {
  const color =
    value >= 80 ? 'bg-emerald-500' : value >= 65 ? 'bg-[#D4AF37]' : value >= 50 ? 'bg-amber-500' : 'bg-red-500'
  const pct = Math.max(4, Math.min(100, value))

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 overflow-hidden rounded-full bg-white/6" style={{ height: 64 }}>
        <div className={`w-full rounded-full transition-all ${color}`} style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }} />
      </div>
      <span className="text-center text-[9px] font-mono leading-tight text-white/30">{label}</span>
      <span className="text-xs font-bold text-white/70">{Math.round(value)}</span>
    </div>
  )
}

function formatTrendLabel(str: string) {
  return new Date(`${str}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdherencePage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [records, setRecords] = useState<RecordRow[]>([])
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [snapshotTrend, setSnapshotTrend] = useState<SnapshotTrendRow[]>([])
  const [currentBar, setCurrentBar] = useState<number | null>(null)

  const [form, setForm] = useState({
    recordDate: new Date().toISOString().split('T')[0],
    recordType: 'session_completed',
    sessionType: '',
    completionPct: '100',
    rpe: '',
    energyLevel: '',
    moodRating: '',
    swapsApplied: false,
    clientNotes: '',
    coachNotes: '',
  })

  useEffect(() => {
    if (!clientId) return

    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((d) => setClientName(d.client?.full_name ?? ''))
      .catch(() => undefined)

    void loadRecords()
  }, [clientId])

  async function loadRecords() {
    setLoading(true)

    try {
      const response = await fetch(`/api/clients/${clientId}/adherence`)
      const data = await response.json().catch(() => ({}))

      setRecords((data.records ?? []) as RecordRow[])
      setSessionsPerWeek(data.sessionsPerWeek ?? 3)
      setSnapshotTrend((data.snapshotTrend ?? []) as SnapshotTrendRow[])
      setCurrentBar(typeof data.currentBar === 'number' ? data.currentBar : null)
    } finally {
      setLoading(false)
    }
  }

  function setF(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/clients/${clientId}/adherence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordDate: form.recordDate,
          recordType: form.recordType,
          sessionType: form.sessionType || undefined,
          completionPct: form.completionPct ? Number(form.completionPct) : undefined,
          rpe: form.rpe ? Number(form.rpe) : undefined,
          energyLevel: form.energyLevel ? Number(form.energyLevel) : undefined,
          moodRating: form.moodRating ? Number(form.moodRating) : undefined,
          swapsApplied: form.swapsApplied,
          clientNotes: form.clientNotes || undefined,
          coachNotes: form.coachNotes || undefined,
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Save failed')
        return
      }

      setSuccess('Record logged')
      setShowForm(false)
      setForm({
        recordDate: new Date().toISOString().split('T')[0],
        recordType: 'session_completed',
        sessionType: '',
        completionPct: '100',
        rpe: '',
        energyLevel: '',
        moodRating: '',
        swapsApplied: false,
        clientNotes: '',
        coachNotes: '',
      })
      await loadRecords()
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const trendBars = snapshotTrend.map((item) => ({
    label: formatTrendLabel(item.snapshot_date),
    bar: item.bar ?? 0,
  }))

  const resolvedCurrentBar = currentBar ?? trendBars[trendBars.length - 1]?.bar ?? 0
  const totalCompleted = records.filter((r) => r.record_type === 'session_completed').length

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/clients/${clientId}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/6 text-white/50 transition-colors hover:text-white">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Adherence</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="forge-btn-gold flex items-center gap-2 text-sm">
            <Plus size={15} /> Log Session
          </button>
        </div>

        {success ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-sm text-emerald-400">{success}</span>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle size={16} className="text-red-400" />
            <span className="flex-1 text-sm text-red-400">{error}</span>
            <button onClick={() => setError('')}>
              <X size={14} className="text-red-400/60" />
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/8 bg-[#111111] p-4">
            <div className="mb-1 text-xs font-mono uppercase tracking-widest text-white/35">Current BAR</div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                resolvedCurrentBar >= 80
                  ? 'text-emerald-400'
                  : resolvedCurrentBar >= 65
                    ? 'text-[#D4AF37]'
                    : resolvedCurrentBar >= 50
                      ? 'text-amber-400'
                      : 'text-red-400'
              }`}
            >
              {Math.round(resolvedCurrentBar)}
            </div>
            <div className="mt-1 text-[11px] text-white/30">Authoritative BIE snapshot value</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-[#111111] p-4">
            <div className="mb-1 text-xs font-mono uppercase tracking-widest text-white/35">Sessions/Week Target</div>
            <div className="text-2xl font-bold tabular-nums text-white">{sessionsPerWeek}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-[#111111] p-4">
            <div className="mb-1 text-xs font-mono uppercase tracking-widest text-white/35">Total Completed</div>
            <div className="text-2xl font-bold tabular-nums text-[#D4AF37]">{totalCompleted}</div>
          </div>
        </div>

        {trendBars.length > 0 ? (
          <div className="rounded-2xl border border-white/8 bg-[#111111] p-6">
            <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-white">BAR Trend - BIE Snapshots</h2>
            <div className="flex items-end justify-between gap-2">
              {trendBars.map((w, i) => (
                <BARBar key={i} value={w.bar} label={w.label} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 border-t border-white/6 pt-4 text-xs text-white/40">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> ≥80 Eligible</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#D4AF37]" /> 65-79 Consolidate</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> &lt;50 Recovery</span>
            </div>
          </div>
        ) : null}

        {showForm ? (
          <div className="space-y-4 rounded-2xl border border-[#D4AF37]/20 bg-[#111111] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">Log Record</h2>
              <button onClick={() => setShowForm(false)} className="text-white/30 transition-colors hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="forge-label">Date</label><input type="date" value={form.recordDate} onChange={(e) => setF('recordDate', e.target.value)} className="forge-input" /></div>
              <div><label className="forge-label">Record Type</label><select value={form.recordType} onChange={(e) => setF('recordType', e.target.value)} className="forge-input">{RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div><label className="forge-label">Session Type</label><select value={form.sessionType} onChange={(e) => setF('sessionType', e.target.value)} className="forge-input"><option value="">Select...</option>{SESSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="forge-label">Completion %</label><input type="number" min="0" max="100" value={form.completionPct} onChange={(e) => setF('completionPct', e.target.value)} className="forge-input" /></div>
              <div><label className="forge-label">RPE (1-10)</label><input type="number" min="1" max="10" value={form.rpe} onChange={(e) => setF('rpe', e.target.value)} className="forge-input" placeholder="7" /></div>
              <div><label className="forge-label">Energy (1-5)</label><input type="number" min="1" max="5" value={form.energyLevel} onChange={(e) => setF('energyLevel', e.target.value)} className="forge-input" placeholder="3" /></div>
            </div>
            <div className="flex cursor-pointer items-center gap-3" onClick={() => setF('swapsApplied', !form.swapsApplied)}>
              <div className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-all ${form.swapsApplied ? 'justify-end bg-[#D4AF37]' : 'justify-start bg-white/10'}`}>
                <div className="h-4 w-4 rounded-full bg-white shadow" />
              </div>
              <span className="text-sm text-white/60">Swaps applied this session</span>
            </div>
            <div><label className="forge-label">Coach Notes</label><textarea rows={2} value={form.coachNotes} onChange={(e) => setF('coachNotes', e.target.value)} className="forge-input resize-none" placeholder="Observations from this session..." /></div>
            <button onClick={() => void handleSave()} disabled={saving} className="forge-btn-gold flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Activity size={16} /> Log Record</>}
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/20" /></div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/8 bg-[#111111] p-12 text-center">
            <Activity size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No sessions logged yet</p>
            <button onClick={() => setShowForm(true)} className="forge-btn-gold mx-auto mt-4 flex items-center gap-2 text-sm"><Plus size={14} /> Log First Session</button>
          </div>
        ) : (
          <div>
            <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-white">Recent Activity</h2>
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/6 bg-[#111111] p-4">
                  <div className="flex items-center gap-3">
                    <RecordIcon type={r.record_type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-white/80">{r.session_type ?? r.record_type.replace(/_/g, ' ')}</span>
                        {r.completion_pct !== null && r.completion_pct < 100 ? (
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">{r.completion_pct}%</span>
                        ) : null}
                        {r.swaps_applied ? <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">swaps</span> : null}
                      </div>
                      {r.coach_notes ? <p className="mt-0.5 truncate text-xs text-white/35">{r.coach_notes}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-white/30">
                      {r.rpe ? <span>RPE {r.rpe}</span> : null}
                      {r.energy_level ? <span>E {r.energy_level}/5</span> : null}
                      <span>{r.record_date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
