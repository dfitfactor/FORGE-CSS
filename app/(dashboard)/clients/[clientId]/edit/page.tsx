'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, Loader2, CheckCircle, AlertCircle,
  User, Target, Activity, Dumbbell, FlaskConical, FileText, X
} from 'lucide-react'

type FormState = {
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  status: string
  primaryGoal: string
  motivation: string
  obstacles: string
  weightLbs: string
  bodyFatPct: string
  programTier: string
  sessionsPerMonth: string
  targetSessionsPerWeek: number
  injuries: string[]
  availableEquipment: string[]
  notes: string
}

const EQUIPMENT_OPTIONS = [
  'Barbell', 'Dumbbells', 'Kettlebell', 'Cable Machine',
  'Leg Press', 'Hip Thrust Bench', 'Resistance Bands',
  'TRX', 'Pull-up Bar', 'Full Gym', 'Bodyweight Only',
]

function TagInput({ tags, onAdd, onRemove, placeholder, tagClass }: {
  tags: string[]
  onAdd: (t: string) => void
  onRemove: (t: string) => void
  placeholder: string
  tagClass: string
}) {
  const [input, setInput] = useState('')
  function handleKey(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      if (!tags.includes(input.trim())) onAdd(input.trim())
      setInput('')
    }
  }
  return (
    <div className="flex flex-wrap gap-2 p-3 bg-forge-surface-3 border border-forge-border rounded-lg min-h-[48px]">
      {tags.map(tag => (
        <span key={tag} className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full border ${tagClass}`}>
          {tag}
          <button type="button" onClick={() => onRemove(tag)} className="ml-1 hover:opacity-70 text-base leading-none">x</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={tags.length === 0 ? placeholder : 'Add more...'}
        className="bg-transparent text-sm text-forge-text-primary outline-none flex-1 min-w-[140px] placeholder-forge-text-muted"
      />
    </div>
  )
}

export default function EditClientPage() {
  const router = useRouter()
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')

  const [form, setForm] = useState<FormState>({
    fullName: '', email: '', phone: '', dateOfBirth: '', status: 'active',
    primaryGoal: '', motivation: '', obstacles: '',
    weightLbs: '', bodyFatPct: '',
    programTier: '', sessionsPerMonth: '', targetSessionsPerWeek: 3,
    injuries: [], availableEquipment: [], notes: '',
  })

  useEffect(() => {
    if (!clientId) return
    fetch('/api/clients/' + clientId)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then(d => {
        const c = d.client
        if (!c) throw new Error('No client data')
        setClientName(c.full_name ?? '')
        setForm({
          fullName: c.full_name ?? '',
          email: c.email ?? '',
          phone: c.phone ?? '',
          dateOfBirth: c.date_of_birth ?? '',
          status: c.status ?? 'active',
          primaryGoal: c.primary_goal ?? '',
          motivation: c.motivation ?? '',
          obstacles: c.obstacles ?? '',
          weightLbs: c.weight_lbs ?? '',
          bodyFatPct: c.body_fat_pct ?? '',
          programTier: c.program_tier ?? '',
          sessionsPerMonth: c.sessions_per_month ?? '',
          targetSessionsPerWeek: c.sessions_per_week ?? c.target_sessions_per_week ?? 3,
          injuries: Array.isArray(c.injuries) ? c.injuries : [],
          availableEquipment: Array.isArray(c.available_equipment) ? c.available_equipment : [],
          notes: c.notes ?? '',
        })
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load client: ' + err.message)
        setLoading(false)
      })
  }, [clientId])

  function set(key: keyof FormState, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.fullName.trim()) { setError('Full name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/clients/' + clientId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email || undefined,
          phone: form.phone || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          status: form.status,
          primaryGoal: form.primaryGoal || undefined,
          motivation: form.motivation || undefined,
          obstacles: form.obstacles || undefined,
          weightLbs: form.weightLbs ? Number(form.weightLbs) : undefined,
          bodyFatPct: form.bodyFatPct ? Number(form.bodyFatPct) : undefined,
          programTier: form.programTier || undefined,
          sessionsPerMonth: form.sessionsPerMonth ? Number(form.sessionsPerMonth) : undefined,
          targetSessionsPerWeek: Number(form.targetSessionsPerWeek),
          injuries: form.injuries,
          availableEquipment: form.availableEquipment,
          notes: form.notes || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Save failed (' + res.status + ')')
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/clients/' + clientId), 1500)
    } catch {
      setError('Network error - please try again')
    } finally {
      setSaving(false)
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    active: 'text-emerald-400', paused: 'text-amber-400',
    graduated: 'text-blue-400', churned: 'text-red-400',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-forge-gold" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <Link href={'/clients/' + clientId}
            className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">Edit Profile</h1>
            <p className="text-sm text-white/40">{clientName}</p>
          </div>
        </div>

        {success && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">Profile updated - redirecting...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="text-red-400" />
            <span className="text-sm text-red-400 flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User size={15} className="text-[#D4AF37]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Identity</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="forge-label">Full Name</label>
              <input value={form.fullName} onChange={e => set('fullName', e.target.value)} className="forge-input" placeholder="Client full name" />
            </div>
            <div>
              <label className="forge-label">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="forge-input" placeholder="email@example.com" />
            </div>
            <div>
              <label className="forge-label">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} className="forge-input" placeholder="+1 (555) 000-0000" />
            </div>
            <div>
              <label className="forge-label">Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} className="forge-input" />
            </div>
            <div className="col-span-2">
              <label className="forge-label">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={'forge-input ' + (STATUS_COLORS[form.status] ?? '')}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="graduated">Graduated</option>
                <option value="churned">Churned</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={15} className="text-[#D4AF37]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Program</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="forge-label">Program Tier</label>
              <select value={form.programTier} onChange={e => set('programTier', e.target.value)} className="forge-input">
                <option value="">Select tier...</option>
                <option value="forge_lite">Forge Lite</option>
                <option value="forge_core">Forge Core</option>
                <option value="forge_elite">Forge Elite</option>
              </select>
            </div>
            <div>
              <label className="forge-label">Sessions / Month</label>
              <input type="number" min={1} max={30} value={form.sessionsPerMonth} onChange={e => set('sessionsPerMonth', e.target.value)} className="forge-input" placeholder="12" />
            </div>
            <div>
              <label className="forge-label">Sessions / Week Target</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => set('targetSessionsPerWeek', Math.max(1, form.targetSessionsPerWeek - 1))}
                  className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-colors text-lg leading-none">-</button>
                <div className="flex-1 forge-input text-center font-bold text-[#D4AF37]">{form.targetSessionsPerWeek}</div>
                <button type="button" onClick={() => set('targetSessionsPerWeek', Math.min(7, form.targetSessionsPerWeek + 1))}
                  className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-colors text-lg leading-none">+</button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Target size={15} className="text-[#D4AF37]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Goals and Motivation</h2>
          </div>
          <div>
            <label className="forge-label">Primary Goal</label>
            <textarea rows={3} value={form.primaryGoal} onChange={e => set('primaryGoal', e.target.value)} className="forge-input resize-none" placeholder="What does success look like for this client?" />
          </div>
          <div>
            <label className="forge-label">Motivation / Why</label>
            <textarea rows={3} value={form.motivation} onChange={e => set('motivation', e.target.value)} className="forge-input resize-none" placeholder="What drives this client?" />
          </div>
          <div>
            <label className="forge-label">Obstacles / Challenges</label>
            <textarea rows={3} value={form.obstacles} onChange={e => set('obstacles', e.target.value)} className="forge-input resize-none" placeholder="What gets in the way?" />
          </div>
        </div>

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={15} className="text-[#D4AF37]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Physical Baseline</h2>
          </div>
          <p className="text-xs text-white/35">Reference values from intake. Use Measurements to track progress over time.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="forge-label">Weight (lbs)</label>
              <input type="number" step={0.5} value={form.weightLbs} onChange={e => set('weightLbs', e.target.value)} className="forge-input" placeholder="148" />
            </div>
            <div>
              <label className="forge-label">Body Fat %</label>
              <input type="number" step={0.1} value={form.bodyFatPct} onChange={e => set('bodyFatPct', e.target.value)} className="forge-input" placeholder="28.5" />
            </div>
          </div>
        </div>

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical size={15} className="text-[#D4AF37]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Injuries and Limitations</h2>
          </div>
          <p className="text-xs text-white/35">Press Enter or comma to add. Click x to remove.</p>
          <TagInput
            tags={form.injuries}
            onAdd={t => set('injuries', [...form.injuries, t])}
            onRemove={t => set('injuries', form.injuries.filter(i => i !== t))}
            placeholder="e.g. Left knee, Lower back..."
            tagClass="bg-red-500/10 text-red-400 border-red-500/20"
          />
        </div>

        <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Dumbbell size={15} className="text-[#D4AF37]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Available Equipment</h2>
          </div>
          <p className="text-xs text-white/35">Click to toggle. Add custom equipment below.</p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map(eq => {
              const selected = form.availableEquipment.includes(eq)
              return (
                <button key={eq} type="button"
                  onClick={() => set('availableEquipment', selected ? form.availableEquipment.filter(e => e !== eq) : [...form.availableEquipment, eq])}
                  className={'text-xs px-3 py-1.5 rounded-full border transition-all ' + (selected ? 'bg-forge-purple/30 text-[#D4AF37] border-forge-purple/50' : 'bg-forge-surface-3 text-forge-text-muted border-forge-border hover:border-white/20')}>
                  {eq}
                </button>
              )
            })}
          </div>
          <TagInput
            tags={form.availableEquipment.filter(e => !EQUIPMENT_OPTIONS.includes(e))}
            onAdd={t => set('availableEquipment', [...form.availableEquipment, t])}
            onRemove={t => set('availableEquipment', form.availableEquipment.filter(e => e !== t))}
            placeholder="Add custom equipment..."
            tagClass="bg-forge-purple/20 text-forge-text-secondary border-forge-border"
          />
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={15} className="text-[#D4AF37]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Coach Notes</h2>
            <span className="ml-auto text-[10px] font-mono text-white/25 uppercase tracking-widest">Internal only</span>
          </div>
          <p className="text-xs text-white/35">Private notes for your reference. Not visible to the client.</p>
          <textarea rows={6} value={form.notes} onChange={e => set('notes', e.target.value)} className="forge-input resize-none" placeholder="Coaching observations, patterns, context, reminders..." />
        </div>

        <button onClick={handleSave} disabled={saving || success}
          className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 text-base font-semibold disabled:opacity-60">
          {saving
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
            : success
            ? <><CheckCircle className="w-5 h-5" /> Saved!</>
            : <><Save className="w-5 h-5" /> Save Changes</>
          }
        </button>

        <div className="h-8" />
      </div>
    </div>
  )
}
