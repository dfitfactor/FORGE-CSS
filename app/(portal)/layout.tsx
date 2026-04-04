import Link from 'next/link'

const navLinks = [
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/bookings', label: 'My Sessions' },
  { href: '/portal/package', label: 'Package & Billing' },
  { href: '/portal/forms', label: 'Forms' },
  { href: '/portal/notifications', label: 'Notifications' },
]

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#0a0a0a',
            color: '#ffffff',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          <header
            style={{
              backgroundColor: '#111111',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              padding: '16px 24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href="/portal/dashboard"
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    color: '#D4AF37',
                    fontWeight: 'bold',
                    fontSize: '20px',
                    letterSpacing: '2px',
                  }}
                >
                  FORGE
                </span>
                <span
                  style={{
                    color: '#666',
                    fontSize: '12px',
                    letterSpacing: '1px',
                  }}
                >
                  CLIENT PORTAL
                </span>
              </Link>
              <Link
                href="/api/portal/auth/signout"
                style={{
                  color: '#666',
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                Sign Out
              </Link>
            </div>

            <nav style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    textDecoration: 'none',
                    color: '#aaa',
                    fontSize: '13px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '999px',
                    padding: '8px 12px',
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </header>

          <main style={{ padding: '24px' }}>{children}</main>
        </div>
      </body>
    </html>
  )
}
