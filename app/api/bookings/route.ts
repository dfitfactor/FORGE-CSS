import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const bookings = await db.query(
      `SELECT
         b.id,
         b.service_id,
         b.package_id,
         b.client_id,
         b.enrollment_id,
         b.entitlement_id,
         b.client_name,
         b.client_email,
         b.client_phone,
         b.booking_date::text as booking_date,
         b.booking_time::text as booking_time,
         b.duration_minutes,
         b.status,
         b.payment_status,
         b.attended,
         b.notes,
         b.google_calendar_event_id,
         b.cancelled_at,
         b.created_at,
         b.updated_at,
         s.name as service_name,
         p.name as package_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN packages p ON b.package_id = p.id
       ORDER BY b.booking_date DESC, b.booking_time DESC`
    )

    return NextResponse.json({ bookings })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load bookings' }, { status: 500 })
  }
}
