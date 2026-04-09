'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/services', label: 'Services', icon: LayoutGrid },
  { href: '/bookings', label: 'Bookings', icon: Calendar },
  { href: '/availability', label: 'Availability', icon: Clock3 },
  { href: '/ai-insights', label: 'AI Insights', icon: Sparkles },
]

const bottomItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('forge-sidebar-collapsed') === 'true'
    setCollapsed(saved)
    setMounted(true)
    if (saved) document.documentElement.setAttribute('data-sidebar', 'collapsed')
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('forge-sidebar-collapsed', String(next))
    if (next) document.documentElement.setAttribute('data-sidebar', 'collapsed')
    else document.documentElement.removeAttribute('data-sidebar')
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.location.href = '/auth/login'
      router.refresh()
    }
  }

  const desktopWidth = !mounted ? 256 : collapsed ? 60 : 256

  function renderNavItems(compact: boolean) {
    return navItems.map((item) => {
      const Icon = item.icon
      const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
      return (
        <Link
          key={item.href}
          href={item.href}
          title={compact ? item.label : undefined}
          className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all duration-150 ${
            compact ? 'justify-center' : ''
          } ${
            isActive
              ? 'bg-forge-purple text-white shadow-lg shadow-forge-purple/20'
              : 'text-forge-text-secondary hover:bg-forge-surface-3 hover:text-forge-text-primary'
          }`}
        >
          <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-forge-gold' : ''}`} />
          {!compact && <span>{item.label}</span>}
        </Link>
      )
    })
  }

  function renderBottomItems(compact: boolean) {
    return bottomItems.map((item) => {
      const Icon = item.icon
      const isActive = pathname === item.href
      return (
        <Link
          key={item.href}
          href={item.href}
          title={compact ? item.label : undefined}
          className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all duration-150 ${
            compact ? 'justify-center' : ''
          } ${
            isActive
              ? 'bg-forge-purple text-white'
              : 'text-forge-text-secondary hover:bg-forge-surface-3 hover:text-forge-text-primary'
          }`}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          {!compact && <span>{item.label}</span>}
        </Link>
      )
    })
  }

  const desktopSidebar = (
    <aside
      className="hidden min-h-screen overflow-hidden border-r border-forge-border bg-forge-surface-2 transition-all duration-200 lg:flex lg:flex-col"
      style={{ width: desktopWidth, minWidth: desktopWidth, maxWidth: desktopWidth, flex: `0 0 ${desktopWidth}px` }}
    >
      <div className={`${collapsed ? 'px-3 py-5' : 'px-6 py-5'} border-b border-forge-border`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          {!mounted || !collapsed ? (
            <>
              <div className="glow-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-forge-purple">
                <img src="/forge-logo.png" alt="FORGE" className="h-5 w-5 object-contain" />
              </div>
              <div>
                <div className="font-bold tracking-wide text-forge-text-primary">FORGE</div>
                <div className="text-[10px] uppercase tracking-widest leading-none text-forge-text-muted">Client Support System</div>
              </div>
            </>
          ) : (
            <div className="glow-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-forge-purple">
              <img src="/forge-logo.png" alt="FORGE" className="h-5 w-5 object-contain" />
            </div>
          )}
        </div>

        <div className={`mt-4 ${collapsed ? 'flex justify-center' : ''}`}>
          <ThemeToggle compact={collapsed} />
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {renderNavItems(collapsed)}

        {collapsed ? (
          <div className="pb-2 pt-4"><div className="border-t border-forge-border" /></div>
        ) : (
          <div className="px-3 pb-2 pt-4"><div className="text-[10px] font-semibold uppercase tracking-widest text-forge-text-muted">System</div></div>
        )}

        {renderBottomItems(collapsed)}
      </nav>

      <div className={`px-2 pb-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-forge-text-muted transition-all hover:bg-forge-surface-3 hover:text-forge-text-primary ${
            collapsed ? 'w-auto justify-center' : 'w-full'
          }`}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 flex-shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      <div className={`border-t border-forge-border pb-4 pt-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forge-purple text-xs font-bold text-forge-gold">C</div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              title="Log out"
              className="p-1 text-forge-text-muted transition-colors hover:text-state-recovery disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="forge-card flex items-center gap-3 p-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-forge-purple text-xs font-bold text-forge-gold">C</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-forge-text-primary">Coach</div>
              <div className="truncate text-xs text-forge-text-muted">DFitFactor</div>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-forge-text-muted transition-all hover:bg-forge-surface-3 hover:text-forge-text-primary disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-forge-border bg-forge-surface-2/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-surface-3 text-forge-text-primary"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3 no-underline">
              <div className="glow-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-forge-purple">
                <img src="/forge-logo.png" alt="FORGE" className="h-5 w-5 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold tracking-wide text-forge-text-primary">FORGE</div>
                <div className="truncate text-[10px] uppercase tracking-widest text-forge-text-muted">Client Support System</div>
              </div>
            </Link>
          </div>
          <ThemeToggle compact />
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[88vw] max-w-[320px] flex-col border-r border-forge-border bg-forge-surface-2 shadow-2xl">
            <div className="flex items-center justify-between border-b border-forge-border px-5 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="glow-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-forge-purple">
                  <img src="/forge-logo.png" alt="FORGE" className="h-5 w-5 object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold tracking-wide text-forge-text-primary">FORGE</div>
                  <div className="truncate text-[10px] uppercase tracking-widest text-forge-text-muted">Client Support System</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-surface-3 text-forge-text-primary"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
              {renderNavItems(false)}
              <div className="px-3 pb-2 pt-4"><div className="text-[10px] font-semibold uppercase tracking-widest text-forge-text-muted">System</div></div>
              {renderBottomItems(false)}
            </nav>

            <div className="border-t border-forge-border p-4">
              <div className="forge-card flex items-center gap-3 p-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-forge-purple text-xs font-bold text-forge-gold">C</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-forge-text-primary">Coach</div>
                  <div className="truncate text-xs text-forge-text-muted">DFitFactor</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-forge-text-muted transition-all hover:bg-forge-surface-3 hover:text-forge-text-primary disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {desktopSidebar}
    </>
  )
}
