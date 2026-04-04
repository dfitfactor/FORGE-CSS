import { Suspense } from 'react'
import { ThankYouClient } from './ThankYouClient'

export default function ThankYouPage({
  searchParams,
}: {
  searchParams?: { name?: string; payment?: string; session_id?: string }
}) {
  const name = searchParams?.name || 'there'
  const sessionId = searchParams?.session_id || null
  const paymentComplete = searchParams?.payment === 'paid' || Boolean(sessionId)

  return (
    <Suspense fallback={null}>
      <ThankYouClient
        name={name}
        paymentComplete={paymentComplete}
        sessionId={sessionId}
      />
    </Suspense>
  )
}
