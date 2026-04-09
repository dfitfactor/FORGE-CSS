'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, FlaskConical, Loader2, CheckCircle, AlertCircle, X, Trash2, ChevronDown, ChevronUp, Pencil
} from 'lucide-react'

type Panel = {
  id: string; panel_date: string; panel_type: string
  lab_name: string | null; ordered_by: string | null
  fasting_glucose: number | null; hba1c: number | null; insulin: number | null
  triglycerides: number | null; hdl: number | null; ldl: number | null; total_cholesterol: number | null
  testosterone_total: number | null; testosterone_free: number | null
  estradiol: number | null; progesterone: number | null; cortisol: number | null; dhea_s: number | null
  tsh: number | null; t3_free: number | null; t4_free: number | null
  crp: number | null; homocysteine: number | null
  vitamin_d: number | null; b12: number | null; ferritin: number | null
  coach_interpretation: string | null
}

const PANEL_TYPES = [
  { value: 'comprehensive_metabolic', label: 'Comprehensive Metabolic' },
  { value: 'lipid', label: 'Lipid Panel' },
  { value: 'thyroid', label: 'Thyroid Panel' },
  { value: 'hormone', label: 'Hormone Panel' },
  { value: 'nutrient', label: 'Nutrient Panel' },
  { value: 'custom', label: 'Custom / Other' },
]

const RANGES: Record<string, { low: number; high: number; unit: string }> = {
  fasting_glucose: { low: 70, high: 100, unit: 'mg/dL' },
  hba1c: { low: 4.0, high: 5.6, unit: '%' },
  triglycerides: { low: 0, high: 150, unit: 'mg/dL' },
  hdl: { low: 50, high: 999, unit: 'mg/dL' },
  ldl: { low: 0, high: 100, unit: 'mg/dL' },
  tsh: { low: 0.5, high: 4.5, unit: 'mIU/L' },
  vitamin_d: { low: 30, high: 100, unit: 'ng/mL' },
  cortisol: { low: 6, high: 23, unit: 'mcg/dL' },
  crp: { low: 0, high: 1.0, unit: 'mg/L' },
}

function MarkerValue({ field, value }: { field: string; value: number | null }) {
  if (!value) return null
  const range = RANGES[field]
  if (!range) return <span className="text-white/60 font-semibold text-xs">{value}</span>
  const inRange = value >= range.low && value <= range.high
  return (
    <span className={`text-xs font-semibold ${inRange ? 'text-emerald-400' : 'text-amber-400'}`}>
      {value} {range.unit} {inRange ? '✓' : '!'}
    </span>
  )
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type FormData = Record<string, string>

export default function BiomarkersPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [panels, setPanels] = useState<Panel[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const emptyForm: FormData = {
    panelDate: new Date().toISOString().split('T')[0],
    panelType: 'comprehensive_metabolic', labName: '', orderedBy: '',
    fastingGlucose: '', hba1c: '', insulin: '',
    triglycerides: '', hdl: '', ldl: '', totalCholesterol: '',
    testosteroneTotal: '', testosteroneFree: '', estradiol: '',
    progesterone: '', cortisol: '', dheaS: '',
    tsh: '', t3Free: '', t4Free: '',
    crp: '', homocysteine: '',
    vitaminD: '', b12: '', ferritin: '',
    coachInterpretation: '',
  }

  const [form, setForm] = useState<FormData>(emptyForm)

  useEffect(() => {
    if (!clientId) return
    fetch('/api/clients/' + clientId).then(r => r.json()).then(d => setClientName(d.client?.full_name ?? '')).catch(() => {})
    loadPanels()
  }, [clientId])

  function loadPanels() {
    fetch('/api/clients/' + clientId + '/biomarkers')
      .then(r => r.json())
      .then(d => { setPanels(d.panels ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function setF(key: string, value: string) { setForm(prev => ({ ...prev, [key]: value })) }
  function n(val: string) { return val ? Number(val) : undefined }

  function openNewPanelForm() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEditForm(panel: Panel) {
    setEditingId(panel.id)
    setForm({
      panelDate: panel.panel_date,
      panelType: panel.panel_type,
      labName: panel.lab_name ?? '',
      orderedBy: panel.ordered_by ?? '',
      fastingGlucose: panel.fasting_glucose?.toString() ?? '',
      hba1c: panel.hba1c?.toString() ?? '',
      insulin: panel.insulin?.toString() ?? '',
      triglycerides: panel.triglycerides?.toString() ?? '',
      hdl: panel.hdl?.toString() ?? '',
      ldl: panel.ldl?.toString() ?? '',
      totalCholesterol: panel.total_cholesterol?.toString() ?? '',
      testosteroneTotal: panel.testosterone_total?.toString() ?? '',
      testosteroneFree: panel.testosterone_free?.toString() ?? '',
      estradiol: panel.estradiol?.toString() ?? '',
      progesterone: panel.progesterone?.toString() ?? '',
      cortisol: panel.cortisol?.toString() ?? '',
      dheaS: panel.dhea_s?.toString() ?? '',
      tsh: panel.tsh?.toString() ?? '',
      t3Free: panel.t3_free?.toString() ?? '',
      t4Free: panel.t4_free?.toString() ?? '',
      crp: panel.crp?.toString() ?? '',
      homocysteine: panel.homocysteine?.toString() ?? '',
      vitaminD: panel.vitamin_d?.toString() ?? '',
      b12: panel.b12?.toString() ?? '',
      ferritin: panel.ferritin?.toString() ?? '',
      coachInterpretation: panel.coach_interpretation ?? '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/clients/' + clientId + '/biomarkers', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          panelDate: form.panelDate, panelType: form.panelType,
          labName: form.labName || undefined, orderedBy: form.orderedBy || undefined,
          fastingGlucose: n(form.fastingGlucose), hba1c: n(form.hba1c), insulin: n(form.insulin),
          triglycerides: n(form.triglycerides), hdl: n(form.hdl), ldl: n(form.ldl), totalCholesterol: n(form.totalCholesterol),
          testosteroneTotal: n(form.testosteroneTotal), testosteroneFree: n(form.testosteroneFree),
          estradiol: n(form.estradiol), progesterone: n(form.progesterone), cortisol: n(form.cortisol), dheaS: n(form.dheaS),
          tsh: n(form.tsh), t3Free: n(form.t3Free), t4Free: n(form.t4Free),
          crp: n(form.crp), homocysteine: n(form.homocysteine),
          vitaminD: n(form.vitaminD), b12: n(form.b12), ferritin: n(form.ferritin),
          coachInterpretation: form.coachInterpretation || undefined,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Save failed'); return }
      setSuccess(editingId ? 'Panel updated' : 'Panel saved')
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      loadPanels()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this panel?')) return
    await fetch('/api/clients/' + clientId + '/biomarkers?id=' + id, { method: 'DELETE' })
    setPanels(prev => prev.filter(p => p.id !== id))
  }

  function Field({ label, field, placeholder, unit }: { label: string; field: string; placeholder: string; unit?: string }) {
    return (
      <div>
        <label className="forge-label">{label}{unit && <span className="text-white/25 font-normal ml-1">({unit})</span>}</label>
        <input type="number" step="0.01" value={form[field] ?? ''} onChange={e => setF(field, e.target.value)} className="forge-input" placeholder={placeholder} />
      </div>
    )
  }

  const latest = panels[0] ?? null

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + clientId} className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Biomarkers</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <button onClick={openNewPanelForm} className="forge-btn-gold text-sm flex items-center gap-2">
            <Plus size={15} /> Log Panel
          </button>
        </div>

        {success && <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"><CheckCircle size={16} className="text-emerald-400" /><span className="text-sm text-emerald-400">{success}</span></div>}
        {error && <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"><AlertCircle size={16} className="text-red-400" /><span className="text-sm text-red-400 flex-1">{error}</span><button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button></div>}

        {latest && (
          <div className="bg-[#111111] border border-white/8 rounded-2xl p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">Latest — {formatDate(latest.panel_date)}</h2>
              {latest.lab_name && <span className="text-xs text-white/30">{latest.lab_name}</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(latest.fasting_glucose || latest.hba1c || latest.triglycerides || latest.hdl || latest.ldl) && (
                <div className="bg-white/3 rounded-xl p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Metabolic</p>
                  <div className="space-y-1.5">
                    {latest.fasting_glucose && <div className="flex justify-between"><span className="text-xs text-white/40">Glucose</span><MarkerValue field="fasting_glucose" value={latest.fasting_glucose} /></div>}
                    {latest.hba1c && <div className="flex justify-between"><span className="text-xs text-white/40">HbA1c</span><MarkerValue field="hba1c" value={latest.hba1c} /></div>}
                    {latest.triglycerides && <div className="flex justify-between"><span className="text-xs text-white/40">Triglycerides</span><MarkerValue field="triglycerides" value={latest.triglycerides} /></div>}
                    {latest.hdl && <div className="flex justify-between"><span className="text-xs text-white/40">HDL</span><MarkerValue field="hdl" value={latest.hdl} /></div>}
                    {latest.ldl && <div className="flex justify-between"><span className="text-xs text-white/40">LDL</span><MarkerValue field="ldl" value={latest.ldl} /></div>}
                  </div>
                </div>
              )}
              {(latest.testosterone_total || latest.estradiol || latest.cortisol || latest.tsh) && (
                <div className="bg-white/3 rounded-xl p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Hormonal</p>
                  <div className="space-y-1.5">
                    {latest.testosterone_total && <div className="flex justify-between"><span className="text-xs text-white/40">Testosterone</span><span className="text-xs text-white/60 font-semibold">{latest.testosterone_total} ng/dL</span></div>}
                    {latest.estradiol && <div className="flex justify-between"><span className="text-xs text-white/40">Estradiol</span><span className="text-xs text-white/60 font-semibold">{latest.estradiol} pg/mL</span></div>}
                    {latest.cortisol && <div className="flex justify-between"><span className="text-xs text-white/40">Cortisol</span><MarkerValue field="cortisol" value={latest.cortisol} /></div>}
                    {latest.tsh && <div className="flex justify-between"><span className="text-xs text-white/40">TSH</span><MarkerValue field="tsh" value={latest.tsh} /></div>}
                  </div>
                </div>
              )}
              {(latest.vitamin_d || latest.b12 || latest.ferritin) && (
                <div className="bg-white/3 rounded-xl p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Nutrients</p>
                  <div className="space-y-1.5">
                    {latest.vitamin_d && <div className="flex justify-between"><span className="text-xs text-white/40">Vitamin D</span><MarkerValue field="vitamin_d" value={latest.vitamin_d} /></div>}
                    {latest.b12 && <div className="flex justify-between"><span className="text-xs text-white/40">B12</span><span className="text-xs text-white/60 font-semibold">{latest.b12} pg/mL</span></div>}
                    {latest.ferritin && <div className="flex justify-between"><span className="text-xs text-white/40">Ferritin</span><span className="text-xs text-white/60 font-semibold">{latest.ferritin} ng/mL</span></div>}
                  </div>
                </div>
              )}
              {(latest.crp || latest.homocysteine) && (
                <div className="bg-white/3 rounded-xl p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Inflammatory</p>
                  <div className="space-y-1.5">
                    {latest.crp && <div className="flex justify-between"><span className="text-xs text-white/40">CRP</span><MarkerValue field="crp" value={latest.crp} /></div>}
                    {latest.homocysteine && <div className="flex justify-between"><span className="text-xs text-white/40">Homocysteine</span><span className="text-xs text-white/60 font-semibold">{latest.homocysteine} umol/L</span></div>}
                  </div>
                </div>
              )}
            </div>
            {latest.coach_interpretation && (
              <div className="mt-4 pt-4 border-t border-white/6">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-1">Coach Notes</p>
                <p className="text-sm text-white/50">{latest.coach_interpretation}</p>
              </div>
            )}
          </div>
        )}

        {showForm && (
          <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">{editingId ? 'Edit Panel' : 'Log Panel'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm) }} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="forge-label">Date</label><input type="date" value={form.panelDate} onChange={e => setF('panelDate', e.target.value)} className="forge-input" /></div>
              <div><label className="forge-label">Panel Type</label><select value={form.panelType} onChange={e => setF('panelType', e.target.value)} className="forge-input">{PANEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div><label className="forge-label">Lab Name</label><input value={form.labName} onChange={e => setF('labName', e.target.value)} className="forge-input" placeholder="e.g. LabCorp" /></div>
              <div><label className="forge-label">Ordered By</label><input value={form.orderedBy} onChange={e => setF('orderedBy', e.target.value)} className="forge-input" placeholder="Dr. Name" /></div>
            </div>
            <div><p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Metabolic</p><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"><Field label="Fasting Glucose" field="fastingGlucose" placeholder="95" unit="mg/dL" /><Field label="HbA1c" field="hba1c" placeholder="5.4" unit="%" /><Field label="Insulin" field="insulin" placeholder="8.0" unit="uIU/mL" /><Field label="Triglycerides" field="triglycerides" placeholder="120" unit="mg/dL" /><Field label="HDL" field="hdl" placeholder="65" unit="mg/dL" /><Field label="LDL" field="ldl" placeholder="90" unit="mg/dL" /><Field label="Total Cholesterol" field="totalCholesterol" placeholder="180" unit="mg/dL" /></div></div>
            <div><p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Hormonal</p><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"><Field label="Testosterone Total" field="testosteroneTotal" placeholder="450" unit="ng/dL" /><Field label="Testosterone Free" field="testosteroneFree" placeholder="12" unit="pg/mL" /><Field label="Estradiol" field="estradiol" placeholder="80" unit="pg/mL" /><Field label="Progesterone" field="progesterone" placeholder="1.2" unit="ng/mL" /><Field label="Cortisol" field="cortisol" placeholder="14" unit="mcg/dL" /><Field label="DHEA-S" field="dheaS" placeholder="200" unit="mcg/dL" /></div></div>
            <div><p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Thyroid</p><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"><Field label="TSH" field="tsh" placeholder="2.0" unit="mIU/L" /><Field label="Free T3" field="t3Free" placeholder="3.2" unit="pg/mL" /><Field label="Free T4" field="t4Free" placeholder="1.2" unit="ng/dL" /></div></div>
            <div><p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Inflammatory</p><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"><Field label="CRP" field="crp" placeholder="0.5" unit="mg/L" /><Field label="Homocysteine" field="homocysteine" placeholder="8.0" unit="umol/L" /></div></div>
            <div><p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Nutrients</p><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"><Field label="Vitamin D" field="vitaminD" placeholder="45" unit="ng/mL" /><Field label="B12" field="b12" placeholder="500" unit="pg/mL" /><Field label="Ferritin" field="ferritin" placeholder="80" unit="ng/mL" /></div></div>
            <div><label className="forge-label">Coach Interpretation</label><textarea rows={3} value={form.coachInterpretation} onChange={e => setF('coachInterpretation', e.target.value)} className="forge-input resize-none" placeholder="Clinical observations and coaching notes..." /></div>
            <button onClick={handleSave} disabled={saving} className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><FlaskConical size={16} /> {editingId ? 'Update Panel' : 'Save Panel'}</>}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
        ) : panels.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <FlaskConical size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No lab panels logged yet</p>
            <button onClick={openNewPanelForm} className="mt-4 forge-btn-gold text-sm flex items-center gap-2 mx-auto"><Plus size={14} /> Log First Panel</button>
          </div>
        ) : (
          <div>
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono mb-3">Panel History</h2>
            <div className="space-y-2">
              {panels.map(panel => (
                <div key={panel.id} className="bg-[#111111] border border-white/6 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedPanel(expandedPanel === panel.id ? null : panel.id)}>
                    <div className="flex items-center gap-3">
                      <FlaskConical size={15} className="text-white/30" />
                      <div>
                        <span className="text-sm font-semibold text-white">{formatDate(panel.panel_date)}</span>
                        <span className="text-xs text-white/30 ml-2">{PANEL_TYPES.find(t => t.value === panel.panel_type)?.label ?? panel.panel_type}</span>
                        {panel.lab_name && <span className="text-xs text-white/20 ml-2">· {panel.lab_name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); openEditForm(panel) }} className="text-white/15 hover:text-[#D4AF37] transition-colors p-1"><Pencil size={13} /></button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(panel.id) }} className="text-white/15 hover:text-red-400 transition-colors p-1"><Trash2 size={13} /></button>
                      {expandedPanel === panel.id ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                    </div>
                  </div>
                  {expandedPanel === panel.id && (
                    <div className="px-4 pb-4 border-t border-white/6 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {panel.fasting_glucose && <div className="flex justify-between"><span className="text-white/35">Glucose</span><span className="text-white/60">{panel.fasting_glucose} mg/dL</span></div>}
                      {panel.hba1c && <div className="flex justify-between"><span className="text-white/35">HbA1c</span><span className="text-white/60">{panel.hba1c}%</span></div>}
                      {panel.triglycerides && <div className="flex justify-between"><span className="text-white/35">Triglycerides</span><span className="text-white/60">{panel.triglycerides} mg/dL</span></div>}
                      {panel.hdl && <div className="flex justify-between"><span className="text-white/35">HDL</span><span className="text-white/60">{panel.hdl} mg/dL</span></div>}
                      {panel.ldl && <div className="flex justify-between"><span className="text-white/35">LDL</span><span className="text-white/60">{panel.ldl} mg/dL</span></div>}
                      {panel.testosterone_total && <div className="flex justify-between"><span className="text-white/35">Testosterone</span><span className="text-white/60">{panel.testosterone_total} ng/dL</span></div>}
                      {panel.estradiol && <div className="flex justify-between"><span className="text-white/35">Estradiol</span><span className="text-white/60">{panel.estradiol} pg/mL</span></div>}
                      {panel.cortisol && <div className="flex justify-between"><span className="text-white/35">Cortisol</span><span className="text-white/60">{panel.cortisol} mcg/dL</span></div>}
                      {panel.tsh && <div className="flex justify-between"><span className="text-white/35">TSH</span><span className="text-white/60">{panel.tsh} mIU/L</span></div>}
                      {panel.vitamin_d && <div className="flex justify-between"><span className="text-white/35">Vitamin D</span><span className="text-white/60">{panel.vitamin_d} ng/mL</span></div>}
                      {panel.b12 && <div className="flex justify-between"><span className="text-white/35">B12</span><span className="text-white/60">{panel.b12} pg/mL</span></div>}
                      {panel.ferritin && <div className="flex justify-between"><span className="text-white/35">Ferritin</span><span className="text-white/60">{panel.ferritin} ng/mL</span></div>}
                      {panel.coach_interpretation && <div className="col-span-2 border-t border-white/6 pt-3 mt-1"><p className="text-white/30 mb-1">Coach Notes</p><p className="text-white/50">{panel.coach_interpretation}</p></div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
