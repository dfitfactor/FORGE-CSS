import { Resend } from 'resend'

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
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY')
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromAddress = process.env.RESEND_FROM_EMAIL ||
    'FORGË <onboarding@resend.dev>'

  const formattedDate = bookingDate
    ? new Date(bookingDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric',
        month: 'long', day: 'numeric'
      })
    : null

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;
      margin: 0 auto; padding: 20px; color: #333;">

      <div style="background: #1a0a2e; padding: 24px;
        border-radius: 8px; margin-bottom: 24px;">
        <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">
          FORGË
        </h1>
        <p style="color: #aaa; margin: 4px 0 0; font-size: 12px;">
          DFITFACTOR
        </p>
      </div>

      <h2 style="color: #1a0a2e;">
        ${isPaid ? '✅ Booking Confirmed' : '📋 Booking Request Received'}
      </h2>

      <p>Hi ${clientName},</p>

      <p>
        ${isPaid
          ? 'Your payment was successful and your session is confirmed.'
          : "We've received your booking request and will confirm shortly."}
      </p>

      <div style="background: #f9f9f9; border-left: 4px solid #D4AF37;
        padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px;"><strong>Service:</strong> ${serviceName}</p>
        ${formattedDate ? `<p style="margin: 0 0 8px;"><strong>Date:</strong> ${formattedDate}</p>` : ''}
        ${bookingTime ? `<p style="margin: 0 0 8px;"><strong>Time:</strong> ${bookingTime}</p>` : ''}
        ${durationMinutes ? `<p style="margin: 0 0 8px;"><strong>Duration:</strong> ${durationMinutes} minutes</p>` : ''}
        ${amountPaid ? `<p style="margin: 0;"><strong>Amount paid:</strong> $${amountPaid.toFixed(2)}</p>` : ''}
      </div>

      <p>
        ${isPaid
          ? "You'll receive a calendar invite shortly. Please complete any required forms before your appointment."
          : "We'll confirm your appointment within 24 hours."}
      </p>

      <p style="color: #666; font-size: 14px;">
        Questions? Reply to this email or contact us at
        <a href="mailto:coach@dfitfactor.com">coach@dfitfactor.com</a>
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">
        DFitFactor · FORGË Platform
      </p>
    </body>
    </html>
  `

  await resend.emails.send({
    from: fromAddress,
    to: clientEmail,
    subject: isPaid
      ? `Booking Confirmed — ${serviceName}`
      : `Booking Request Received — ${serviceName}`,
    html,
  })
}
