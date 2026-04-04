import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyClientToken } from '@/lib/client-auth'
import { db } from '@/lib/db'

export default async function PortalDashboard() {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get('forge_client_session')?.value

  if (!sessionToken) {
    redirect('/portal/auth')
  }

  const session = verifyClientToken(sessionToken)
  if (!session) {
    redirect('/portal/auth')
  }

  const client = await db.queryOne<{
    id: string
    full_name: string
    email: string
    current_stage: string
    primary_goal: string
    status: string
  }>(
    `SELECT id, full_name, email, current_stage,
            primary_goal, status
     FROM clients WHERE id = $1`,
    [session.clientId]
  ).catch(() => null)

  if (!client) {
    redirect('/portal/auth')
  }

  const protocol = await db.queryOne<{
    id: string
    name: string
    protocol_type: string
    created_at: string
  }>(
    `SELECT id, name, protocol_type, created_at::text
     FROM protocols
     WHERE client_id = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [client.id]
  ).catch(() => null)

  const bookings = await db.query<{
    id: string
    booking_date: string
    booking_time: string
    duration_minutes: number
    status: string
    service_name: string
  }>(
    `SELECT b.id, b.booking_date::text, b.booking_time::text,
            b.duration_minutes, b.status,
            COALESCE(s.name, p.name, 'Session') as service_name
     FROM bookings b
     LEFT JOIN services s ON b.service_id = s.id
     LEFT JOIN packages p ON b.package_id = p.id
     WHERE b.client_email = $1
     AND b.booking_date >= CURRENT_DATE
     AND b.status IN ('pending', 'confirmed')
     ORDER BY b.booking_date ASC, b.booking_time ASC
     LIMIT 3`,
    [client.email]
  ).catch(() => [])

  const completedForms = await db.query<{ form_template_id: string }>(
    `SELECT form_template_id FROM form_submissions
     WHERE client_id = $1
     AND status = 'submitted'
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [client.id]
  ).catch(() => [])

  const completedFormIds = completedForms.map((form) => form.form_template_id)

  const requiredForms = await db.query<{
    id: string
    name: string
    slug: string
    form_type: string
  }>(
    `SELECT id, name, slug, form_type
     FROM form_templates
     WHERE form_type IN ('waiver', 'parq')
     AND is_active = true`,
    []
  ).catch(() => [])

  const outstandingForms = requiredForms.filter(
    (form) => !completedFormIds.includes(form.id)
  )

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
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{
            color: '#ffffff',
            fontSize: '24px',
            marginBottom: '4px',
            fontWeight: 'bold',
          }}
        >
          Welcome back, {client.full_name.split(' ')[0]}
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>
          {client.primary_goal || 'Your FORGË journey continues'}
        </p>
      </div>

      {outstandingForms.length > 0 && (
        <div
          style={{
            backgroundColor: 'rgba(212,175,55,0.1)',
            border: '1px solid rgba(212,175,55,0.3)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <p
              style={{
                color: '#D4AF37',
                fontWeight: 'bold',
                fontSize: '14px',
                marginBottom: '4px',
              }}
            >
              ⚠️ {outstandingForms.length} form{outstandingForms.length > 1 ? 's' : ''} required
            </p>
            <p style={{ color: '#888', fontSize: '13px' }}>
              Complete your required forms before your appointment
            </p>
          </div>
          <Link
            href="/portal/forms"
            style={{
              backgroundColor: '#D4AF37',
              color: '#000',
              padding: '8px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
            }}
          >
            Complete Now →
          </Link>
        </div>
      )}

      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
            <span
              style={{
                color: '#D4AF37',
                fontSize: '11px',
                fontWeight: 'bold',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              My Protocol
            </span>
          </div>
          <span style={badgeStyle('#8b5cf6')}>
            {client.current_stage || 'Foundations'}
          </span>
        </div>

        {protocol ? (
          <div>
            <p
              style={{
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '16px',
                marginBottom: '8px',
              }}
            >
              {protocol.name}
            </p>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
              Generated{' '}
              {new Date(protocol.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <Link
              href={`/portal/protocol/${protocol.id}`}
              style={{
                display: 'inline-block',
                backgroundColor: '#D4AF37',
                color: '#000',
                padding: '10px 20px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              View My Protocol →
            </Link>
          </div>
        ) : (
          <div>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '4px' }}>
              No protocol generated yet
            </p>
            <p style={{ color: '#555', fontSize: '13px' }}>
              Your coach will generate your personalized protocol soon
            </p>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontSize: '18px' }}>📅</span>
          <span
            style={{
              color: '#D4AF37',
              fontSize: '11px',
              fontWeight: 'bold',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            Upcoming Sessions
          </span>
        </div>

        {bookings.length > 0 ? (
          <div>
            {bookings.map((booking) => (
              <div
                key={booking.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div>
                  <p
                    style={{
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: '500',
                      marginBottom: '2px',
                    }}
                  >
                    {booking.service_name}
                  </p>
                  <p style={{ color: '#666', fontSize: '13px' }}>
                    {new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    at {booking.booking_time}
                  </p>
                </div>
                <span style={badgeStyle(
                  booking.status === 'confirmed' ? '#10b981' : '#f59e0b'
                )}>
                  {booking.status}
                </span>
              </div>
            ))}
            <div style={{ marginTop: '16px' }}>
              <Link
                href="/book"
                style={{
                  color: '#D4AF37',
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                + Book another session
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
              No upcoming sessions
            </p>
            <Link
              href="/book"
              style={{
                display: 'inline-block',
                border: '1px solid rgba(212,175,55,0.4)',
                color: '#D4AF37',
                padding: '10px 20px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '14px',
              }}
            >
              Book a Session →
            </Link>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontSize: '18px' }}>🔗</span>
          <span
            style={{
              color: '#D4AF37',
              fontSize: '11px',
              fontWeight: 'bold',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            Quick Links
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            href="/book"
            style={{
              color: '#888',
              fontSize: '14px',
              textDecoration: 'none',
              padding: '8px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
            }}
          >
            📅 Book Session
          </Link>
          <Link
            href="/portal/forms"
            style={{
              color: '#888',
              fontSize: '14px',
              textDecoration: 'none',
              padding: '8px 16px',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
            }}
          >
            📋 My Forms
          </Link>
          {protocol && (
            <Link
              href={`/portal/protocol/${protocol.id}`}
              style={{
                color: '#888',
                fontSize: '14px',
                textDecoration: 'none',
                padding: '8px 16px',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
              }}
            >
              ⚡ My Protocol
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
