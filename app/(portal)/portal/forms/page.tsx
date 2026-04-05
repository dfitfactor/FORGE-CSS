import Link from 'next/link'
import { db } from '@/lib/db'
import { getPortalClientOrRedirect, getPortalForms } from '@/lib/client-portal'

const FORM_ROUTES: Record<string, string> = {
  waiver: '/portal/forms/waiver',
  parq: '/portal/forms/parq',
  intake: '/portal/forms/intake',
  'weekly-checkin': '/portal/forms/weekly-checkin',
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

  const [latestCheckin, intakeSubmission] = await Promise.all([
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
  ])

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
  ]

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>My Forms</h1>
        <p style={{ color: '#777', fontSize: 14, marginBottom: 0 }}>
          Complete the forms that support your onboarding, weekly progress review, and protocol accuracy.
        </p>
      </section>

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

      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
        {allForms.map((form, index) => {
          const formRoute = FORM_ROUTES[form.slug]
          return (
            <div key={form.id} style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{form.name}</div>
                  <div style={{ color: '#777', fontSize: 13, marginTop: 4 }}>{form.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: form.required ? '#D4AF37' : '#6ee7b7', fontSize: 12, fontWeight: 700 }}>
                    {form.required ? 'Outstanding' : 'Completed'}
                  </span>
                  {formRoute ? (
                    <Link
                      href={formRoute}
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
                      {form.required ? 'Complete Now' : 'View Form'}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
