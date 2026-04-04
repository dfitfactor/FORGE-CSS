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
  preferredWindow: 'morning' | 'afternoon' | 'evening'
  notes: string
}

type AvailableSlot = {
  value: string
  label: string
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
  preferredWindow: 'morning',
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
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([])
  const [slotsMessage, setSlotsMessage] = useState('Select a date to view available times.')
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

  useEffect(() => {
    async function loadAvailability() {
      if (!selectedTarget || !form.bookingDate) {
        setAvailableSlots([])
        setSlotsMessage('Select a date to view available times.')
        setForm((current) => ({ ...current, bookingTime: '' }))
        return
      }

      setSlotsLoading(true)
      setCheckoutError('')
      try {
        const duration = selectedTarget.duration_minutes ?? 60
        const res = await fetch(
          `/api/public/availability?date=${encodeURIComponent(form.bookingDate)}&duration=${duration}&period=${form.preferredWindow}`,
          { cache: 'no-store' }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load availability')

        const nextSlots = Array.isArray(data.slots) ? data.slots : []
        setAvailableSlots(nextSlots)
        setSlotsMessage(data.reason || (nextSlots.length > 0 ? 'Choose one of the available times below.' : 'Unavailable for this time window.'))
        setForm((current) => ({
          ...current,
          bookingTime: nextSlots.some((slot: AvailableSlot) => slot.value === current.bookingTime) ? current.bookingTime : '',
        }))
      } catch (err: unknown) {
        setAvailableSlots([])
        setSlotsMessage(err instanceof Error ? err.message : 'Failed to load availability')
      } finally {
        setSlotsLoading(false)
      }
    }

    void loadAvailability()
  }, [form.bookingDate, form.preferredWindow, selectedTarget])

  function validateBookingSelection() {
    if (!form.clientName || !form.clientEmail || !form.clientPhone) {
      return 'Please fill in your name, email, and phone'
    }
    if (!form.bookingDate) {
      return 'Please choose a date first'
    }
    if (!form.bookingTime) {
      return availableSlots.length > 0
        ? 'Please choose one of the available time slots'
        : 'No times are available in this window. Try another date or time of day.'
    }
    return null
  }

  async function submitBookingRequest() {
    const validationMessage = validateBookingSelection()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

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
    const validationMessage = validateBookingSelection()
    if (validationMessage) {
      setCheckoutError(validationMessage)
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
          <h2 className="text-xl font-semibold text-[#1b140d]">Request this booking</h2>
          <p className="mt-2 text-sm text-black/55">
            {isFree
              ? "Choose your preferred date and one of the available times below. We'll confirm within 24 hours."
              : 'Choose your preferred date and available time below, then pay securely to submit your booking request.'}
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
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1b140d]">Preferred Date*</label>
                <input
                  type="date"
                  value={form.bookingDate}
                  onChange={(event) => setForm((current) => ({ ...current, bookingDate: event.target.value, bookingTime: '' }))}
                  className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1b140d]">Time Of Day*</label>
                <select
                  value={form.preferredWindow}
                  onChange={(event) => setForm((current) => ({ ...current, preferredWindow: event.target.value as BookingFormState['preferredWindow'], bookingTime: '' }))}
                  className="w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]"
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-[#faf8f2] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[#1b140d]">Available times</div>
                  <div className="mt-1 text-xs text-black/50">{slotsMessage}</div>
                </div>
                {slotsLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#2B154A]/50" /> : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {availableSlots.length > 0 ? availableSlots.map((slot) => (
                  <button
                    key={slot.value}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, bookingTime: slot.value }))}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${form.bookingTime === slot.value ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#664c07]' : 'border-black/10 bg-white text-black/70 hover:border-[#D4AF37]/50'}`}
                  >
                    {slot.label}
                  </button>
                )) : (
                  <div className="text-sm text-black/45">Unavailable. Try another date or switch between morning, afternoon, and evening.</div>
                )}
              </div>

              {form.bookingTime ? (
                <div className="mt-4 rounded-xl bg-white px-3 py-2 text-sm text-black/65">
                  Selected time: <span className="font-medium text-[#1b140d]">{availableSlots.find((slot) => slot.value === form.bookingTime)?.label ?? form.bookingTime}</span>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#1b140d]">Notes</label>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-[120px] w-full rounded-xl border border-black/10 bg-[#faf8f2] px-4 py-3 text-sm outline-none focus:border-[#D4AF37]" />
            </div>
            {isFree ? (
              <button onClick={() => void submitBookingRequest()} disabled={inquiryLoading || slotsLoading} className="w-full rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
                {inquiryLoading ? 'Submitting...' : 'Submit Booking Request'}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => void handleCheckout()}
                  disabled={checkoutLoading || slotsLoading}
                  className="forge-btn-gold w-full flex items-center justify-center gap-2 py-3 text-base font-semibold disabled:opacity-60"
                >
                  {checkoutLoading
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                    : <>Book & Pay — ${(selectedTarget.price_cents / 100).toFixed(2)}</>}
                </button>
                {checkoutError && (
                  <p className="text-red-400 text-sm mt-2">{checkoutError}</p>
                )}
                <button onClick={() => void submitBookingRequest()} disabled={inquiryLoading || slotsLoading} className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-[#1b140d] disabled:opacity-50">
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
              Payment secures your request, and your coach will confirm the final appointment details after review.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
