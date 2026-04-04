'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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

type IncludedService = {
  service_id: string
  service_name?: string
  monthly_session_allotment: number
}

type Package = {
  id: string
  name: string
  slug: string
  description: string | null
  duration_minutes: number
  price_cents: number
  forge_stage: string
  included_services?: IncludedService[]
}

type BookingFormState = {
  clientName: string
  clientEmail: string
  clientPhone: string
  bookingDate: string
  bookingTime: string
  notes: string
}

type SelectedBookingTarget =
  | ({ kind: 'service' } & Service)
  | ({ kind: 'package' } & Package)

const INITIAL_FORM: BookingFormState = {
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  bookingDate: '',
  bookingTime: '',
  notes: '',
}

export default function PublicBookingDetailPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [inquiryLoading, setInquiryLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkoutError, setCheckoutError] = useState('')

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
    setInquiryLoading(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        client_name: form.clientName,
        client_email: form.clientEmail,
        client_phone: form.clientPhone,
        booking_date: form.bookingDate,
        booking_time: form.bookingTime,
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
      router.push(`/thank-you?name=${encodeURIComponent(form.clientName)}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit booking request')
    } finally {
      setInquiryLoading(false)
    }
  }

  async function handleCheckout() {
    if (!form.clientName || !form.clientEmail || !form.clientPhone) {
      setCheckoutError('Please fill in your name, email, and phone')
      return
    }
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: selectedTarget?.kind === 'service' ? selectedTarget.id : undefined,
          packageId: selectedTarget?.kind === 'package' ? selectedTarget.id : undefined,
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone,
          bookingDate: form.bookingDate,
          bookingTime: form.bookingTime,
          notes: form.notes,
        })
      })
      const data = await res.json().catch(() => ({}))
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        setCheckoutError(data.error || 'Checkout failed')
      }
    } catch {
      setCheckoutError('Network error — please try again')
    } finally {
      setCheckoutLoading(false)
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
  const includedServices = selectedTarget.kind === 'package' && Array.isArray(selectedTarget.included_services) ? selectedTarget.included_services : []
  const requiredForms = selectedTarget.kind === 'service' && Array.isArray(selectedTarget.required_forms) ? selectedTarget.required_forms : []
  const cancelled = searchParams.get('cancelled') === '1'

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-[#1b140d]">{isFree ? 'Request this booking' : 'Request this booking'}</h2>
          <p className="mt-2 text-sm text-black/55">
            {isFree
              ? "Choose your preferred date and time and we'll confirm within 24 hours."
              : 'Complete the form below, then pay securely to confirm your booking.'}
          </p>

          {cancelled ? <div className="mt-4 rounded-xl border border-black/10 bg-black/5 px-4 py-3 text-sm text-black/60">Checkout was cancelled. Your booking request was not paid yet.</div> : null}
          {error ? <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Full Name*</label>
              <input value={form.clientName} onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Email*</label>
              <input type="email" value={form.clientEmail} onChange={(event) => setForm((current) => ({ ...current, clientEmail: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Phone*</label>
              <input value={form.clientPhone} onChange={(event) => setForm((current) => ({ ...current, clientPhone: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1b140d]">Preferred Date*</label>
                <input type="date" value={form.bookingDate} onChange={(event) => setForm((current) => ({ ...current, bookingDate: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1b140d]">Preferred Time*</label>
                <input type="time" value={form.bookingTime} onChange={(event) => setForm((current) => ({ ...current, bookingTime: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Notes</label>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-[120px] w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            {isFree ? (
              <button onClick={() => void submitBookingRequest()} disabled={inquiryLoading} className="w-full rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
                {inquiryLoading ? 'Submitting...' : 'Submit Booking Request'}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => void handleCheckout()}
                  disabled={checkoutLoading}
                  className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 text-base font-semibold disabled:opacity-60"
                >
                  {checkoutLoading
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                    : <>Book & Pay — ${(selectedTarget.price_cents / 100).toFixed(2)}</>}
                </button>
                {checkoutError && (
                  <p className="text-red-400 text-sm mt-2">{checkoutError}</p>
                )}
                <button onClick={() => void submitBookingRequest()} disabled={inquiryLoading} className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-[#1b140d] disabled:opacity-50">
                  {inquiryLoading ? 'Submitting Inquiry...' : 'Submit Inquiry Without Payment'}
                </button>
                <p className="text-xs text-black/45">
                  Proceed to checkout to pay now, or submit an inquiry if you want us to review your request first.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#2B154A]/8 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#2B154A]">
              {selectedTarget.kind === 'service' ? 'Requested service' : 'Requested package'}
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

          {includedServices.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-black/10 bg-[#faf8f2] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-black/45">Included Sessions</div>
              <div className="mt-3 space-y-2 text-sm text-black/60">
                {includedServices.map((service) => (
                  <div key={service.service_id}>{service.service_name ?? 'Attached service'} · {service.monthly_session_allotment} per month</div>
                ))}
              </div>
            </div>
          ) : null}

          {requiredForms.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-4 text-sm text-[#664c07]">
              You will complete {requiredForms.length} form{requiredForms.length === 1 ? '' : 's'} before your appointment.
            </div>
          ) : null}

          {!isFree ? (
            <div className="mt-6 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-4 text-sm text-[#664c07]">
              Secure checkout confirms payment first, then your booking details are finalized automatically.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
