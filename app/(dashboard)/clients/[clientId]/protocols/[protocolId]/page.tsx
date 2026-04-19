'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Mail, Loader2, CheckCircle, Edit3, Save, Trash2, X } from 'lucide-react'
import { normalizeLoad } from '@/lib/protocol-overrides'

type Protocol = {
  id: string; name: string; protocol_type: string; stage: string
  generation_state: string | null; effective_date: string
  sessions_per_week: number | null; complexity_ceiling: number | null
  volume_target: string | null; calorie_target: number | null
  protein_target_g: number | null; carb_target_g: number | null
  fat_target_g: number | null; meal_frequency?: number | null
  notes: string | null; coach_notes?: string | null; is_active?: boolean
  protocol_payload: Record<string, unknown>
}

type Client = { full_name: string; email: string }

type ExerciseRow = {
  exerciseName: string; sets: number; reps: string
  tempo?: string; loadGuidance?: string; coachingCue?: string; swapOption?: string
}

type MealPlanRow = {
  time?: string
  meal?: string
  foods?: string
  notes?: string
}

type MealSlot = { foods: string; protein: string; carbs: string; fats: string; timing: string; notes: string }

function displayNutritionValue(display: unknown, numericValue: unknown, unit: string) {
  if (typeof display === 'string' && display.trim().length > 0) return display
  if (typeof numericValue === 'number') return `${numericValue} ${unit}`
  return '—'
}

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div style={{ borderLeft: `4px solid ${color}`, paddingLeft: '12px', marginBottom: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</div>
    </div>
  )
}

function ExerciseTable({ title, exercises }: { title: string; exercises: ExerciseRow[] }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '9px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            {['Exercise', 'Sets', 'Reps', 'Tempo', 'Load', 'Coaching Cue'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '9px', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #eee' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {exercises.map((ex, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '7px 8px', fontWeight: '600', color: '#333' }}>
                {ex.exerciseName}
                {ex.swapOption && <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>→ {ex.swapOption}</div>}
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '700', color: '#555' }}>{ex.sets}</td>
              <td style={{ padding: '7px 8px', textAlign: 'center', color: '#555' }}>{ex.reps}</td>
              <td style={{ padding: '7px 8px', textAlign: 'center', color: '#888' }}>{ex.tempo ?? '—'}</td>
              <td style={{ padding: '7px 8px', color: '#b5451b', fontSize: '10px' }}>{ex.loadGuidance ?? '—'}</td>
              <td style={{ padding: '7px 8px', color: '#666', fontSize: '10px' }}>{ex.coachingCue ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BSLDSTable({ bsldsTemplate }: { bsldsTemplate: Record<string, unknown> }) {
  const days = [
    { key: 'trainingDay', label: 'Training Day' },
    { key: 'restDay', label: 'Rest Day' },
  ]
  const slots = [
    { key: 'breakfast', label: 'B — Breakfast' },
    { key: 'morningSnack', label: 'S — Snack' },
    { key: 'lunch', label: 'L — Lunch' },
    { key: 'dinner', label: 'D — Dinner' },
    { key: 'eveningSnack', label: 'S — Eve Snack' },
  ]
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
        BSLDS Meal Structure
      </div>
      {days.map(day => {
        const dayData = bsldsTemplate[day.key] as Record<string, MealSlot> | undefined
        if (!dayData) return null
        return (
          <div key={day.key} style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#b5451b', textTransform: 'uppercase', marginBottom: '4px' }}>{day.label}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#fff8f5' }}>
                  {['Meal', 'Foods', 'Protein', 'Carbs', 'Fats', 'Timing', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontSize: '8px', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #fde0d0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot, i) => {
                  const meal = dayData[slot.key]
                  if (!meal) return null
                  return (
                    <tr key={slot.key} style={{ borderBottom: '1px solid #fafafa', background: i % 2 === 0 ? '#fff' : '#fff8f5' }}>
                      <td style={{ padding: '6px', fontWeight: '600', color: '#b5451b', whiteSpace: 'nowrap' }}>{slot.label}</td>
                      <td style={{ padding: '6px', color: '#333' }}>{meal.foods}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: '700', color: '#2d6a4f' }}>{meal.protein}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: '700', color: '#b8860b' }}>{meal.carbs}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: '700', color: '#1a5276' }}>{meal.fats}</td>
                      <td style={{ padding: '6px', color: '#888', whiteSpace: 'nowrap' }}>{meal.timing}</td>
                      <td style={{ padding: '6px', color: '#aaa', fontSize: '9px' }}>{meal.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function MealPlanTable({ mealPlan }: { mealPlan: MealPlanRow[] }) {
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
        Sample Meal Plan
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr style={{ background: '#fff8f5' }}>
            {['Time', 'Meal', 'Foods', 'Notes'].map(h => (
              <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontSize: '8px', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #fde0d0' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mealPlan.map((meal, i) => (
            <tr key={`${meal.meal ?? 'meal'}-${i}`} style={{ borderBottom: '1px solid #fafafa', background: i % 2 === 0 ? '#fff' : '#fff8f5' }}>
              <td style={{ padding: '6px', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{meal.time ?? '—'}</td>
              <td style={{ padding: '6px', fontWeight: '600', color: '#b5451b', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{meal.meal ?? 'Meal'}</td>
              <td style={{ padding: '6px', color: '#333' }}>{meal.foods ?? '—'}</td>
              <td style={{ padding: '6px', color: '#888' }}>{meal.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProtocolPDFPage() {
  const params = useParams<{ clientId: string; protocolId: string }>()
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)

  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [savingEdits, setSavingEdits] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    stage: '',
    generationState: '',
    effectiveDate: '',
    sessionsPerWeek: '',
    complexityCeiling: '',
    volumeTarget: '',
    calorieTarget: '',
    proteinTargetG: '',
    carbTargetG: '',
    fatTargetG: '',
    mealFrequency: '',
    notes: '',
    coachNotes: '',
    clientFacingMessage: '',
  })

  useEffect(() => {
    fetch(`/api/clients/${params.clientId}/protocols/${params.protocolId}`)
      .then(r => r.json())
      .then(d => {
        setProtocol(d.protocol)
        setClient(d.client)
        if (d.protocol) {
          setEditForm({
            name: d.protocol.name ?? '',
            stage: d.protocol.stage ?? '',
            generationState: d.protocol.generation_state ?? '',
            effectiveDate: d.protocol.effective_date ?? '',
            sessionsPerWeek: d.protocol.sessions_per_week?.toString() ?? '',
            complexityCeiling: d.protocol.complexity_ceiling?.toString() ?? '',
            volumeTarget: d.protocol.volume_target ?? '',
            calorieTarget: d.protocol.calorie_target?.toString() ?? '',
            proteinTargetG: d.protocol.protein_target_g?.toString() ?? '',
            carbTargetG: d.protocol.carb_target_g?.toString() ?? '',
            fatTargetG: d.protocol.fat_target_g?.toString() ?? '',
            mealFrequency: d.protocol.meal_frequency?.toString() ?? '',
            notes: d.protocol.notes ?? '',
            coachNotes: d.protocol.coach_notes ?? '',
            clientFacingMessage: typeof d.protocol.protocol_payload?.clientFacingMessage === 'string'
              ? d.protocol.protocol_payload.clientFacingMessage
              : '',
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [params.clientId, params.protocolId])

  function setFormField(key: keyof typeof editForm, value: string) {
    setEditForm(prev => ({ ...prev, [key]: value }))
  }

  function toNullableNumber(value: string) {
    if (!value.trim()) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  async function handleDownloadPDF() {
    if (!printRef.current || !protocol || !client) return
    setGenerating(true); setError('')
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(printRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgHeight = (canvas.height * pdfWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
      heightLeft -= pdfHeight
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
        heightLeft -= pdfHeight
      }
      const fileName = `${client.full_name.replace(/\s+/g, '_')}_${protocol.name.slice(0, 30).replace(/\s+/g, '_')}_${protocol.effective_date}.pdf`
      pdf.save(fileName)
    } catch (err) {
      setError('PDF generation failed. Please try again.')
      console.error(err)
    } finally { setGenerating(false) }
  }

  async function handleEmailPDF() {
    if (!protocol || !client || !printRef.current) return
    setEmailing(true); setError('')
    try {
      // Step 1 — generate and download PDF
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(printRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgHeight = (canvas.height * pdfWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
      heightLeft -= pdfHeight
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
        heightLeft -= pdfHeight
      }
      const fileName = `${client.full_name.replace(/\s+/g, '_')}_${protocol.name.slice(0, 30).replace(/\s+/g, '_')}.pdf`
      pdf.save(fileName)

      // Step 2 — get email draft content
      const res = await fetch(`/api/clients/${params.clientId}/protocols/${params.protocolId}/email`, { method: 'POST' })
      const data = await res.json()

      // Step 3 — open Gmail compose
      const to = data.to ?? client.email
      const subject = data.subject ?? `Your FORGË Protocol: ${protocol.name}`
      const body = (data.body ?? '') + '\n\n---\n📎 Please see the attached PDF protocol document.'
      const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      window.open(gmailUrl, '_blank')

      setEmailSuccess(true)
      setTimeout(() => setEmailSuccess(false), 5000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Email send failed.')
    } finally { setEmailing(false) }
  }

  async function handleSaveEdits() {
    if (!protocol) return
    setSavingEdits(true)
    setError('')
    setSuccess('')
    try {
      const updatedPayload: Record<string, unknown> = { ...(protocol.protocol_payload ?? {}) }
      const sessionStructure =
        updatedPayload.sessionStructure && typeof updatedPayload.sessionStructure === 'object'
          ? { ...(updatedPayload.sessionStructure as Record<string, unknown>) }
          : null
      const nutritionStructure =
        updatedPayload.nutritionStructure && typeof updatedPayload.nutritionStructure === 'object'
          ? { ...(updatedPayload.nutritionStructure as Record<string, unknown>) }
          : null

      if (sessionStructure) {
        sessionStructure.sessionsPerWeek = toNullableNumber(editForm.sessionsPerWeek)
        sessionStructure.complexityCeiling = toNullableNumber(editForm.complexityCeiling)
        sessionStructure.volumeLevel = editForm.volumeTarget || null
        updatedPayload.sessionStructure = sessionStructure
      }

      if (nutritionStructure) {
        nutritionStructure.dailyCalories = toNullableNumber(editForm.calorieTarget)
        nutritionStructure.proteinG = toNullableNumber(editForm.proteinTargetG)
        nutritionStructure.carbG = toNullableNumber(editForm.carbTargetG)
        nutritionStructure.fatG = toNullableNumber(editForm.fatTargetG)
        nutritionStructure.mealFrequency = toNullableNumber(editForm.mealFrequency)
        updatedPayload.nutritionStructure = nutritionStructure
      }

      updatedPayload.clientFacingMessage = editForm.clientFacingMessage

      const res = await fetch(`/api/clients/${params.clientId}/protocols/${params.protocolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          stage: editForm.stage,
          generation_state: editForm.generationState || null,
          effective_date: editForm.effectiveDate,
          sessions_per_week: toNullableNumber(editForm.sessionsPerWeek),
          complexity_ceiling: toNullableNumber(editForm.complexityCeiling),
          volume_target: editForm.volumeTarget || null,
          calorie_target: toNullableNumber(editForm.calorieTarget),
          protein_target_g: toNullableNumber(editForm.proteinTargetG),
          carb_target_g: toNullableNumber(editForm.carbTargetG),
          fat_target_g: toNullableNumber(editForm.fatTargetG),
          meal_frequency: toNullableNumber(editForm.mealFrequency),
          notes: editForm.notes || null,
          coach_notes: editForm.coachNotes || null,
          protocol_payload: updatedPayload,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Update failed')
        return
      }

      setProtocol(data.protocol ?? null)
      setEditMode(false)
      setSuccess('Protocol updated')
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Network error while saving changes')
    } finally {
      setSavingEdits(false)
    }
  }

  async function handleDeleteProtocol() {
    if (!protocol) return
    const confirmed = window.confirm(`Delete "${protocol.name}"? This cannot be undone.`)
    if (!confirmed) return

    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${params.clientId}/protocols/${params.protocolId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Delete failed')
        return
      }
      router.push(`/clients/${params.clientId}/protocols`)
      router.refresh()
    } catch {
      setError('Network error while deleting protocol')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-white/20" />
    </div>
  )

  if (!protocol || !client) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <p className="text-white/40">Protocol not found</p>
    </div>
  )

  const rawSessionStructure = protocol.protocol_payload?.sessionStructure as Record<string, unknown> | undefined
  const ns = protocol.protocol_payload?.nutritionStructure as Record<string, unknown> | undefined
  const rs = protocol.protocol_payload?.recoveryStructure as Record<string, unknown> | undefined
  const normalizedSessionStructure = rawSessionStructure
    ? {
        ...rawSessionStructure,
        activationBlock: Array.isArray(rawSessionStructure.activationBlock)
          ? (rawSessionStructure.activationBlock as ExerciseRow[]).map(exercise => ({
              ...exercise,
              loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
            }))
          : rawSessionStructure.activationBlock,
        primaryBlock: Array.isArray(rawSessionStructure.primaryBlock)
          ? (rawSessionStructure.primaryBlock as ExerciseRow[]).map(exercise => ({
              ...exercise,
              loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
            }))
          : rawSessionStructure.primaryBlock,
        accessoryBlock: Array.isArray(rawSessionStructure.accessoryBlock)
          ? (rawSessionStructure.accessoryBlock as ExerciseRow[]).map(exercise => ({
              ...exercise,
              loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
            }))
          : rawSessionStructure.accessoryBlock,
        finisherBlock: Array.isArray(rawSessionStructure.finisherBlock)
          ? (rawSessionStructure.finisherBlock as ExerciseRow[]).map(exercise => ({
              ...exercise,
              loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
            }))
          : rawSessionStructure.finisherBlock,
      }
    : undefined
  const ss = (normalizedSessionStructure ?? {}) as Record<string, unknown>

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="sticky top-0 z-10 bg-[#0a0a0a] border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/clients/${params.clientId}/protocols`}
            className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
            <ArrowLeft size={14} />
          </Link>
          <div>
            <p className="text-sm font-semibold text-white truncate max-w-xs">{protocol.name}</p>
            <p className="text-xs text-white/40">{client.full_name} · {protocol.effective_date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {emailSuccess && <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle size={13} /> PDF downloaded — attach it to the Gmail window that just opened</span>}
          {success && <span className="text-xs text-emerald-400">{success}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button onClick={() => setEditMode(current => !current)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/6 border border-white/10 rounded-xl text-xs text-white/60 hover:text-white transition-colors">
            {editMode ? <X size={13} /> : <Edit3 size={13} />} {editMode ? 'Close Edit' : 'Edit'}
          </button>
          <button onClick={handleDeleteProtocol} disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300 hover:text-red-200 transition-colors disabled:opacity-50">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
          </button>
          <button onClick={handleEmailPDF} disabled={emailing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/6 border border-white/10 rounded-xl text-xs text-white/60 hover:text-white transition-colors disabled:opacity-50">
            {emailing ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Email to Client
          </button>
          <button onClick={handleDownloadPDF} disabled={generating}
            className="forge-btn-gold flex items-center gap-1.5 text-sm py-2 disabled:opacity-50">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {generating ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center py-8 px-4">
        {editMode && (
          <div className="w-full max-w-[800px] mb-4 bg-[#111111] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Edit Protocol</p>
                <p className="text-xs text-white/35">Update the key protocol fields without regenerating the entire plan.</p>
              </div>
              <button onClick={handleSaveEdits} disabled={savingEdits}
                className="forge-btn-gold flex items-center gap-1.5 text-sm py-2 disabled:opacity-50">
                {savingEdits ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="forge-label">Protocol Name</label>
                <input value={editForm.name} onChange={e => setFormField('name', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Effective Date</label>
                <input type="date" value={editForm.effectiveDate} onChange={e => setFormField('effectiveDate', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Stage</label>
                <input value={editForm.stage} onChange={e => setFormField('stage', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Generation State</label>
                <input value={editForm.generationState} onChange={e => setFormField('generationState', e.target.value)} className="forge-input" maxLength={1} />
              </div>
              <div>
                <label className="forge-label">Sessions / Week</label>
                <input value={editForm.sessionsPerWeek} onChange={e => setFormField('sessionsPerWeek', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Complexity Ceiling</label>
                <input value={editForm.complexityCeiling} onChange={e => setFormField('complexityCeiling', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Volume Target</label>
                <input value={editForm.volumeTarget} onChange={e => setFormField('volumeTarget', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Meal Frequency</label>
                <input value={editForm.mealFrequency} onChange={e => setFormField('mealFrequency', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Calories</label>
                <input value={editForm.calorieTarget} onChange={e => setFormField('calorieTarget', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Protein (g)</label>
                <input value={editForm.proteinTargetG} onChange={e => setFormField('proteinTargetG', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Carbs (g)</label>
                <input value={editForm.carbTargetG} onChange={e => setFormField('carbTargetG', e.target.value)} className="forge-input" />
              </div>
              <div>
                <label className="forge-label">Fats (g)</label>
                <input value={editForm.fatTargetG} onChange={e => setFormField('fatTargetG', e.target.value)} className="forge-input" />
              </div>
            </div>
            <div>
              <label className="forge-label">Internal Notes</label>
              <textarea rows={3} value={editForm.notes} onChange={e => setFormField('notes', e.target.value)} className="forge-input resize-none" />
            </div>
            <div>
              <label className="forge-label">Coach Notes</label>
              <textarea rows={3} value={editForm.coachNotes} onChange={e => setFormField('coachNotes', e.target.value)} className="forge-input resize-none" />
            </div>
            <div>
              <label className="forge-label">Client Facing Message</label>
              <textarea rows={4} value={editForm.clientFacingMessage} onChange={e => setFormField('clientFacingMessage', e.target.value)} className="forge-input resize-none" />
            </div>
          </div>
        )}
        <div ref={printRef} className="bg-white w-full max-w-[800px] p-12 shadow-2xl" style={{ fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>

          <div style={{ borderBottom: '3px solid #4B0082', paddingBottom: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#4B0082', letterSpacing: '2px' }}>FORGË</div>
              <div style={{ fontSize: '10px', color: '#888', letterSpacing: '3px', textTransform: 'uppercase' }}>Behavioral Intelligence Engine</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: '#888' }}>Coach Dee Byfield, MBA, CHC, CSNC, CPT</div>
              <div style={{ fontSize: '10px', color: '#888' }}>DFitFactor · dee@dfitfactor.com</div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Client Protocol</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '8px', lineHeight: '1.2' }}>{protocol.name}</div>
            <div style={{ display: 'flex', gap: '20px', fontSize: '11px', color: '#666', flexWrap: 'wrap' }}>
              <span><strong>Client:</strong> {client.full_name}</span>
              <span><strong>Stage:</strong> {protocol.stage.charAt(0).toUpperCase() + protocol.stage.slice(1)}</span>
              {protocol.generation_state && <span><strong>State:</strong> {protocol.generation_state}</span>}
              <span><strong>Date:</strong> {protocol.effective_date}</span>
            </div>
          </div>

          {typeof (protocol.protocol_payload as any)?.rationale === 'string' && (protocol.protocol_payload as any).rationale.length > 0 && (
            <div style={{ background: '#f8f4ff', border: '1px solid #e0d4f7', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#4B0082', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Protocol Rationale</div>
              <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.7' }}>{String((protocol.protocol_payload as any).rationale)}</div>
            </div>
          )}

          {normalizedSessionStructure && (
            <div style={{ marginBottom: '28px' }}>
              <SectionHeader title="Movement Protocol" color="#2d6a4f" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {[
                  { label: 'Sessions/Week', value: String(ss.sessionsPerWeek ?? protocol.sessions_per_week ?? '—') },
                  { label: 'Session Type', value: String(ss.sessionType ?? '—') },
                  { label: 'Complexity', value: ss.complexityCeiling ? 'Tier ' + ss.complexityCeiling : '—' },
                  { label: 'Volume', value: String(ss.volumeLevel ?? protocol.volume_target ?? '—') },
                ].map(s => (
                  <div key={s.label} style={{ background: '#f0faf4', border: '1px solid #d4edda', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#2d6a4f' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {(ss.activationBlock as ExerciseRow[])?.length > 0 && <ExerciseTable title="Activation" exercises={ss.activationBlock as ExerciseRow[]} />}
              {(ss.primaryBlock as ExerciseRow[])?.length > 0 && <ExerciseTable title="Primary" exercises={ss.primaryBlock as ExerciseRow[]} />}
              {(ss.accessoryBlock as ExerciseRow[])?.length > 0 && <ExerciseTable title="Accessory" exercises={ss.accessoryBlock as ExerciseRow[]} />}
            </div>
          )}

          {ns && (
            <div style={{ marginBottom: '28px' }}>
              <SectionHeader title="Nutrition Protocol" color="#b5451b" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {[
                    { label: 'Calories', value: displayNutritionValue((ns as any).dailyCaloriesDisplay, ns.dailyCalories ?? protocol.calorie_target, 'kcal') },
                    { label: 'Protein', value: displayNutritionValue((ns as any).proteinDisplay, ns.proteinG ?? protocol.protein_target_g, 'g') },
                    { label: 'Carbs', value: displayNutritionValue((ns as any).carbDisplay, ns.carbG ?? protocol.carb_target_g, 'g') },
                    { label: 'Fats', value: displayNutritionValue((ns as any).fatDisplay, ns.fatG ?? protocol.fat_target_g, 'g') },
                  ].map(s => (
                  <div key={s.label} style={{ background: '#fff8f5', border: '1px solid #fde0d0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#b5451b' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {typeof (ns as any).mealTiming === 'string' && (ns as any).mealTiming.length > 0 && (
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '12px', lineHeight: '1.6', background: '#fafafa', padding: '10px', borderRadius: '6px' }}>
                  <strong>Meal Timing:</strong> {String((ns as any).mealTiming)}
                </div>
              )}
              {Boolean((ns as any).bsldsTemplate) && (
                <BSLDSTable bsldsTemplate={(ns as any).bsldsTemplate as Record<string, unknown>} />
              )}
              {Array.isArray((ns as any).mealPlan) && (ns as any).mealPlan.length > 0 && (
                <MealPlanTable mealPlan={(ns as any).mealPlan as MealPlanRow[]} />
              )}
              {(ns.keyGuidelines as string[])?.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Key Guidelines</div>
                  {(ns.keyGuidelines as string[]).map((g, i) => (
                    <div key={i} style={{ fontSize: '11px', color: '#444', marginBottom: '5px', display: 'flex', gap: '8px' }}>
                      <span style={{ color: '#D4AF37', fontWeight: '700', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span>{g}</span>
                    </div>
                  ))}
                </div>
              )}
              {Boolean((ns as any).hydrationTargetOz) && (
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#555', background: '#f0f8ff', padding: '10px', borderRadius: '6px', border: '1px solid #d0e8f8' }}>
                  <strong>Hydration Target:</strong> ≥ {String(ns.hydrationTargetOz)} oz/day
                  {(ns.hydrationSchedule as Array<Record<string, string>>)?.map((h, i) => (
                    <div key={i} style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>{h.timing}</span>
                      <span style={{ fontWeight: '600', color: '#1e6fa8' }}>{h.amount} {h.notes ? '· ' + h.notes : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {typeof (ns as any).disruption_protocol === 'string' && (ns as any).disruption_protocol.length > 0 && (
                <div style={{ marginTop: '12px', background: '#fffbf0', border: '1px solid #fde8a0', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#b8860b', textTransform: 'uppercase', marginBottom: '4px' }}>When Life Disrupts the Plan</div>
                  <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.6' }}>{String((ns as any).disruption_protocol)}</div>
                </div>
              )}
            </div>
          )}

          {rs && (
            <div style={{ marginBottom: '28px' }}>
              <SectionHeader title="Recovery Protocol" color="#1a5276" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {[
                  { label: 'Sleep Target', value: String(rs.sleepTarget ?? '—') },
                  { label: 'Recovery Days', value: String(rs.activeRecoveryDays ?? '—') + '/week' },
                  { label: 'Mobility', value: String(rs.mobilityMinutes ?? '—') + ' min/day' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#f0f5ff', border: '1px solid #d0dff8', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a5276' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {typeof (rs as any).stressReductionProtocol === 'string' && (rs as any).stressReductionProtocol.length > 0 && (
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '12px', background: '#f0f5ff', padding: '10px', borderRadius: '6px', border: '1px solid #d0dff8', lineHeight: '1.6' }}>
                  <strong>Stress Reduction:</strong> {String((rs as any).stressReductionProtocol)}
                </div>
              )}
              {(rs.keyRecoveryPractices as string[])?.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Key Recovery Practices</div>
                  {(rs.keyRecoveryPractices as string[]).map((p, i) => (
                    <div key={i} style={{ fontSize: '11px', color: '#444', marginBottom: '5px', display: 'flex', gap: '8px' }}>
                      <span style={{ color: '#D4AF37', fontWeight: '700', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {typeof (protocol.protocol_payload as any)?.clientFacingMessage === 'string' && (protocol.protocol_payload as any).clientFacingMessage.length > 0 && (
            <div style={{ background: '#f8f4ff', border: '1px solid #e0d4f7', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#4B0082', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>A Note From Your Coach</div>
              <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.8', fontStyle: 'italic' }}>{String((protocol.protocol_payload as any).clientFacingMessage)}</div>
            </div>
          )}

          <div style={{ borderTop: '1px solid #eee', paddingTop: '16px', fontSize: '9px', color: '#aaa', lineHeight: '1.6' }}>
            This protocol is provided for educational wellness coaching purposes and does not replace medical advice.
            Consult your healthcare provider before making nutrition, supplement, or exercise changes.
            © DFitFactor {new Date().getFullYear()} · Strength Forged In Training
          </div>
        </div>
      </div>
    </div>
  )
}
