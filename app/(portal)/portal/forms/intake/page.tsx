'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type ClientRecord = Record<string, unknown>

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

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{ display: 'block', color: 'var(--app-text)', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
        {label}
      </label>
      {helper ? <p style={{ color: 'var(--app-text-muted)', fontSize: '12px', marginBottom: '10px' }}>{helper}</p> : null}
      {children}
    </div>
  )
}

function RadioGroup({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
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

function CheckboxGroup({ values, options, onToggle }: { values: string[]; options: string[]; onToggle: (value: string) => void }) {
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

function SliderField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--app-gold)' }} />
      <div style={{ color: 'var(--app-gold)', fontSize: '13px', fontWeight: 700, marginTop: '6px' }}>{value} / 10</div>
    </div>
  )
}

export default function IntakePage() {
  const router = useRouter()
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [loadingClient, setLoadingClient] = useState(true)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    preferred_name: '',
    mobile_phone: '',
    home_phone: '',
    email: '',
    date_of_birth: '',
    gender: '',
    pronouns: '',
    street: '',
    city: '',
    state: '',
    postal_code: '',
    occupation: '',
    hours_per_week: '',
    relationship_status: '',
    emergency_first_name: '',
    emergency_last_name: '',
    emergency_relationship: '',
    emergency_phone: '',
    emergency_email: '',
    primary_goals: [] as string[],
    goal_90_days: '',
    goal_importance: '',
    past_obstacles: '',
    medical_conditions: '',
    additional_health_notes: '',
    activity_level: 5,
    fitness_level: '',
    training_history: '',
    meals_per_day: '',
    typical_foods: '',
    taking_supplements: '',
    supplements_list: '',
    sleep_avg_hours: '',
    stress_level: 5,
    training_location: '',
    preferred_training_days: [] as string[],
    wellness_stage: '',
    wellness_stage_reason: '',
    privacy_acknowledged: false,
    signature: '',
    signature_date: today,
  })

  useEffect(() => {
    let active = true
    async function loadClient() {
      try {
        const res = await fetch('/api/portal/client/me')
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.client || !active) return
        const client = data.client as ClientRecord
        const fullName = String(client.full_name || '').trim().split(' ')
        setForm((current) => ({
          ...current,
          first_name: fullName[0] || current.first_name,
          last_name: fullName.slice(1).join(' ') || current.last_name,
          preferred_name: String(client.preferred_name || ''),
          mobile_phone: String(client.phone || ''),
          email: String(client.email || ''),
          date_of_birth: String(client.date_of_birth || '').slice(0, 10),
          gender: String(client.gender || ''),
          goal_90_days: String(client.primary_goal || ''),
          goal_importance: String(client.motivation || ''),
          past_obstacles: String(client.obstacles || ''),
          training_history: String(client.training_history || ''),
          training_location: String(client.training_location || ''),
          meals_per_day: String(client.meals_per_day || ''),
          typical_foods: String(client.typical_foods || ''),
          supplements_list: String(client.supplements || ''),
          sleep_avg_hours: String(client.sleep_avg_hours || ''),
          wellness_stage: String(client.wellness_stage || ''),
          medical_conditions: String(client.health_conditions || ''),
          additional_health_notes: String(client.notes || ''),
        }))
      } catch {
      } finally {
        if (active) setLoadingClient(false)
      }
    }
    void loadClient()
    return () => {
      active = false
    }
  }, [])

  function setField<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleValue<Key extends 'primary_goals' | 'preferred_training_days'>(key: Key, value: string) {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }))
  }

  const steps = [
    {
      title: 'Personal Information',
      content: (
        <>
          <Field label="First Name"><input value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Last Name"><input value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Preferred Name"><input value={form.preferred_name} onChange={(e) => setField('preferred_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Mobile Phone"><input value={form.mobile_phone} onChange={(e) => setField('mobile_phone', e.target.value)} style={inputStyle} /></Field>
          <Field label="Home Phone"><input value={form.home_phone} onChange={(e) => setField('home_phone', e.target.value)} style={inputStyle} /></Field>
          <Field label="Email"><input value={form.email} readOnly style={{ ...inputStyle, opacity: 0.7 }} /></Field>
          <Field label="Date of Birth"><input type="date" value={form.date_of_birth} onChange={(e) => setField('date_of_birth', e.target.value)} style={inputStyle} /></Field>
          <Field label="Gender"><input value={form.gender} onChange={(e) => setField('gender', e.target.value)} style={inputStyle} /></Field>
          <Field label="Pronouns"><input value={form.pronouns} onChange={(e) => setField('pronouns', e.target.value)} style={inputStyle} /></Field>
          <Field label="Street"><input value={form.street} onChange={(e) => setField('street', e.target.value)} style={inputStyle} /></Field>
          <Field label="City"><input value={form.city} onChange={(e) => setField('city', e.target.value)} style={inputStyle} /></Field>
          <Field label="State"><input value={form.state} onChange={(e) => setField('state', e.target.value)} style={inputStyle} /></Field>
          <Field label="Postal Code"><input value={form.postal_code} onChange={(e) => setField('postal_code', e.target.value)} style={inputStyle} /></Field>
          <Field label="Occupation"><input value={form.occupation} onChange={(e) => setField('occupation', e.target.value)} style={inputStyle} /></Field>
          <Field label="Hours Per Week"><input type="number" value={form.hours_per_week} onChange={(e) => setField('hours_per_week', e.target.value)} style={inputStyle} /></Field>
          <Field label="Relationship Status"><RadioGroup value={form.relationship_status} options={['Single', 'Married', 'Partnered', 'Divorced', 'Widowed', 'Prefer not to say']} onChange={(value) => setField('relationship_status', value)} /></Field>
        </>
      ),
    },
    {
      title: 'Emergency Contact',
      content: (
        <>
          <Field label="Emergency Contact First Name"><input value={form.emergency_first_name} onChange={(e) => setField('emergency_first_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Emergency Contact Last Name"><input value={form.emergency_last_name} onChange={(e) => setField('emergency_last_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Relationship"><input value={form.emergency_relationship} onChange={(e) => setField('emergency_relationship', e.target.value)} style={inputStyle} /></Field>
          <Field label="Phone"><input value={form.emergency_phone} onChange={(e) => setField('emergency_phone', e.target.value)} style={inputStyle} /></Field>
          <Field label="Email"><input value={form.emergency_email} onChange={(e) => setField('emergency_email', e.target.value)} style={inputStyle} /></Field>
        </>
      ),
    },
    {
      title: 'Goals & Motivation',
      content: (
        <>
          <Field label="Primary Goals"><CheckboxGroup values={form.primary_goals} options={['Weight Loss', 'Improved Nutrition', 'Increased Physical Activity', 'Stress Management', 'Enhanced Well-being', 'Body Recompositioning', 'Other']} onToggle={(value) => toggleValue('primary_goals', value)} /></Field>
          <Field label="What is the #1 result you want in the next 90 days?"><textarea value={form.goal_90_days} onChange={(e) => setField('goal_90_days', e.target.value)} style={areaStyle} /></Field>
          <Field label="Why is this goal important to you?"><textarea value={form.goal_importance} onChange={(e) => setField('goal_importance', e.target.value)} style={areaStyle} /></Field>
          <Field label="What obstacles have made progress difficult before?"><textarea value={form.past_obstacles} onChange={(e) => setField('past_obstacles', e.target.value)} style={areaStyle} /></Field>
        </>
      ),
    },
    {
      title: 'Health History',
      content: (
        <>
          <Field label="Medical conditions or diagnoses" helper="Any diagnosed conditions your coach should know"><textarea value={form.medical_conditions} onChange={(e) => setField('medical_conditions', e.target.value)} style={areaStyle} /></Field>
          <Field label="Additional health notes"><textarea value={form.additional_health_notes} onChange={(e) => setField('additional_health_notes', e.target.value)} style={areaStyle} /></Field>
        </>
      ),
    },
    {
      title: 'Lifestyle Baseline',
      content: (
        <>
          <Field label="Typical daily activity level" helper="1 = mostly sedentary, 10 = highly active"><SliderField value={form.activity_level} onChange={(value) => setField('activity_level', value)} /></Field>
          <Field label="Fitness Level"><RadioGroup value={form.fitness_level} options={['Inactive – little to no exercise', 'Lightly active – occasional walks or light movement', 'Moderately active – exercise 2-3x/week', 'Very active – structured workouts 4+x/week', 'Extremely active – high-intensity training regularly']} onChange={(value) => setField('fitness_level', value)} /></Field>
          <Field label="Training History" helper="Describe your exercise background"><textarea value={form.training_history} onChange={(e) => setField('training_history', e.target.value)} style={areaStyle} /></Field>
          <Field label="Meals Per Day"><RadioGroup value={form.meals_per_day} options={['1-2 times per day', '3-4 times per day', '5+ times per day']} onChange={(value) => setField('meals_per_day', value)} /></Field>
          <Field label="What types of foods do you typically eat?"><textarea value={form.typical_foods} onChange={(e) => setField('typical_foods', e.target.value)} style={areaStyle} /></Field>
          <Field label="Taking Supplements"><RadioGroup value={form.taking_supplements} options={['Yes', 'No']} onChange={(value) => setField('taking_supplements', value)} /></Field>
          {form.taking_supplements === 'Yes' ? (
            <Field label="What supplements are you taking?"><textarea value={form.supplements_list} onChange={(e) => setField('supplements_list', e.target.value)} style={areaStyle} /></Field>
          ) : null}
        </>
      ),
    },
    {
      title: 'Sleep & Stress Baseline',
      content: (
        <>
          <Field label="Average sleep per night"><RadioGroup value={form.sleep_avg_hours} options={['<5 hours', '5-6 hours', '7-8 hours', '8+ hours']} onChange={(value) => setField('sleep_avg_hours', value)} /></Field>
          <Field label="Current stress level" helper="1 = very low, 10 = very high"><SliderField value={form.stress_level} onChange={(value) => setField('stress_level', value)} /></Field>
        </>
      ),
    },
    {
      title: 'Training Preferences',
      content: (
        <>
          <Field label="Where do you train?"><RadioGroup value={form.training_location} options={['Home', 'Gym', 'Both', 'Outdoor']} onChange={(value) => setField('training_location', value)} /></Field>
          <Field label="Preferred training days"><CheckboxGroup values={form.preferred_training_days} options={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} onToggle={(value) => toggleValue('preferred_training_days', value)} /></Field>
        </>
      ),
    },
    {
      title: 'Wellness Stage & Signature',
      content: (
        <>
          <Field label="Where are you in your wellness journey?"><RadioGroup value={form.wellness_stage} options={['Just Starting', 'Making Progress', 'Maintaining', 'Overcoming Challenges', 'Other']} onChange={(value) => setField('wellness_stage', value)} /></Field>
          <Field label="Why does this stage feel right for you?"><textarea value={form.wellness_stage_reason} onChange={(e) => setField('wellness_stage_reason', e.target.value)} style={areaStyle} /></Field>
          <div style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.24)', borderRadius: '12px', padding: '16px', color: 'var(--app-text-secondary)', fontSize: '14px', lineHeight: 1.7, marginBottom: '18px' }}>
            DFitfactor respects your privacy and is committed to protecting your personal information. We will keep the information you provide confidential and will not share it without your consent, except as required by law. This form and any information collected are for wellness purposes only.
          </div>
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: 'var(--app-text)', fontSize: '14px', marginBottom: '18px' }}>
            <input type="checkbox" checked={form.privacy_acknowledged} onChange={(e) => setField('privacy_acknowledged', e.target.checked)} />
            I have read and agree to the Privacy & Information Use policy
          </label>
          <Field label="Electronic Signature — type your full legal name" helper="By typing your name you agree this constitutes your legally binding electronic signature"><input value={form.signature} onChange={(e) => setField('signature', e.target.value)} style={inputStyle} /></Field>
          <Field label="Signature Date"><input value={form.signature_date} readOnly style={{ ...inputStyle, opacity: 0.7 }} /></Field>
        </>
      ),
    },
  ]

  async function handleSubmit() {
    if (!form.first_name || !form.last_name || !form.mobile_phone || !form.date_of_birth || !form.goal_90_days || !form.privacy_acknowledged || !form.signature.trim()) {
      setError('Please complete the required intake fields before submitting.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/portal/intake/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Submission failed')
        return
      }
      router.push('/portal/dashboard?intake=submitted')
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
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>Health Coach Client Intake</h1>
        <p style={{ color: 'var(--app-text-muted)', fontSize: '14px', marginBottom: '24px' }}>{loadingClient ? 'Loading your profile...' : currentStep.title}</p>

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
              {submitting ? 'Submitting...' : 'Submit Intake Form'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
