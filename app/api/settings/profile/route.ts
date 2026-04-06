import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureCoachSettingsColumns } from '@/lib/coach-settings'

const ProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  avatar_url: z.union([z.string().trim().url(), z.literal('')]).optional().nullable(),
  timezone: z.string().trim().min(1).max(255).default('America/New_York'),
  notification_email: z.string().trim().email().max(255),
})

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    await ensureCoachSettingsColumns()

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
              avatar_url,
              timezone,
              notification_email
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
        role: user.role,
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

    const body = await request.json().catch(() => null)
    const parsed = ProfileSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const normalizedEmail = data.email.toLowerCase().trim()
    const normalizedNotificationEmail = data.notification_email.toLowerCase().trim()
    const nextAvatarUrl = data.avatar_url?.trim() ? data.avatar_url.trim() : null

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

    await db.query(
      `UPDATE users
       SET full_name = $1,
           email = $2,
           avatar_url = $3,
           timezone = $4,
           notification_email = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [
        data.full_name.trim(),
        normalizedEmail,
        nextAvatarUrl,
        data.timezone,
        normalizedNotificationEmail,
        session.id,
      ]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[settings/profile] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
