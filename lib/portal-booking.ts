import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'

export type BookableSlot = {
  id: string
  coach_id: string
  date: string
  start_time: string
  end_time: string
  is_booked: boolean
}

export type PortalClientBookingContext = {
  clientId: string
  clientName: string
  clientEmail: string
  packageId: string | null
  packageName: string
}

export async function getPortalBookingContext(clientId: string) {
  return db.queryOne<PortalClientBookingContext>(
    `SELECT c.id AS client_id,
            c.full_name AS client_name,
            c.email AS client_email,
            pe.package_id,
            COALESCE(p.name, 'Coaching Session') AS package_name
     FROM clients c
     LEFT JOIN package_enrollments pe
       ON pe.client_id = c.id
      AND pe.status = 'active'
     LEFT JOIN packages p
       ON p.id = pe.package_id
     WHERE c.id = $1
     ORDER BY pe.created_at DESC NULLS LAST
     LIMIT 1`,
    [clientId]
  )
}

export async function getCoachEmail(coachId: string) {
  const coach = await db.queryOne<{ email: string | null; full_name: string | null }>(
    `SELECT email, full_name
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [coachId]
  )

  return {
    email: coach?.email ?? 'coach@dfitfactor.com',
    name: coach?.full_name ?? 'Coach',
  }
}

export async function sendCoachBookingRequestEmail({
  coachEmail,
  clientName,
  packageName,
  date,
  time,
  sessionsRemaining,
}: {
  coachEmail: string
  clientName: string
  packageName: string
  date: string
  time: string
  sessionsRemaining: number
}) {
  await sendEmail({
    to: coachEmail,
    subject: `New Session Request — ${clientName}`,
    html: `
      <p>${clientName} requested a session.</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Package:</strong> ${packageName}</p>
      <p><strong>Sessions remaining after deduction:</strong> ${sessionsRemaining}</p>
    `,
  })
}

export async function sendClientBookingReceivedEmail({
  clientEmail,
  date,
  time,
  sessionsRemaining,
}: {
  clientEmail: string
  date: string
  time: string
  sessionsRemaining: number
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Session Request Received',
    html: `
      <p>Your session request has been received.</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Sessions remaining:</strong> ${sessionsRemaining}</p>
      <p>One session has been deducted pending coach confirmation.</p>
    `,
  })
}

export async function sendClientBookingConfirmedEmail({
  clientEmail,
  date,
  time,
  sessionsRemaining,
  calendarLink,
}: {
  clientEmail: string
  date: string
  time: string
  sessionsRemaining: number
  calendarLink: string | null
}) {
  await sendEmail({
    to: clientEmail,
    subject: `Session Confirmed — ${date} ${time}`,
    html: `
      <p>Your session is confirmed.</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Sessions remaining:</strong> ${sessionsRemaining}</p>
      ${calendarLink ? `<p><a href="${calendarLink}">Open Google Calendar event</a></p>` : ''}
    `,
  })
}

export async function sendClientBookingDeclinedEmail({
  clientEmail,
  date,
  time,
  sessionsRemaining,
}: {
  clientEmail: string
  date: string
  time: string
  sessionsRemaining: number
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Session Request Declined',
    html: `
      <p>Your session request was declined.</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Session restored to bank:</strong> yes</p>
      <p><strong>Sessions remaining:</strong> ${sessionsRemaining}</p>
      <p>Please rebook a different time.</p>
    `,
  })
}

export async function sendCoachCancellationEmail({
  coachEmail,
  clientName,
  date,
  time,
}: {
  coachEmail: string
  clientName: string
  date: string
  time: string
}) {
  await sendEmail({
    to: coachEmail,
    subject: `Session Cancelled — ${clientName}`,
    html: `
      <p>${clientName} cancelled a session.</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p>The session was not restored to the client bank.</p>
    `,
  })
}

export async function sendClientCancellationEmail({
  clientEmail,
  date,
  time,
}: {
  clientEmail: string
  date: string
  time: string
}) {
  await sendEmail({
    to: clientEmail,
    subject: 'Session Cancelled',
    html: `
      <p>Your session has been cancelled.</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p>Your session has been forfeited per the cancellation policy.</p>
    `,
  })
}
