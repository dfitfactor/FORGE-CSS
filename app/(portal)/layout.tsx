import Link from 'next/link'

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0a0a0a',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif'
        }}>
          <header style={{
            backgroundColor: '#111111',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Link href="/portal/dashboard" style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                color: '#D4AF37',
                fontWeight: 'bold',
                fontSize: '20px',
                letterSpacing: '2px'
              }}>FORGË</span>
              <span style={{
                color: '#666',
                fontSize: '12px',
                letterSpacing: '1px'
              }}>CLIENT PORTAL</span>
            </Link>
            <Link href="/api/portal/auth/signout" style={{
              color: '#666',
              fontSize: '13px',
              textDecoration: 'none'
            }}>
              Sign Out
            </Link>
          </header>

          <main style={{ padding: '24px' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
