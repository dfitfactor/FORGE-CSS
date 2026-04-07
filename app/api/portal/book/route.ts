import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'
import { checkBookingLimits, deductSession, getSessionsRemaining } from '@/lib/session-bank'
import {
  getCoachEmail,
  getPortalBookingContext,
  sendClientBookingReceivedEmail,
  sendCoachBookingRequestEmail,
} from '@/lib/portal-booking'

export async function POST(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const availabilityId = typeof body?.availabilityId === 'string' ? body.availabilityId : null
  if (!availabilityId) {
    return NextResponse.json({ error: 'Availability slot is required' }, { status: 400 })
  }

  try {
    const remainingStatus = await getSessionsRemaining(session.clientId)
    if (!remainingStatus.success || remainingStatus.remaining <= 0 || remainingStatus.expired) {
      return NextResponse.json({ error: 'No sessions remaining' }, { status: 400 })
    }

    const slot = await db.queryOne<{
      id: string
      coach_id: string
      date: string
      start_time: string
      end_time: string
      is_booked: boolean
    }>(
      `SELECT id,
              coach_id,
              date::text AS date,
              start_time::text AS start_time,
              end_time::text AS end_time,
              is_booked
       FROM coach_availability
       WHERE id = $1
       LIMIT 1`,
      [availabilityId]
    )

    if (!slot || slot.is_booked) {
      return NextResponse.json({ error: 'Selected slot is no longer available' }, { status: 400 })
    }

    const scheduledAt = new Date(`${slot.date}T${slot.start_time}`)
    const limitCheck = await checkBookingLimits(session.clientId, scheduledAt)
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.reason }, { status: 400 })
    }

    const context = await getPortalBookingContext(session.clientId)
    if (!context) {
      return NextResponse.json({ error: 'Client booking context not found' }, { status: 404 })
    }

    const result = await db.transaction(async (client) => {
      const lockedSlot = await client.query(
        `SELECT id
         FROM coach_availability
         WHERE id = $1
           AND is_booked = false
         FOR UPDATE`,
        [availabilityId]
      )

      if (!lockedSlot.rows[0]) {
        throw new Error('Selected slot is no longer available')
      }

      const deduction = await deductSession(session.clientId, client)
      const booking = await client.query(
        `INSERT INTO bookings (
           client_id,
           client_name,
           client_email,
           package_id,
           availability_id,
           booking_date,
           booking_time,
           scheduled_at,
           status,
           session_deducted,
           is_makeup,
           notes,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::date, $7::time, $8::timestamptz,
           'pending_confirmation', true, $9, NULL, NOW(), NOW()
         )
         RETURNING id,
                   client_id,
                   client_name,
                   client_email,
                   package_id,
                   availability_id,
                   booking_date::text AS booking_date,
                   booking_time::text AS booking_time,
                   scheduled_at,
                   status,
                   session_deducted,
                   is_makeup`,
        [
          session.clientId,
          context.clientName,
          context.clientEmail,
          context.packageId,
          availabilityId,
          slot.date,
          slot.start_time,
          `${slot.date}T${slot.start_time}`,
          limitCheck.override,
        ]
      )

      await client.query(
        `UPDATE coach_availability
         SET is_booked = true
         WHERE id = $1`,
        [availabilityId]
      )

      return {
        booking: booking.rows[0],
        sessionsRemaining: deduction.remaining,
      }
    })

    const coach = await getCoachEmail(slot.coach_id)
    await Promise.allSettled([
      sendCoachBookingRequestEmail({
        coachEmail: coach.email,
        clientName: context.clientName,
        packageName: context.packageName,
        date: slot.date,
        time: slot.start_time.slice(0, 5),
        sessionsRemaining: result.sessionsRemaining,
      }),
      sendClientBookingReceivedEmail({
        clientEmail: context.clientEmail,
        date: slot.date,
        time: slot.start_time.slice(0, 5),
        sessionsRemaining: result.sessionsRemaining,
      }),
    ])

    return NextResponse.json({
      booking: result.booking,
      sessions_remaining: result.sessionsRemaining,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to book session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
