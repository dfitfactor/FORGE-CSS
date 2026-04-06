import Link from 'next/link'
import { db } from '@/lib/db'
import { getPortalClientOrRedirect, getPortalForms } from '@/lib/client-portal'

const FORM_ROUTES: Record<string, string> = {
  waiver: '/portal/forms/waiver',
  parq: '/portal/forms/parq',
  intake: '/portal/forms/intake',
  'weekly-checkin': '/portal/forms/weekly-checkin',
  'coaching-agreement': '/portal/forms/coaching-agreement',
}

type SubmissionSummary = {
  id: string
  slug: string
  name: string
  submitted_at: string | null
}

export default async function PortalFormsPage({
  searchParams,
}: {
  searchParams?: { submitted?: string }
}) {
  const { client } = await getPortalClientOrRedirect()
  const { outstandingForms, requiredForms } = await getPortalForms(client.id)
  const submittedSlug = searchParams?.submitted ?? ''

  const lastSunday = new Date()
  lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay())
  const lastSundayStr = lastSunday.toISOString().split('T')[0]

  const [latestCheckin, intakeSubmission, unsignedEnrollment, unsignedBooking, latestSubmissions] = await Promise.all([
    db.queryOne<{ checkin_date: string }>(
      `SELECT checkin_date::text AS checkin_date
       FROM client_checkins
       WHERE client_id = $1
       ORDER BY checkin_date DESC
       LIMIT 1`,
      [client.id]
    ).catch(() => null),
    db.queryOne<{ id: string }>(
      `SELECT fs.id
       FROM form_submissions fs
       JOIN form_templates ft ON ft.id = fs.form_template_id
       WHERE fs.client_id = $1
         AND ft.slug = 'intake'
         AND fs.status = 'submitted'
       ORDER BY fs.submitted_at DESC NULLS LAST, fs.created_at DESC NULLS LAST
       LIMIT 1`,
      [client.id]
    ).catch(() => null),
    db.queryOne<{ package_name: string }>(
      `SELECT p.name AS package_name
       FROM package_enrollments pe
       JOIN packages p ON p.id = pe.package_id
       WHERE pe.client_id = $1
         AND pe.status = 'active'
         AND (pe.agreement_signed = false OR pe.agreement_signed IS NULL)
       ORDER BY pe.created_at DESC
       LIMIT 1`,
      [client.id]
    ).catch(() => null),
    db.queryOne<{ item_name: string }>(
      `SELECT COALESCE(s.name, p2.name, 'Service') AS item_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN packages p2 ON b.package_id = p2.id
       WHERE b.client_id = $1
         AND b.status IN ('pending','confirmed')
         AND (b.agreement_signed = false OR b.agreement_signed IS NULL)
       ORDER BY b.created_at DESC
       LIMIT 1`,
      [client.id]
    ).catch(() => null),
    db.query<SubmissionSummary>(
      `SELECT DISTINCT ON (ft.slug)
          fs.id,
          ft.slug,
          ft.name,
          fs.submitted_at::text AS submitted_at
       FROM form_submissions fs
       JOIN form_templates ft ON ft.id = fs.form_template_id
       WHERE fs.client_id = $1
         AND fs.status = 'submitted'
       ORDER BY ft.slug, fs.submitted_at DESC NULLS LAST, fs.created_at DESC NULLS LAST`,
      [client.id]
    ).catch(() => []),
  ])

  const agreementRequired = !!unsignedEnrollment || !!unsignedBooking
  const latestSubmissionBySlug = new Map(latestSubmissions.map((submission) => [submission.slug, submission]))
  const agreementSubmission = latestSubmissionBySlug.get('coaching-agreement') || null
  const agreementName = unsignedEnrollment?.package_name || unsignedBooking?.item_name || agreementSubmission?.name || 'DFitFactor Program'

  const extraForms = [
    {
      id: 'weekly-checkin',
      slug: 'weekly-checkin',
      name: 'Weekly Guided Progress Check-In',
      description: 'Your weekly reflection, recovery, and adherence check-in.',
      required: latestCheckin?.checkin_date !== lastSundayStr,
    },
    {
      id: 'intake',
      slug: 'intake',
      name: 'Health Coach Client Intake',
      description: 'Your baseline intake form for goals, lifestyle, and preferences.',
      required: !intakeSubmission,
    },
  ]

  const allForms = [
    ...extraForms,
    ...requiredForms.map((form) => ({
      id: form.id,
      slug: form.slug,
      name: form.name,
      description: form.description ?? form.form_type,
      required: outstandingForms.some((item) => item.id === form.id),
    })),
  ].map((form) => ({
    ...form,
    submission: latestSubmissionBySlug.get(form.slug) || null,
  }))

  const completedArchive = latestSubmissions
    .filter((submission) => submission.slug !== 'coaching-agreement')
    .sort((left, right) => new Date(right.submitted_at || 0).getTime() - new Date(left.submitted_at || 0).getTime())

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>My Forms</h1>
        <p style={{ color: '#777', fontSize: 14, marginBottom: 0 }}>
          Complete the forms that support your onboarding, weekly progress review, and protocol accuracy.
        </p>
      </section>

      {(agreementRequired || agreementSubmission) ? (
        <section style={{ background: '#111111', border: agreementRequired ? '1px solid rgba(239,68,68,0.32)' : '1px solid rgba(110,231,183,0.25)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>DFitFactor® Coaching Agreement</div>
              <div style={{ color: '#777', fontSize: 13 }}>{agreementName}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: agreementRequired ? '#f87171' : '#6ee7b7', fontSize: 12, fontWeight: 700 }}>
                {agreementRequired ? 'Action Required' : 'Completed ✓'}
              </span>
              <Link
                href={agreementRequired || !agreementSubmission ? '/portal/forms/coaching-agreement' : `/portal/forms/completed/${agreementSubmission.id}`}
                style={{
                  background: agreementRequired ? '#D4AF37' : 'transparent',
                  color: agreementRequired ? '#000' : '#6ee7b7',
                  border: agreementRequired ? 'none' : '1px solid rgba(110,231,183,0.35)',
                  borderRadius: 8,
                  padding: '8px 14px',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {agreementRequired ? 'Review & Sign →' : 'View PDF'}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {allForms.some((form) => form.required) ? (
        <section style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ color: '#D4AF37', fontWeight: 700, marginBottom: 8 }}>{allForms.filter((form) => form.required).length} form(s) still required</div>
          <div style={{ color: '#ddd', fontSize: 14 }}>
            Please complete these forms before your appointment so your coach can keep your plan safe and on track.
          </div>
        </section>
      ) : null}

      {submittedSlug ? (
        <section style={{ background: 'rgba(110,231,183,0.1)', border: '1px solid rgba(110,231,183,0.25)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ color: '#6ee7b7', fontWeight: 700, marginBottom: 6 }}>Form submitted successfully</div>
          <div style={{ color: '#d8d8d8', fontSize: 14 }}>
            Your {submittedSlug.toUpperCase()} form has been saved to your client record.
          </div>
        </section>
      ) : null}

      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        {allForms.map((form, index) => {
          const defaultRoute = FORM_ROUTES[form.slug]
          const targetRoute = form.required || !form.submission
            ? defaultRoute
            : `/portal/forms/completed/${form.submission.id}`
          return (
            <div key={form.id} style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{form.name}</div>
                  <div style={{ color: '#777', fontSize: 13, marginTop: 4 }}>{form.description}</div>
                  {form.submission?.submitted_at && !form.required ? (
                    <div style={{ color: '#6ee7b7', fontSize: 12, marginTop: 8 }}>
                      Submitted {new Date(form.submission.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: form.required ? '#D4AF37' : '#6ee7b7', fontSize: 12, fontWeight: 700 }}>
                    {form.required ? 'Outstanding' : 'Completed'}
                  </span>
                  {targetRoute ? (
                    <Link
                      href={targetRoute}
                      style={{
                        background: form.required ? '#D4AF37' : 'transparent',
                        color: form.required ? '#000' : '#D4AF37',
                        border: form.required ? 'none' : '1px solid rgba(212,175,55,0.35)',
                        borderRadius: 8,
                        padding: '8px 14px',
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {form.required ? 'Complete Now' : 'View PDF'}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {completedArchive.length > 0 ? (
        <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
          <div style={{ color: '#D4AF37', fontWeight: 700, fontSize: 12, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 16 }}>
            Completed Form Archive
          </div>
          {completedArchive.map((submission, index) => (
            <div key={submission.id} style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)', padding: '14px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{submission.name}</div>
                  <div style={{ color: '#777', fontSize: 13, marginTop: 4 }}>
                    Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'recently'}
                  </div>
                </div>
                <Link href={`/portal/forms/completed/${submission.id}`} style={{ color: '#D4AF37', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                  Open PDF View →
                </Link>
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
