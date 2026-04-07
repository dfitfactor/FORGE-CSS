import Link from 'next/link'
import { getClientBankStatus } from '@/lib/session-bank'
import { formatMoney, getPortalClientOrRedirect, getPortalEnrollment } from '@/lib/client-portal'

function statCard(label: string, value: string, accent?: string) {
  return (
    <div style={{ borderRadius: 12, background: 'var(--app-surface-muted)', border: '1px solid rgba(255,255,255,0.08)', padding: 16 }}>
      <div style={{ color: 'var(--app-text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ color: accent || 'var(--app-text)', fontWeight: 700, fontSize: 22 }}>{value}</div>
    </div>
  )
}

export default async function PortalPackagePage() {
  const { client } = await getPortalClientOrRedirect()
  const enrollment = await getPortalEnrollment(client.id)
  const bank = enrollment ? await getClientBankStatus(enrollment.id).catch(() => null) : null

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: 'var(--app-text)', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>My Package & Billing</h1>
        <p style={{ color: 'var(--app-text-muted)', fontSize: 14, marginBottom: 0 }}>
          Review your active package, session balance, hold status, and payment summary.
        </p>
      </section>

      {!enrollment ? (
        <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
          <p style={{ color: 'var(--app-text-secondary)', fontSize: 14, marginBottom: 16 }}>No active package enrollment is attached to your portal yet.</p>
          <Link href="/book" style={{ color: 'var(--app-gold)', textDecoration: 'none', fontWeight: 600 }}>Browse booking options &rarr;</Link>
        </section>
      ) : (
        <>
          <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--app-gold)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Active Package</div>
                <h2 style={{ color: 'var(--app-text)', fontSize: 22, margin: 0 }}>{enrollment.package_name ?? 'Package'}</h2>
                <p style={{ color: 'var(--app-text-secondary)', fontSize: 14, marginTop: 10, maxWidth: 520 }}>{enrollment.package_description ?? 'Your current coaching package and session bank.'}</p>
              </div>
              <div style={{ borderRadius: 999, border: '1px solid rgba(212,175,55,0.35)', background: 'var(--app-gold-soft)', color: 'var(--app-gold)', padding: '6px 12px', height: 'fit-content', textTransform: 'capitalize', fontSize: 12, fontWeight: 700 }}>
                {enrollment.status}
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            {statCard('Sessions Total', String(enrollment.sessions_total ?? 0))}
            {statCard('Used', String(enrollment.sessions_used ?? 0), '#60a5fa')}
            {statCard('Remaining', String(enrollment.sessions_remaining ?? 0), 'var(--app-gold)')}
            {statCard('Forfeited', String(enrollment.sessions_forfeited ?? 0), '#f87171')}
          </section>

          <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <div style={{ color: 'var(--app-gold)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Billing Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {statCard('Payment Status', enrollment.payment_status ?? 'unpaid')}
              {statCard('Amount', formatMoney(enrollment.amount_cents))}
              {statCard('Billing Type', enrollment.billing_type ?? '—')}
              {statCard('Sessions / Week', String(enrollment.sessions_per_week ?? 0))}
            </div>
            <div style={{ color: 'var(--app-text-muted)', fontSize: 13, marginTop: 16 }}>
              Start: {enrollment.start_date ? new Date(`${enrollment.start_date}T12:00:00`).toLocaleDateString('en-US') : '—'}  -  End: {enrollment.end_date ? new Date(`${enrollment.end_date}T12:00:00`).toLocaleDateString('en-US') : '—'}
            </div>
          </section>

          {bank ? (
            <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ color: 'var(--app-gold)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Session Bank</div>
              <div style={{ color: 'var(--app-text)', fontSize: 14, marginBottom: 10 }}>{bank.used} of {bank.allotted} sessions used this billing period</div>
              <div style={{ height: 10, borderRadius: 999, background: 'var(--app-border)', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ width: `${bank.allotted > 0 ? Math.min((bank.used / bank.allotted) * 100, 100) : 0}%`, height: '100%', background: 'var(--app-gold)' }} />
              </div>
              <div style={{ color: bank.canBook ? '#6ee7b7' : '#fca5a5', fontSize: 13 }}>
                {bank.canBook ? 'Available to book' : bank.cannotBookReason ?? 'Unable to book right now'}
              </div>
              {bank.graceExpires && bank.remaining > 0 ? (
                <div style={{ color: '#f6dfa1', fontSize: 13, marginTop: 8 }}>
                  {bank.remaining} unused session(s) expire on {new Date(bank.graceExpires).toLocaleDateString('en-US')}
                </div>
              ) : null}
            </section>
          ) : null}

          {enrollment.is_on_hold ? (
            <section style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 16, padding: 24 }}>
              <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 8 }}>Membership Hold Active</div>
              <div style={{ color: 'var(--app-text-secondary)', fontSize: 14 }}>
                Your package is paused until {enrollment.hold_end ? new Date(`${enrollment.hold_end}T12:00:00`).toLocaleDateString('en-US') : 'further notice'}.
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

