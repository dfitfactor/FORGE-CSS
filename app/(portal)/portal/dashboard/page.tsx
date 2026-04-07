import Link from 'next/link'
import { getPortalClientOrRedirect } from '@/lib/client-portal'
import { db } from '@/lib/db'
import { getClientBankStatus } from '@/lib/session-bank'

export default async function PortalDashboard() {
  const { client } = await getPortalClientOrRedirect()

  const [enrollment, nextBooking] = await Promise.all([
    db.queryOne<{ id: string; package_name: string | null }>(
      `SELECT pe.id, p.name AS package_name
       FROM package_enrollments pe
       LEFT JOIN packages p ON p.id = pe.package_id
       WHERE pe.client_id = $1
         AND pe.status = 'active'
       ORDER BY pe.created_at DESC
       LIMIT 1`,
      [client.id]
    ),
    db.queryOne<{ item_name: string; booking_date: string; booking_time: string }>(
      `SELECT COALESCE(p.name, s.name, 'Session') AS item_name,
              b.booking_date::text AS booking_date,
              b.booking_time::text AS booking_time
       FROM bookings b
       LEFT JOIN packages p ON p.id = b.package_id
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.client_id = $1
         AND b.status = 'confirmed'
         AND b.scheduled_at >= NOW()
       ORDER BY b.scheduled_at ASC
       LIMIT 1`,
      [client.id]
    ),
  ])

  const bank = enrollment?.id ? await getClientBankStatus(enrollment.id).catch(() => null) : null
  const expirationSoon = bank?.graceExpires
    ? new Date(bank.graceExpires).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000
    : false

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: 'var(--app-text)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome back, {client.full_name.split(' ')[0]}</h1>
        <p style={{ color: 'var(--app-text-secondary)', fontSize: 14, marginBottom: 18 }}>Manage your session balance, request new bookings, and track confirmed appointments.</p>
        <Link href="/portal/book" style={{ display: 'inline-block', background: 'var(--app-gold)', color: '#111', padding: '10px 16px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
          Book a Session
        </Link>
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 20 }}>
        <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
          <div style={{ color: 'var(--app-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Sessions Remaining</div>
          <div style={{ color: 'var(--app-gold)', fontSize: 30, fontWeight: 700, marginTop: 10 }}>{bank?.remaining ?? 0}</div>
        </div>
        <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
          <div style={{ color: 'var(--app-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Package</div>
          <div style={{ color: 'var(--app-text)', fontSize: 18, fontWeight: 600, marginTop: 10 }}>{enrollment?.package_name ?? 'No active package'}</div>
        </div>
        <div style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
          <div style={{ color: 'var(--app-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Next Confirmed Session</div>
          <div style={{ color: 'var(--app-text)', fontSize: 16, fontWeight: 600, marginTop: 10 }}>
            {nextBooking ? `${nextBooking.item_name} · ${new Date(`${nextBooking.booking_date}T${nextBooking.booking_time.slice(0, 5)}:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No confirmed session'}
          </div>
        </div>
      </section>

      {bank?.graceExpires ? (
        <section style={{ background: expirationSoon && !bank.overrideExpiration ? 'rgba(245,158,11,0.12)' : 'var(--app-surface)', border: expirationSoon && !bank.overrideExpiration ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ color: expirationSoon && !bank.overrideExpiration ? '#fbbf24' : 'var(--app-text)', fontWeight: 700, marginBottom: 8 }}>Session Expiration</div>
          <div style={{ color: 'var(--app-text-secondary)', fontSize: 14 }}>
            Sessions expire on {new Date(bank.graceExpires).toLocaleDateString('en-US')}{bank.overrideExpiration ? ' and expiration override is active for this cycle.' : '.'}
          </div>
        </section>
      ) : null}

      <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/portal/bookings" style={{ color: 'var(--app-text-secondary)', fontSize: 14, textDecoration: 'none', padding: '8px 14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
            View My Bookings
          </Link>
          <Link href="/portal/package" style={{ color: 'var(--app-text-secondary)', fontSize: 14, textDecoration: 'none', padding: '8px 14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
            Package Details
          </Link>
        </div>
      </section>
    </div>
  )
}

