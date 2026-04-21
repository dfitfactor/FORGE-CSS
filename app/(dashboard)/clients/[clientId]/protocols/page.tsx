'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Dumbbell, Utensils, Heart, ClipboardList,
  Loader2, CheckCircle, AlertCircle, X, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Calendar, Zap, Layers, Sparkles,
  Brain, MessageSquare, Edit3, Check, Trash2
} from 'lucide-react'

type Protocol = {
  id: string; version: number; is_active: boolean; name: string
  protocol_type: string; stage: string; generation_state: string | null
  bar_at_generation: number | null; bli_at_generation: number | null
  dbi_at_generation: number | null; movement_template: string | null
  sessions_per_week: number | null; complexity_ceiling: number | null
  volume_target: string | null; calorie_target: number | null
  protein_target_g: number | null; carb_target_g: number | null
  fat_target_g: number | null; meal_frequency: number | null
  nutrition_complexity: string | null
  protocol_payload: Record<string, unknown>; generated_by: string
  effective_date: string; expiry_date: string | null
  notes: string | null; coach_notes: string | null; created_at: string
}

type GeneratedProtocol = {
  name: string
  rationale: string
  stateAnalysis?: {
    capacityClass?: string
    physiologicalFocus?: string
    adherenceRisk?: string
    summary?: string
  }
  protocolRationale?: {
    behaviorLink?: string
    physiologyLink?: string
    executionFocus?: string
  }
  movementProtocol?: {
    progressionModel?: string[]
    rationale?: string
  }
  nutritionProtocol?: {
    caloriePhase?: string
    macroJustification?: string
    adherenceFallback?: string
    bsldsTemplate?: {
      trainingDay?: Record<string, string>
      restDay?: Record<string, string>
    }
  }
  recoveryProtocol?: {
    progressionNotes?: string
  }
  monitoringMetrics?: {
    primary?: string[]
    secondary?: string[]
    cadence?: string
  }
  decisionRules?: string[]
  phaseProgressionCriteria?: string[]
  coachIntelligence?: {
    progressionAssessment?: string
    gapsIdentified?: string[]
    oversights?: string[]
    riskFlags?: string[]
    nextIterationStrategy?: string[]
  }
  sessionStructure?: {
    frequency: number; sessionsPerWeek: number; sessionType: string
    complexityCeiling: number; volumeLevel: string
    activationBlock: Array<{ exerciseName: string; sets: number; reps: string; tempo?: string; coachingCue?: string; swapOption?: string }>
    primaryBlock: Array<{ exerciseName: string; sets: number; reps: string; tempo?: string; loadGuidance?: string; coachingCue?: string; swapOption?: string }>
    accessoryBlock: Array<{ exerciseName: string; sets: number; reps: string; tempo?: string; coachingCue?: string }>
    finisherBlock?: Array<{ exerciseName: string; sets: number; reps: string }>
  }
  nutritionStructure?: {
    dailyCalories: number; proteinG: number; carbG: number; fatG: number
    mealFrequency: number; mealTiming: string; complexityLevel: string
    mealPlan?: Array<{ time: string; meal: string; foods: string; notes?: string }>
    keyGuidelines: string[]; disruption_protocol: string
  }
  recoveryStructure?: {
    sleepTarget: string; stressReductionProtocol: string
    activeRecoveryDays: number; mobilityMinutes: number
    keyRecoveryPractices: string[]
  }
  coachNotes: string
  clientFacingMessage: string
}

type GenerationContext = {
  bie: { bar: number; bli: number; dbi: number; cdi: number; lsi: number; pps: number }
  bieSource?: 'snapshot' | 'estimated'
  generationState: string
  stage: string
  protocolFrame?: string
  physiqueFocus?: boolean
  dataPoints: { adherenceRecords: number; journalEntries: number; checkins: number; biomarkers: string; aiDocs: number }
}

const PROTOCOL_TYPES = [
  { value: 'movement', label: 'Movement', icon: Dumbbell, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', desc: 'Training sessions, exercise selection, progression' },
  { value: 'nutrition', label: 'Nutrition', icon: Utensils, color: 'text-amber-400 bg-amber-400/10 border-amber-400/20', desc: 'Macro targets, meal structure, food guidelines' },
  { value: 'recovery', label: 'Recovery', icon: Heart, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', desc: 'Sleep, stress, restoration protocols' },
  { value: 'composite', label: 'Composite', icon: Layers, color: 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20', desc: 'Full protocol — movement + nutrition + recovery' },
]

const STAGES = ['foundations', 'optimization', 'resilience', 'growth', 'empowerment']
const VOLUME_TARGETS = ['Full', 'Moderate', 'Reduced', 'Minimum Viable']

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function RequiredAsterisk() {
  return <span className="ml-1 text-red-400">*</span>
}

export default function ProtocolsPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [clientName, setClientName] = useState('')
  const [clientStage, setClientStage] = useState('foundations')
  const [clientBIE, setClientBIE] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterType, setFilterType] = useState('all')
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null)

  // Generation state
  const [genType, setGenType] = useState('composite')
  const [coachDirectives, setCoachDirectives] = useState('')
  const [generated, setGenerated] = useState<GeneratedProtocol | null>(null)
  const [genContext, setGenContext] = useState<GenerationContext | null>(null)
  const [editedNotes, setEditedNotes] = useState('')
  const [editedCoachNotes, setEditedCoachNotes] = useState('')
  const [showInsights, setShowInsights] = useState(true)

  // Manual form state
  const [form, setForm] = useState({
    name: '', protocolType: 'movement', stage: 'foundations',
    generationState: '', effectiveDate: new Date().toISOString().split('T')[0],
    movementTemplate: '', sessionsPerWeek: '', complexityCeiling: '',
    volumeTarget: '', calorieTarget: '', proteinTargetG: '',
    carbTargetG: '', fatTargetG: '', mealFrequency: '',
    nutritionComplexity: '', notes: '', coachNotes: '',
  })

  useEffect(() => {
    if (!clientId) return
    fetch('/api/clients/' + clientId).then(r => r.json()).then(d => {
      setClientName(d.client?.full_name ?? '')
      setClientStage(d.client?.current_stage ?? 'foundations')
      const snap = d.latestSnapshot
      if (snap) {
        setClientBIE({ bar: snap.bar, bli: snap.bli, dbi: snap.dbi, cdi: snap.cdi, lsi: snap.lsi, pps: snap.pps })
      }
      setForm(prev => ({ ...prev, stage: d.client?.current_stage ?? 'foundations' }))
    }).catch(() => {})
    loadProtocols()
  }, [clientId])

  function loadProtocols() {
    fetch('/api/clients/' + clientId + '/protocols')
      .then(r => r.json())
      .then(d => { setProtocols(d.protocols ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function setF(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function resetForm() {
    setForm({
      name: '',
      protocolType: 'movement',
      stage: clientStage || 'foundations',
      generationState: '',
      effectiveDate: new Date().toISOString().split('T')[0],
      movementTemplate: '',
      sessionsPerWeek: '',
      complexityCeiling: '',
      volumeTarget: '',
      calorieTarget: '',
      proteinTargetG: '',
      carbTargetG: '',
      fatTargetG: '',
      mealFrequency: '',
      nutritionComplexity: '',
      notes: '',
      coachNotes: '',
    })
    setEditingProtocolId(null)
  }

  function handleEditProtocol(protocol: Protocol) {
    setEditingProtocolId(protocol.id)
    setGenerated(null)
    setGenContext(null)
    setShowGenerate(false)
    setShowForm(true)
    setForm({
      name: protocol.name ?? '',
      protocolType: protocol.protocol_type ?? 'movement',
      stage: protocol.stage ?? clientStage ?? 'foundations',
      generationState: protocol.generation_state ?? '',
      effectiveDate: protocol.effective_date ?? new Date().toISOString().split('T')[0],
      movementTemplate: protocol.movement_template ?? '',
      sessionsPerWeek: protocol.sessions_per_week?.toString() ?? '',
      complexityCeiling: protocol.complexity_ceiling?.toString() ?? '',
      volumeTarget: protocol.volume_target ?? '',
      calorieTarget: protocol.calorie_target?.toString() ?? '',
      proteinTargetG: protocol.protein_target_g?.toString() ?? '',
      carbTargetG: protocol.carb_target_g?.toString() ?? '',
      fatTargetG: protocol.fat_target_g?.toString() ?? '',
      mealFrequency: protocol.meal_frequency?.toString() ?? '',
      nutritionComplexity: protocol.nutrition_complexity ?? '',
      notes: protocol.notes ?? '',
      coachNotes: protocol.coach_notes ?? '',
    })
  }

  async function handleGenerate() {
    setGenerating(true); setError(''); setGenerated(null)
    try {
      const res = await fetch('/api/clients/' + clientId + '/protocols/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocolType: genType, coachDirectives: coachDirectives || undefined }),
      })
      if (!res.ok) {
        const raw = await res.text().catch(() => '')
        let message = 'Generation failed'

        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            message = parsed.error ?? parsed.message ?? message
          } catch {
            const normalized = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            if (/duration|timed out|max duration|function invocation/i.test(normalized)) {
              message = 'Protocol generation timed out before the server could finish.'
            } else if (normalized) {
              message = normalized.slice(0, 240)
            }
          }
        }

        setError(message)
        return
      }
      const data = await res.json()
      setGenerated(data.generated)
      setGenContext(data.context)
      setEditedNotes(data.generated.clientFacingMessage ?? '')
      setEditedCoachNotes(data.generated.coachNotes ?? '')
    } catch { setError('Network error during generation') } finally { setGenerating(false) }
  }

  async function handleSaveGenerated() {
    if (!generated) return
    setSaving(true); setError('')
    try {
      const ss = generated.sessionStructure
      const ns = generated.nutritionStructure

      const res = await fetch('/api/clients/' + clientId + '/protocols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generated.name,
          protocolType: genType,
          stage: genContext?.stage ?? clientStage,
          generationState: genContext?.generationState ?? 'B',
          barAtGeneration: genContext?.bie.bar,
          bliAtGeneration: genContext?.bie.bli,
          dbiAtGeneration: genContext?.bie.dbi,
          movementTemplate: ss?.sessionType ?? null,
          sessionsPerWeek: ss?.sessionsPerWeek ?? null,
          complexityCeiling: ss?.complexityCeiling ?? null,
          volumeTarget: ss?.volumeLevel ?? null,
          calorieTarget: ns?.dailyCalories ?? null,
          proteinTargetG: ns?.proteinG ?? null,
          carbTargetG: ns?.carbG ?? null,
          fatTargetG: ns?.fatG ?? null,
          mealFrequency: ns?.mealFrequency ?? null,
          nutritionComplexity: ns?.complexityLevel ?? null,
          protocolPayload: generated,
          generatedBy: 'ai',
          notes: editedNotes,
          coachNotes: editedCoachNotes,
          effectiveDate: new Date().toISOString().split('T')[0],
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Save failed'); return }
      setSuccess('Protocol saved successfully')
      setShowGenerate(false)
      setGenerated(null)
      setGenContext(null)
      setCoachDirectives('')
      loadProtocols()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  async function handleSaveManual() {
    if (!form.name.trim()) { setError('Protocol name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name: form.name,
        stage: form.stage,
        generation_state: form.generationState || null,
        effective_date: form.effectiveDate || new Date().toISOString().split('T')[0],
        movementTemplate: form.movementTemplate || null,
        sessions_per_week: form.sessionsPerWeek ? Number(form.sessionsPerWeek) : null,
        complexity_ceiling: form.complexityCeiling ? Number(form.complexityCeiling) : null,
        volume_target: form.volumeTarget || null,
        calorie_target: form.calorieTarget ? Number(form.calorieTarget) : null,
        protein_target_g: form.proteinTargetG ? Number(form.proteinTargetG) : null,
        carb_target_g: form.carbTargetG ? Number(form.carbTargetG) : null,
        fat_target_g: form.fatTargetG ? Number(form.fatTargetG) : null,
        meal_frequency: form.mealFrequency ? Number(form.mealFrequency) : null,
        nutrition_complexity: form.nutritionComplexity || null,
        notes: form.notes || null,
        coach_notes: form.coachNotes || null,
      }

      const res = await fetch(
        editingProtocolId
          ? '/api/clients/' + clientId + '/protocols/' + editingProtocolId
          : '/api/clients/' + clientId + '/protocols',
        {
          method: editingProtocolId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editingProtocolId
              ? payload
              : {
                  ...form,
                  barAtGeneration: clientBIE.bar || null,
                  bliAtGeneration: clientBIE.bli || null,
                  dbiAtGeneration: clientBIE.dbi || null,
                  sessionsPerWeek: form.sessionsPerWeek ? Number(form.sessionsPerWeek) : null,
                  complexityCeiling: form.complexityCeiling ? Number(form.complexityCeiling) : null,
                  calorieTarget: form.calorieTarget ? Number(form.calorieTarget) : null,
                  proteinTargetG: form.proteinTargetG ? Number(form.proteinTargetG) : null,
                  carbTargetG: form.carbTargetG ? Number(form.carbTargetG) : null,
                  fatTargetG: form.fatTargetG ? Number(form.fatTargetG) : null,
                  mealFrequency: form.mealFrequency ? Number(form.mealFrequency) : null,
                  generatedBy: 'coach',
                }
          ),
        }
      )
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Save failed'); return }
      setSuccess(editingProtocolId ? 'Protocol updated' : 'Protocol created')
      setShowForm(false)
      resetForm()
      loadProtocols()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  async function toggleActive(id: string, current: boolean) {
    await fetch('/api/clients/' + clientId + '/protocols', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !current }),
    })
    setProtocols(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p))
  }

  async function handleDeleteProtocol(protocol: Protocol) {
    const confirmed = window.confirm(`Delete "${protocol.name}"? This cannot be undone.`)
    if (!confirmed) return

    setDeletingId(protocol.id)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/protocols/${protocol.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Delete failed')
        return
      }
      setProtocols(prev => prev.filter(p => p.id !== protocol.id))
      setExpanded(current => current === protocol.id ? null : current)
      setSuccess('Protocol deleted')
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Network error while deleting protocol')
    } finally {
      setDeletingId(null)
    }
  }

  const active = protocols.filter(p => p.is_active)
  const inactive = protocols.filter(p => !p.is_active)
  const filtered = filterType === 'all' ? protocols : protocols.filter(p => p.protocol_type === filterType)

  function ProtocolCard({ p }: { p: Protocol }) {
    const typeInfo = PROTOCOL_TYPES.find(t => t.value === p.protocol_type)
    const Icon = typeInfo?.icon ?? Layers
    const isOpen = expanded === p.id
    return (
      <div className={'rounded-xl overflow-hidden border transition-all ' + (p.is_active ? 'bg-[#111111] border-white/10' : 'bg-[#0d0d0d] border-white/5 opacity-60')}>
        <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpanded(isOpen ? null : p.id)}>
          <div className={'w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ' + (typeInfo?.color ?? '')}>
            <Icon size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">{p.name}</span>
              {p.is_active && <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-mono uppercase">Active</span>}
              <span className={'text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase ' + (typeInfo?.color ?? '')}>{typeInfo?.label}</span>
              {p.generated_by === 'ai' && <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full font-mono uppercase flex items-center gap-1"><Sparkles size={8} />AI</span>}
              <span className="text-[10px] text-white/25 font-mono">v{p.version}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-white/35 flex-wrap">
              <span className="capitalize">{p.stage}</span>
              {p.generation_state && <span>State {p.generation_state}</span>}
              {p.sessions_per_week && <span>{p.sessions_per_week}x/week</span>}
              {p.calorie_target && <span>{p.calorie_target} kcal</span>}
              <span className="flex items-center gap-1"><Calendar size={10} />{formatDate(p.effective_date)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); toggleActive(p.id, p.is_active) }}
              className={'text-white/30 hover:text-white transition-colors ' + (p.is_active ? 'text-emerald-400' : '')}>
              {p.is_active ? <ToggleRight size={20} className="text-emerald-400" /> : <ToggleLeft size={20} />}
            </button>
            {isOpen ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-white/6 p-4 space-y-4">
            {(p.bar_at_generation || p.dbi_at_generation) && (
              <div className="grid grid-cols-3 gap-2">
                {p.bar_at_generation && <div className="bg-white/3 rounded-lg p-2 text-center"><p className="text-[10px] text-white/30 mb-1 font-mono">BAR</p><p className="text-sm font-bold text-white">{p.bar_at_generation}</p></div>}
                {p.bli_at_generation && <div className="bg-white/3 rounded-lg p-2 text-center"><p className="text-[10px] text-white/30 mb-1 font-mono">BLI</p><p className="text-sm font-bold text-white">{p.bli_at_generation}</p></div>}
                {p.dbi_at_generation && <div className="bg-white/3 rounded-lg p-2 text-center"><p className="text-[10px] text-white/30 mb-1 font-mono">DBI</p><p className="text-sm font-bold text-white">{p.dbi_at_generation}</p></div>}
              </div>
            )}
            {p.protocol_type === 'movement' && (
              <div className="space-y-2">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30">Movement</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {p.movement_template && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Template</span><span className="text-white/70">{p.movement_template}</span></div>}
                  {p.sessions_per_week && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Frequency</span><span className="text-white/70">{p.sessions_per_week}x/week</span></div>}
                  {p.complexity_ceiling && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Complexity</span><span className="text-white/70">Tier {p.complexity_ceiling}</span></div>}
                  {p.volume_target && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Volume</span><span className="text-white/70">{p.volume_target}</span></div>}
                </div>
              </div>
            )}
            {p.protocol_type === 'nutrition' && (p.calorie_target || p.protein_target_g) && (
              <div className="space-y-2">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30">Nutrition</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {p.calorie_target && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Calories</span><span className="text-white/70">{p.calorie_target} kcal</span></div>}
                  {p.protein_target_g && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Protein</span><span className="text-white/70">{p.protein_target_g}g</span></div>}
                  {p.carb_target_g && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Carbs</span><span className="text-white/70">{p.carb_target_g}g</span></div>}
                  {p.fat_target_g && <div className="flex justify-between bg-white/3 rounded-lg p-2"><span className="text-white/40">Fats</span><span className="text-white/70">{p.fat_target_g}g</span></div>}
                </div>
              </div>
            )}
            {p.notes && <div><p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Client Notes</p><p className="text-sm text-white/55 leading-relaxed whitespace-pre-wrap">{p.notes}</p></div>}
            {p.coach_notes && <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-xl p-3"><p className="text-xs text-white/30 mb-1">Coach Notes</p><p className="text-sm text-[#D4AF37]/80">{p.coach_notes}</p></div>}
            <div className="flex items-center justify-between text-xs text-white/25 pt-2 border-t border-white/6">
              <span>Generated by {p.generated_by} · {formatDate(p.created_at)}</span>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <span className="font-mono">v{p.version}</span>
                <Link
                  href="#"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleEditProtocol(p)
                  }}
                  className="px-2 py-1 bg-white/6 text-white/70 border border-white/10 rounded-lg text-[10px] font-mono uppercase tracking-wide hover:bg-white/10 transition-colors">
                  Edit
                </Link>
                <Link
                  href={`/clients/${clientId}/protocols/${p.id}`}
                  onClick={e => e.stopPropagation()}
                  className="px-2 py-1 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 rounded-lg text-[10px] font-mono uppercase tracking-wide hover:bg-[#D4AF37]/20 transition-colors">
                  View PDF
                </Link>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    void handleDeleteProtocol(p)
                  }}
                  disabled={deletingId === p.id}
                  className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-mono uppercase tracking-wide hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-1">
                  {deletingId === p.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + clientId} className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Protocols</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button onClick={() => { setShowForm(false); setShowGenerate(true) }}
              className="forge-btn-gold text-sm flex items-center gap-2">
              <Sparkles size={15} /> Generate with AI
            </button>
            <button onClick={() => { setShowGenerate(false); resetForm(); setShowForm(true) }}
              className="px-3 py-2 bg-white/6 border border-white/10 rounded-xl text-xs text-white/50 hover:text-white transition-colors flex items-center gap-1.5">
              <Plus size={13} /> Manual
            </button>
          </div>
        </div>

        {/* Banners */}
        {success && <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"><CheckCircle size={16} className="text-emerald-400" /><span className="text-sm text-emerald-400">{success}</span></div>}
        {error && <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"><AlertCircle size={16} className="text-red-400" /><span className="text-sm text-red-400 flex-1">{error}</span><button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button></div>}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-[#111111] border border-white/8 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{active.length}</div>
            <div className="text-xs text-white/35 mt-1 font-mono uppercase tracking-wide">Active</div>
          </div>
          <div className="bg-[#111111] border border-white/8 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{protocols.length}</div>
            <div className="text-xs text-white/35 mt-1 font-mono uppercase tracking-wide">Total</div>
          </div>
          <div className="bg-[#111111] border border-white/8 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#D4AF37] capitalize">{clientStage}</div>
            <div className="text-xs text-white/35 mt-1 font-mono uppercase tracking-wide">Stage</div>
          </div>
        </div>

        {/* Filter tabs */}
        {protocols.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterType('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === 'all' ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>All ({protocols.length})</button>
            {PROTOCOL_TYPES.map(t => {
              const count = protocols.filter(p => p.protocol_type === t.value).length
              if (count === 0) return null
              return <button key={t.value} onClick={() => setFilterType(t.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === t.value ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>{t.label} ({count})</button>
            })}
          </div>
        )}

        {/* AI Generate Panel */}
        {showGenerate && (
          <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-white/6">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Sparkles size={16} className="text-[#D4AF37]" />
                <h2 className="text-sm font-semibold text-white">Generate Protocol with AI</h2>
              </div>
              <button onClick={() => { setShowGenerate(false); setGenerated(null); setGenContext(null) }} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>

            {!generated ? (
              <div className="p-5 space-y-5">
                {/* BIE context */}
                {Object.keys(clientBIE).length > 0 && (
                  <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Current BIE State</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                      {Object.entries(clientBIE).map(([k, v]) => (
                        <div key={k} className="text-center">
                          <p className="text-[10px] font-mono text-white/30 uppercase">{k}</p>
                          <p className="text-sm font-bold text-white mt-0.5">{Number(v).toFixed(0)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Protocol type */}
                <div>
                  <label className="forge-label mb-3">Protocol Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PROTOCOL_TYPES.map(t => {
                      const Icon = t.icon
                      return (
                        <button key={t.value} type="button" onClick={() => setGenType(t.value)}
                          className={'p-3 rounded-xl border text-left transition-all ' + (genType === t.value ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40' : 'bg-white/3 border-white/8 hover:border-white/20')}>
                          <div className="flex items-center gap-2 mb-1">
                            <Icon size={14} className={genType === t.value ? 'text-[#D4AF37]' : 'text-white/40'} />
                            <span className={`text-sm font-medium ${genType === t.value ? 'text-[#D4AF37]' : 'text-white/60'}`}>{t.label}</span>
                          </div>
                          <p className="text-xs text-white/30">{t.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Coach directives */}
                <div>
                  <label className="forge-label">Coach Directives (optional)</label>
                  <p className="text-xs text-white/30 mb-2">Specific instructions, focus areas, or constraints for this protocol</p>
                  <textarea rows={3} value={coachDirectives} onChange={e => setCoachDirectives(e.target.value)}
                    className="forge-input resize-none"
                    placeholder="e.g. Focus on gut healing, client has knee pain avoid deep squats, traveling 2x per month, prioritize simplicity..." />
                </div>

                <button onClick={handleGenerate} disabled={generating}
                  className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3.5 disabled:opacity-50">
                  {generating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating protocol — analyzing {clientName}apos;s data...</>
                  ) : (
                    <><Sparkles size={16} /> Generate {PROTOCOL_TYPES.find(t => t.value === genType)?.label} Protocol</>
                  )}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/6">
                {/* Generated header */}
                <div className="p-5 bg-emerald-500/5">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={16} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">{generated.name}</h3>
                  </div>
                  <p className="text-xs text-white/50">Protocol generated successfully — review and edit before saving</p>
                </div>

                {/* Split view — Content + Insights */}
                <div className="flex flex-col xl:flex-row">
                  {/* Left — Protocol content */}
                  <div className="flex-1 p-5 space-y-5 min-w-0">

                    {/* Rationale */}
                    <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain size={14} className="text-[#D4AF37]" />
                        <p className="text-xs font-mono uppercase tracking-widest text-[#D4AF37]/70">AI Rationale</p>
                      </div>
                      <p className="text-sm text-white/65 leading-relaxed">{generated.rationale}</p>
                    </div>

                    {generated.stateAnalysis && (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {generated.stateAnalysis.capacityClass && (
                          <div className="rounded-xl bg-white/3 p-3">
                            <p className="text-[10px] font-mono text-white/30 mb-1">CAPACITY</p>
                            <p className="text-sm font-bold text-white">{generated.stateAnalysis.capacityClass}</p>
                          </div>
                        )}
                        {generated.stateAnalysis.physiologicalFocus && (
                          <div className="rounded-xl bg-white/3 p-3">
                            <p className="text-[10px] font-mono text-white/30 mb-1">PHYSIOLOGY</p>
                            <p className="text-sm text-white/70">{generated.stateAnalysis.physiologicalFocus}</p>
                          </div>
                        )}
                        {generated.stateAnalysis.adherenceRisk && (
                          <div className="rounded-xl bg-white/3 p-3">
                            <p className="text-[10px] font-mono text-white/30 mb-1">ADHERENCE RISK</p>
                            <p className="text-sm text-white/70">{generated.stateAnalysis.adherenceRisk}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {generated.protocolRationale && (
                      <div className="rounded-xl bg-white/3 p-4 space-y-2">
                        <p className="text-xs font-mono uppercase tracking-widest text-white/30">Protocol Rationale</p>
                        {generated.protocolRationale.behaviorLink && <p className="text-sm text-white/65">{generated.protocolRationale.behaviorLink}</p>}
                        {generated.protocolRationale.physiologyLink && <p className="text-sm text-white/65">{generated.protocolRationale.physiologyLink}</p>}
                        {generated.protocolRationale.executionFocus && <p className="text-sm text-white/65">{generated.protocolRationale.executionFocus}</p>}
                      </div>
                    )}

                    {/* Movement Structure */}
                    {generated.sessionStructure && (
                      <div className="space-y-3">
                        <p className="text-xs font-mono uppercase tracking-widest text-white/35">Movement Structure</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Frequency</span><span className="text-white font-bold">{generated.sessionStructure.sessionsPerWeek}x/week</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Volume</span><span className="text-white font-bold">{generated.sessionStructure.volumeLevel}</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Complexity</span><span className="text-white font-bold">Tier {generated.sessionStructure.complexityCeiling}</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Session Type</span><span className="text-white font-bold truncate ml-2">{generated.sessionStructure.sessionType}</span></div>
                          </div>

                          {generated.movementProtocol?.progressionModel && generated.movementProtocol.progressionModel.length > 0 && (
                            <div className="bg-white/3 rounded-xl p-3 space-y-1">
                              <p className="text-xs text-white/30 font-mono mb-2">PROGRESSION MODEL</p>
                              {generated.movementProtocol.progressionModel.map((step, i) => (
                                <p key={i} className="text-xs text-white/60 flex gap-2"><span className="text-emerald-400 flex-shrink-0">·</span>{step}</p>
                              ))}
                            </div>
                          )}

                          {/* Activation Block */}
                          {generated.sessionStructure.activationBlock?.length > 0 && (
                            <div>
                            <p className="text-xs text-white/25 font-mono mb-2">ACTIVATION</p>
                            <div className="space-y-1.5">
                              {generated.sessionStructure.activationBlock.map((ex, i) => (
                                <div key={i} className="bg-white/3 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm text-white/80">{ex.exerciseName}</span>
                                    {ex.coachingCue && <p className="text-xs text-white/30 truncate">{ex.coachingCue}</p>}
                                  </div>
                                  <span className="text-xs text-white/50 font-mono shrink-0">{ex.sets}×{ex.reps}{ex.tempo ? ` · ${ex.tempo}` : ''}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Primary Block */}
                        {generated.sessionStructure.primaryBlock?.length > 0 && (
                          <div>
                            <p className="text-xs text-white/25 font-mono mb-2">PRIMARY</p>
                            <div className="space-y-1.5">
                              {generated.sessionStructure.primaryBlock.map((ex, i) => (
                                <div key={i} className="bg-white/3 border border-white/6 rounded-lg px-3 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-white/85 font-medium">{ex.exerciseName}</span>
                                    <span className="text-xs text-white/50 font-mono shrink-0">{ex.sets}×{ex.reps}{ex.tempo ? ` · ${ex.tempo}` : ''}</span>
                                  </div>
                                  {ex.loadGuidance && <p className="text-xs text-[#D4AF37]/60 mt-0.5">{ex.loadGuidance}</p>}
                                  {ex.coachingCue && <p className="text-xs text-white/30 mt-0.5">{ex.coachingCue}</p>}
                                  {ex.swapOption && <p className="text-xs text-blue-400/60 mt-0.5">Swap: {ex.swapOption}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Accessory Block */}
                        {generated.sessionStructure.accessoryBlock?.length > 0 && (
                          <div>
                            <p className="text-xs text-white/25 font-mono mb-2">ACCESSORY</p>
                            <div className="space-y-1.5">
                              {generated.sessionStructure.accessoryBlock.map((ex, i) => (
                                <div key={i} className="bg-white/3 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm text-white/70">{ex.exerciseName}</span>
                                    {ex.coachingCue && <p className="text-xs text-white/30 truncate">{ex.coachingCue}</p>}
                                  </div>
                                  <span className="text-xs text-white/40 font-mono shrink-0">{ex.sets}×{ex.reps}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nutrition Structure */}
                    {generated.nutritionStructure && (
                      <div className="space-y-3">
                        <p className="text-xs font-mono uppercase tracking-widest text-white/35">Nutrition Targets</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Calories</span><span className="text-white font-bold">{generated.nutritionStructure.dailyCalories} kcal</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Protein</span><span className="text-white font-bold">{generated.nutritionStructure.proteinG}g</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Carbs</span><span className="text-white font-bold">{generated.nutritionStructure.carbG}g</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Fats</span><span className="text-white font-bold">{generated.nutritionStructure.fatG}g</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Meals/day</span><span className="text-white font-bold">{generated.nutritionStructure.mealFrequency}</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Complexity</span><span className="text-white font-bold">{generated.nutritionStructure.complexityLevel}</span></div>
                        </div>
                        {generated.nutritionStructure.keyGuidelines?.length > 0 && (
                          <div className="bg-white/3 rounded-xl p-3 space-y-1">
                            <p className="text-xs text-white/30 font-mono mb-2">KEY GUIDELINES</p>
                            {generated.nutritionStructure.keyGuidelines.map((g, i) => (
                              <p key={i} className="text-xs text-white/60 flex gap-2"><span className="text-[#D4AF37] flex-shrink-0">·</span>{g}</p>
                            ))}
                          </div>
                        )}
                        {generated.nutritionStructure.mealTiming && (
                          <div className="bg-white/3 rounded-xl p-3">
                            <p className="text-xs text-white/30 font-mono mb-1">MEAL TIMING</p>
                            <p className="text-sm text-white/60">{generated.nutritionStructure.mealTiming}</p>
                          </div>
                        )}
                        {generated.nutritionProtocol?.macroJustification && (
                          <div className="bg-white/3 rounded-xl p-3">
                            <p className="text-xs text-white/30 font-mono mb-1">MACRO JUSTIFICATION</p>
                            <p className="text-sm text-white/60">{generated.nutritionProtocol.macroJustification}</p>
                          </div>
                        )}
                        {generated.nutritionProtocol?.adherenceFallback && (
                          <div className="bg-emerald-500/6 border border-emerald-500/15 rounded-xl p-3">
                            <p className="text-xs text-emerald-400/70 font-mono mb-1">ADHERENCE FALLBACK</p>
                            <p className="text-sm text-white/60">{generated.nutritionProtocol.adherenceFallback}</p>
                          </div>
                        )}
                        {generated.nutritionStructure.disruption_protocol && (
                          <div className="bg-amber-500/6 border border-amber-500/15 rounded-xl p-3">
                            <p className="text-xs text-amber-400/70 font-mono mb-1">DISRUPTION PROTOCOL</p>
                            <p className="text-sm text-white/60">{generated.nutritionStructure.disruption_protocol}</p>
                          </div>
                        )}
                        {generated.nutritionStructure.mealPlan && generated.nutritionStructure.mealPlan.length > 0 && (
                          <div className="bg-white/3 rounded-xl p-3 space-y-2">
                            <p className="text-xs text-white/30 font-mono mb-1">SAMPLE MEAL PLAN</p>
                            {generated.nutritionStructure.mealPlan.map((meal, i) => (
                              <div key={i} className="rounded-lg border border-white/6 bg-black/20 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-white">{meal.meal}</p>
                                  <p className="text-[11px] font-mono text-[#D4AF37] shrink-0">{meal.time}</p>
                                </div>
                                <p className="text-sm text-white/65 mt-1">{meal.foods}</p>
                                {meal.notes && <p className="text-xs text-white/35 mt-1">{meal.notes}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                        {generated.nutritionProtocol?.bsldsTemplate && (
                          <div className="bg-white/3 rounded-xl p-3 space-y-3">
                            <p className="text-xs text-white/30 font-mono mb-1">BSLDS MEAL STRUCTURE</p>
                            {(['trainingDay', 'restDay'] as const).map(day =>
                              generated.nutritionProtocol?.bsldsTemplate?.[day] ? (
                                <div key={day} className="rounded-lg border border-white/6 bg-black/20 p-3">
                                  <p className="text-xs font-mono uppercase text-[#D4AF37] mb-2">{day === 'trainingDay' ? 'Training Day' : 'Rest Day'}</p>
                                  <div className="space-y-1">
                                    {Object.entries(generated.nutritionProtocol.bsldsTemplate?.[day] ?? {}).map(([slot, value]) => (
                                      <div key={slot} className="flex justify-between gap-3 text-xs">
                                        <span className="text-white/35 capitalize">{slot}</span>
                                        <span className="text-white/65 text-right">{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Recovery Structure */}
                    {generated.recoveryStructure && (
                      <div className="space-y-3">
                        <p className="text-xs font-mono uppercase tracking-widest text-white/35">Recovery Protocol</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Sleep Target</span><span className="text-white font-bold">{generated.recoveryStructure.sleepTarget}</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between"><span className="text-white/40">Recovery Days</span><span className="text-white font-bold">{generated.recoveryStructure.activeRecoveryDays}/week</span></div>
                          <div className="bg-white/3 rounded-lg p-2 flex justify-between col-span-2"><span className="text-white/40">Mobility</span><span className="text-white font-bold">{generated.recoveryStructure.mobilityMinutes} min/day</span></div>
                        </div>
                        {generated.recoveryStructure.keyRecoveryPractices?.length > 0 && (
                          <div className="bg-white/3 rounded-xl p-3 space-y-1">
                            {generated.recoveryStructure.keyRecoveryPractices.map((p, i) => (
                              <p key={i} className="text-xs text-white/60 flex gap-2"><span className="text-blue-400 flex-shrink-0">·</span>{p}</p>
                            ))}
                          </div>
                        )}
                        {generated.recoveryStructure.stressReductionProtocol && (
                          <div className="bg-blue-500/6 border border-blue-500/15 rounded-xl p-3">
                            <p className="text-xs text-blue-400/70 font-mono mb-1">STRESS REDUCTION</p>
                            <p className="text-sm text-white/60">{generated.recoveryStructure.stressReductionProtocol}</p>
                          </div>
                        )}
                        {generated.recoveryProtocol?.progressionNotes && (
                          <div className="bg-white/3 rounded-xl p-3">
                            <p className="text-xs text-white/30 font-mono mb-1">RECOVERY PROGRESSION</p>
                            <p className="text-sm text-white/60">{generated.recoveryProtocol.progressionNotes}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {generated.monitoringMetrics && (
                      <div className="rounded-xl bg-white/3 p-4 space-y-3">
                        <p className="text-xs font-mono uppercase tracking-widest text-white/30">Monitoring & Metrics</p>
                        {generated.monitoringMetrics.primary && generated.monitoringMetrics.primary.length > 0 && (
                          <div>
                            <p className="text-xs text-white/35 mb-1">Primary</p>
                            <p className="text-sm text-white/65">{generated.monitoringMetrics.primary.join(', ')}</p>
                          </div>
                        )}
                        {generated.monitoringMetrics.secondary && generated.monitoringMetrics.secondary.length > 0 && (
                          <div>
                            <p className="text-xs text-white/35 mb-1">Secondary</p>
                            <p className="text-sm text-white/65">{generated.monitoringMetrics.secondary.join(', ')}</p>
                          </div>
                        )}
                        {generated.monitoringMetrics.cadence && (
                          <div>
                            <p className="text-xs text-white/35 mb-1">Cadence</p>
                            <p className="text-sm text-white/65">{generated.monitoringMetrics.cadence}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {generated.decisionRules && generated.decisionRules.length > 0 && (
                      <div className="rounded-xl bg-white/3 p-4 space-y-2">
                        <p className="text-xs font-mono uppercase tracking-widest text-white/30">Decision Rules</p>
                        {generated.decisionRules.map((rule, i) => (
                          <p key={i} className="text-sm text-white/65 flex gap-2"><span className="text-[#D4AF37] flex-shrink-0">·</span>{rule}</p>
                        ))}
                      </div>
                    )}

                    {generated.phaseProgressionCriteria && generated.phaseProgressionCriteria.length > 0 && (
                      <div className="rounded-xl bg-white/3 p-4 space-y-2">
                        <p className="text-xs font-mono uppercase tracking-widest text-white/30">Phase Progression Criteria</p>
                        {generated.phaseProgressionCriteria.map((criterion, i) => (
                          <p key={i} className="text-sm text-white/65 flex gap-2"><span className="text-emerald-400 flex-shrink-0">·</span>{criterion}</p>
                        ))}
                      </div>
                    )}

                    {generated.coachIntelligence && (
                      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                        <p className="text-xs font-mono uppercase tracking-widest text-purple-300/70">Coach Intelligence Notes</p>
                        {generated.coachIntelligence.progressionAssessment && <p className="text-sm text-white/70">{generated.coachIntelligence.progressionAssessment}</p>}
                        {([
                          ['Gaps Identified', generated.coachIntelligence.gapsIdentified],
                          ['Oversights', generated.coachIntelligence.oversights],
                          ['Risk Flags', generated.coachIntelligence.riskFlags],
                          ['Next Iteration Strategy', generated.coachIntelligence.nextIterationStrategy],
                        ] as Array<[string, string[] | undefined]>).map(([label, items]) => Array.isArray(items) && items.length > 0 ? (
                          <div key={label}>
                            <p className="text-xs text-white/35 mb-1">{label}</p>
                            <div className="space-y-1">
                              {items.map((item, i) => (
                                <p key={i} className="text-xs text-white/60 flex gap-2"><span className="text-purple-300 flex-shrink-0">·</span>{item}</p>
                              ))}
                            </div>
                          </div>
                        ) : null)}
                      </div>
                    )}

                    {/* Editable sections */}
                    <div className="space-y-3 pt-2 border-t border-white/6">
                      <div>
                        <label className="forge-label flex items-center gap-1.5"><MessageSquare size={12} /> Client Facing Message</label>
                        <p className="text-xs text-white/30 mb-2">This will be included in the protocol PDF sent to the client</p>
                        <textarea rows={4} value={editedNotes} onChange={e => setEditedNotes(e.target.value)}
                          className="forge-input resize-none" />
                      </div>
                      <div>
                        <label className="forge-label flex items-center gap-1.5"><Edit3 size={12} /> Coach Notes (internal)</label>
                        <textarea rows={3} value={editedCoachNotes} onChange={e => setEditedCoachNotes(e.target.value)}
                          className="forge-input resize-none" />
                      </div>
                    </div>
                  </div>

                  {/* Right — AI Insights panel */}
                  {genContext && (
                    <div className="w-full xl:w-72 border-t xl:border-t-0 xl:border-l border-white/6 bg-white/1">
                      <button onClick={() => setShowInsights(!showInsights)}
                        className="w-full flex items-center justify-between p-4 text-xs font-mono uppercase tracking-widest text-white/40 hover:text-white">
                        <span className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"><Brain size={12} className="text-[#D4AF37]" /> AI Insights</span>
                        {showInsights ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {showInsights && (
                        <div className="px-4 pb-4 space-y-4">
                          {/* Generation state */}
                            <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-xl p-3">
                              <p className="text-[10px] font-mono text-white/30 mb-1">GENERATION STATE</p>
                              <p className="text-sm font-bold text-[#D4AF37]">State {genContext.generationState}</p>
                              <p className="text-xs text-white/40 mt-1 capitalize">{genContext.stage} stage</p>
                              {genContext.protocolFrame && genContext.protocolFrame !== genContext.stage && (
                                <p className="text-[10px] text-emerald-300 mt-2">
                                  Framing: {genContext.protocolFrame}
                                </p>
                              )}
                              {genContext.physiqueFocus && (
                                <p className="text-[10px] text-white/35 mt-1">
                                  Physique-specific architecture preserved
                                </p>
                              )}
                              <p className="text-[10px] text-white/30 mt-2">
                                BIE source: {genContext.bieSource === 'estimated' ? 'estimated from recent data' : 'latest snapshot'}
                              </p>
                            </div>

                          {/* BIE breakdown */}
                          <div>
                            <p className="text-[10px] font-mono text-white/30 mb-2">BIE AT GENERATION</p>
                            <div className="space-y-2">
                              {Object.entries(genContext.bie).map(([k, v]) => {
                                const pct = Math.round(v)
                                const color = k === 'bar' || k === 'lsi' || k === 'pps'
                                  ? pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-[#D4AF37]' : 'bg-red-500'
                                  : pct >= 70 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                return (
                                  <div key={k}>
                                    <div className="flex justify-between text-xs mb-0.5">
                                      <span className="text-white/40 font-mono uppercase">{k}</span>
                                      <span className="text-white/60">{pct}</span>
                                    </div>
                                    <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${color}`} style={{ width: pct + '%' }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Data sources used */}
                          <div>
                            <p className="text-[10px] font-mono text-white/30 mb-2">DATA SOURCES USED</p>
                            <div className="space-y-1.5">
                              {[
                                { label: 'Adherence records', value: genContext.dataPoints.adherenceRecords },
                                { label: 'Journal entries', value: genContext.dataPoints.journalEntries },
                                { label: 'Check-ins', value: genContext.dataPoints.checkins },
                                { label: 'AI documents', value: genContext.dataPoints.aiDocs },
                              ].map(item => (
                                <div key={item.label} className="flex items-center justify-between text-xs">
                                  <span className="text-white/35">{item.label}</span>
                                  <span className={`font-mono font-bold ${Number(item.value) > 0 ? 'text-emerald-400' : 'text-white/20'}`}>
                                    {item.value}
                                  </span>
                                </div>
                              ))}
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-white/35">Biomarkers</span>
                                <span className={`font-mono font-bold ${genContext.dataPoints.biomarkers === 'available' ? 'text-emerald-400' : 'text-white/20'}`}>
                                  {genContext.dataPoints.biomarkers === 'available' ? '✓' : '—'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-white/6">
                            <button onClick={() => { setGenerated(null); setGenContext(null) }}
                              className="w-full text-xs text-white/30 hover:text-white py-2 transition-colors">
                              ← Regenerate with different directives
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Save button */}
                <div className="p-5 border-t border-white/6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button onClick={handleSaveGenerated} disabled={saving}
                    className="forge-btn-gold flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-50">
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Check size={16} /> Save Protocol</>}
                  </button>
                  <button onClick={() => { setGenerated(null); setGenContext(null) }}
                    className="px-4 py-3 bg-white/6 border border-white/10 rounded-xl text-sm text-white/50 hover:text-white transition-colors">
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual form */}
        {showForm && (
          <div className="bg-[#111111] border border-white/10 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Manual Protocol</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2"><label className="forge-label">Protocol Name<RequiredAsterisk /></label><input value={form.name} onChange={e => setF('name', e.target.value)} className="forge-input" placeholder="e.g. Phase 1 Movement Protocol" /></div>
              <div><label className="forge-label">Type</label><select value={form.protocolType} onChange={e => setF('protocolType', e.target.value)} className="forge-input">{PROTOCOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div><label className="forge-label">Stage</label><select value={form.stage} onChange={e => setF('stage', e.target.value)} className="forge-input">{STAGES.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
              <div><label className="forge-label">Generation State</label><select value={form.generationState} onChange={e => setF('generationState', e.target.value)} className="forge-input"><option value="">None</option>{['A','B','C','D','E'].map(s => <option key={s} value={s}>State {s}</option>)}</select></div>
              <div><label className="forge-label">Effective Date</label><input type="date" value={form.effectiveDate} onChange={e => setF('effectiveDate', e.target.value)} className="forge-input" /></div>
            </div>
            {form.protocolType === 'movement' && (
              <div className="space-y-3">
                <p className="text-xs font-mono uppercase tracking-widest text-white/35">Movement</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="forge-label">Template</label><input value={form.movementTemplate} onChange={e => setF('movementTemplate', e.target.value)} className="forge-input" placeholder="e.g. Lower A / Upper A" /></div>
                  <div><label className="forge-label">Sessions/Week</label><input type="number" min="1" max="7" value={form.sessionsPerWeek} onChange={e => setF('sessionsPerWeek', e.target.value)} className="forge-input" placeholder="3" /></div>
                  <div><label className="forge-label">Complexity (1-5)</label><input type="number" min="1" max="5" value={form.complexityCeiling} onChange={e => setF('complexityCeiling', e.target.value)} className="forge-input" placeholder="2" /></div>
                  <div><label className="forge-label">Volume Target</label><select value={form.volumeTarget} onChange={e => setF('volumeTarget', e.target.value)} className="forge-input"><option value="">Select...</option>{VOLUME_TARGETS.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                </div>
              </div>
            )}
            {form.protocolType === 'nutrition' && (
              <div className="space-y-3">
                <p className="text-xs font-mono uppercase tracking-widest text-white/35">Nutrition</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="forge-label">Calories</label><input type="number" value={form.calorieTarget} onChange={e => setF('calorieTarget', e.target.value)} className="forge-input" placeholder="1650" /></div>
                  <div><label className="forge-label">Protein (g)</label><input type="number" value={form.proteinTargetG} onChange={e => setF('proteinTargetG', e.target.value)} className="forge-input" placeholder="140" /></div>
                  <div><label className="forge-label">Carbs (g)</label><input type="number" value={form.carbTargetG} onChange={e => setF('carbTargetG', e.target.value)} className="forge-input" placeholder="150" /></div>
                  <div><label className="forge-label">Fats (g)</label><input type="number" value={form.fatTargetG} onChange={e => setF('fatTargetG', e.target.value)} className="forge-input" placeholder="50" /></div>
                </div>
              </div>
            )}
            <div><label className="forge-label">Protocol Notes</label><textarea rows={3} value={form.notes} onChange={e => setF('notes', e.target.value)} className="forge-input resize-none" placeholder="Protocol rationale and instructions..." /></div>
            <div><label className="forge-label">Coach Notes (internal)</label><textarea rows={2} value={form.coachNotes} onChange={e => setF('coachNotes', e.target.value)} className="forge-input resize-none" placeholder="Internal observations..." /></div>
            <button onClick={handleSaveManual} disabled={saving} className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Zap size={16} /> {editingProtocolId ? 'Update Protocol' : 'Create Protocol'}</>}
              </button>
            </div>
        )}

        {/* Protocol list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
        ) : protocols.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Layers size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No protocols yet</p>
            <p className="text-xs text-white/25 mt-1">Use Generate with AI to create your first protocol</p>
          </div>
        ) : (
          <div className="space-y-4">
            {active.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Active Protocols</p>
                <div className="space-y-2">{filtered.filter(p => p.is_active).map(p => <ProtocolCard key={p.id} p={p} />)}</div>
              </div>
            )}
            {inactive.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-white/20 mb-3">Inactive</p>
                <div className="space-y-2">{filtered.filter(p => !p.is_active).map(p => <ProtocolCard key={p.id} p={p} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
