import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, getEffectiveRole, getSession, setSessionCookie } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureCoachSettingsColumns, getCoachSettingsColumnSupport } from '@/lib/coach-settings'

const ProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  avatar_url: z.string().trim().max(2000).optional().nullable(),
  timezone: z.string().trim().min(1).max(255).default('America/New_York'),
  notification_email: z.string().trim().max(255).optional().nullable(),
})

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    await ensureCoachSettingsColumns()
    const columns = await getCoachSettingsColumnSupport()

    const user = await db.queryOne<{
      id: string
      full_name: string
      email: string
      role: string
      avatar_url: string | null
      timezone: string | null
      notification_email: string | null
    }>(
      `SELECT id,
              full_name,
              email,
              role,
              ${columns.avatarUrl ? 'avatar_url' : "NULL::text AS avatar_url"},
              ${columns.timezone ? 'timezone' : "NULL::text AS timezone"},
              ${columns.notificationEmail ? 'notification_email' : "NULL::text AS notification_email"}
       FROM users
       WHERE id = $1
         AND is_active = true`,
      [session.id]
    )

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: getEffectiveRole(user.email, user.role),
        avatar_url: user.avatar_url,
        timezone: user.timezone || 'America/New_York',
        notification_email: user.notification_email || user.email,
      },
    })
  } catch (err) {
    console.error('[settings/profile] GET error:', err)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    await ensureCoachSettingsColumns()
    const columns = await getCoachSettingsColumnSupport()

    const body = await request.json().catch(() => null)
    const parsed = ProfileSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const normalizedEmail = data.email.toLowerCase().trim()
    const normalizedNotificationEmail = data.notification_email?.trim()
      ? data.notification_email.trim().toLowerCase()
      : normalizedEmail

    let nextAvatarUrl: string | null = data.avatar_url?.trim() ? data.avatar_url.trim() : null
    if (nextAvatarUrl) {
      try {
        nextAvatarUrl = new URL(nextAvatarUrl).toString()
      } catch {
        nextAvatarUrl = null
      }
    }

    const existing = await db.queryOne<{ id: string }>(
      `SELECT id FROM users
       WHERE lower(email) = $1
         AND id <> $2
       LIMIT 1`,
      [normalizedEmail, session.id]
    )

    if (existing) {
      return NextResponse.json({ error: 'Another account already uses this email' }, { status: 409 })
    }

    const values: Array<string | null> = [
      data.full_name.trim(),
      normalizedEmail,
    ]

    const updates = [
      'full_name = $1',
      'email = $2',
    ]

    if (columns.avatarUrl) {
      values.push(nextAvatarUrl)
      updates.push(`avatar_url = $${values.length}`)
    }

    if (columns.timezone) {
      values.push(data.timezone)
      updates.push(`timezone = $${values.length}`)
    }

    if (columns.notificationEmail) {
      values.push(normalizedNotificationEmail)
      updates.push(`notification_email = $${values.length}`)
    }

    if (columns.updatedAt) {
      updates.push('updated_at = NOW()')
    }

    values.push(session.id)

    await db.query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${values.length}`,
      values
    )

    const refreshedToken = await createSession(session.id)
    setSessionCookie(refreshedToken)

    return NextResponse.json({
      success: true,
      user: {
        id: session.id,
        full_name: data.full_name.trim(),
        email: normalizedEmail,
        avatar_url: columns.avatarUrl ? nextAvatarUrl : null,
        timezone: columns.timezone ? data.timezone : 'America/New_York',
        notification_email: columns.notificationEmail ? normalizedNotificationEmail : normalizedEmail,
      },
    })
  } catch (err) {
    console.error('[settings/profile] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
