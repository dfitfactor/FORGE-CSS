'use client'

import { useState } from 'react'

export function BillingPortalButton({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  const [loading, setLoading] = useState(false)

  async function openPortal() {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Failed to open billing portal')
      }

      window.location.href = data.url
    } catch (error) {
      console.error('[billing-portal] failed:', error)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void openPortal()}
      disabled={loading}
      className={className}
    >
      {loading ? 'Opening...' : label ?? 'Manage Billing'}
    </button>
  )
}
