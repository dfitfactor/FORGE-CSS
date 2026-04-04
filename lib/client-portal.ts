import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { verifyClientToken } from '@/lib/client-auth'

export type PortalClient = {
  id: string
  full_name: string
  email: string
  current_stage: string | null
  primary_goal: string | null
  status: string | null
}

export type PortalBooking = {
  id: string
  service_id: string | null
  package_id: string | null
  client_id: string | null
  client_name: string
  client_email: string
  booking_date: string
  booking_time: string
  duration_minutes: number | null
  status: string
  payment_status: string | null
  notes: string | null
  google_calendar_event_id: string | null
  item_name: string
  amount_cents: number | null
}

export type PortalProtocol = {
  id: string
  name: string | null
  protocol_type: string | null
  created_at: string
  content: unknown
  protocol_payload: unknown
  notes: string | null
}

export type PortalEnrollment = {
  id: string
  package_id: string
  sessions_total: number | null
  sessions_used: number | null
  sessions_remaining: number | null
  sessions_per_week: number | null
  sessions_forfeited: number | null
  start_date: string | null
  end_date: string | null
  payment_status: string | null
  amount_cents: number | null
  status: string
  is_on_hold: boolean | null
  hold_start: string | null
  hold_end: string | null
  package_name: string | null
  package_description: string | null
  billing_type: string | null
  billing_period_months: number | null
  forge_stage: string | null
}

export type PortalFormTemplate = {
  id: string
  name: string
  slug: string
  form_type: string
  description: string | null
}

export async function getPortalClientOrRedirect() {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get('forge_client_session')?.value

  if (!sessionToken) {
    redirect('/portal/auth')
  }

  const session = verifyClientToken(sessionToken)
  if (!session) {
    redirect('/portal/auth')
  }

  const client = await db.queryOne<PortalClient>(
    `SELECT id, full_name, email, current_stage, primary_goal, status
     FROM clients
     WHERE id = $1`,
    [session.clientId]
  ).catch(() => null)

  if (!client) {
    redirect('/portal/auth')
  }

  return { session, client }
}

export async function getPortalBookings(client: PortalClient) {
  return db.query<PortalBooking>(
    `SELECT b.id,
            b.service_id,
            b.package_id,
            b.client_id,
            b.client_name,
            b.client_email,
            b.booking_date::text AS booking_date,
            b.booking_time::text AS booking_time,
            b.duration_minutes,
            b.status,
            b.payment_status,
            b.notes,
            b.google_calendar_event_id,
            b.amount_cents,
            COALESCE(s.name, p.name, 'Session') AS item_name
     FROM bookings b
     LEFT JOIN services s ON b.service_id = s.id
     LEFT JOIN packages p ON b.package_id = p.id
     WHERE b.client_id = $1 OR LOWER(b.client_email) = LOWER($2)
     ORDER BY b.booking_date DESC, b.booking_time DESC`,
    [client.id, client.email]
  ).catch(() => [])
}

export async function getPortalEnrollment(clientId: string) {
  return db.queryOne<PortalEnrollment>(
    `SELECT pe.id,
            pe.package_id,
            pe.sessions_total,
            pe.sessions_used,
            pe.sessions_remaining,
            pe.sessions_per_week,
            pe.sessions_forfeited,
            pe.start_date::text AS start_date,
            pe.end_date::text AS end_date,
            pe.payment_status,
            pe.amount_cents,
            pe.status,
            pe.is_on_hold,
            pe.hold_start::text AS hold_start,
            pe.hold_end::text AS hold_end,
            p.name AS package_name,
            p.description AS package_description,
            p.billing_type,
            p.billing_period_months,
            p.forge_stage
     FROM package_enrollments pe
     LEFT JOIN packages p ON pe.package_id = p.id
     WHERE pe.client_id = $1
     ORDER BY pe.created_at DESC
     LIMIT 1`,
    [clientId]
  ).catch(() => null)
}

export async function getPortalProtocol(clientId: string, protocolId?: string) {
  const baseQuery = `
    SELECT id,
           name,
           protocol_type,
           created_at::text AS created_at,
           content,
           protocol_payload,
           notes
    FROM protocols
    WHERE client_id = $1
  `

  if (protocolId) {
    return db.queryOne<PortalProtocol>(
      `${baseQuery} AND id = $2 LIMIT 1`,
      [clientId, protocolId]
    ).catch(() => null)
  }

  return db.queryOne<PortalProtocol>(
    `${baseQuery} AND is_active = true ORDER BY created_at DESC LIMIT 1`,
    [clientId]
  ).catch(() => null)
}

export async function getPortalForms(clientId: string) {
  const completedForms = await db.query<{ form_template_id: string }>(
    `SELECT form_template_id
     FROM form_submissions
     WHERE client_id = $1
       AND status = 'submitted'
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [clientId]
  ).catch(() => [])

  const completedFormIds = completedForms.map((form) => form.form_template_id)

  const requiredForms = await db.query<PortalFormTemplate>(
    `SELECT id, name, slug, form_type, description
     FROM form_templates
     WHERE form_type IN ('waiver', 'parq')
       AND is_active = true
     ORDER BY name ASC`,
    []
  ).catch(() => [])

  return {
    requiredForms,
    outstandingForms: requiredForms.filter((form) => !completedFormIds.includes(form.id)),
    completedFormIds,
  }
}

export function bookingDateTime(bookingDate: string, bookingTime: string) {
  return new Date(`${bookingDate}T${bookingTime.slice(0, 5)}:00`)
}

export function canClientModifyBooking(booking: Pick<PortalBooking, 'booking_date' | 'booking_time' | 'status'>) {
  if (!['pending', 'approved', 'confirmed', 'rescheduled'].includes(booking.status)) {
    return false
  }

  const hoursUntil = (bookingDateTime(booking.booking_date, booking.booking_time).getTime() - Date.now()) / (1000 * 60 * 60)
  return hoursUntil >= 24
}

export function formatMoney(amountCents: number | null | undefined) {
  if (amountCents === null || amountCents === undefined) return '—'
  return `$${(amountCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

