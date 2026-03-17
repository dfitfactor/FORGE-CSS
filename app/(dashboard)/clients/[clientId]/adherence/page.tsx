'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle, XCircle, MinusCircle,
  Plus, Loader2, AlertCircle, X, Trash2, Activity
} from 'lucide-react'

type Record = {
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
  'Full Body', 'Recovery', 'Cardio', 'Custom'
]

function RecordIcon({ type }: { type: string }) {
  if (type === 'session_completed' || type === 'nutrition_logged' || type === 'check_in_completed')
    return <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
  if (type === 'session_missed' || type === 'nutrition_missed')
    return <XCircle size={16} className="text-red-400 flex-shrink-0" />
  return <MinusCircle size={16} className="text-amber-400 flex-shrink-0" />
}

function BARBar({ value, label }: { value: number; label: string }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 65 ? 'bg-[#D4AF37]' : value >= 50 ? 'bg-amber-500' : 'bg-red-500'
  const pct = Math.max(4, Math.min(100, value))
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 rounded-full bg-white/6 overflow-hidden" style={{ height: 64 }}>
        <div className={`w-full ${color} rounded-full transition-all`} style={{ height: pct + '%', marginTop: (100 - pct) + '%' }} />
      </div>
      <span className="text-[9px] font-mono text-white/30 text-center leading-tight">{label}</span>
      <span className="text-xs font-bold text-white/70">{Math.round(value)}</span>
    </div>
  )
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function computeWeeklyBAR(records: Record[], sessionsPerWeek: number) {
  if (records.length === 0) return []
  const weeks: { weekStart: string; bar: number }[] = []
  const now = new Date()
  for (let w = 0; w < 8; w++) {
    const end = new Date(now)
    end.setDate(end.getDate() - w * 7)
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    const weekRecords = records.filter(r => {
      const d = new Date(r.record_date)
      return d >= start && d <= end
    })
    const completed = weekRecords.filter(r => r.record_type === 'session_completed').length
    const partial = weekRecords.filter(r => r.record_type === 'session_partial').length
    const bar = sessionsPerWeek > 0
      ? Math.min(100, Math.round(((completed + partial * 0.5) / sessionsPerWeek) * 100))
      : 0
    weeks.push({
      weekStart: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      bar
    })
  }
  return weeks.reverse()
}

export default function AdherencePage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [records, setRecords] = useState<Record[]>([])
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)

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
    fetch('/api/clients/' + clientId).then(r => r.json()).then(d => setClientName(d.client?.full_name ?? '')).catch(() => {})
    loadRecords()
  }, [clientId])

  function loadRecords() {
    fetch('/api/clients/' + clientId + '/adherence')
      .then(r => r.json())
      .then(d => {
        setRecords(d.records ?? [])
        setSessionsPerWeek(d.sessionsPerWeek ?? 3)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  function setF(key: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/clients/' + clientId + '/adherence', {
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
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Save failed'); return }
      setSuccess('Record logged')
      setShowForm(false)
      setForm({ recordDate: new Date().toISOString().split('T')[0], recordType: 'session_completed', sessionType: '', completionPct: '100', rpe: '', energyLevel: '', moodRating: '', swapsApplied: false, clientNotes: '', coachNotes: '' })
      loadRecords()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  const weeklyBAR = computeWeeklyBAR(records, sessionsPerWeek)
  const currentBAR = weeklyBAR[weeklyBAR.length - 1]?.bar ?? 0
  const totalCompleted = records.filter(r => r.record_type === 'session_completed').length

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + clientId} className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Adherence</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="forge-btn-gold text-sm flex items-center gap-2">
            <Plus size={15} /> Log Session
          </button>
        </div>

        {success && <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"><CheckCircle size={16} className="text-emerald-400" /><span className="text-sm text-emerald-400">{success}</span></div>}
        {error && <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"><AlertCircle size={16} className="text-red-400" /><span className="text-sm text-red-400 flex-1">{error}</span><button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button></div>}

        {/* BAR Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#111111] border border-white/8 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-white/35 mb-1">Current BAR</div>
            <div className={`text-2xl font-bold tabular-nums ${currentBAR >= 80 ? 'text-emerald-400' : currentBAR >= 65 ? 'text-[#D4AF37]' : currentBAR >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{currentBAR}</div>
          </div>
          <div className="bg-[#111111] border border-white/8 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-white/35 mb-1">Sessions/Week Target</div>
            <div className="text-2xl font-bold tabular-nums text-white">{sessionsPerWeek}</div>
          </div>
          <div className="bg-[#111111] border border-white/8 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-white/35 mb-1">Total Completed</div>
            <div className="text-2xl font-bold tabular-nums text-[#D4AF37]">{totalCompleted}</div>
          </div>
        </div>

        {/* BAR Chart */}
        {weeklyBAR.length > 0 && (
          <div className="bg-[#111111] border border-white/8 rounded-2xl p-6">
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono mb-4">BAR Trend — 8 Weeks</h2>
            <div className="flex items-end justify-between gap-2">
              {weeklyBAR.map((w, i) => <BARBar key={i} value={w.bar} label={w.weekStart} />)}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/6 text-xs text-white/40">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> ≥80 Eligible</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#D4AF37] inline-block" /> 65–79 Consolidate</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &lt;50 Recovery</span>
            </div>
          </div>
        )}

        {/* Log form */}
        {showForm && (
          <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Log Record</h2>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="forge-label">Date</label><input type="date" value={form.recordDate} onChange={e => setF('recordDate', e.target.value)} className="forge-input" /></div>
              <div><label className="forge-label">Record Type</label><select value={form.recordType} onChange={e => setF('recordType', e.target.value)} className="forge-input">{RECORD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div><label className="forge-label">Session Type</label><select value={form.sessionType} onChange={e => setF('sessionType', e.target.value)} className="forge-input"><option value="">Select...</option>{SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="forge-label">Completion %</label><input type="number" min="0" max="100" value={form.completionPct} onChange={e => setF('completionPct', e.target.value)} className="forge-input" /></div>
              <div><label className="forge-label">RPE (1-10)</label><input type="number" min="1" max="10" value={form.rpe} onChange={e => setF('rpe', e.target.value)} className="forge-input" placeholder="7" /></div>
              <div><label className="forge-label">Energy (1-5)</label><input type="number" min="1" max="5" value={form.energyLevel} onChange={e => setF('energyLevel', e.target.value)} className="forge-input" placeholder="3" /></div>
            </div>
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setF('swapsApplied', !form.swapsApplied)}>
              <div className={`w-9 h-5 rounded-full transition-all flex items-center px-0.5 ${form.swapsApplied ? 'bg-[#D4AF37] justify-end' : 'bg-white/10 justify-start'}`}>
                <div className="w-4 h-4 rounded-full bg-white shadow" />
              </div>
              <span className="text-sm text-white/60">Swaps applied this session</span>
            </div>
            <div><label className="forge-label">Coach Notes</label><textarea rows={2} value={form.coachNotes} onChange={e => setF('coachNotes', e.target.value)} className="forge-input resize-none" placeholder="Observations from this session..." /></div>
            <button onClick={handleSave} disabled={saving} className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Activity size={16} /> Log Record</>}
            </button>
          </div>
        )}

        {/* Records list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
        ) : records.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Activity size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No sessions logged yet</p>
            <button onClick={() => setShowForm(true)} className="mt-4 forge-btn-gold text-sm flex items-center gap-2 mx-auto"><Plus size={14} /> Log First Session</button>
          </div>
        ) : (
          <div>
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono mb-3">Recent Activity</h2>
            <div className="space-y-2">
              {records.map(r => (
                <div key={r.id} className="bg-[#111111] border border-white/6 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <RecordIcon type={r.record_type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white/80">{r.session_type ?? r.record_type.replace(/_/g, ' ')}</span>
                        {r.completion_pct !== null && r.completion_pct < 100 && (
                          <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">{r.completion_pct}%</span>
                        )}
                        {r.swaps_applied && <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full">swaps</span>}
                      </div>
                      {r.coach_notes && <p className="text-xs text-white/35 mt-0.5 truncate">{r.coach_notes}</p>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/30 shrink-0">
                      {r.rpe && <span>RPE {r.rpe}</span>}
                      {r.energy_level && <span>E {r.energy_level}/5</span>}
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