import { Resend } from 'resend'

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY')
  }

  return new Resend(process.env.RESEND_API_KEY)
}

export function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'FORGË <onboarding@dfitfactor.com>'
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const resend = getResendClient()

  await resend.emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
  })
}

function formatBookingDate(bookingDate?: string) {
  if (!bookingDate) return null
  return new Date(`${bookingDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function baseTemplate({
  heading,
  intro,
  details,
  footer,
}: {
  heading: string
  intro: string
  details?: string[]
  footer?: string
}) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #333;">
      <div style="background: #1a0a2e; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
        <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">FORGË</h1>
        <p style="color: #aaa; margin: 4px 0 0; font-size: 12px;">DFITFACTOR</p>
      </div>
      <h2 style="color: #1a0a2e;">${heading}</h2>
      <p>${intro}</p>
      ${
        details && details.length > 0
          ? `<div style="background: #f9f9f9; border-left: 4px solid #D4AF37; padding: 16px; margin: 20px 0; border-radius: 4px;">
              ${details.map((line) => `<p style="margin: 0 0 8px;">${line}</p>`).join('')}
            </div>`
          : ''
      }
      ${footer ? `<p>${footer}</p>` : ''}
      <p style="color: #666; font-size: 14px;">
        Questions? Reply to this email or contact
        <a href="mailto:coach@dfitfactor.com">coach@dfitfactor.com</a>.
      </p>
    </body>
    </html>
  `
}

export async function sendBookingConfirmation({
  clientName,
  clientEmail,
  serviceName,
  bookingDate,
  bookingTime,
  durationMinutes,
  isPaid = false,
  amountPaid,
}: {
  clientName: string
  clientEmail: string
  serviceName: string
  bookingDate?: string
  bookingTime?: string
  durationMinutes?: number
  isPaid?: boolean
  amountPaid?: number
}) {
  const formattedDate = formatBookingDate(bookingDate)

  await sendEmail({
    to: clientEmail,
    subject: isPaid ? `Booking Confirmed — ${serviceName}` : `Booking Request Received — ${serviceName}`,
    html: baseTemplate({
      heading: isPaid ? 'Booking Confirmed' : 'Booking Request Received',
      intro: `Hi ${clientName},`,
      details: [
        `<strong>Service:</strong> ${serviceName}`,
        ...(formattedDate ? [`<strong>Date:</strong> ${formattedDate}`] : []),
        ...(bookingTime ? [`<strong>Time:</strong> ${bookingTime}`] : []),
        ...(durationMinutes ? [`<strong>Duration:</strong> ${durationMinutes} minutes`] : []),
        ...(amountPaid ? [`<strong>Amount paid:</strong> $${amountPaid.toFixed(2)}`] : []),
      ],
      footer: isPaid
        ? "You'll receive a calendar invite shortly."
        : "We've received your booking request and will confirm shortly.",
    }),
  })
}
