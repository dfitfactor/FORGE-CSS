'use client'

import { useEffect, useState } from 'react'

export type DashboardPreviewMode = 'desktop' | 'tablet' | 'mobile'

const PREVIEW_STORAGE_KEY = 'forge-dashboard-preview-mode'

function readPreviewMode(): DashboardPreviewMode {
  if (typeof window === 'undefined') return 'desktop'
  const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY)
  return stored === 'tablet' || stored === 'mobile' ? stored : 'desktop'
}

export function useDashboardPreviewMode() {
  const [previewMode, setPreviewMode] = useState<DashboardPreviewMode>('desktop')

  useEffect(() => {
    const syncPreviewMode = () => {
      setPreviewMode(readPreviewMode())
    }

    syncPreviewMode()
    window.addEventListener('storage', syncPreviewMode)
    window.addEventListener('forge-preview-mode-change', syncPreviewMode as EventListener)

    return () => {
      window.removeEventListener('storage', syncPreviewMode)
      window.removeEventListener('forge-preview-mode-change', syncPreviewMode as EventListener)
    }
  }, [])

  return previewMode
}
