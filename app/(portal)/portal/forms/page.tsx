import { getPortalClientOrRedirect, getPortalForms } from '@/lib/client-portal'

export default async function PortalFormsPage() {
  const { client } = await getPortalClientOrRedirect()
  const { outstandingForms, requiredForms } = await getPortalForms(client.id)

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
            Your coach can send or unlock the final form links. Contact support if you need help before your appointment.
          </div>
        </section>
      ) : null}

      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
        {requiredForms.map((form) => {
          const isOutstanding = outstandingForms.some((item) => item.id === form.id)
          return (
            <div key={form.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{form.name}</div>
                  <div style={{ color: '#777', fontSize: 13, marginTop: 4 }}>{form.description ?? form.form_type}</div>
                </div>
                <span style={{ color: isOutstanding ? '#D4AF37' : '#6ee7b7', fontSize: 12, fontWeight: 700 }}>
                  {isOutstanding ? 'Outstanding' : 'Completed / Not Required'}
                </span>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
