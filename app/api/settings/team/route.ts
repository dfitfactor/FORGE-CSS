import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureCoachSettingsColumns, getCoachSettingsColumnSupport } from '@/lib/coach-settings'

const SUPERUSER_EMAIL = 'coach@dfitfactor.com'

const UpdateTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'regular']),
})

type TeamUserRow = {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'coach' | 'client'
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

function mapUser(row: TeamUserRow) {
  const isSuperuser = row.email.toLowerCase() === SUPERUSER_EMAIL

  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    access_level: row.role === 'admin' ? 'admin' : 'regular',
    is_superuser: isSuperuser,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (actor.email.toLowerCase() !== SUPERUSER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const users = await db.query<TeamUserRow>(
      `SELECT id,
              full_name,
              email,
              role,
              is_active,
              last_login_at,
              created_at
       FROM users
       WHERE role IN ('admin', 'coach')
       ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
                lower(full_name),
                created_at ASC`
    )

    return NextResponse.json({
      users: users.map(mapUser),
      subscription_mode: 'free_admin_during_build',
      superuser_email: SUPERUSER_EMAIL,
    })
  } catch (err) {
    console.error('[settings/team] GET error:', err)
    return NextResponse.json({ error: 'Failed to load team access' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (actor.email.toLowerCase() !== SUPERUSER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    await ensureCoachSettingsColumns()
    const columns = await getCoachSettingsColumnSupport()

    const body = await request.json().catch(() => null)
    const parsed = UpdateTeamMemberSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { userId, role } = parsed.data
    const nextRole = role === 'admin' ? 'admin' : 'coach'

    const targetUser = await db.queryOne<TeamUserRow>(
      `SELECT id,
              full_name,
              email,
              role,
              is_active,
              last_login_at,
              created_at
       FROM users
       WHERE id = $1
         AND role IN ('admin', 'coach')`,
      [userId]
    )

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const targetIsSuperuser = targetUser.email.toLowerCase() === SUPERUSER_EMAIL

    if (role === 'admin' && !targetIsSuperuser) {
      return NextResponse.json({ error: 'Only coach@dfitfactor.com can hold superuser access' }, { status: 400 })
    }

    if (role === 'regular' && targetIsSuperuser) {
      return NextResponse.json({ error: 'coach@dfitfactor.com must remain the superuser' }, { status: 400 })
    }

    if (targetUser.id === actor.id && nextRole !== 'admin') {
      return NextResponse.json({ error: 'You cannot remove your own admin access' }, { status: 400 })
    }

    if (targetUser.role === 'admin' && nextRole !== 'admin') {
      const adminCount = await db.queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM users
         WHERE role = 'admin'
           AND is_active = true`
      )

      if (Number(adminCount?.count ?? '0') <= 1) {
        return NextResponse.json({ error: 'At least one active admin is required' }, { status: 400 })
      }
    }

    const updates = ['role = $1']
    if (columns.updatedAt) {
      updates.push('updated_at = NOW()')
    }

    const updated = await db.queryOne<TeamUserRow>(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $2
       RETURNING id,
                 full_name,
                 email,
                 role,
                 is_active,
                 last_login_at,
                 created_at`,
      [nextRole, userId]
    )

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: mapUser(updated),
    })
  } catch (err) {
    console.error('[settings/team] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}
