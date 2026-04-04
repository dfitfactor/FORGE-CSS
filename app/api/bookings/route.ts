import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

let cachedBookingColumns: Set<string> | null = null

async function getBookingColumns() {
  if (cachedBookingColumns) return cachedBookingColumns

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'bookings'`
  )

  cachedBookingColumns = new Set(rows.map((row) => row.column_name))
  return cachedBookingColumns
}

function hasColumn(columns: Set<string>, column: string) {
  return columns.has(column)
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const columns = await getBookingColumns()
    const selectColumns = [
      'b.id',
      'b.service_id',
      'b.package_id',
      hasColumn(columns, 'client_id') ? 'b.client_id' : 'NULL::uuid as client_id',
      hasColumn(columns, 'enrollment_id') ? 'b.enrollment_id' : 'NULL::uuid as enrollment_id',
      hasColumn(columns, 'entitlement_id') ? 'b.entitlement_id' : 'NULL::uuid as entitlement_id',
      'b.client_name',
      'b.client_email',
      'b.client_phone',
      'b.booking_date::text as booking_date',
      'b.booking_time::text as booking_time',
      'b.duration_minutes',
      'b.status',
      'b.payment_status',
      'b.attended',
      'b.notes',
      hasColumn(columns, 'google_calendar_event_id') ? 'b.google_calendar_event_id' : 'NULL::text as google_calendar_event_id',
      hasColumn(columns, 'cancelled_at') ? 'b.cancelled_at' : 'NULL::timestamptz as cancelled_at',
      hasColumn(columns, 'created_at') ? 'b.created_at' : 'NOW() as created_at',
      hasColumn(columns, 'updated_at') ? 'b.updated_at' : 'NOW() as updated_at',
      's.name as service_name',
      'p.name as package_name',
    ]

    const bookings = await db.query(
      `SELECT ${selectColumns.join(', ')}
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
