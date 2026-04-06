import Link from 'next/link'
import { db } from '@/lib/db'
import { getClientBankStatus } from '@/lib/session-bank'
import {
  formatMoney,
  getPortalBookings,
  getPortalClientOrRedirect,
  getPortalEnrollment,
  getPortalForms,
  getPortalProtocol,
} from '@/lib/client-portal'

export default async function PortalDashboard() {
  const { client } = await getPortalClientOrRedirect()
  const [protocol, allBookings, forms, enrollment, latestCheckin, unsignedEnrollment] = await Promise.all([
    getPortalProtocol(client.id),
    getPortalBookings(client),
    getPortalForms(client.id),
    getPortalEnrollment(client.id),
    db.queryOne<{ checkin_date: string }>(
      `SELECT checkin_date::text AS checkin_date
       FROM client_checkins
       WHERE client_id = $1
       ORDER BY checkin_date DESC
       LIMIT 1`,
      [client.id]
    ).catch(() => null),
    db.queryOne<{ id: string }>(
      `SELECT pe.id FROM package_enrollments pe
       WHERE pe.client_id = $1
       AND pe.status = 'active'
       AND (pe.agreement_signed = false
            OR pe.agreement_signed IS NULL)
       LIMIT 1`,
      [client.id]
    ).catch(() => null),
  ])

  const unsignedBooking = !unsignedEnrollment
    ? await db.queryOne<{ id: string }>(
        `SELECT id FROM bookings
         WHERE client_id = $1
         AND status IN ('pending','confirmed')
         AND (agreement_signed = false
              OR agreement_signed IS NULL)
         ORDER BY created_at DESC LIMIT 1`,
        [client.id]
      ).catch(() => null)
    : null

  const hasUnsignedAgreement = !!unsignedEnrollment || !!unsignedBooking
  const outstandingForms = forms.outstandingForms
  const today = new Date().toISOString().slice(0, 10)
  const bookings = allBookings
    .filter((booking) => booking.booking_date >= today && ['pending', 'approved', 'confirmed', 'rescheduled'].includes(booking.status))
    .slice(0, 3)
  const bank = enrollment ? await getClientBankStatus(enrollment.id).catch(() => null) : null

  const lastSunday = new Date()
  lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay())
  const lastSundayStr = lastSunday.toISOString().split('T')[0]
  const showCheckinReminder = new Date().getDay() >= 1 && latestCheckin?.checkin_date !== lastSundayStr

  const cardStyle = {
    backgroundColor: '#111111',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '16px',
  }

  const badgeStyle = (color: string) => ({
    display: 'inline-block',
    backgroundColor: `${color}20`,
    color,
    border: `1px solid ${color}40`,
    borderRadius: '20px',
    padding: '2px 10px',
    fontSize: '12px',
    fontWeight: 'bold',
  })

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      {hasUnsignedAgreement && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
              ?? Coaching Agreement Required
            </p>
            <p style={{ color: '#fca5a5', fontSize: '13px' }}>
              Please sign your coaching agreement before your first session.
            </p>
          </div>
          <Link href="/portal/forms/coaching-agreement" style={{ backgroundColor: '#D4AF37', color: '#000', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            Review & Sign &rarr;
          </Link>
        </div>
      )}

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#ffffff', fontSize: '24px', marginBottom: '4px', fontWeight: 'bold' }}>
          Welcome back, {client.full_name.split(' ')[0]}
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>
          {client.primary_goal || 'Your FORGE journey continues'}
        </p>
      </div>

      {showCheckinReminder && (
        <div style={{ backgroundColor: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p style={{ color: '#D4AF37', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
              Weekly check-in due
            </p>
            <p style={{ color: '#888', fontSize: '13px' }}>
              Your weekly check-in for the week ending {new Date(`${lastSundayStr}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} is waiting.
            </p>
          </div>
          <Link href="/portal/forms/weekly-checkin" style={{ backgroundColor: '#D4AF37', color: '#000', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            Complete Check-In →
          </Link>
        </div>
      )}

      {outstandingForms.length > 0 && (
        <div style={{ backgroundColor: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p style={{ color: '#D4AF37', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
              {outstandingForms.length} form{outstandingForms.length > 1 ? 's' : ''} required
            </p>
            <p style={{ color: '#888', fontSize: '13px' }}>
              Complete your required forms before your appointment.
            </p>
          </div>
          <Link href="/portal/forms" style={{ backgroundColor: '#D4AF37', color: '#000', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            Complete Now →
          </Link>
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>Protocol</span>
            <span style={{ color: '#D4AF37', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
              My Protocol
            </span>
          </div>
          <span style={badgeStyle('#8b5cf6')}>{client.current_stage || 'Foundations'}</span>
        </div>

        {protocol ? (
          <div>
            <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>{protocol.name}</p>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
              Generated {new Date(protocol.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <Link href={`/portal/protocol/${protocol.id}`} style={{ display: 'inline-block', backgroundColor: '#D4AF37', color: '#000', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' }}>
              View My Protocol →
            </Link>
          </div>
        ) : (
          <div>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '4px' }}>No protocol generated yet</p>
            <p style={{ color: '#555', fontSize: '13px' }}>Your coach will generate your personalized protocol soon.</p>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px' }}>Sessions</span>
          <span style={{ color: '#D4AF37', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Upcoming Sessions
          </span>
        </div>

        {bookings.length > 0 ? (
          <div>
            {bookings.map((booking) => (
              <div key={booking.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: '500', marginBottom: '2px' }}>{booking.item_name}</p>
                  <p style={{ color: '#666', fontSize: '13px' }}>
                    {new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {booking.booking_time.slice(0, 5)}
                  </p>
                </div>
                <span style={badgeStyle(booking.status === 'confirmed' ? '#10b981' : booking.status === 'approved' ? '#D4AF37' : '#f59e0b')}>
                  {booking.status}
                </span>
              </div>
            ))}
            <div style={{ marginTop: '16px' }}>
              <Link href="/portal/bookings" style={{ color: '#D4AF37', fontSize: '13px', textDecoration: 'none' }}>
                Manage my sessions →
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>No upcoming sessions</p>
            <Link href="/book" style={{ display: 'inline-block', border: '1px solid rgba(212,175,55,0.4)', color: '#D4AF37', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px' }}>
              Request a Session →
            </Link>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px' }}>Billing</span>
          <span style={{ color: '#D4AF37', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Package & Billing
          </span>
        </div>
        {enrollment ? (
          <div>
            <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>{enrollment.package_name ?? 'Active Package'}</p>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '8px' }}>
              Payment status: {enrollment.payment_status ?? 'unpaid'} · Amount: {formatMoney(enrollment.amount_cents)}
            </p>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
              Sessions remaining: {enrollment.sessions_remaining ?? 0}{bank ? ` · Weekly usage: ${bank.weeklyUsed}/${bank.weeklyLimit || 0}` : ''}
            </p>
            <Link href="/portal/package" style={{ color: '#D4AF37', fontSize: '13px', textDecoration: 'none' }}>
              View package details →
            </Link>
          </div>
        ) : (
          <p style={{ color: '#666', fontSize: '14px' }}>No active package or billing record found yet.</p>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px' }}>Alerts</span>
          <span style={{ color: '#D4AF37', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Notifications
          </span>
        </div>
        <div style={{ color: '#666', fontSize: '13px', marginBottom: '12px' }}>
          {outstandingForms.length > 0 ? `${outstandingForms.length} form(s) still need attention before your next appointment.` : 'No urgent portal notifications right now.'}
        </div>
        <Link href="/portal/notifications" style={{ color: '#D4AF37', textDecoration: 'none', fontSize: '13px' }}>
          Open notifications →
        </Link>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px' }}>Links</span>
          <span style={{ color: '#D4AF37', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Quick Links
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/portal/bookings" style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            My Sessions
          </Link>
          <Link href="/book" style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            Book Session
          </Link>
          <Link href="/portal/forms" style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            My Forms
          </Link>
          <Link href="/portal/forms/coaching-agreement" style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            Coaching Agreement
          </Link>
          <Link href="/portal/forms/weekly-checkin" style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            Weekly Check-In
          </Link>
          <Link href="/portal/package" style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            Package & Billing
          </Link>
          <Link href="/portal/notifications" style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            Notifications
          </Link>
          {protocol ? (
            <Link href={`/portal/protocol/${protocol.id}`} style={{ color: '#888', fontSize: '14px', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
              My Protocol
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
