import Link from 'next/link'
import { db } from '@/lib/db'
import { getPortalBookings, getPortalClientOrRedirect, getPortalForms, getPortalProtocol } from '@/lib/client-portal'

type ActivityItem = {
  title: string
  body: string
  timestamp: string
  href?: string
}

export default async function PortalNotificationsPage() {
  const { client } = await getPortalClientOrRedirect()
  const [bookings, protocol, forms, auditRows] = await Promise.all([
    getPortalBookings(client),
    getPortalProtocol(client.id),
    getPortalForms(client.id),
    db.query<{ action: string; created_at: string }>(
      `SELECT action, created_at::text AS created_at
       FROM audit_log
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 12`,
      [client.id]
    ).catch(() => []),
  ])

  const items: ActivityItem[] = []

  if (protocol) {
    items.push({
      title: 'Active protocol available',
      body: `${protocol.name ?? 'Your latest protocol'} is ready to review in your portal.`,
      timestamp: protocol.created_at,
      href: `/portal/protocol/${protocol.id}`,
    })
  }

  for (const booking of bookings.slice(0, 6)) {
    items.push({
      title: `Booking ${booking.status.replace('_', ' ')}`,
      body: `${booking.item_name} on ${new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${booking.booking_time.slice(0, 5)}.`,
      timestamp: `${booking.booking_date}T${booking.booking_time}`,
      href: '/portal/bookings',
    })
  }

  for (const form of forms.outstandingForms) {
    items.push({
      title: 'Required form pending',
      body: `${form.name} is still outstanding and should be completed before your next appointment.`,
      timestamp: new Date().toISOString(),
      href: '/portal/forms',
    })
  }

  for (const row of auditRows) {
    items.push({
      title: 'Account activity',
      body: row.action,
      timestamp: row.created_at,
    })
  }

  items.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: 'var(--app-text)', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Notifications</h1>
        <p style={{ color: 'var(--app-text-muted)', fontSize: 14, marginBottom: 0 }}>
          A timeline of your own booking, protocol, and form activity inside FORGE.
        </p>
      </section>

      <section style={{ background: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
        {items.length === 0 ? (
          <p style={{ color: 'var(--app-text-secondary)', fontSize: 14 }}>No notifications yet.</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item.title}-${index}`} style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)', padding: index === 0 ? '0 0 16px' : '16px 0 16px' }}>
              <div style={{ color: 'var(--app-text)', fontWeight: 600, fontSize: 15 }}>{item.title}</div>
              <div style={{ color: 'var(--app-text-secondary)', fontSize: 14, marginTop: 6 }}>{item.body}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <span style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{new Date(item.timestamp).toLocaleString('en-US')}</span>
                {item.href ? <Link href={item.href} style={{ color: 'var(--app-gold)', fontSize: 12, textDecoration: 'none' }}>Open &rarr;</Link> : null}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

