'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, BookOpen, Loader2, CheckCircle,
  AlertCircle, X, Trash2, ChevronDown, ChevronUp,
  Zap, Heart, Brain, Droplets, Moon, Utensils, Flag
} from 'lucide-react'

type Entry = {
  id: string
  entry_date: string
  entry_type: string
  title: string | null
  body: string | null
  sleep_hours: number | null
  sleep_quality: number | null
  stress_level: number | null
  energy_level: number | null
  hunger_level: number | null
  mood: number | null
  digestion_quality: number | null
  travel_flag: boolean
  illness_flag: boolean
  work_stress_flag: boolean
  family_stress_flag: boolean
  extracted_signals: Record<string, unknown> | null
  signals_extracted: boolean
  coach_response: string | null
  is_private: boolean
}

const ENTRY_TYPES = [
  { value: 'daily_log', label: 'Daily Log' },
  { value: 'session_note', label: 'Session Note' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'disruption_report', label: 'Disruption Report' },
  { value: 'free_form', label: 'Free Form' },
  { value: 'coach_note', label: 'Coach Note' },
]

const ENTRY_COLORS: Record<string, string> = {
  daily_log: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  session_note: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  milestone: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  disruption_report: 'text-red-400 bg-red-400/10 border-red-400/20',
  free_form: 'text-white/50 bg-white/4 border-white/10',
  coach_note: 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20',
}

function RatingDots({ value, max = 5, color = 'bg-[#D4AF37]' }: { value: number | null; max?: number; color?: string }) {
  if (!value) return <span className="text-white/20 text-xs">—</span>
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <div key={i} className={`w-2 h-2 rounded-full ${i < value ? color : 'bg-white/10'}`} />
      ))}
    </div>
  )
}

function RatingButtons({ value, max = 5, onChange }: { value: string; max?: number; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" onClick={() => onChange(String(n))}
          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
            value === String(n) ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:bg-white/12'
          }`}>{n}</button>
      ))}
    </div>
  )
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function JournalsPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [entries, setEntries] = useState<Entry[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterType, setFilterType] = useState('all')
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [coachReply, setCoachReply] = useState('')

  const emptyForm = {
    entryDate: new Date().toISOString().split('T')[0],
    entryType: 'daily_log',
    title: '',
    body: '',
    sleepHours: '',
    sleepQuality: '',
    stressLevel: '',
    energyLevel: '',
    hungerLevel: '',
    mood: '',
    digestionQuality: '',
    travelFlag: false,
    illnessFlag: false,
    workStressFlag: false,
    familyStressFlag: false,
    coachResponse: '',
    isPrivate: false,
  }

  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm)

  useEffect(() => {
    if (!clientId) return
    fetch('/api/clients/' + clientId, { cache: 'no-store' }).then(r => r.json()).then(d => setClientName(d.client?.full_name ?? '')).catch(() => {})
    loadEntries()
  }, [clientId])

  function loadEntries() {
    fetch('/api/clients/' + clientId + '/journals', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error ?? `Failed to load journal entries (${r.status})`)
        return data
      })
      .then(d => {
        // TEMP DEBUG
        console.log('[TEMP DEBUG][journals][page][GET] full response', d)
        if (d.debug) {
          console.log('[TEMP DEBUG][journals][page][GET] debug', d.debug)
        }
        setEntries(Array.isArray(d.entries) ? d.entries : [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load journal entries')
        setLoading(false)
      })
  }

  function setF(key: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/clients/' + clientId + '/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sleepHours: form.sleepHours ? Number(form.sleepHours) : undefined,
          sleepQuality: form.sleepQuality ? Number(form.sleepQuality) : undefined,
          stressLevel: form.stressLevel ? Number(form.stressLevel) : undefined,
          energyLevel: form.energyLevel ? Number(form.energyLevel) : undefined,
          hungerLevel: form.hungerLevel ? Number(form.hungerLevel) : undefined,
          mood: form.mood ? Number(form.mood) : undefined,
          digestionQuality: form.digestionQuality ? Number(form.digestionQuality) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      // TEMP DEBUG
      console.log('[TEMP DEBUG][journals][page][POST] full response', data)
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      setSuccess('Entry saved')
      setShowForm(false)
      setForm(emptyForm)
      if (data.entry) {
        setEntries(prev => [...prev.filter(entry => entry.id !== data.entry.id), data.entry as Entry])
      } else {
        loadEntries()
      }
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Network error') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return
    await fetch('/api/clients/' + clientId + '/journals?id=' + id, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const filtered = filterType === 'all' ? entries : entries.filter(e => e.entry_type === filterType)

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + clientId} className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Journal</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="forge-btn-gold text-sm flex items-center gap-2">
            <Plus size={15} /> New Entry
          </button>
        </div>

        {success && <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"><CheckCircle size={16} className="text-emerald-400" /><span className="text-sm text-emerald-400">{success}</span></div>}
        {error && <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"><AlertCircle size={16} className="text-red-400" /><span className="text-sm text-red-400 flex-1">{error}</span><button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button></div>}

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === 'all' ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>
            All ({entries.length})
          </button>
          {ENTRY_TYPES.map(t => {
            const count = entries.filter(e => e.entry_type === t.value).length
            if (count === 0) return null
            return (
              <button key={t.value} onClick={() => setFilterType(t.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === t.value ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>
                {t.label} ({count})
              </button>
            )
          })}
        </div>

        {/* New entry form */}
        {showForm && (
          <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">New Entry</h2>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="forge-label">Date</label><input type="date" value={String(form.entryDate)} onChange={e => setF('entryDate', e.target.value)} className="forge-input" /></div>
              <div><label className="forge-label">Entry Type</label><select value={String(form.entryType)} onChange={e => setF('entryType', e.target.value)} className="forge-input">{ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            </div>

            <div><label className="forge-label">Title (optional)</label><input value={String(form.title)} onChange={e => setF('title', e.target.value)} className="forge-input" placeholder="e.g. Great week, feeling strong..." /></div>

            <div><label className="forge-label">Journal Entry</label><textarea rows={5} value={String(form.body)} onChange={e => setF('body', e.target.value)} className="forge-input resize-none" placeholder="What happened today? How are you feeling? Any wins, struggles, observations..." /></div>

            {/* Daily metrics */}
            <div className="space-y-4">
              <p className="text-xs font-mono uppercase tracking-widest text-white/35">Daily Metrics</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="forge-label flex items-center gap-1.5"><Moon size={12} /> Sleep Hours</label><input type="number" step="0.5" min="0" max="24" value={String(form.sleepHours)} onChange={e => setF('sleepHours', e.target.value)} className="forge-input" placeholder="7.5" /></div>
                <div><label className="forge-label flex items-center gap-1.5"><Moon size={12} /> Sleep Quality (1-5)</label><RatingButtons value={String(form.sleepQuality)} onChange={v => setF('sleepQuality', v)} /></div>
                <div><label className="forge-label flex items-center gap-1.5"><Zap size={12} /> Energy (1-5)</label><RatingButtons value={String(form.energyLevel)} onChange={v => setF('energyLevel', v)} /></div>
                <div><label className="forge-label flex items-center gap-1.5"><Brain size={12} /> Stress (1-5)</label><RatingButtons value={String(form.stressLevel)} onChange={v => setF('stressLevel', v)} /></div>
                <div><label className="forge-label flex items-center gap-1.5"><Heart size={12} /> Mood (1-5)</label><RatingButtons value={String(form.mood)} onChange={v => setF('mood', v)} /></div>
                <div><label className="forge-label flex items-center gap-1.5"><Utensils size={12} /> Hunger (1-5)</label><RatingButtons value={String(form.hungerLevel)} onChange={v => setF('hungerLevel', v)} /></div>
                <div className="col-span-2"><label className="forge-label flex items-center gap-1.5"><Droplets size={12} /> Digestion (1-5)</label><RatingButtons value={String(form.digestionQuality)} onChange={v => setF('digestionQuality', v)} /></div>
              </div>
            </div>

            {/* Disruption flags */}
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-widest text-white/35">Disruption Flags</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'travelFlag', label: 'Travel' },
                  { key: 'illnessFlag', label: 'Illness' },
                  { key: 'workStressFlag', label: 'Work Stress' },
                  { key: 'familyStressFlag', label: 'Family Stress' },
                ].map(f => (
                  <button key={f.key} type="button" onClick={() => setF(f.key, !form[f.key])}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                      form[f.key] ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-white/4 text-white/35 border-white/10'
                    }`}>
                    <Flag size={10} /> {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Coach notes */}
            <div><label className="forge-label">Coach Notes (internal)</label><textarea rows={2} value={String(form.coachResponse)} onChange={e => setF('coachResponse', e.target.value)} className="forge-input resize-none" placeholder="Coaching observations, patterns, action items..." /></div>

            <button onClick={handleSave} disabled={saving} className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><BookOpen size={16} /> Save Entry</>}
            </button>
          </div>
        )}

        {/* Entries list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <BookOpen size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No journal entries yet</p>
            <button onClick={() => setShowForm(true)} className="mt-4 forge-btn-gold text-sm flex items-center gap-2 mx-auto"><Plus size={14} /> Add First Entry</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => {
              const typeColor = ENTRY_COLORS[entry.entry_type] ?? ENTRY_COLORS.free_form
              const hasFlags = entry.travel_flag || entry.illness_flag || entry.work_stress_flag || entry.family_stress_flag
              return (
                <div key={entry.id} className="bg-[#111111] border border-white/6 rounded-xl overflow-hidden">
                  <div className="flex items-start justify-between p-4 cursor-pointer" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono text-white/35">{formatDate(entry.entry_date)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wide ${typeColor}`}>
                            {ENTRY_TYPES.find(t => t.value === entry.entry_type)?.label ?? entry.entry_type}
                          </span>
                          {hasFlags && <Flag size={10} className="text-red-400" />}
                        </div>
                        {entry.title && <p className="text-sm font-semibold text-white/85 truncate">{entry.title}</p>}
                        {entry.body && !entry.title && <p className="text-sm text-white/50 truncate">{entry.body}</p>}
                        {/* Metric dots */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {entry.sleep_quality && <div className="flex items-center gap-1"><Moon size={10} className="text-white/25" /><RatingDots value={entry.sleep_quality} color="bg-blue-400" /></div>}
                          {entry.energy_level && <div className="flex items-center gap-1"><Zap size={10} className="text-white/25" /><RatingDots value={entry.energy_level} color="bg-[#D4AF37]" /></div>}
                          {entry.mood && <div className="flex items-center gap-1"><Heart size={10} className="text-white/25" /><RatingDots value={entry.mood} color="bg-emerald-400" /></div>}
                          {entry.stress_level && <div className="flex items-center gap-1"><Brain size={10} className="text-white/25" /><RatingDots value={entry.stress_level} color="bg-red-400" /></div>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); handleDelete(entry.id) }} className="text-white/15 hover:text-red-400 transition-colors p-1"><Trash2 size={13} /></button>
                      {expanded === entry.id ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                    </div>
                  </div>

                  {expanded === entry.id && (
                    <div className="border-t border-white/6 p-4 space-y-4">
                      {entry.body && (
                        <div>
                          <p className="text-xs text-white/30 mb-1">Entry</p>
                          <p className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap">{entry.body}</p>
                        </div>
                      )}
                      {/* Metrics grid */}
                      <div className="grid grid-cols-3 gap-2">
                        {entry.sleep_hours && <div className="bg-white/3 rounded-lg p-2 text-center"><Moon size={12} className="mx-auto text-blue-400 mb-1" /><p className="text-xs text-white/35">Sleep</p><p className="text-sm font-bold text-white">{entry.sleep_hours}h</p></div>}
                        {entry.energy_level && <div className="bg-white/3 rounded-lg p-2 text-center"><Zap size={12} className="mx-auto text-[#D4AF37] mb-1" /><p className="text-xs text-white/35">Energy</p><p className="text-sm font-bold text-white">{entry.energy_level}/5</p></div>}
                        {entry.mood && <div className="bg-white/3 rounded-lg p-2 text-center"><Heart size={12} className="mx-auto text-emerald-400 mb-1" /><p className="text-xs text-white/35">Mood</p><p className="text-sm font-bold text-white">{entry.mood}/5</p></div>}
                        {entry.stress_level && <div className="bg-white/3 rounded-lg p-2 text-center"><Brain size={12} className="mx-auto text-red-400 mb-1" /><p className="text-xs text-white/35">Stress</p><p className="text-sm font-bold text-white">{entry.stress_level}/5</p></div>}
                        {entry.hunger_level && <div className="bg-white/3 rounded-lg p-2 text-center"><Utensils size={12} className="mx-auto text-amber-400 mb-1" /><p className="text-xs text-white/35">Hunger</p><p className="text-sm font-bold text-white">{entry.hunger_level}/5</p></div>}
                        {entry.digestion_quality && <div className="bg-white/3 rounded-lg p-2 text-center"><Droplets size={12} className="mx-auto text-cyan-400 mb-1" /><p className="text-xs text-white/35">Digestion</p><p className="text-sm font-bold text-white">{entry.digestion_quality}/5</p></div>}
                      </div>
                      {/* Flags */}
                      {hasFlags && (
                        <div className="flex gap-2 flex-wrap">
                          {entry.travel_flag && <span className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">Travel</span>}
                          {entry.illness_flag && <span className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">Illness</span>}
                          {entry.work_stress_flag && <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">Work Stress</span>}
                          {entry.family_stress_flag && <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">Family Stress</span>}
                        </div>
                      )}
                      {/* Coach notes */}
                      {entry.coach_response && (
                        <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-xl p-3">
                          <p className="text-xs text-white/30 mb-1">Coach Notes</p>
                          <p className="text-sm text-[#D4AF37]/80">{entry.coach_response}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
