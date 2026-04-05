'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const cardStyle: React.CSSProperties = {
  backgroundColor: '#111111',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '16px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '12px 16px',
  color: '#ffffff',
  fontSize: '14px',
  boxSizing: 'border-box',
}

export default function WaiverPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    health_disclosure: false,
    assumption_of_responsibility: false,
    release_of_liability: false,
    media_consent: '',
    signature: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (
      !form.health_disclosure ||
      !form.assumption_of_responsibility ||
      !form.release_of_liability
    ) {
      setError('Please acknowledge each required waiver section.')
      return
    }

    if (!form.media_consent) {
      setError('Please select a media consent preference.')
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
          formSlug: 'waiver',
          responses: {
            health_disclosure: form.health_disclosure,
            assumption_of_responsibility: form.assumption_of_responsibility,
            release_of_liability: form.release_of_liability,
            media_consent: form.media_consent,
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

      router.push('/portal/forms?submitted=waiver')
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <Link href="/portal/forms" style={{ color: '#888', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
        Back to forms
      </Link>

      <div style={cardStyle}>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
          Waiver and Release of Liability
        </h1>
        <p style={{ color: '#777', fontSize: '14px', marginBottom: 0 }}>
          Please review and sign this waiver before participating in DFitfactor health coaching services.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <section style={cardStyle}>
          <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Acknowledgment of Risks
          </div>
          <p style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.7, marginBottom: 0 }}>
            I acknowledge that I am voluntarily participating in health coaching services provided by
            DFitfactor LLC. I understand that participation in fitness and wellness activities involves
            inherent risks, including but not limited to physical injury, health complications, and other
            unforeseen risks.
          </p>
        </section>

        <section style={cardStyle}>
          <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Health Disclosure
          </div>
          <p style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.7, marginBottom: '14px' }}>
            I affirm that I have disclosed all relevant health conditions to my health coach and understand
            that DFitfactor LLC is not a medical provider and does not offer medical advice. I acknowledge
            that it is my responsibility to consult with a healthcare professional before participating in
            any fitness or wellness activities.
          </p>
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: '#fff', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={form.health_disclosure}
              onChange={(e) => setForm((current) => ({ ...current, health_disclosure: e.target.checked }))}
            />
            I understand and agree to this health disclosure statement.
          </label>
        </section>

        <section style={cardStyle}>
          <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Assumption of Responsibility
          </div>
          <p style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.7, marginBottom: '14px' }}>
            By signing this waiver, I accept full responsibility for my health and well-being during my
            participation in the services and programs offered by DFitfactor LLC. I agree to follow all
            instructions provided by my health coach and to inform them of any discomfort or health issues
            that may arise during my participation.
          </p>
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: '#fff', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={form.assumption_of_responsibility}
              onChange={(e) =>
                setForm((current) => ({ ...current, assumption_of_responsibility: e.target.checked }))
              }
            />
            I accept responsibility for my participation and will communicate any concerns promptly.
          </label>
        </section>

        <section style={cardStyle}>
          <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Media Consent
          </div>
          <p style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.7, marginBottom: '14px' }}>
            DFitfactor LLC may take photographs, video, or audio recordings during sessions, events, or
            services for promotional, marketing, educational, or other lawful business purposes.
          </p>
          <div style={{ display: 'grid', gap: '10px' }}>
            <label style={{ display: 'flex', gap: '10px', color: '#fff', fontSize: '14px' }}>
              <input
                type="radio"
                name="media_consent"
                checked={form.media_consent === 'consent'}
                onChange={() => setForm((current) => ({ ...current, media_consent: 'consent' }))}
              />
              I consent to the use of my image, audio, or video.
            </label>
            <label style={{ display: 'flex', gap: '10px', color: '#fff', fontSize: '14px' }}>
              <input
                type="radio"
                name="media_consent"
                checked={form.media_consent === 'do_not_consent'}
                onChange={() => setForm((current) => ({ ...current, media_consent: 'do_not_consent' }))}
              />
              I do not consent and understand I should notify the business in advance.
            </label>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Release of Liability
          </div>
          <p style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.7, marginBottom: '14px' }}>
            I hereby release, waive, and discharge DFitfactor LLC, its staff, and affiliates from any and
            all claims, demands, or causes of action that may arise from my involvement in its services or
            programs, including but not limited to claims for personal injury, property damage, or wrongful
            death.
          </p>
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: '#fff', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={form.release_of_liability}
              onChange={(e) => setForm((current) => ({ ...current, release_of_liability: e.target.checked }))}
            />
            I acknowledge and accept the release of liability above.
          </label>
        </section>

        <section style={cardStyle}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>
                Typed Signature
              </label>
              <input
                type="text"
                value={form.signature}
                onChange={(e) => setForm((current) => ({ ...current, signature: e.target.value }))}
                placeholder="Type your full legal name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        {error ? <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px' }}>{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            backgroundColor: '#D4AF37',
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
          {submitting ? 'Submitting...' : 'Submit Waiver'}
        </button>
      </form>
    </div>
  )
}
