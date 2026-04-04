import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/client-auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getClientSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const bookings = await db.query(
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
      [session.clientId, session.email]
    )

    return NextResponse.json({ bookings })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load bookings' },
      { status: 500 }
    )
  }
}
