'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/ui/Sidebar'

type PreviewMode = 'desktop' | 'tablet' | 'mobile'

const PREVIEW_STORAGE_KEY = 'forge-dashboard-preview-mode'

function readPreviewMode(): PreviewMode {
  if (typeof window === 'undefined') return 'desktop'
  const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY)
  return stored === 'tablet' || stored === 'mobile' ? stored : 'desktop'
}

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')

  useEffect(() => {
    setPreviewMode(readPreviewMode())

    const handleStorage = (event: StorageEvent) => {
      if (event.key === PREVIEW_STORAGE_KEY) {
        setPreviewMode(readPreviewMode())
      }
    }

    const handlePreviewChange = () => {
      setPreviewMode(readPreviewMode())
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('forge-preview-mode-change', handlePreviewChange as EventListener)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('forge-preview-mode-change', handlePreviewChange as EventListener)
    }
  }, [])

  const previewClassName =
    previewMode === 'mobile' ? 'max-w-md' : previewMode === 'tablet' ? 'max-w-3xl' : 'max-w-none'

  return (
    <div className="flex min-h-screen bg-forge-surface">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className={`mx-auto min-h-full transition-all duration-200 ${previewClassName}`}>
          {children}
        </div>
      </main>
    </div>
  )
}