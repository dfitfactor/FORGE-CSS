'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, ClipboardList, CheckCircle, AlertCircle,
  X, Loader2, Trash2, ChevronDown, ChevronUp, Calendar, BarChart2
} from 'lucide-react'

type Checkin = {
  id: string
  checkin_type: string
  checkin_date: string
  workout_consistency: number | null
  nutrition_adherence: number | null
  sleep_quality: number | null
  sleep_hours_avg: string | null
  mindset_rating: number | null
  stress_rating: number | null
  energy_level: string | null
  what_worked: string | null
  challenges: string | null
  goals_next_week: string | null
  one_win: string | null
  one_obstacle: string | null
  grateful_for: string | null
  did_for_self: string | null
  workout_types: string[] | null
  workouts_enjoyed: string | null
  workouts_completed: string | null
  nutrition_challenges: string | null
  protein_adherence: string | null
  food_journaling_days: string | null
  nutrition_drift: string | null
  hydration_range: string | null
  digestion_rating: number | null
  digestion_issues: boolean | null
  sleep_disturbances: boolean | null
  sleep_response: string | null
  sleep_hygiene: string | null
  positive_affirmations: string | null
  stress_strategies: string | null
  movement_vs_usual: string | null
  recovery_quality: string | null
  additional_notes: string | null
  based_on_logs: boolean | null
  coach_notes: string | null
  coach_response: string | null
}

function ScoreBar({ value, max = 10, color = '#D4AF37' }: { value: number | null; max?: number; color?: string }) {
  if (!value) return <span className="text-white/20 text-xs">—</span>
  const pct = (value / max) * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: pct + '%', backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold text-white/70 w-6 text-right">{value}</span>
    </div>
  )
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function RatingButtons({ value, max, onChange }: { value: string; max: number; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button"
          onClick={() => onChange(String(n))}
          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
            value === String(n)
              ? 'bg-[#D4AF37] text-black'
              : 'bg-white/6 text-white/40 hover:bg-white/12'
          }`}>
          {n}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-mono uppercase tracking-widest text-[#D4AF37]/70 border-b border-white/6 pb-2">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="forge-label">{label}</label>
      {hint && <p className="text-xs text-white/30 -mt-1">{hint}</p>}
      {children}
    </div>
  )
}

function OptionButtons({
  field,
  form,
  setF,
  options,
}: {
  field: string
  form: Record<string, string | string[] | boolean>
  setF: (key: string, value: string | string[] | boolean) => void
  options: string[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt} type="button"
          onClick={() => setF(field, String(form[field]) === opt ? '' : opt)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
            String(form[field]) === opt
              ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
              : 'bg-white/4 text-white/40 border-white/10 hover:border-white/25'
          }`}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function CheckboxGroup({
  field,
  form,
  toggleArray,
  isChecked,
  options,
}: {
  field: string
  form: Record<string, string | string[] | boolean>
  toggleArray: (key: string, value: string) => void
  isChecked: (key: string, value: string) => boolean
  options: string[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt} type="button"
          onClick={() => toggleArray(field, opt)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
            isChecked(field, opt)
              ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
              : 'bg-white/4 text-white/40 border-white/10 hover:border-white/25'
          }`}>
          {opt}
        </button>
      ))}
    </div>
  )
}

export default function CheckinsPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId as string

  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly')
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [form, setForm] = useState<Record<string, string | string[] | boolean>>({
    checkinDate: new Date().toISOString().split('T')[0],
    checkinType: 'weekly',
    workoutConsistency: '',
    workoutTypes: [],
    workoutsEnjoyed: '',
    workoutsCompleted: '',
    nutritionAdherence: '',
    mealFocus: [],
    nutritionChallenges: '',
    proteinAdherence: '',
    foodJournalingDays: '',
    nutritionDrift: '',
    hydrationRange: '',
    digestionRating: '',
    digestionIssues: false,
    sleepQuality: '',
    sleepHoursAvg: '',
    sleepDisturbances: false,
    sleepResponse: '',
    sleepHygiene: '',
    mindsetRating: '',
    positiveAffirmations: '',
    stressRating: '',
    stressStrategies: '',
    movementVsUsual: '',
    recoveryQuality: '',
    energyLevel: '',
    whatWorked: '',
    challenges: '',
    goalsNextWeek: '',
    oneWin: '',
    oneObstacle: '',
    gratefulFor: '',
    didForSelf: '',
    additionalNotes: '',
    basedOnLogs: false,
    coachNotes: '',
  })

  useEffect(() => {
    if (!clientId) return
    fetch('/api/clients/' + clientId).then(r => r.json()).then(d => setClientName(d.client?.full_name ?? '')).catch(() => {})
    loadCheckins()
  }, [clientId])

  function loadCheckins() {
    fetch('/api/clients/' + clientId + '/checkins')
      .then(r => r.json())
      .then(d => { setCheckins(d.checkins ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function setF(key: string, value: string | string[] | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleArray(key: string, val: string) {
    const arr = (form[key] as string[]) || []
    setF(key, arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  function isChecked(key: string, val: string) {
    return ((form[key] as string[]) || []).includes(val)
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/clients/' + clientId + '/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Save failed'); return }
      setSuccess('Check-in saved')
      setShowForm(false)
      loadCheckins()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this check-in?')) return
    await fetch('/api/clients/' + clientId + '/checkins?id=' + id, { method: 'DELETE' })
    setCheckins(prev => prev.filter(c => c.id !== id))
  }

  const filtered = checkins.filter(c => c.checkin_type === activeTab)

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + clientId} className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Check-ins</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <button onClick={() => { setShowForm(true); setF('checkinType', activeTab) }}
            className="forge-btn-gold text-sm flex items-center gap-2">
            <Plus size={15} /> Log Check-in
          </button>
        </div>

        {/* Banners */}
        {success && <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"><CheckCircle size={16} className="text-emerald-400" /><span className="text-sm text-emerald-400">{success}</span></div>}
        {error && <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"><AlertCircle size={16} className="text-red-400" /><span className="text-sm text-red-400 flex-1">{error}</span><button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button></div>}

        {/* Tabs */}
        <div className="flex gap-2">
          {(['weekly', 'monthly'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? 'bg-[#D4AF37] text-black'
                  : 'bg-white/6 text-white/40 hover:text-white'
              }`}>
              {tab === 'weekly' ? 'Weekly Check-in' : 'Monthly Self-Assessment'}
            </button>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl p-6 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-widest font-mono">
                {activeTab === 'weekly' ? 'Weekly Check-in' : 'Monthly Self-Assessment'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>

            <div>
              <label className="forge-label">Date</label>
              <input type="date" value={String(form.checkinDate)} onChange={e => setF('checkinDate', e.target.value)} className="forge-input max-w-xs" />
            </div>

            {activeTab === 'weekly' ? (
              <>
                <Section title="Workouts">
                  <Field label="How would you rate your workout consistency this week?" hint="1 = Not consistent, 10 = Extremely consistent">
                    <RatingButtons value={String(form.workoutConsistency)} max={10} onChange={v => setF('workoutConsistency', v)} />
                  </Field>
                  <Field label="What types of workouts did you complete?">
                    <CheckboxGroup field="workoutTypes" form={form} toggleArray={toggleArray} isChecked={isChecked} options={['Strength Training', 'Cardio', 'Flexibility/Stretching', 'Other']} />
                  </Field>
                  <Field label="Please list any specific workouts or activities you enjoyed:">
                    <textarea rows={2} value={String(form.workoutsEnjoyed)} onChange={e => setF('workoutsEnjoyed', e.target.value)} className="forge-input resize-none" placeholder="e.g. Hip thrust PR, loved the HIIT class..." />
                  </Field>
                </Section>

                <Section title="Nutrition">
                  <Field label="How would you rate your nutrition adherence this week?" hint="1 = Poor, 10 = Excellent">
                    <RatingButtons value={String(form.nutritionAdherence)} max={10} onChange={v => setF('nutritionAdherence', v)} />
                  </Field>
                  <Field label="What types of meals did you focus on?">
                    <CheckboxGroup field="mealFocus" form={form} toggleArray={toggleArray} isChecked={isChecked} options={['Whole Foods', 'Balanced Meals', 'Meal Prepping', 'Other']} />
                  </Field>
                  <Field label="Any challenges with nutrition this week?">
                    <textarea rows={2} value={String(form.nutritionChallenges)} onChange={e => setF('nutritionChallenges', e.target.value)} className="forge-input resize-none" placeholder="e.g. Ate out 3x, skipped breakfast..." />
                  </Field>
                </Section>

                <Section title="Digestion">
                  <Field label="How would you rate your digestion this week?" hint="1 = Very Poor, 10 = Excellent">
                    <RatingButtons value={String(form.digestionRating)} max={10} onChange={v => setF('digestionRating', v)} />
                  </Field>
                  <Field label="Did you experience any discomfort or issues?">
                    <div className="flex gap-3">
                      {['Yes', 'No'].map(opt => (
                        <button key={opt} type="button" onClick={() => setF('digestionIssues', opt === 'Yes')}
                          className={`px-4 py-2 rounded-xl text-sm border transition-all ${
                            (form.digestionIssues === true && opt === 'Yes') || (form.digestionIssues === false && opt === 'No')
                              ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
                              : 'bg-white/4 text-white/40 border-white/10'
                          }`}>{opt}</button>
                      ))}
                    </div>
                  </Field>
                </Section>

                <Section title="Sleep">
                  <Field label="How would you rate the quality of your sleep this week?" hint="1 = Very Poor, 10 = Excellent">
                    <RatingButtons value={String(form.sleepQuality)} max={10} onChange={v => setF('sleepQuality', v)} />
                  </Field>
                  <Field label="Average hours of sleep per night:">
                    <OptionButtons field="sleepHoursAvg" form={form} setF={setF} options={['< 5', '5-6', '6-7', '7-8', '8+']} />
                  </Field>
                  <Field label="Any sleep disturbances?">
                    <div className="flex gap-3">
                      {['Yes', 'No'].map(opt => (
                        <button key={opt} type="button" onClick={() => setF('sleepDisturbances', opt === 'Yes')}
                          className={`px-4 py-2 rounded-xl text-sm border transition-all ${
                            (form.sleepDisturbances === true && opt === 'Yes') || (form.sleepDisturbances === false && opt === 'No')
                              ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
                              : 'bg-white/4 text-white/40 border-white/10'
                          }`}>{opt}</button>
                      ))}
                    </div>
                  </Field>
                </Section>

                <Section title="Mindset">
                  <Field label="How would you rate your overall mindset this week?" hint="1 = Very Negative, 10 = Very Positive">
                    <RatingButtons value={String(form.mindsetRating)} max={10} onChange={v => setF('mindsetRating', v)} />
                  </Field>
                  <Field label="What positive affirmations or thoughts helped you this week?">
                    <textarea rows={2} value={String(form.positiveAffirmations)} onChange={e => setF('positiveAffirmations', e.target.value)} className="forge-input resize-none" placeholder="e.g. I am consistent and disciplined..." />
                  </Field>
                </Section>

                <Section title="Stress">
                  <Field label="How would you rate your stress levels this week?" hint="1 = Very High, 10 = Very Low">
                    <RatingButtons value={String(form.stressRating)} max={10} onChange={v => setF('stressRating', v)} />
                  </Field>
                  <Field label="What strategies did you use to manage stress?">
                    <textarea rows={2} value={String(form.stressStrategies)} onChange={e => setF('stressStrategies', e.target.value)} className="forge-input resize-none" placeholder="e.g. Journaling, walks, breathing exercises..." />
                  </Field>
                </Section>

                <Section title="Feedback & Reflection">
                  <Field label="What worked well for you this week?">
                    <textarea rows={2} value={String(form.whatWorked)} onChange={e => setF('whatWorked', e.target.value)} className="forge-input resize-none" placeholder="Celebrate your wins..." />
                  </Field>
                  <Field label="What challenges did you face?">
                    <textarea rows={2} value={String(form.challenges)} onChange={e => setF('challenges', e.target.value)} className="forge-input resize-none" placeholder="Be honest about what got in the way..." />
                  </Field>
                  <Field label="What are your goals for next week?">
                    <textarea rows={2} value={String(form.goalsNextWeek)} onChange={e => setF('goalsNextWeek', e.target.value)} className="forge-input resize-none" placeholder="Set your intentions..." />
                  </Field>
                  <Field label="One thing I am grateful for this week:">
                    <textarea rows={2} value={String(form.gratefulFor)} onChange={e => setF('gratefulFor', e.target.value)} className="forge-input resize-none" placeholder="Something meaningful, big or small..." />
                  </Field>
                  <Field label="One thing I did for myself this week:">
                    <textarea rows={2} value={String(form.didForSelf)} onChange={e => setF('didForSelf', e.target.value)} className="forge-input resize-none" placeholder="Self-care, joy, rest, fun..." />
                  </Field>
                  <Field label="Additional notes or goals to discuss:">
                    <textarea rows={2} value={String(form.additionalNotes)} onChange={e => setF('additionalNotes', e.target.value)} className="forge-input resize-none" placeholder="Anything else you want your coach to know..." />
                  </Field>
                </Section>

                <Section title="Coach Notes">
                  <Field label="Coach observations (internal):">
                    <textarea rows={3} value={String(form.coachNotes)} onChange={e => setF('coachNotes', e.target.value)} className="forge-input resize-none" placeholder="Patterns, flags, recommendations..." />
                  </Field>
                </Section>
              </>
            ) : (
              <>
                <Section title="Nutrition">
                  <Field label="Food journaling days" hint="Count days you logged all meals with reasonable accuracy">
                    <OptionButtons field="foodJournalingDays" form={form} setF={setF} options={['0', '1-2', '3-4', '5 or more']} />
                  </Field>
                  <Field label="Nutrition drift frequency" hint="How often did foods outside the plan show up?">
                    <OptionButtons field="nutritionDrift" form={form} setF={setF} options={['Not at all', '1-2 times', '3-4 times', '5 or more times']} />
                  </Field>
                  <Field label="Protein adherence" hint="How often did you meet your protein target?">
                    <OptionButtons field="proteinAdherence" form={form} setF={setF} options={['>95%', '85-95%', '70-85%', '<70%', 'Unsure']} />
                  </Field>
                  <Field label="Average daily hydration:">
                    <OptionButtons field="hydrationRange" form={form} setF={setF} options={['≥ 1 gallon/day', '80-100 oz/day', '60-80 oz/day', '< 60 oz/day']} />
                  </Field>
                </Section>

                <Section title="Sleep">
                  <Field label="Average nightly sleep:">
                    <OptionButtons field="sleepHoursAvg" form={form} setF={setF} options={['< 5', '5-6', '7-8', '8+']} />
                  </Field>
                  <Field label="After nights of shorter sleep, how did your body respond?">
                    <OptionButtons field="sleepResponse" form={form} setF={setF} options={['Felt rested and functional', 'Slightly tired but manageable', 'Crashed or struggled significantly', 'Inconsistent']} />
                  </Field>
                  <Field label="Overall sleep hygiene this period:">
                    <OptionButtons field="sleepHygiene" form={form} setF={setF} options={['Very supportive', 'Mostly supportive', 'Inconsistent', 'Poor / not supportive']} />
                  </Field>
                </Section>

                <Section title="Movement & Recovery">
                  <Field label="Movement vs your usual routine (excluding workouts):">
                    <OptionButtons field="movementVsUsual" form={form} setF={setF} options={['Less', 'About the same', 'More']} />
                  </Field>
                  <Field label="Workouts completed:">
                    <OptionButtons field="workoutsCompleted" form={form} setF={setF} options={['All planned workouts', 'Missed 1 workout', 'Missed 2+ workouts', 'No workouts completed']} />
                  </Field>
                  <Field label="Recovery between workouts:">
                    <OptionButtons field="recoveryQuality" form={form} setF={setF} options={['Good - Ready for next sessions', 'Moderate - Some lingering soreness', 'Slow - Persistent fatigue affected training']} />
                  </Field>
                  <Field label="Energy level this period:">
                    <OptionButtons field="energyLevel" form={form} setF={setF} options={['Low', 'Steady', 'High', 'Inconsistent']} />
                  </Field>
                </Section>

                <Section title="Reflection">
                  <Field label="One Win" hint="One specific thing you did well — keep it factual and to one sentence">
                    <textarea rows={2} value={String(form.oneWin)} onChange={e => setF('oneWin', e.target.value)} className="forge-input resize-none" placeholder="e.g. Hit all 4 workouts and tracked every meal..." />
                  </Field>
                  <Field label="One Obstacle" hint="One specific obstacle that affected your month — state what it was, not why">
                    <textarea rows={2} value={String(form.oneObstacle)} onChange={e => setF('oneObstacle', e.target.value)} className="forge-input resize-none" placeholder="e.g. Work travel disrupted schedule twice..." />
                  </Field>
                  <Field label="One thing I am grateful for:">
                    <textarea rows={2} value={String(form.gratefulFor)} onChange={e => setF('gratefulFor', e.target.value)} className="forge-input resize-none" placeholder="Something meaningful, big or small..." />
                  </Field>
                  <Field label="One thing I did for myself:">
                    <textarea rows={2} value={String(form.didForSelf)} onChange={e => setF('didForSelf', e.target.value)} className="forge-input resize-none" placeholder="Self-care, joy, rest, fun..." />
                  </Field>
                  <Field label="Are these answers based mostly on logs?">
                    <div className="flex gap-3">
                      {['Yes', 'No'].map(opt => (
                        <button key={opt} type="button" onClick={() => setF('basedOnLogs', opt === 'Yes')}
                          className={`px-4 py-2 rounded-xl text-sm border transition-all ${
                            (form.basedOnLogs === true && opt === 'Yes') || (form.basedOnLogs === false && opt === 'No')
                              ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
                              : 'bg-white/4 text-white/40 border-white/10'
                          }`}>{opt}</button>
                      ))}
                    </div>
                  </Field>
                </Section>

                <Section title="Coach Notes">
                  <Field label="Coach observations (internal):">
                    <textarea rows={3} value={String(form.coachNotes)} onChange={e => setF('coachNotes', e.target.value)} className="forge-input resize-none" placeholder="Patterns, flags, recommendations..." />
                  </Field>
                </Section>
              </>
            )}

            <button onClick={handleSave} disabled={saving}
              className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><ClipboardList size={16} /> Save Check-in</>}
            </button>
          </div>
        )}

        {/* History */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <ClipboardList size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No {activeTab} check-ins yet</p>
            <button onClick={() => { setShowForm(true); setF('checkinType', activeTab) }}
              className="mt-4 forge-btn-gold text-sm flex items-center gap-2 mx-auto">
              <Plus size={14} /> Log First Check-in
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest font-mono mb-3">
              {activeTab === 'weekly' ? 'Weekly' : 'Monthly'} History
            </h2>
            <div className="space-y-3">
              {filtered.map(c => (
                <div key={c.id} className="bg-[#111111] border border-white/6 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <div className="flex items-center gap-3">
                      <Calendar size={15} className="text-white/30" />
                      <span className="text-sm font-semibold text-white">{formatDate(c.checkin_date)}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {c.workout_consistency && <div className="flex items-center gap-2 text-xs text-white/40"><span>Workout</span><ScoreBar value={c.workout_consistency} /></div>}
                      {c.nutrition_adherence && <div className="flex items-center gap-2 text-xs text-white/40"><span>Nutrition</span><ScoreBar value={c.nutrition_adherence} /></div>}
                      {c.sleep_quality && <div className="flex items-center gap-2 text-xs text-white/40"><span>Sleep</span><ScoreBar value={c.sleep_quality} /></div>}
                      <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); handleDelete(c.id) }} className="text-white/15 hover:text-red-400 transition-colors p-1"><Trash2 size={13} /></button>
                        {expanded === c.id ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                      </div>
                    </div>
                  </div>

                  {expanded === c.id && (
                    <div className="border-t border-white/6 p-4 space-y-4 text-sm">
                      {c.workouts_enjoyed && <div><p className="text-white/35 text-xs mb-1">Workouts Enjoyed</p><p className="text-white/60">{c.workouts_enjoyed}</p></div>}
                      {c.nutrition_challenges && <div><p className="text-white/35 text-xs mb-1">Nutrition Challenges</p><p className="text-white/60">{c.nutrition_challenges}</p></div>}
                      {c.positive_affirmations && <div><p className="text-white/35 text-xs mb-1">Positive Affirmations</p><p className="text-white/60">{c.positive_affirmations}</p></div>}
                      {c.stress_strategies && <div><p className="text-white/35 text-xs mb-1">Stress Strategies</p><p className="text-white/60">{c.stress_strategies}</p></div>}
                      {c.what_worked && <div><p className="text-white/35 text-xs mb-1">What Worked</p><p className="text-white/60">{c.what_worked}</p></div>}
                      {c.challenges && <div><p className="text-white/35 text-xs mb-1">Challenges</p><p className="text-white/60">{c.challenges}</p></div>}
                      {c.goals_next_week && <div><p className="text-white/35 text-xs mb-1">Goals Next Week</p><p className="text-white/60">{c.goals_next_week}</p></div>}
                      {c.one_win && <div><p className="text-white/35 text-xs mb-1">One Win</p><p className="text-white/60">{c.one_win}</p></div>}
                      {c.one_obstacle && <div><p className="text-white/35 text-xs mb-1">One Obstacle</p><p className="text-white/60">{c.one_obstacle}</p></div>}
                      {c.grateful_for && (
                        <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-xl p-3">
                          <p className="text-white/35 text-xs mb-1">Grateful For</p>
                          <p className="text-[#D4AF37]/80">{c.grateful_for}</p>
                        </div>
                      )}
                      {c.did_for_self && (
                        <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-xl p-3">
                          <p className="text-white/35 text-xs mb-1">Did For Self</p>
                          <p className="text-[#D4AF37]/80">{c.did_for_self}</p>
                        </div>
                      )}
                      {c.coach_notes && (
                        <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                          <p className="text-white/35 text-xs mb-1">Coach Notes</p>
                          <p className="text-white/50">{c.coach_notes}</p>
                        </div>
                      )}
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
