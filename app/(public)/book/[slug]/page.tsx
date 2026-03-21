'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { formatDurationLabel, formatPriceFromCents, stageLabel } from '@/lib/booking'

type Service = {
  id: string
  name: string
  slug: string
  description: string | null
  duration_minutes: number
  price_cents: number
  required_forms?: string[]
}

type Package = {
  id: string
  name: string
  slug: string
  description: string | null
  duration_minutes: number
  price_cents: number
  forge_stage: string
}

type BookingFormState = {
  client_name: string
  client_email: string
  client_phone: string
  booking_date: string
  booking_time: string
  notes: string
}

type SelectedBookingTarget =
  | ({ kind: 'service' } & Service)
  | ({ kind: 'package' } & Package)

const INITIAL_FORM: BookingFormState = {
  client_name: '',
  client_email: '',
  client_phone: '',
  booking_date: '',
  booking_time: '',
  notes: '',
}

export default function PublicBookingDetailPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadOptions() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/public/book', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load booking option')
        setServices(Array.isArray(data.services) ? data.services : [])
        setPackages(Array.isArray(data.packages) ? data.packages : [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load booking option')
      } finally {
        setLoading(false)
      }
    }

    void loadOptions()
  }, [])

  const selectedTarget = useMemo<SelectedBookingTarget | null>(() => {
    const service = services.find((item) => item.slug === params.slug)
    if (service) return { kind: 'service', ...service }
    const pkg = packages.find((item) => item.slug === params.slug)
    if (pkg) return { kind: 'package', ...pkg }
    return null
  }, [packages, params.slug, services])

  async function submitBookingRequest() {
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        client_name: form.client_name,
        client_email: form.client_email,
        client_phone: form.client_phone,
        booking_date: form.booking_date,
        booking_time: form.booking_time,
        notes: form.notes || null,
      }

      if (selectedTarget?.kind === 'service') {
        payload.service_id = selectedTarget.id
      } else if (selectedTarget?.kind === 'package') {
        payload.package_id = selectedTarget.id
      }

      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit booking request')
      router.push(`/thank-you?name=${encodeURIComponent(form.client_name)}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit booking request')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#2B154A]/40" />
      </div>
    )
  }

  if (!selectedTarget) {
    return (
      <div className="px-6 py-20">
        <div className="mx-auto max-w-3xl rounded-3xl border border-black/10 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#1b140d]">Booking option not found</h1>
          <p className="mt-3 text-sm text-black/55">This service or package may no longer be public.</p>
          <a href="/book" className="mt-6 inline-flex rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black">Back to booking page</a>
        </div>
      </div>
    )
  }

  const isFree = Number(selectedTarget.price_cents ?? 0) <= 0
  const requiredForms = selectedTarget.kind === 'service' && Array.isArray(selectedTarget.required_forms) ? selectedTarget.required_forms : []

  return (
    <div className="px-6 py-12">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_420px]">
        <section className="rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#2B154A]/8 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#2B154A]">
              {selectedTarget.kind === 'service' ? 'Session' : 'Package'}
            </span>
            {selectedTarget.kind === 'package' ? (
              <span className="rounded-full bg-[#D4AF37]/15 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#8f6c07]">
                {stageLabel(selectedTarget.forge_stage)}
              </span>
            ) : null}
          </div>

          <h1 className="mt-5 text-3xl font-semibold text-[#1b140d]">{selectedTarget.name}</h1>
          <p className="mt-3 text-base text-black/60">{selectedTarget.description || 'A FORGË booking option tailored to your current needs and stage.'}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#f6f1e2] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-black/45">Duration</div>
              <div className="mt-2 text-lg font-semibold text-[#1b140d]">{formatDurationLabel(selectedTarget.duration_minutes)}</div>
            </div>
            <div className="rounded-2xl bg-[#f6f1e2] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-black/45">Price</div>
              <div className="mt-2 text-lg font-semibold text-[#1b140d]">{formatPriceFromCents(selectedTarget.price_cents)}</div>
            </div>
          </div>

          {requiredForms.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-4 text-sm text-[#664c07]">
              You will complete {requiredForms.length} form{requiredForms.length === 1 ? '' : 's'} before your appointment.
            </div>
          ) : null}

          {!isFree ? (
            <div className="mt-6">
              <button type="button" disabled title="Payment coming in Phase 2" className="rounded-xl bg-black/10 px-4 py-2 text-sm font-semibold text-black/55">
                Proceed to Checkout
              </button>
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-[#1b140d]">{isFree ? 'Request your booking' : 'Request this booking'}</h2>
          <p className="mt-2 text-sm text-black/55">
            {isFree ? 'Choose your preferred date and time for Coach Dee to confirm.' : 'Checkout is coming in Phase 2. Submit your request and Coach Dee will follow up.'}
          </p>

          {error ? <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Full Name*</label>
              <input value={form.client_name} onChange={(event) => setForm((current) => ({ ...current, client_name: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Email*</label>
              <input type="email" value={form.client_email} onChange={(event) => setForm((current) => ({ ...current, client_email: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Phone*</label>
              <input value={form.client_phone} onChange={(event) => setForm((current) => ({ ...current, client_phone: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1b140d]">Preferred Date*</label>
                <input type="date" value={form.booking_date} onChange={(event) => setForm((current) => ({ ...current, booking_date: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1b140d]">Preferred Time*</label>
                <input type="time" value={form.booking_time} onChange={(event) => setForm((current) => ({ ...current, booking_time: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Notes</label>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-[120px] w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            <button onClick={() => void submitBookingRequest()} disabled={saving} className="w-full rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
              {saving ? 'Submitting...' : isFree ? 'Submit Booking Request' : 'Submit Inquiry'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
