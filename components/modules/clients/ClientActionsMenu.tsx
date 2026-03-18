"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, AlertTriangle, Trash2 } from 'lucide-react'

export function ClientActionsMenu({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter()
  const [openMenu, setOpenMenu] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleArchive = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          console.error('Failed to archive client', await res.text())
          return
        }
        router.push('/clients')
        router.refresh()
      } finally {
        setShowConfirm(false)
      }
    })
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(v => !v)}
          className="w-9 h-9 rounded-lg bg-forge-surface-3 border border-forge-border flex items-center justify-center text-forge-text-muted hover:text-forge-text-primary hover:border-forge-gold/60 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {openMenu && (
          <div className="absolute right-0 mt-2 w-40 rounded-xl bg-forge-surface-3 border border-forge-border shadow-xl z-20">
            <div className="py-1 text-sm text-forge-text-secondary">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={() => {
                  setOpenMenu(false)
                  setShowConfirm(true)
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Archive Client
              </button>
            </div>
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-2xl bg-forge-surface-2 border border-amber-500/30 shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-forge-text-primary">Archive Client</h2>
                <p className="text-xs text-forge-text-muted mt-0.5">
                  Archive {clientName}? They will be removed from your active client list. Their data is preserved and this can be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 rounded-xl border border-forge-border text-xs text-forge-text-secondary hover:bg-forge-surface-3 transition-colors"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchive}
                className="px-4 py-1.5 rounded-xl bg-red-500 text-xs font-semibold text-white hover:bg-red-400 transition-colors disabled:opacity-60"
                disabled={isPending}
              >
                {isPending ? 'Archiving…' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

