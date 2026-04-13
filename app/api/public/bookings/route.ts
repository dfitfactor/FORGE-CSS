import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { publicBookingSchema } from '@/lib/booking'
import { sendBookingConfirmation } from '@/lib/email'
import { createAishaLead } from '@/lib/aisha'

type BookingTarget = {
  duration_minutes: number
  name: string
  price_cents: number
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = publicBookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    let durationMinutes: number | null = null
    let bookingName = 'your session'

    if (data.service_id) {
      const service = await db.queryOne<BookingTarget>(
        `SELECT duration_minutes, name, price_cents
         FROM services
         WHERE id = $1 AND is_active = true`,
        [data.service_id]
      )
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 })
      }
      durationMinutes = service.duration_minutes
      bookingName = service.name
    }

    if (data.package_id) {
      const pkg = await db.queryOne<BookingTarget>(
        `SELECT duration_minutes, name, price_cents
         FROM packages
         WHERE id = $1 AND is_active = true`,
        [data.package_id]
      )
      if (!pkg) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      }
      durationMinutes = pkg.duration_minutes
      bookingName = pkg.name
    }

    const booking = await db.queryOne<{ id: string }>(
      `INSERT INTO bookings (
        service_id, package_id, client_name, client_email, client_phone,
        booking_date, booking_time, duration_minutes, notes,
        status, payment_status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        'pending', 'unpaid'
      )
      RETURNING id`,
      [
        data.service_id ?? null,
        data.package_id ?? null,
        data.client_name,
        data.client_email,
        data.client_phone,
        data.booking_date,
        data.booking_time,
        durationMinutes,
        data.notes ?? null,
      ]
    )

    try {
      const [firstName, ...restName] = data.client_name.trim().split(/\s+/)
      const lastName = restName.join(' ')
      const leadGoal = `Requested booking for ${bookingName}`

      const existingLead = await db.queryOne<{ id: string }>(
        `SELECT id
         FROM leads
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [data.client_email]
      )

      if (existingLead) {
        await db.query(
          `UPDATE leads
           SET first_name = COALESCE(first_name, $2),
               last_name = COALESCE(last_name, $3),
               phone = COALESCE(phone, $4),
               source = COALESCE(source, 'website'),
               notes = COALESCE(notes, $5),
               next_action = COALESCE(next_action, 'Review booking request'),
               goal = COALESCE(goal, $6),
               updated_at = NOW()
           WHERE id = $1`,
          [existingLead.id, firstName || null, lastName || null, data.client_phone, data.notes ?? null, leadGoal]
        )
      } else {
        await db.query(
          `INSERT INTO leads (
             first_name,
             last_name,
             email,
             phone,
             source,
             status,
             notes,
             next_action,
             goal,
             raw_payload
           ) VALUES (
             $1, $2, $3, $4, 'website', 'new', $5, 'Review booking request', $6, $7::jsonb
           )`,
          [
            firstName || null,
            lastName || null,
            data.client_email,
            data.client_phone,
            data.notes ?? null,
            leadGoal,
            JSON.stringify({
              event_type: 'lead.created',
              email: data.client_email,
              first_name: firstName || null,
              last_name: lastName || null,
              phone: data.client_phone,
              source: 'website',
              notes: data.notes ?? null,
              goal: leadGoal,
            }),
          ]
        )
      }

      await createAishaLead({
        email: data.client_email,
        first_name: firstName || null,
        last_name: lastName || null,
        phone: data.client_phone,
        source: 'website',
        notes: data.notes ?? null,
        goal: leadGoal,
      })
    } catch (leadError) {
      console.error('Failed to create or sync lead from public booking', leadError)
    }

    try {
      await sendBookingConfirmation({
        clientName: data.client_name,
        clientEmail: data.client_email,
        serviceName: bookingName,
        bookingDate: data.booking_date,
        bookingTime: data.booking_time,
        durationMinutes: Number(durationMinutes ?? 60),
        isPaid: false,
      })
    } catch (emailError) {
      console.error('Failed to send booking request email for public booking', emailError)
    }

    return NextResponse.json({ bookingId: booking?.id, success: true }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create booking' }, { status: 500 })
  }
}
