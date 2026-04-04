import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { liftHold } from '@/lib/session-bank'

const actionSchema = z.object({
  action: z.enum(['approve', 'cancel', 'lift']),
})

const SUPERUSER_EMAIL = 'coach@dfitfactor.com'

function formatDateOnly(value: Date) {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function isAdminUser(userId: string) {
  const [user, adminRole] = await Promise.all([
    db.queryOne<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [userId]),
    db.queryOne<{ role: string }>(
      `SELECT role FROM admin_roles
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [userId]
    ),
  ])

  return user?.email?.toLowerCase() === SUPERUSER_EMAIL || Boolean(adminRole)
}

async function freezeApprovedHold(enrollmentId: string, holdId: string, reason: string) {
  const billingPeriod = formatDateOnly(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  await db.query(
    `UPDATE session_bank
     SET is_frozen = true,
         frozen_at = NOW(),
         freeze_reason = $3,
         hold_id = $2,
         grace_period_expires = grace_period_expires + COALESCE((
           SELECT ((end_date - start_date) || ' days')::interval
           FROM membership_holds
           WHERE id = $2
         ), INTERVAL '0 days')
     WHERE enrollment_id = $1
       AND billing_period = $4`,
    [enrollmentId, holdId, reason, billingPeriod]
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string; holdId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const hold = await db.queryOne<{
      id: string
      enrollment_id: string
      start_date: string
      end_date: string
      reason: string | null
      status: string
    }>(
      `SELECT id, enrollment_id, start_date::text, end_date::text, reason, status
       FROM membership_holds
       WHERE id = $1 AND client_id = $2
       LIMIT 1`,
      [params.holdId, params.clientId]
    )

    if (!hold) {
      return NextResponse.json({ error: 'Hold not found' }, { status: 404 })
    }

    if (parsed.data.action === 'approve') {
      const isAdmin = await isAdminUser(session.id)
      if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

      await db.query(
        `UPDATE membership_holds
         SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [params.holdId, session.id]
      )

      if (hold.start_date <= formatDateOnly(new Date())) {
        await freezeApprovedHold(hold.enrollment_id, params.holdId, hold.reason ?? 'Membership hold')
        await db.query(
          `UPDATE package_enrollments
           SET is_on_hold = true, updated_at = NOW()
           WHERE id = $1`,
          [hold.enrollment_id]
        )
        await db.query(
          `UPDATE membership_holds
           SET status = 'active', updated_at = NOW()
           WHERE id = $1`,
          [params.holdId]
        )
      }
    }

    if (parsed.data.action === 'cancel') {
      await db.query(
        `UPDATE membership_holds
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1`,
        [params.holdId]
      )

      if (hold.status === 'active') {
        await liftHold(params.holdId, session.id)
      }
    }

    if (parsed.data.action === 'lift') {
      await liftHold(params.holdId, session.id)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update hold' }, { status: 500 })
  }
}
