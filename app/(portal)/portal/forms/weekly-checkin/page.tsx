'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

const baseCard: React.CSSProperties = {
  backgroundColor: 'var(--app-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '24px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--app-surface-muted)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  padding: '12px 14px',
  color: 'var(--app-text)',
  fontSize: '14px',
  boxSizing: 'border-box',
}

const areaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '96px',
  resize: 'vertical',
}

function RadioGroup({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {options.map((option) => {
        const active = value === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: '10px',
              border: active ? '1px solid rgba(212,175,55,0.8)' : '1px solid rgba(255,255,255,0.08)',
              background: active ? 'var(--app-gold-soft)' : 'var(--app-surface-muted)',
              color: active ? 'var(--app-gold)' : 'var(--app-text-secondary)',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function CheckboxGroup({
  values,
  options,
  onToggle,
}: {
  values: string[]
  options: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {options.map((option) => {
        const active = values.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            style={{
              borderRadius: '999px',
              padding: '10px 14px',
              border: active ? '1px solid rgba(212,175,55,0.8)' : '1px solid rgba(255,255,255,0.08)',
              background: active ? 'var(--app-gold-soft)' : 'var(--app-surface-muted)',
              color: active ? 'var(--app-gold)' : 'var(--app-text-secondary)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function SliderField({
  value,
  min = 1,
  max = 10,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--app-gold)' }}
      />
      <div style={{ color: 'var(--app-gold)', fontSize: '13px', fontWeight: 700, marginTop: '6px' }}>{value} / {max}</div>
    </div>
  )
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', color: 'var(--app-text)', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
        {label}
      </label>
      {helper ? <p style={{ color: 'var(--app-text-muted)', fontSize: '12px', marginBottom: '10px' }}>{helper}</p> : null}
      {children}
    </div>
  )
}

export default function WeeklyCheckinPage() {
  const router = useRouter()
  const lastSunday = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() - date.getDay())
    return date.toISOString().split('T')[0]
  }, [])

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    week_ending_date: lastSunday,
    food_journaling_days: '',
    nutrition_drift: '',
    protein_adherence: '',
    hydration_range: '',
    nutrition_challenges: '',
    sleep_hours: '',
    sleep_response: '',
    sleep_hygiene: '',
    workouts_completed: '',
    workout_types: [] as string[],
    movement_vs_usual: '',
    recovery_quality: '',
    energy_level: '',
    stress_rating: 5,
    mindset_rating: 5,
    digestion_quality: '',
    one_win: '',
    one_obstacle: '',
    grateful_for: '',
    did_for_self: '',
    based_on_logs: '',
  })

  function setField<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleWorkoutType(value: string) {
    setForm((current) => ({
      ...current,
      workout_types: current.workout_types.includes(value)
        ? current.workout_types.filter((item) => item !== value)
        : [...current.workout_types, value],
    }))
  }

  const steps = [
    {
      title: 'Week Info',
      content: (
        <Field label="Week Ending Date">
          <input type="date" value={form.week_ending_date} onChange={(e) => setField('week_ending_date', e.target.value)} style={inputStyle} />
        </Field>
      ),
    },
    {
      title: 'Nutrition',
      content: (
        <>
          <Field label="Food Journaling Days" helper="Days you logged all meals accurately">
            <RadioGroup value={form.food_journaling_days} options={['0', '1-2', '3-4', '5 or more']} onChange={(value) => setField('food_journaling_days', value)} />
          </Field>
          <Field label="Nutrition Drift Frequency" helper="How often foods outside your plan showed up">
            <RadioGroup value={form.nutrition_drift} options={['none', '1-2 times', '3-4 times', '5+ times']} onChange={(value) => setField('nutrition_drift', value)} />
          </Field>
          <Field label="Protein Adherence" helper="How often you met your protein target">
            <RadioGroup value={form.protein_adherence} options={['>95%', '85-95%', '70-85%', '<70%', 'unsure']} onChange={(value) => setField('protein_adherence', value)} />
          </Field>
          <Field label="Hydration Range" helper="Average daily fluid intake this week">
            <RadioGroup value={form.hydration_range} options={['≥1 gallon/day', '80-100 oz/day', '60-80 oz/day', '<60 oz/day']} onChange={(value) => setField('hydration_range', value)} />
          </Field>
          <Field label="Nutrition Challenges" helper="Any specific challenges with nutrition this week">
            <textarea maxLength={200} value={form.nutrition_challenges} onChange={(e) => setField('nutrition_challenges', e.target.value)} style={areaStyle} />
          </Field>
        </>
      ),
    },
    {
      title: 'Sleep',
      content: (
        <>
          <Field label="Sleep Hours" helper="Average nightly sleep across past 7 days">
            <RadioGroup value={form.sleep_hours} options={['<5', '5-6', '7-8', '8+']} onChange={(value) => setField('sleep_hours', value)} />
          </Field>
          <Field label="After short sleep nights, how did you respond?">
            <RadioGroup value={form.sleep_response} options={['Rested and functional', 'Slightly tired but manageable', 'Crashed or struggled significantly', 'Inconsistent']} onChange={(value) => setField('sleep_response', value)} />
          </Field>
          <Field label="Overall sleep hygiene this period">
            <RadioGroup value={form.sleep_hygiene} options={['Very supportive', 'Mostly supportive', 'Inconsistent', 'Poor / not supportive']} onChange={(value) => setField('sleep_hygiene', value)} />
          </Field>
        </>
      ),
    },
    {
      title: 'Training & Movement',
      content: (
        <>
          <Field label="Workouts Completed" helper="Planned training sessions only">
            <RadioGroup value={form.workouts_completed} options={['All planned workouts', 'Missed 1 workout', 'Missed 2+ workouts', 'No workouts completed']} onChange={(value) => setField('workouts_completed', value)} />
          </Field>
          <Field label="Workout Types This Week">
            <CheckboxGroup values={form.workout_types} options={['Strength', 'Cardio', 'HIIT', 'Mobility/Flexibility', 'Sport/Recreation', 'Other']} onToggle={toggleWorkoutType} />
          </Field>
          <Field label="Movement vs Usual" helper="Daily movement excluding planned workouts">
            <RadioGroup value={form.movement_vs_usual} options={['Less', 'About the same', 'More']} onChange={(value) => setField('movement_vs_usual', value)} />
          </Field>
        </>
      ),
    },
    {
      title: 'Recovery & Energy',
      content: (
        <>
          <Field label="Recovery Between Workouts">
            <RadioGroup value={form.recovery_quality} options={['Good – felt ready for next session', 'Moderate – some lingering soreness but manageable', 'Slow – persistent soreness or fatigue affected training']} onChange={(value) => setField('recovery_quality', value)} />
          </Field>
          <Field label="Energy Level">
            <RadioGroup value={form.energy_level} options={['Low', 'Steady', 'High', 'Inconsistent']} onChange={(value) => setField('energy_level', value)} />
          </Field>
          <Field label="Stress Rating" helper="1 = very low, 10 = very high">
            <SliderField value={form.stress_rating} onChange={(value) => setField('stress_rating', value)} />
          </Field>
          <Field label="Mindset Rating" helper="1 = struggling, 10 = strong and focused">
            <SliderField value={form.mindset_rating} onChange={(value) => setField('mindset_rating', value)} />
          </Field>
          <Field label="Digestion">
            <RadioGroup value={form.digestion_quality} options={['Good', 'Moderate', 'Poor']} onChange={(value) => setField('digestion_quality', value)} />
          </Field>
        </>
      ),
    },
    {
      title: 'Reflection & Submission',
      content: (
        <>
          <Field label="One Win" helper="One specific thing you did well — one sentence">
            <textarea maxLength={200} value={form.one_win} onChange={(e) => setField('one_win', e.target.value)} style={areaStyle} />
          </Field>
          <Field label="One Obstacle" helper="One specific obstacle — state what it was">
            <textarea maxLength={200} value={form.one_obstacle} onChange={(e) => setField('one_obstacle', e.target.value)} style={areaStyle} />
          </Field>
          <Field label="Something You're Grateful For">
            <textarea maxLength={200} value={form.grateful_for} onChange={(e) => setField('grateful_for', e.target.value)} style={areaStyle} />
          </Field>
          <Field label="Something You Did For Yourself">
            <textarea maxLength={200} value={form.did_for_self} onChange={(e) => setField('did_for_self', e.target.value)} style={areaStyle} />
          </Field>
          <Field label="These answers are based mostly on logs">
            <RadioGroup value={form.based_on_logs} options={['Yes', 'No']} onChange={(value) => setField('based_on_logs', value)} />
          </Field>
        </>
      ),
    },
  ]

  async function handleSubmit() {
    if (!form.one_win.trim() || !form.one_obstacle.trim() || !form.based_on_logs) {
      setError('Please complete the required reflection fields before submitting.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/portal/checkin/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Submission failed')
        return
      }
      router.push('/portal/dashboard?checkin=submitted')
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const currentStep = steps[step]

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', color: 'var(--app-text)' }}>
      <Link href="/portal/forms" style={{ color: 'var(--app-text-secondary)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
        Back to forms
      </Link>
      <div style={baseCard}>
        <div style={{ color: 'var(--app-gold)', fontSize: '13px', fontWeight: 700, marginBottom: '14px' }}>Step {step + 1} of {steps.length}</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {steps.map((_, index) => (
            <div key={index} style={{ flex: 1, height: '8px', borderRadius: '999px', background: index <= step ? 'var(--app-gold)' : 'var(--app-border-strong)' }} />
          ))}
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>Weekly Guided Progress Check-In</h1>
        <p style={{ color: 'var(--app-text-muted)', fontSize: '14px', marginBottom: '24px' }}>{currentStep.title}</p>

        {currentStep.content}

        {error ? <p style={{ color: '#f87171', fontSize: '13px', marginTop: '6px' }}>{error}</p> : null}

        <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
          <button
            type="button"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0 || submitting}
            style={{
              flex: 1,
              borderRadius: '10px',
              padding: '14px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'var(--app-text)',
              opacity: step === 0 ? 0.4 : 1,
              cursor: step === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Back
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
              style={{ flex: 1, borderRadius: '10px', padding: '14px', background: 'var(--app-gold)', border: 'none', color: '#000', fontWeight: 700, cursor: 'pointer' }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ flex: 1, borderRadius: '10px', padding: '14px', background: 'var(--app-gold)', border: 'none', color: '#000', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Submitting...' : 'Submit Weekly Check-In'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
