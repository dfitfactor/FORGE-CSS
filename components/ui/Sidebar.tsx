'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { LayoutDashboard, Users, Sparkles, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/ai-insights', label: 'AI Insights', icon: Sparkles },
]

const bottomItems = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('forge-sidebar-collapsed') === 'true'
    setCollapsed(saved)
    setMounted(true)
    if (saved) document.documentElement.setAttribute('data-sidebar', 'collapsed')
  }, [])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('forge-sidebar-collapsed', String(next))
    if (next) document.documentElement.setAttribute('data-sidebar', 'collapsed')
    else document.documentElement.removeAttribute('data-sidebar')
  }

  const w = !mounted ? 256 : collapsed ? 60 : 256

  return (
    <aside
      style={{ width: w, minWidth: w, maxWidth: w }}
      className="min-h-screen bg-forge-surface-2 border-r border-forge-border flex flex-col overflow-hidden transition-all duration-200" style={{ width: w, minWidth: w, maxWidth: w, flex: `0 0 ${w}px` }}
    >
      {/* Logo */}
      <div className={`border-b border-forge-border flex items-center ${collapsed ? 'px-3 py-5 justify-center' : 'px-6 py-5'}`}>
        {!mounted || !collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-forge-purple flex items-center justify-center glow-purple flex-shrink-0">
              <img src="/forge-logo.png" alt="FORGË" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <div className="font-bold text-forge-text-primary tracking-wide">FORG<span className="text-forge-gold">Ë</span></div>
              <div className="text-[10px] text-forge-text-muted uppercase tracking-widest leading-none">Client Support System</div>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-forge-purple flex items-center justify-center glow-purple flex-shrink-0">
            <img src="/forge-logo.png" alt="FORGË" className="w-5 h-5 object-contain" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                ${collapsed ? 'justify-center' : ''}
                ${isActive ? 'bg-forge-purple text-white shadow-lg shadow-forge-purple/20' : 'text-forge-text-secondary hover:bg-forge-surface-3 hover:text-forge-text-primary'}`}>
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-forge-gold' : ''}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        {collapsed
          ? <div className="pt-4 pb-2"><div className="border-t border-forge-border" /></div>
          : <div className="pt-4 pb-2 px-3"><div className="text-[10px] font-semibold text-forge-text-muted uppercase tracking-widest">System</div></div>
        }

        {bottomItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                ${collapsed ? 'justify-center' : ''}
                ${isActive ? 'bg-forge-purple text-white' : 'text-forge-text-secondary hover:bg-forge-surface-3 hover:text-forge-text-primary'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className={`px-2 pb-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <button onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-forge-text-muted hover:text-forge-text-primary hover:bg-forge-surface-3 transition-all ${collapsed ? 'justify-center w-auto' : 'w-full'}`}>
          {collapsed ? <ChevronRight className="w-4 h-4 flex-shrink-0" /> : <><ChevronLeft className="w-4 h-4 flex-shrink-0" /><span>Collapse</span></>}
        </button>
      </div>

      {/* User footer */}
      <div className={`border-t border-forge-border pt-4 pb-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-forge-purple flex items-center justify-center text-xs font-bold text-forge-gold">C</div>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" title="Sign out" className="p-1 text-forge-text-muted hover:text-state-recovery transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          <div className="forge-card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-forge-purple flex items-center justify-center text-xs font-bold text-forge-gold flex-shrink-0">C</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-forge-text-primary truncate">Coach</div>
              <div className="text-xs text-forge-text-muted truncate">DFitFactor</div>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" title="Sign out" className="p-1 text-forge-text-muted hover:text-state-recovery transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  )
}