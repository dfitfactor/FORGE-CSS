'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

type PaidSessionData = {
  clientName?: string
  clientEmail?: string
  serviceName?: string
  bookingDate?: string
  bookingTime?: string
  amountPaid?: number
}

export function ThankYouClient({
  name,
  paymentComplete,
  sessionId,
}: {
  name: string
  paymentComplete: boolean
  sessionId: string | null
}) {
  const [paidDetails, setPaidDetails] = useState<PaidSessionData | null>(null)
  const [loading, setLoading] = useState(Boolean(sessionId))

  useEffect(() => {
    async function loadStripeSession() {
      if (!sessionId) return
      setLoading(true)
      try {
        const res = await fetch(`/api/stripe/session?id=${encodeURIComponent(sessionId)}`)
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setPaidDetails(data)
        }
      } finally {
        setLoading(false)
      }
    }

    void loadStripeSession()
  }, [sessionId])

  const displayName = paidDetails?.clientName || name

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-black/10 bg-white p-10 text-center shadow-sm">
        {loading ? <Loader2 className="mx-auto h-14 w-14 animate-spin text-[#D4AF37]" /> : <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />}
        <h1 className="mt-6 text-3xl font-semibold text-[#1b140d]">You&apos;re booked!</h1>
        <p className="mt-3 text-base text-black/60">
          {paymentComplete
            ? `Thank you ${displayName}, your payment was received and your booking has been confirmed.`
            : `Thank you ${displayName}, your booking request has been received.`}
        </p>

        {paymentComplete && paidDetails ? (
          <div className="mt-8 rounded-2xl bg-[#f6f1e2] p-6 text-left">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-black/45">Payment confirmed ✅</h2>
            <div className="mt-4 space-y-3 text-sm text-black/65">
              <div><strong>Service:</strong> {paidDetails.serviceName || 'Booking'}</div>
              {paidDetails.bookingDate ? <div><strong>Date:</strong> {new Date(`${paidDetails.bookingDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div> : null}
              {paidDetails.bookingTime ? <div><strong>Time:</strong> {paidDetails.bookingTime}</div> : null}
              {typeof paidDetails.amountPaid === 'number' ? <div><strong>Amount paid:</strong> ${paidDetails.amountPaid.toFixed(2)}</div> : null}
              {paidDetails.clientEmail ? <div><strong>Email:</strong> {paidDetails.clientEmail}</div> : null}
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl bg-[#f6f1e2] p-6 text-left">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-black/45">What happens next</h2>
            <ol className="mt-4 space-y-3 text-sm text-black/65">
              {paymentComplete ? (
                <>
                  <li>1. Your booking has been confirmed</li>
                  <li>2. You will receive a confirmation email and payment receipt</li>
                  <li>3. Complete any required forms before your appointment</li>
                </>
              ) : (
                <>
                  <li>1. We&apos;ll confirm your booking within 24 hours</li>
                  <li>2. You will receive a confirmation email</li>
                  <li>3. Complete any required forms before your appointment</li>
                </>
              )}
            </ol>
          </div>
        )}

        <Link href="/book" className="mt-8 inline-flex rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black">
          Book another session
        </Link>
      </div>
    </div>
  )
}
