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
    subject: isPaid ? `Booking Confirmed - ${serviceName}` : `Booking Request Received - ${serviceName}`,
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

export async function sendSubscriptionActivatedEmail({
  clientEmail,
  packageName,
  billingAmount,
  renewalDate,
  sessionsIncluded,
}: {
  clientEmail: string
  packageName: string
  billingAmount: string
  renewalDate: string
  sessionsIncluded: number
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Your FORGË Subscription is Active',
    html: baseTemplate({
      heading: 'Subscription Active',
      intro: `Your ${packageName} subscription is now active.`,
      details: [
        `<strong>Billing amount:</strong> ${billingAmount}`,
        `<strong>Next renewal:</strong> ${renewalDate}`,
        `<strong>Sessions included this cycle:</strong> ${sessionsIncluded}`,
      ],
    }),
  })
}

export async function sendSubscriptionCancelledEmail({
  clientEmail,
  finalDate,
  sessionsRemaining,
}: {
  clientEmail: string
  finalDate: string
  sessionsRemaining: number
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Your FORGË Subscription Has Been Cancelled',
    html: baseTemplate({
      heading: 'Subscription Cancelled',
      intro: 'Your subscription has been set to cancel at the end of the current billing period.',
      details: [
        `<strong>Access continues until:</strong> ${finalDate}`,
        `<strong>Sessions remaining:</strong> ${sessionsRemaining}`,
      ],
    }),
  })
}

export async function sendSubscriptionRenewedEmail({
  clientEmail,
  refreshedCount,
  expirationDate,
  nextRenewalDate,
}: {
  clientEmail: string
  refreshedCount: number
  expirationDate: string
  nextRenewalDate: string
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Subscription Renewed - Sessions Refreshed',
    html: baseTemplate({
      heading: 'Subscription Renewed',
      intro: 'Your subscription payment succeeded and your session bank has been refreshed.',
      details: [
        `<strong>Sessions refreshed:</strong> ${refreshedCount}`,
        `<strong>Sessions expire:</strong> ${expirationDate}`,
        `<strong>Next renewal:</strong> ${nextRenewalDate}`,
      ],
    }),
  })
}

export async function sendPaymentFailedEmail({
  clientEmail,
  gracePeriodEndDate,
  updatePaymentUrl,
}: {
  clientEmail: string
  gracePeriodEndDate: string
  updatePaymentUrl?: string | null
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Payment Failed - Action Required',
    html: baseTemplate({
      heading: 'Payment Failed',
      intro: 'We were unable to process your subscription renewal payment.',
      details: [
        `<strong>Grace period ends:</strong> ${gracePeriodEndDate}`,
        updatePaymentUrl
          ? `<strong>Update payment method:</strong> <a href="${updatePaymentUrl}">${updatePaymentUrl}</a>`
          : '<strong>Next step:</strong> Sign in to your portal to update your payment method.',
      ],
      footer: 'Your access continues during the 7-day grace period.',
    }),
  })
}

export async function sendCoachPaymentFailedEmail({
  coachEmail,
  clientName,
  packageName,
  gracePeriodEndDate,
}: {
  coachEmail: string
  clientName: string
  packageName: string
  gracePeriodEndDate: string
}) {
  await sendEmail({
    to: coachEmail,
    subject: `Client Payment Failed - ${clientName}`,
    html: baseTemplate({
      heading: 'Client Payment Failed',
      intro: `${clientName}'s subscription payment failed.`,
      details: [
        `<strong>Package:</strong> ${packageName}`,
        `<strong>Grace period ends:</strong> ${gracePeriodEndDate}`,
      ],
    }),
  })
}

export async function sendSubscriptionEndedEmail({
  clientEmail,
  sessionsRemaining,
}: {
  clientEmail: string
  sessionsRemaining: number
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Your FORGË Subscription Has Ended',
    html: baseTemplate({
      heading: 'Subscription Ended',
      intro: 'Your FORGË subscription has ended.',
      details: [
        `<strong>Sessions remaining:</strong> ${sessionsRemaining}`,
      ],
      footer: 'Contact your coach if you would like to reactivate your subscription.',
    }),
  })
}

export async function sendUpcomingSessionReminderEmail({
  clientEmail,
  dateTimeLabel,
  portalUrl,
}: {
  clientEmail: string
  dateTimeLabel: string
  portalUrl: string
}) {
  await sendEmail({
    to: clientEmail,
    subject: `Session Tomorrow - ${dateTimeLabel}`,
    html: baseTemplate({
      heading: 'Session Reminder',
      intro: 'You have a confirmed FORGË session tomorrow.',
      details: [
        `<strong>When:</strong> ${dateTimeLabel}`,
        `<strong>Portal:</strong> <a href="${portalUrl}">${portalUrl}</a>`,
      ],
    }),
  })
}

export async function sendSessionExpiryReminderEmail({
  clientEmail,
  daysUntilExpiry,
  sessionsRemaining,
  expirationDate,
  portalUrl,
}: {
  clientEmail: string
  daysUntilExpiry: 7 | 3
  sessionsRemaining: number
  expirationDate: string
  portalUrl: string
}) {
  await sendEmail({
    to: clientEmail,
    subject: daysUntilExpiry === 7
      ? 'Your Sessions Expire in 7 Days'
      : 'Your Sessions Expire in 3 Days - Use Them Now',
    html: baseTemplate({
      heading: 'Session Expiration Reminder',
      intro: `You still have sessions remaining that expire in ${daysUntilExpiry} days.`,
      details: [
        `<strong>Sessions remaining:</strong> ${sessionsRemaining}`,
        `<strong>Expiration date:</strong> ${expirationDate}`,
        `<strong>Book now:</strong> <a href="${portalUrl}">${portalUrl}</a>`,
      ],
    }),
  })
}

export async function sendGracePeriodEndingEmail({
  clientEmail,
  updatePaymentUrl,
}: {
  clientEmail: string
  updatePaymentUrl?: string | null
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Final Notice - Update Payment by Tomorrow',
    html: baseTemplate({
      heading: 'Grace Period Ending',
      intro: 'Your account will pause tomorrow unless your payment method is updated.',
      details: [
        updatePaymentUrl
          ? `<strong>Update payment method:</strong> <a href="${updatePaymentUrl}">${updatePaymentUrl}</a>`
          : '<strong>Next step:</strong> Sign in to your portal and update your payment method today.',
      ],
      footer: 'Contact your coach right away if you need help.',
    }),
  })
}

export async function sendCoachPausedAccountEmail({
  coachEmail,
  clientName,
}: {
  coachEmail: string
  clientName: string
}) {
  await sendEmail({
    to: coachEmail,
    subject: `Client Account Paused - ${clientName}`,
    html: baseTemplate({
      heading: 'Client Account Paused',
      intro: `${clientName}'s grace period has expired and their account is now paused.`,
      footer: 'Manual follow-up may be needed.',
    }),
  })
}
