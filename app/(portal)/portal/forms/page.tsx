import Link from 'next/link'
import { getPortalClientOrRedirect, getPortalForms } from '@/lib/client-portal'

const FORM_ROUTES: Record<string, string> = {
  waiver: '/portal/forms/waiver',
  parq: '/portal/forms/parq',
}

export default async function PortalFormsPage({
  searchParams,
}: {
  searchParams?: { submitted?: string }
}) {
  const { client } = await getPortalClientOrRedirect()
  const { outstandingForms, requiredForms } = await getPortalForms(client.id)
  const submittedSlug = searchParams?.submitted ?? ''

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>My Forms</h1>
        <p style={{ color: '#777', fontSize: 14, marginBottom: 0 }}>
          Review your required onboarding and compliance forms for upcoming sessions.
        </p>
      </section>

      {outstandingForms.length > 0 ? (
        <section style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ color: '#D4AF37', fontWeight: 700, marginBottom: 8 }}>{outstandingForms.length} form(s) still required</div>
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
        {requiredForms.map((form) => {
          const isOutstanding = outstandingForms.some((item) => item.id === form.id)
          const formRoute = FORM_ROUTES[form.slug]
          return (
            <div key={form.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{form.name}</div>
                  <div style={{ color: '#777', fontSize: 13, marginTop: 4 }}>{form.description ?? form.form_type}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: isOutstanding ? '#D4AF37' : '#6ee7b7', fontSize: 12, fontWeight: 700 }}>
                    {isOutstanding ? 'Outstanding' : 'Completed'}
                  </span>
                  {formRoute ? (
                    <Link
                      href={formRoute}
                      style={{
                        background: isOutstanding ? '#D4AF37' : 'transparent',
                        color: isOutstanding ? '#000' : '#D4AF37',
                        border: isOutstanding ? 'none' : '1px solid rgba(212,175,55,0.35)',
                        borderRadius: 8,
                        padding: '8px 14px',
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isOutstanding ? 'Complete Now' : 'View Form'}
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
