'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Calculator,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Network,
  PlugZap,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Monitor,
  Settings,
  Smartphone,
  Sparkles,
  Tablet,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { BrandLogoImage } from '@/components/ui/BrandLogoImage'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: UserPlus },
  { href: '/crm', label: 'CRM', icon: Network },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/finance', label: 'Finance', icon: TrendingUp },
  { href: '/services', label: 'Services', icon: LayoutGrid },
  { href: '/bookings', label: 'Bookings', icon: Calendar },
  { href: '/availability', label: 'Availability', icon: Clock3 },
  { href: '/ai-insights', label: 'AI Insights', icon: Sparkles },
]

const bottomItems = [
  { href: '/accounting', label: 'Accounting', icon: Calculator },
  { href: '/exercise-review', label: 'Exercise Review', icon: Dumbbell },
  { href: '/integrations', label: 'Integrations', icon: PlugZap },
  { href: '/settings', label: 'Settings', icon: Settings },
]

type PreviewMode = 'desktop' | 'tablet' | 'mobile'

const PREVIEW_STORAGE_KEY = 'forge-dashboard-preview-mode'

const previewOptions = [
  { value: 'desktop' as const, label: 'Desktop', icon: Monitor },
  { value: 'tablet' as const, label: 'Tablet', icon: Tablet },
  { value: 'mobile' as const, label: 'Mobile', icon: Smartphone },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')

  useEffect(() => {
    const storedCollapsed = localStorage.getItem('forge-sidebar-collapsed')
    const saved = storedCollapsed === null ? true : storedCollapsed === 'true'
    const storedPreview = localStorage.getItem(PREVIEW_STORAGE_KEY)
    setCollapsed(saved)
    setPreviewMode(storedPreview === 'tablet' || storedPreview === 'mobile' ? storedPreview : 'desktop')
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

  function setGlobalPreviewMode(mode: PreviewMode) {
    setPreviewMode(mode)
    setMobileOpen(false)
    localStorage.setItem(PREVIEW_STORAGE_KEY, mode)
    window.dispatchEvent(new CustomEvent('forge-preview-mode-change'))
  }

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

  const effectiveCollapsed = previewMode !== 'desktop' ? true : collapsed
  const desktopWidth = !mounted ? 60 : effectiveCollapsed ? 60 : 256

  function renderPreviewControls(compact: boolean) {
    return (
      <div className={`flex rounded-xl border border-forge-border bg-forge-surface-3/60 p-2 ${compact ? 'flex-col items-center gap-2' : 'items-center gap-2'}`}>
        {previewOptions.map((option) => {
          const Icon = option.icon
          const active = previewMode === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setGlobalPreviewMode(option.value)}
              title={`Preview ${option.label.toLowerCase()} layout`}
              aria-label={`Preview ${option.label.toLowerCase()} layout`}
              className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-all ${
                active
                  ? 'bg-forge-gold text-forge-purple-dark'
                  : 'text-forge-text-secondary hover:bg-forge-surface-2 hover:text-forge-text-primary'
              } ${compact ? 'justify-center' : ''}`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!compact && <span>{option.label}</span>}
            </button>
          )
        })}
      </div>
    )
  }

  function renderNavItems(compact: boolean) {
    return navItems.map((item) => {
      const Icon = item.icon
      const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
      return (
        <Link
          key={item.href}
          href={item.href}
          title={compact ? item.label : undefined}
          onClick={() => setMobileOpen(false)}
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
          onClick={() => setMobileOpen(false)}
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
      className="hidden min-h-screen overflow-hidden border-r border-forge-border bg-forge-surface-2 transition-all duration-200 md:flex md:flex-col"
      style={{ width: desktopWidth, minWidth: desktopWidth, maxWidth: desktopWidth, flex: `0 0 ${desktopWidth}px` }}
    >
      <div className={`${effectiveCollapsed ? 'px-3 py-5' : 'px-6 py-5'} border-b border-forge-border`}>
        <div className={`flex items-center ${effectiveCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
          {!mounted || !effectiveCollapsed ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <div className="glow-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-forge-purple">
                  <BrandLogoImage alt="FORGE" className="h-5 w-5 object-contain" />
                </div>
                <div>
                  <div className="font-bold tracking-wide text-forge-text-primary">FORGE</div>
                  <div className="text-[10px] uppercase tracking-widest leading-none text-forge-text-muted">Client Support System</div>
                </div>
              </div>
              <button
                type="button"
                onClick={toggle}
                disabled={previewMode !== 'desktop'}
                title={previewMode !== 'desktop' ? 'Sidebar stays compact in tablet and mobile preview' : 'Collapse sidebar'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-forge-border bg-forge-surface-3 text-forge-text-muted transition-all hover:bg-forge-surface hover:text-forge-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggle}
              disabled={previewMode !== 'desktop'}
              title={previewMode !== 'desktop' ? 'Sidebar stays compact in tablet and mobile preview' : 'Expand sidebar'}
              className="glow-purple inline-flex h-9 w-9 items-center justify-center rounded-lg bg-forge-purple text-forge-gold transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={`mt-4 space-y-3 ${effectiveCollapsed ? 'flex flex-col items-center' : ''}`}>
          <div className={effectiveCollapsed ? 'flex justify-center' : ''}>
            <ThemeToggle compact={effectiveCollapsed} />
          </div>
          {renderPreviewControls(effectiveCollapsed)}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {renderNavItems(effectiveCollapsed)}

        {effectiveCollapsed ? (
          <div className="pb-2 pt-4"><div className="border-t border-forge-border" /></div>
        ) : (
          <div className="px-3 pb-2 pt-4"><div className="text-[10px] font-semibold uppercase tracking-widest text-forge-text-muted">System</div></div>
        )}

        {renderBottomItems(effectiveCollapsed)}
      </nav>

      <div className={`px-2 pb-2 ${effectiveCollapsed ? 'flex justify-center' : ''}`}>
        <button
          onClick={toggle}
          disabled={previewMode !== 'desktop'}
          title={previewMode !== 'desktop' ? 'Sidebar stays compact in tablet and mobile preview' : effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-forge-text-muted transition-all hover:bg-forge-surface-3 hover:text-forge-text-primary disabled:cursor-not-allowed disabled:opacity-40 ${
            effectiveCollapsed ? 'w-auto justify-center' : 'w-full'
          }`}
        >
          {effectiveCollapsed ? (
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 flex-shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      <div className={`border-t border-forge-border pb-4 pt-4 ${effectiveCollapsed ? 'px-2' : 'px-3'}`}>
        {effectiveCollapsed ? (
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

  const showMobileChrome = false

  return (
    <>
      <div className={`sticky top-0 z-40 border-b border-forge-border bg-forge-surface-2/95 px-4 py-3 backdrop-blur ${showMobileChrome ? '' : 'md:hidden'}`}>
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
                <BrandLogoImage alt="FORGE" className="h-5 w-5 object-contain" />
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
        <div className={`fixed inset-0 z-50 ${showMobileChrome ? '' : 'md:hidden'}`}>
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[78vw] max-w-[280px] flex-col border-r border-forge-border bg-forge-surface-2 shadow-2xl">
            <div className="flex items-center justify-between border-b border-forge-border px-5 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="glow-purple flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-forge-purple">
                  <BrandLogoImage alt="FORGE" className="h-5 w-5 object-contain" />
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

            <div className="border-b border-forge-border px-4 py-4">
              {renderPreviewControls(false)}
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




