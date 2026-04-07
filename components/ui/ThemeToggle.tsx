'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function getResolvedTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'

  const stored = window.localStorage.getItem('forge-theme')
  if (stored === 'light' || stored === 'dark') return stored

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  window.localStorage.setItem('forge-theme', theme)
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initialTheme = getResolvedTheme()
    setTheme(initialTheme)
    applyTheme(initialTheme)
    setMounted(true)
  }, [])

  function toggleTheme() {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  const isDark = theme === 'dark'
  const label = mounted ? (isDark ? 'Dark mode' : 'Light mode') : 'Theme'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center rounded-lg border border-forge-border bg-forge-surface-3 text-forge-text-primary transition-colors hover:border-forge-purple-light hover:bg-forge-surface ${compact ? 'justify-center px-2.5 py-2' : 'gap-2 px-3 py-2 text-sm font-medium'}`}
      title={label}
      aria-label={label}
    >
      {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      {!compact && <span>{label}</span>}
    </button>
  )
}