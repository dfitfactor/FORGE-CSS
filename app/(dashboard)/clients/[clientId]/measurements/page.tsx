'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Ruler, TrendingUp, TrendingDown,
  Minus, Loader2, CheckCircle, AlertCircle, X, Trash2
} from 'lucide-react'

type Measurement = {
  id: string
  measurement_date: string
  weight_lbs: number | null
  body_fat_pct: number | null
  lean_mass_lbs: number | null
  height_in: number | null
  waist_in: number | null
  hips_in: number | null
  chest_in: number | null
  left_arm_in: number | null
  right_arm_in: number | null
  left_thigh_in: number | null
  right_thigh_in: number | null
  notes: string | null
}

type FormState = {
  measurementDate: string
  heightIn: string
  weightLbs: string
  bodyFatPct: string
  leanMassLbs: string
  waistIn: string
  hipsIn: string
  chestIn: string
  leftArmIn: string
  rightArmIn: string
  leftThighIn: string
  rightThighIn: string
  notes: string
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function fmt(val: number | null, unit = '') {
  if (val === null || val === undefined) return '-'
  return Number(val).toFixed(1) + unit
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Trend({ current, previous, lowerIsBetter = false }: {
  current: number | null; previous: number | null; lowerIsBetter?: boolean
}) {
  if (!current || !previous) return <span className="text-white/20">-</span>
  const diff = current - previous
  if (Math.abs(diff) < 0.05) return <span className="text-white/30 flex items-center gap-1"><Minus size={12} /> 0</span>
  const isGood = lowerIsBetter ? diff < 0 : diff > 0
  const Icon = diff > 0 ? TrendingUp : TrendingDown
  const color = isGood ? 'text-emerald-400' : 'text-red-400'
  return (
    <span className={'flex items-center gap-1 ' + color}>
      <Icon size={12} />
      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
    </span>
  )
}

export default function MeasurementsPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)

  const emptyForm: FormState = {
    measurementDate: today(),
    heightIn: '', weightLbs: '', bodyFatPct: '', leanMassLbs: '',
    waistIn: '', hipsIn: '', chestIn: '',
    leftArmIn: '', rightArmIn: '',
    leftThighIn: '', rightThighIn: '',
    notes: '',
  }

  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (!clientId) return
    fetch('/api/clients/' + clientId)
      .then(r => r.json())
      .then(d => setClientName(d.client?.full_name ?? ''))
      .catch(() => {})
    loadMeasurements()
  }, [clientId])

  function loadMeasurements() {
    fetch('/api/clients/' + clientId + '/measurements')
      .then(r => r.json())
      .then(d => { setMeasurements(d.measurements ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function set(key: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    const hasData = form.weightLbs || form.bodyFatPct || form.waistIn || form.hipsIn || form.heightIn
    if (!hasData) { setError('Enter at least one measurement'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/clients/' + clientId + '/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurementDate: form.measurementDate,
          heightIn: form.heightIn ? Number(form.heightIn) : undefined,
          weightLbs: form.weightLbs ? Number(form.weightLbs) : undefined,
          bodyFatPct: form.bodyFatPct ? Number(form.bodyFatPct) : undefined,
          leanMassLbs: form.leanMassLbs
            ? Number(form.leanMassLbs)
            : (form.weightLbs && form.bodyFatPct)
              ? Math.round(Number(form.weightLbs) * (1 - Number(form.bodyFatPct) / 100) * 10) / 10
              : undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Save failed')
        return
      }
      setSuccess('Measurements saved')
      setShowForm(false)
      setForm(emptyForm)
      loadMeasurements()
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return
    await fetch('/api/clients/' + clientId + '/measurements?id=' + id, { method: 'DELETE' })
    setMeasurements(prev => prev.filter(m => m.id !== id))
  }

  const latest = measurements[0] ?? null
  const previous = measurements[1] ?? null

  const SUMMARY_METRICS = [
    { label: 'Height', value: fmt(latest?.height_in, '"'), current: latest?.height_in ?? null, prev: previous?.height_in ?? null, lowerIsBetter: false },
    { label: 'Weight', value: fmt(latest?.weight_lbs, ' lbs'), current: latest?.weight_lbs ?? null, prev: previous?.weight_lbs ?? null, lowerIsBetter: true },
    { label: 'Body Fat', value: fmt(latest?.body_fat_pct, '%'), current: latest?.body_fat_pct ?? null, prev: previous?.body_fat_pct ?? null, lowerIsBetter: true },
    { label: 'Lean Mass', value: fmt(latest?.lean_mass_lbs, ' lbs'), current: latest?.lean_mass_lbs ?? null, prev: previous?.lean_mass_lbs ?? null, lowerIsBetter: false },
    { label: 'Waist', value: fmt(latest?.waist_in, '"'), current: latest?.waist_in ?? null, prev: previous?.waist_in ?? null, lowerIsBetter: true },
    { label: 'Hips', value: fmt(latest?.hips_in, '"'), current: latest?.hips_in ?? null, prev: previous?.hips_in ?? null, lowerIsBetter: false },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + clientId}
              className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Measurements</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="forge-btn-gold text-sm flex items-center gap-2">
            <Plus size={15} /> Log Measurements
          </button>
        </div>

        {success && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-sm text-emerald-400">{success}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="text-red-400" />
            <span className="text-sm text-red-400 flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button>
          </div>
        )}

        {latest && (
          <div className="bg-[#111111] border border-white/8 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Latest — {formatDate(latest.measurement_date)}</h2>
              {previous && <span className="text-xs text-white/30">vs {formatDate(previous.measurement_date)}</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {SUMMARY_METRICS.filter(m => m.current !== null).map(m => (
                <div key={m.label} className="bg-white/4 rounded-xl p-3">
                  <div className="text-xs text-white/35 mb-1">{m.label}</div>
                  <div className="text-lg font-bold text-white">{m.value}</div>
                  <div className="text-xs mt-1">
                    <Trend current={m.current} previous={m.prev} lowerIsBetter={m.lowerIsBetter} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Log Measurements</h2>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>

            <div>
              <label className="forge-label">Date</label>
              <input type="date" value={form.measurementDate} onChange={e => set('measurementDate', e.target.value)} className="forge-input" />
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Body Composition</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="forge-label">Height (in)</label><input type="number" step="0.1" value={form.heightIn} onChange={e => set('heightIn', e.target.value)} className="forge-input" placeholder="65.0" /></div>
                <div><label className="forge-label">Weight (lbs)</label><input type="number" step="0.1" value={form.weightLbs} onChange={e => set('weightLbs', e.target.value)} className="forge-input" placeholder="148.0" /></div>
                <div><label className="forge-label">Body Fat %</label><input type="number" step="0.1" value={form.bodyFatPct} onChange={e => set('bodyFatPct', e.target.value)} className="forge-input" placeholder="28.5" /></div>
                <div><label className="forge-label">Lean Mass (lbs)</label><input type="number" step="0.1" value={form.leanMassLbs} onChange={e => set('leanMassLbs', e.target.value)} className="forge-input" placeholder="106.0" /></div>
              </div>
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Circumference (inches)</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="forge-label">Waist</label><input type="number" step="0.1" value={form.waistIn} onChange={e => set('waistIn', e.target.value)} className="forge-input" placeholder="30.0" /></div>
                <div><label className="forge-label">Hips</label><input type="number" step="0.1" value={form.hipsIn} onChange={e => set('hipsIn', e.target.value)} className="forge-input" placeholder="38.0" /></div>
                <div><label className="forge-label">Chest</label><input type="number" step="0.1" value={form.chestIn} onChange={e => set('chestIn', e.target.value)} className="forge-input" placeholder="34.0" /></div>
                <div><label className="forge-label">Left Arm</label><input type="number" step="0.1" value={form.leftArmIn} onChange={e => set('leftArmIn', e.target.value)} className="forge-input" placeholder="12.0" /></div>
                <div><label className="forge-label">Right Arm</label><input type="number" step="0.1" value={form.rightArmIn} onChange={e => set('rightArmIn', e.target.value)} className="forge-input" placeholder="12.0" /></div>
                <div><label className="forge-label">Left Thigh</label><input type="number" step="0.1" value={form.leftThighIn} onChange={e => set('leftThighIn', e.target.value)} className="forge-input" placeholder="22.0" /></div>
                <div><label className="forge-label">Right Thigh</label><input type="number" step="0.1" value={form.rightThighIn} onChange={e => set('rightThighIn', e.target.value)} className="forge-input" placeholder="22.0" /></div>
              </div>
            </div>

            <div>
              <label className="forge-label">Notes (optional)</label>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className="forge-input resize-none" placeholder="e.g. morning fasted, post competition..." />
            </div>

            <button onClick={handleSave} disabled={saving}
              className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Ruler size={16} /> Save Measurements</>}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/20" />
          </div>
        ) : measurements.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Ruler size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No measurements logged yet</p>
            <p className="text-xs text-white/25 mt-1">Log the first entry to start tracking progress over time</p>
            <button onClick={() => setShowForm(true)} className="mt-4 forge-btn-gold text-sm flex items-center gap-2 mx-auto">
              <Plus size={14} /> Log First Measurement
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono mb-3">History</h2>
            <div className="space-y-2">
              {measurements.map((m, i) => {
                const prev = measurements[i + 1] ?? null
                return (
                  <div key={m.id} className="bg-[#111111] border border-white/6 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-white">{formatDate(m.measurement_date)}</span>
                      <button onClick={() => handleDelete(m.id)} className="text-white/15 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      {[
                        { label: 'Height', value: fmt(m.height_in, '"'), current: m.height_in, prev: prev?.height_in ?? null, lower: false },
                        { label: 'Weight', value: fmt(m.weight_lbs, ' lbs'), current: m.weight_lbs, prev: prev?.weight_lbs ?? null, lower: true },
                        { label: 'BF%', value: fmt(m.body_fat_pct, '%'), current: m.body_fat_pct, prev: prev?.body_fat_pct ?? null, lower: true },
                        { label: 'Waist', value: fmt(m.waist_in, '"'), current: m.waist_in, prev: prev?.waist_in ?? null, lower: true },
                        { label: 'Hips', value: fmt(m.hips_in, '"'), current: m.hips_in, prev: prev?.hips_in ?? null, lower: false },
                        { label: 'Chest', value: fmt(m.chest_in, '"'), current: m.chest_in, prev: prev?.chest_in ?? null, lower: false },
                        { label: 'L Arm', value: fmt(m.left_arm_in, '"'), current: m.left_arm_in, prev: prev?.left_arm_in ?? null, lower: false },
                        { label: 'R Arm', value: fmt(m.right_arm_in, '"'), current: m.right_arm_in, prev: prev?.right_arm_in ?? null, lower: false },
                        { label: 'Thigh', value: fmt(m.left_thigh_in, '"'), current: m.left_thigh_in, prev: prev?.left_thigh_in ?? null, lower: false },
                      ].filter(f => f.current !== null).map(f => (
                        <div key={f.label} className="bg-white/4 rounded-lg p-2">
                          <div className="text-white/35">{f.label}</div>
                          <div className="text-white font-semibold mt-0.5">{f.value}</div>
                          <Trend current={f.current ?? null} previous={f.prev} lowerIsBetter={f.lower} />
                        </div>
                      ))}
                    </div>
                    {m.notes && <p className="text-xs text-white/35 mt-2 pt-2 border-t border-white/6">{m.notes}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}