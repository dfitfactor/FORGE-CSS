'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--app-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '16px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--app-surface-muted)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '12px 16px',
  color: 'var(--app-text)',
  fontSize: '14px',
  boxSizing: 'border-box',
}

type YesNo = 'yes' | 'no' | ''

export default function ParqPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    heart_condition_limit_activity: '' as YesNo,
    chest_pain_during_activity: '' as YesNo,
    chest_pain_last_30_days: '' as YesNo,
    dizziness_or_loss_of_consciousness: '' as YesNo,
    bone_or_joint_problem: '' as YesNo,
    prior_surgeries: '' as YesNo,
    surgery_details: '',
    medications: '' as YesNo,
    medication_details: '',
    medical_conditions: '' as YesNo,
    medical_condition_details: '',
    additional_comments: '',
    signature: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function setField<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function renderYesNoField(
    label: string,
    field:
      | 'heart_condition_limit_activity'
      | 'chest_pain_during_activity'
      | 'chest_pain_last_30_days'
      | 'dizziness_or_loss_of_consciousness'
      | 'bone_or_joint_problem'
      | 'prior_surgeries'
      | 'medications'
      | 'medical_conditions'
  ) {
    return (
      <div style={{ marginBottom: '18px' }}>
        <div style={{ color: 'var(--app-text)', fontSize: '14px', marginBottom: '10px', lineHeight: 1.5 }}>{label}</div>
        <div style={{ display: 'flex', gap: '18px' }}>
          <label style={{ color: 'var(--app-text-secondary)', fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="radio" name={field} checked={form[field] === 'yes'} onChange={() => setField(field, 'yes')} />
            Yes
          </label>
          <label style={{ color: 'var(--app-text-secondary)', fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="radio" name={field} checked={form[field] === 'no'} onChange={() => setField(field, 'no')} />
            No
          </label>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const requiredAnswers = [
      form.heart_condition_limit_activity,
      form.chest_pain_during_activity,
      form.chest_pain_last_30_days,
      form.dizziness_or_loss_of_consciousness,
      form.bone_or_joint_problem,
      form.prior_surgeries,
      form.medications,
      form.medical_conditions,
    ]

    if (requiredAnswers.some((answer) => answer === '')) {
      setError('Please answer every health screening question.')
      return
    }

    if (!form.signature.trim()) {
      setError('Please type your full name as your signature.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/portal/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formSlug: 'parq',
          responses: {
            heart_condition_limit_activity: form.heart_condition_limit_activity,
            chest_pain_during_activity: form.chest_pain_during_activity,
            chest_pain_last_30_days: form.chest_pain_last_30_days,
            dizziness_or_loss_of_consciousness: form.dizziness_or_loss_of_consciousness,
            bone_or_joint_problem: form.bone_or_joint_problem,
            prior_surgeries: form.prior_surgeries,
            surgery_details: form.surgery_details,
            medications: form.medications,
            medication_details: form.medication_details,
            medical_conditions: form.medical_conditions,
            medical_condition_details: form.medical_condition_details,
            additional_comments: form.additional_comments,
            signature_date: form.date,
          },
          signatureName: form.signature,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Submission failed')
        return
      }

      router.push('/portal/forms?submitted=parq')
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <Link href="/portal/forms" style={{ color: 'var(--app-text-secondary)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
        Back to forms
      </Link>

      <div style={cardStyle}>
        <h1 style={{ color: 'var(--app-text)', fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
          Physical Activity Readiness Questionnaire
        </h1>
        <p style={{ color: 'var(--app-text-muted)', fontSize: '14px', marginBottom: 0 }}>
          Please answer this health screening as accurately as possible before beginning your program.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <section style={cardStyle}>
          {renderYesNoField('Has your doctor ever said you have a heart condition and advised you to limit physical activity?', 'heart_condition_limit_activity')}
          {renderYesNoField('Do you feel chest pain or tightness during physical activity?', 'chest_pain_during_activity')}
          {renderYesNoField('Within the last 30 days, have you had chest pain or tightness when not physically active?', 'chest_pain_last_30_days')}
          {renderYesNoField('Do you lose balance due to dizziness or lose consciousness?', 'dizziness_or_loss_of_consciousness')}
          {renderYesNoField('Do you have a bone or joint problem that could be made worse by a change in physical activity?', 'bone_or_joint_problem')}
          {renderYesNoField('Have you had any surgeries in the past?', 'prior_surgeries')}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: 'var(--app-text-secondary)', fontSize: '12px', marginBottom: '8px' }}>
              List surgeries or hospitalizations and dates
            </label>
            <textarea value={form.surgery_details} onChange={(e) => setField('surgery_details', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {renderYesNoField('Are you currently taking any medications?', 'medications')}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: 'var(--app-text-secondary)', fontSize: '12px', marginBottom: '8px' }}>
              List medications you are taking and dosage
            </label>
            <textarea value={form.medication_details} onChange={(e) => setField('medication_details', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {renderYesNoField('Do you have any other medical conditions that may affect your ability to exercise?', 'medical_conditions')}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: 'var(--app-text-secondary)', fontSize: '12px', marginBottom: '8px' }}>
              List medical conditions or injuries that affect your ability to exercise
            </label>
            <textarea value={form.medical_condition_details} onChange={(e) => setField('medical_condition_details', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--app-text-secondary)', fontSize: '12px', marginBottom: '8px' }}>
              Additional Comments
            </label>
            <textarea value={form.additional_comments} onChange={(e) => setField('additional_comments', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </section>

        <section style={cardStyle}>
          <p style={{ color: 'var(--app-text-secondary)', fontSize: '14px', lineHeight: 1.7, marginBottom: '16px' }}>
            This screening is for wellness planning only. It is not a substitute for medical advice or
            evaluation. If you answered yes to any questions above, please discuss them with your trainer
            and consult your physician before beginning this program.
          </p>

          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--app-text-secondary)', fontSize: '12px', marginBottom: '8px' }}>
                Typed Signature
              </label>
              <input
                type="text"
                value={form.signature}
                onChange={(e) => setField('signature', e.target.value)}
                placeholder="Type your full legal name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--app-text-secondary)', fontSize: '12px', marginBottom: '8px' }}>
                Date
              </label>
              <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} style={inputStyle} />
            </div>
          </div>
        </section>

        {error ? <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px' }}>{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            backgroundColor: 'var(--app-gold)',
            color: '#000000',
            border: 'none',
            borderRadius: '8px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 'bold',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Submitting...' : 'Submit PAR-Q'}
        </button>
      </form>
    </div>
  )
}
