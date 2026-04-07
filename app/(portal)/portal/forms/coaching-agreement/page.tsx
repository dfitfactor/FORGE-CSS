'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type AgreementData = {
  type: 'enrollment' | 'booking'
  enrollmentId: string | null
  bookingId: string | null
  clientName: string
  clientEmail: string
  clientPhone: string
  programName: string
  packageName: string
  sessionDuration: number | null
  sessionsTotal: number | null
  sessionsPerWeek: number | null
  billingAmount: string
  billingType: string
  billingDisplay: string
  commitmentPeriod: string
  startDate: string
}

const termsHtml = `
  <strong>Terms of Use</strong><br />
  This Coaching Agreement (&quot;Agreement&quot;) is entered into between DFitFactor®, LLC (&quot;Coach&quot;) and the undersigned client (&quot;Client&quot;). This Agreement establishes a health and performance coaching relationship. Coaching is the primary service provided. Personalized training sessions may be included as one component of a broader coaching program designed to support strength, recovery, consistency, and long-term well-being.<br /><br />

  <strong>Definitions.</strong><br />
  Health and Performance Coaching is an education-based, collaborative relationship focused on behavior change, lifestyle structure, physical capacity, recovery, and long-term sustainability. Coaching does not include medical diagnosis, treatment, or prescription. Personal Training refers to individualized exercise instruction delivered as one component of a broader coaching program. Program or Services refers to the Client's selected coaching tier and included support elements. A Session refers to a scheduled coaching or training interaction delivered in-person or virtually.<br /><br />

  <strong>Nature of the Relationship.</strong><br />
  This Agreement establishes a coaching relationship, not a medical, therapeutic, or emergency care relationship. DFitFactor does not provide emergency, crisis, or urgent care services. Coaching outcomes depend on client participation, consistency, lifestyle behaviors, recovery, and adherence. No specific results are guaranteed.<br /><br />

  <strong>Scope of Services and Medical Disclaimer.</strong><br />
  DFitFactor provides coaching, education, and lifestyle guidance related to movement, nutrition principles, recovery practices, stress management, and performance habits. Services do not replace care from licensed healthcare professionals. Education related to labs, supplementation strategies, metabolic concepts, or advanced tools is provided for informational purposes only. DFitFactor does not diagnose, treat, or prescribe medical conditions. Clients agree to seek appropriate medical care when symptoms, lab values, or conditions fall outside coaching scope.<br /><br />

  <strong>Program Structure and Training Modality.</strong><br />
  Coaching programs may be delivered through private (one-on-one) or semi-private (small group) formats. Training modality does not alter the nature of the coaching relationship, billing terms, cancellation requirements, or obligations under this Agreement. Changes in training format do not constitute a new agreement and do not reset commitment periods unless stated in writing.<br /><br />

  <strong>Semi-Private Training Environment.</strong><br />
  Semi-private sessions involve multiple clients training simultaneously. While programming remains individualized, coaching attention, equipment access, and session flow are shared. Results are not contingent on uninterrupted one-on-one instruction.<br /><br />

  <strong>Session Length, Attendance, and Rescheduling.</strong><br />
  Session duration is determined by the service selected at enrollment and is specified in the Service Details section above. Session effectiveness is determined by program structure and consistency, not session length alone. Sessions may be extended solely to accommodate an approved make-up at the coach's discretion. One emergency reschedule per billing cycle is permitted with at least 24 hours' notice. Missed sessions without proper notice may be forfeited and do not roll over beyond the active billing period, except for a limited grace period of seven (7) days following the billing anniversary if approved. Sessions are non-transferable and may not be shared with or reassigned to another individual.<br /><br />

  <strong>Communication Guidelines.</strong><br />
  Communication access is determined by program tier. Higher tiers may include phone or text communication during business hours, while foundational tiers communicate primarily via email. Response times range from 24 to 48 business hours. DFitFactor does not communicate with third-party healthcare providers on behalf of clients.<br /><br />

  <strong>Billing, Term, and Automatic Renewal.</strong><br />
  Billing occurs monthly on the same date as the original enrollment date (&quot;billing anniversary&quot;). The first billing period begins on the date of enrollment. Session allotments refresh on each billing anniversary. Unused sessions from the prior period may be used within seven (7) days following the billing anniversary before they expire. The commitment period is specified in the Service Details section above and varies by program selected. Upon completion of any initial commitment period, monthly services automatically continue on a month-to-month basis unless written notice of cancellation is received at least thirty (30) days prior to the next billing anniversary. Pay-in-full programs are billed at time of purchase and are non-refundable.<br /><br />

  <strong>Payment Methods and Processing Fees.</strong><br />
  Accepted payment methods include debit cards, credit cards, and eligible HSA/FSA cards. Credit card payments are subject to a processing fee of up to 3.5 percent to cover third-party platform and payment processor costs. Processing fees are non-refundable.<br /><br />

  <strong>Cancellations, Holds, and Travel.</strong><br />
  Written cancellation notice is required at least thirty (30) days prior to the next billing anniversary and must be submitted via email to coach@dfitfactor.com or through the client portal. One thirty-day hold is permitted per six-month period. Medical holds may be granted with documentation. No refunds are issued for unused sessions, early termination of the agreement, or failure to complete the full commitment period.<br /><br />

  <strong>Coach Assignment and Continuity.</strong><br />
  DFitFactor reserves the right to assign or substitute qualified coaches or staff to maintain continuity of service.<br /><br />

  <strong>Intellectual Property.</strong><br />
  All programming, materials, frameworks, and content provided are proprietary and for personal use only. Protocols and programming generated through the DFitFactor client portal are proprietary and for the enrolled client's personal use only. Reproduction, distribution, or commercial use without written consent is prohibited.<br /><br />

  <strong>Client Portal Access.</strong><br />
  Clients enrolled in eligible programs receive access to the DFitFactor client portal. Portal access is personal, non-transferable, and subject to enrollment status. Protocol recommendations and AI-assisted programming delivered through the portal are educational in nature and do not constitute medical advice, diagnosis, or treatment.<br /><br />

  <strong>Health Data Privacy.</strong><br />
  Health and wellness information submitted through intake forms, weekly check-ins, assessments, and portal tools is used solely to personalize coaching services. This information is kept confidential and is not shared with third parties without written consent, except as required by law.<br /><br />

  <strong>Service Interruptions.</strong><br />
  DFitFactor is not liable for service interruptions caused by events beyond reasonable control, including weather, facility closures, illness, or government orders. Services may be rescheduled or modified without refund obligation.<br /><br />

  <strong>Termination for Cause.</strong><br />
  DFitFactor reserves the right to terminate services for non-payment, repeated no-shows, abusive behavior, disruptive or unsafe conduct, or violations of this Agreement. Unused sessions may be forfeited.<br /><br />

  <strong>Governing Law.</strong><br />
  This Agreement is governed by and construed in accordance with the laws of the State of Georgia.<br /><br />

  <strong>Entire Agreement.</strong><br />
  This document constitutes the entire agreement between the parties and supersedes all prior discussions, representations, or understandings.
`

export default function CoachingAgreementPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [agreementData, setAgreementData] = useState<AgreementData | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [signatureName, setSignatureName] = useState('')
  const [printName, setPrintName] = useState('')

  const signatureDate = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    []
  )

  useEffect(() => {
    let active = true
    async function loadAgreement() {
      try {
        const res = await fetch('/api/portal/agreement', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !active) {
          setError(data.error || 'Failed to load agreement')
          return
        }
        setAgreementData(data.agreementData ?? null)
      } catch {
        if (active) setError('Network error — please try again')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadAgreement()
    return () => {
      active = false
    }
  }, [])

  async function handleSubmit() {
    if (!agreementData) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/portal/agreement/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureName,
          printName,
          agreed,
          enrollmentId: agreementData.enrollmentId,
          bookingId: agreementData.bookingId,
          agreementData,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Agreement submission failed')
        return
      }
      setSuccess('Agreement signed successfully')
      setTimeout(() => {
        router.push('/portal/dashboard?agreement=signed')
        router.refresh()
      }, 2000)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ maxWidth: '760px', margin: '0 auto', color: 'var(--app-text-secondary)', padding: '32px 0' }}>Loading agreement...</div>
  }

  if (!agreementData) {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', color: 'var(--app-text)' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>No active enrollment found</h1>
          <p style={{ color: 'var(--app-text-muted)', fontSize: '14px', marginBottom: '20px' }}>Visit our booking page to get started.</p>
          <Link href="/book" style={{ display: 'inline-block', background: 'var(--app-gold)', color: '#000', textDecoration: 'none', borderRadius: '10px', padding: '12px 16px', fontWeight: 700 }}>
            Visit Booking Page &rarr;
          </Link>
        </div>
      </div>
    )
  }

  const canSubmit = agreed && signatureName.trim().length > 2 && printName.trim().length > 2

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', color: 'var(--app-text)' }}>
      <Link href="/portal/forms" style={{ color: 'var(--app-text-secondary)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
        Back to forms
      </Link>

      {success ? (
        <div style={{ background: 'rgba(110,231,183,0.1)', border: '1px solid rgba(110,231,183,0.3)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', color: '#6ee7b7', fontWeight: 700 }}>
          {success}
        </div>
      ) : null}

      {error ? (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', color: '#f87171' }}>
          {error}
        </div>
      ) : null}

      <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(212,175,55,0.35)', borderLeft: '4px solid #D4AF37', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
        <div style={{ color: 'var(--app-gold)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
          DFitFactor® Coaching Agreement
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px 20px' }}>
          {[
            ['Client', agreementData.clientName],
            ['Email', agreementData.clientEmail],
            ['Phone', agreementData.clientPhone],
            ['Program', agreementData.programName],
            ['Package', agreementData.packageName],
            ['Session Duration', `${agreementData.sessionDuration ?? 60} minutes`],
            ...(agreementData.sessionsPerWeek ? [['Sessions Per Week', `${agreementData.sessionsPerWeek}x per week`]] : []),
            ['Sessions', `${agreementData.sessionsTotal ?? 1} total`],
            ['Investment', `$${agreementData.billingAmount}`],
            ['Billing', agreementData.billingDisplay],
            ['Commitment', agreementData.commitmentPeriod],
            ['Start Date', agreementData.startDate],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div style={{ color: 'var(--app-gold)', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>{label}</div>
              <div style={{ color: 'var(--app-text)', fontSize: '14px' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
        <div style={{ color: 'var(--app-gold)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>
          Terms of Use
        </div>
        <div style={{ maxHeight: '420px', overflowY: 'auto', color: 'var(--app-text-secondary)', fontSize: '14px', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: termsHtml }} />
      </div>

      <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
        <p style={{ color: 'var(--app-text-secondary)', fontSize: '14px', lineHeight: 1.7, marginBottom: '16px' }}>
          By signing below, I acknowledge that I have read, understood, and agree to all terms of this DFitFactor® Coaching Agreement. I understand that my participation establishes a health and performance coaching relationship, which may include individualized training sessions as part of a broader coaching program. I agree to participate honestly and take responsibility for my engagement, communication, and adherence to program guidelines.
        </p>

        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: 'var(--app-text)', fontSize: '14px', marginBottom: '18px' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          YES — I confirm I have read and agree to all terms of this DFitFactor® Coaching Agreement
        </label>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--app-gold)', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Electronic Signature</label>
          <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Type your full legal name" style={{ width: '100%', background: 'var(--app-surface-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px', color: 'var(--app-text)', fontSize: '18px', fontStyle: 'italic', boxSizing: 'border-box' }} />
          <p style={{ color: 'var(--app-text-muted)', fontSize: '12px', marginTop: '8px' }}>By typing your name you agree this constitutes your legally binding electronic signature</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--app-gold)', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Print Name</label>
          <input value={printName} onChange={(e) => setPrintName(e.target.value)} placeholder="Your full legal name" style={{ width: '100%', background: 'var(--app-surface-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px', color: 'var(--app-text)', fontSize: '14px', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: 'var(--app-gold)', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Date</label>
          <div style={{ width: '100%', background: 'var(--app-surface-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px', color: 'var(--app-text)', fontSize: '14px', boxSizing: 'border-box' }}>
            {signatureDate}
          </div>
        </div>

        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting} style={{ width: '100%', background: 'var(--app-gold)', color: '#000', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer', opacity: !canSubmit || submitting ? 0.6 : 1 }}>
          {submitting ? 'Submitting...' : 'Sign Coaching Agreement'}
        </button>
      </div>
    </div>
  )
}
