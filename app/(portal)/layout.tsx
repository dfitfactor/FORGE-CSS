import Link from 'next/link'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

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
            backgroundColor: 'var(--app-bg)',
            color: 'var(--app-text)',
            fontFamily: 'Arial, sans-serif',
            transition: 'background-color 0.2s ease, color 0.2s ease',
          }}
        >
          <header
            style={{
              backgroundColor: 'var(--app-surface)',
              borderBottom: '1px solid var(--app-border)',
              padding: '16px 24px',
              boxShadow: 'var(--app-shadow)',
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
                    color: 'var(--app-gold)',
                    fontWeight: 'bold',
                    fontSize: '20px',
                    letterSpacing: '2px',
                  }}
                >
                  FORGE
                </span>
                <span
                  style={{
                    color: 'var(--app-text-muted)',
                    fontSize: '12px',
                    letterSpacing: '1px',
                  }}
                >
                  CLIENT PORTAL
                </span>
              </Link>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ThemeToggle />
                <Link
                  href="/api/portal/auth/signout"
                  style={{
                    color: 'var(--app-text-secondary)',
                    fontSize: '13px',
                    textDecoration: 'none',
                    border: '1px solid var(--app-border)',
                    borderRadius: '999px',
                    padding: '8px 12px',
                  }}
                >
                  Sign Out
                </Link>
              </div>
            </div>

            <nav style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    textDecoration: 'none',
                    color: 'var(--app-text-secondary)',
                    fontSize: '13px',
                    border: '1px solid var(--app-border)',
                    backgroundColor: 'var(--app-surface-muted)',
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