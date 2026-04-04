import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getClientBankStatus } from '@/lib/session-bank'

type Enrollment = {
  id: string
  client_id: string
  status: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const enrollment = await db.queryOne<Enrollment>(
      `SELECT *
       FROM package_enrollments
       WHERE client_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.clientId]
    )

    if (!enrollment) {
      return NextResponse.json({ bank: null, enrollment: null, forfeitedEntitlements: [], activeHoldId: null })
    }

    const [bank, forfeitedEntitlements, activeHold] = await Promise.all([
      getClientBankStatus(enrollment.id),
      db.query(
        `SELECT se.id, se.booking_id, se.forfeiture_reason, se.updated_at,
                b.booking_date::text, b.booking_time, s.name AS service_name
         FROM session_entitlements se
         LEFT JOIN bookings b ON b.id = se.booking_id
         LEFT JOIN services s ON s.id = b.service_id
         WHERE se.enrollment_id = $1
           AND se.status = 'forfeited'
         ORDER BY se.updated_at DESC`,
        [enrollment.id]
      ),
      db.queryOne<{ id: string }>(
        `SELECT id
         FROM membership_holds
         WHERE enrollment_id = $1
           AND status = 'active'
         ORDER BY start_date DESC
         LIMIT 1`,
        [enrollment.id]
      ),
    ])

    return NextResponse.json({
      bank,
      enrollment,
      forfeitedEntitlements,
      activeHoldId: activeHold?.id ?? null,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load session bank' }, { status: 500 })
  }
}
