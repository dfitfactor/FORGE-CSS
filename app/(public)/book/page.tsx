'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatDurationLabel, formatPriceFromCents, stageLabel } from '@/lib/booking'

type Service = {
  id: string
  name: string
  slug: string
  description: string | null
  duration_minutes: number
  price_cents: number
  category: string
}

type Package = {
  id: string
  name: string
  slug: string
  description: string | null
  session_count: number
  price_cents: number
  billing_type: string
  forge_stage: string
}

const SERVICE_CATEGORY_ORDER = ['assessment', 'training', 'coaching', 'nutrition', 'wellness']

export default function PublicBookingPage() {
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/public/book', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load booking options')
        setServices(Array.isArray(data.services) ? data.services : [])
        setPackages(Array.isArray(data.packages) ? data.packages : [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load booking options')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const servicesByCategory = useMemo(
    () =>
      SERVICE_CATEGORY_ORDER.map((category) => ({
        category,
        services: services.filter((service) => service.category === category),
      })).filter((group) => group.services.length > 0),
    [services]
  )

  const packagesByStage = useMemo(() => {
    const groups = new Map<string, Package[]>()
    for (const pkg of packages) {
      groups.set(pkg.forge_stage, [...(groups.get(pkg.forge_stage) ?? []), pkg])
    }
    return Array.from(groups.entries())
  }, [packages])

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-12">
        <section className="rounded-[2rem] bg-[#2B154A] px-8 py-12 text-white shadow-2xl">
          <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#D4AF37]">
            FORGÃ‹ Booking
          </span>
          <h1 className="mt-5 text-4xl font-semibold">Book a Session</h1>
          <p className="mt-3 max-w-2xl text-base text-white/70">Transform your health. Start your journey.</p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-600">{error}</div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-[#2B154A]/40" />
          </div>
        ) : (
          <>
            <section className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-[#1b140d]">Individual Sessions</h2>
                <p className="mt-2 text-sm text-black/55">Explore stand-alone sessions by category.</p>
              </div>

              <div className="space-y-8">
                {servicesByCategory.map((group) => (
                  <div key={group.category} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-[#1b140d]">{stageLabel(group.category)}</h3>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-black/45">{group.services.length}</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.services.map((service) => (
                        <article key={service.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="text-lg font-semibold text-[#1b140d]">{service.name}</h4>
                            <span className="rounded-full bg-[#2B154A]/8 px-3 py-1 text-xs font-medium text-[#2B154A]">
                              {formatDurationLabel(service.duration_minutes)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-black/55">{service.description || 'A focused FORGÃ‹ session tailored to your current phase.'}</p>
                          <div className="mt-4 text-lg font-semibold text-[#2B154A]">{formatPriceFromCents(service.price_cents)}</div>
                          <Link href={`/book/${service.slug}`} className="mt-5 inline-flex rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105">
                            Book Now
                          </Link>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-[#1b140d]">Packages</h2>
                <p className="mt-2 text-sm text-black/55">Choose a stage-aligned package to build long-term momentum.</p>
              </div>

              <div className="space-y-8">
                {packagesByStage.map(([stage, stagePackages]) => (
                  <div key={stage} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-[#1b140d]">{stageLabel(stage)}</h3>
                      <span className="rounded-full bg-[#D4AF37]/15 px-3 py-1 text-xs text-[#8f6c07]">{stagePackages.length}</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {stagePackages.map((pkg) => (
                        <article key={pkg.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                          <h4 className="text-lg font-semibold text-[#1b140d]">{pkg.name}</h4>
                          <p className="mt-2 text-sm text-black/55">{pkg.description || 'A FORGÃ‹ package built to support your stage progression.'}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-black/55">{pkg.session_count} sessions</span>
                            <span className="rounded-full bg-[#2B154A]/8 px-3 py-1 text-xs uppercase text-[#2B154A]">{pkg.billing_type}</span>
                          </div>
                          <div className="mt-4 text-lg font-semibold text-[#2B154A]">{formatPriceFromCents(pkg.price_cents)}</div>
                          <Link href={`/book/${pkg.slug}`} className="mt-5 inline-flex rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105">
                            Get Started
                          </Link>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

