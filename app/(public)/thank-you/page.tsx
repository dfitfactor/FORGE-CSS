import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export default function ThankYouPage({
  searchParams,
}: {
  searchParams?: { name?: string; payment?: string }
}) {
  const name = searchParams?.name || 'there'
  const paymentComplete = searchParams?.payment === 'paid'

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-black/10 bg-white p-10 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-6 text-3xl font-semibold text-[#1b140d]">You&apos;re booked!</h1>
        <p className="mt-3 text-base text-black/60">
          {paymentComplete
            ? `Thank you ${name}, your payment was received and your booking has been confirmed.`
            : `Thank you ${name}, your booking request has been received.`}
        </p>

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

        <Link href="/book" className="mt-8 inline-flex rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black">
          Book another session
        </Link>
      </div>
    </div>
  )
}
