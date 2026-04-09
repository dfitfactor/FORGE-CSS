'use client'

import { useEffect, useState } from 'react'

type BrandingChangeDetail = {
  logoUrl?: string | null
}

const DEFAULT_LOGO_SRC = '/forge-logo.png'

export function BrandLogoImage({
  alt,
  className,
}: {
  alt: string
  className?: string
}) {
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO_SRC)

  useEffect(() => {
    let cancelled = false

    async function loadBrandLogo() {
      try {
        const res = await fetch('/api/branding', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && typeof data.logoUrl === 'string' && data.logoUrl.trim()) {
          setLogoUrl(data.logoUrl)
        }
      } catch {
        if (!cancelled) {
          setLogoUrl(DEFAULT_LOGO_SRC)
        }
      }
    }

    const handleBrandingChange = (event: Event) => {
      const detail = (event as CustomEvent<BrandingChangeDetail>).detail
      const nextUrl = detail?.logoUrl?.trim()
      setLogoUrl(nextUrl || DEFAULT_LOGO_SRC)
    }

    void loadBrandLogo()
    window.addEventListener('forge-branding-change', handleBrandingChange as EventListener)

    return () => {
      cancelled = true
      window.removeEventListener('forge-branding-change', handleBrandingChange as EventListener)
    }
  }, [])

  return <img src={logoUrl} alt={alt} className={className} />
}
