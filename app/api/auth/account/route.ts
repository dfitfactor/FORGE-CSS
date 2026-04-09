import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, getSession, hashPassword, setSessionCookie, verifyPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureCoachSettingsColumns, getCoachSettingsColumnSupport } from '@/lib/coach-settings'

const AccountSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  avatar_url: z.string().trim().max(500000).optional().nullable(),
  current_password: z.string().optional(),
  new_password: z.union([z.string().min(8).max(128), z.literal('')]).optional(),
})

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  await ensureCoachSettingsColumns()
  const columns = await getCoachSettingsColumnSupport()

  const user = await db.queryOne<{
    id: string
    email: string
    full_name: string
    role: string
    avatar_url: string | null
  }>(
    `SELECT id,
            email,
            full_name,
            role,
            ${columns.avatarUrl ? 'avatar_url' : "NULL::text AS avatar_url"}
     FROM users
     WHERE id = $1 AND is_active = true`,
    [session.id]
  )

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ user })
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    await ensureCoachSettingsColumns()
    const columns = await getCoachSettingsColumnSupport()

    const body = await request.json().catch(() => null)
    const parsed = AccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const normalizedEmail = data.email.toLowerCase().trim()
    let nextAvatarUrl = data.avatar_url?.trim() ? data.avatar_url.trim() : null

    if (nextAvatarUrl) {
      if (nextAvatarUrl.startsWith('data:image/')) {
        nextAvatarUrl = nextAvatarUrl
      } else {
        try {
          nextAvatarUrl = new URL(nextAvatarUrl).toString()
        } catch {
          nextAvatarUrl = null
        }
      }
    }

    const currentUser = await db.queryOne<{
      id: string
      email: string
      password_hash: string
    }>(
      'SELECT id, email, password_hash FROM users WHERE id = $1 AND is_active = true',
      [session.id]
    )

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const existing = await db.queryOne<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1',
      [normalizedEmail, session.id]
    )

    if (existing) {
      return NextResponse.json({ error: 'Another account already uses this email' }, { status: 409 })
    }

    const wantsPasswordChange = Boolean(data.new_password && data.new_password.trim())
    let passwordHashToSave: string | null = null

    if (wantsPasswordChange) {
      if (!data.current_password) {
        return NextResponse.json({ error: 'Current password is required to change your password' }, { status: 400 })
      }

      const isValid = await verifyPassword(data.current_password, currentUser.password_hash)
      if (!isValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
      }

      passwordHashToSave = await hashPassword(data.new_password!.trim())
    }

    const values: Array<string | null> = [data.full_name.trim(), normalizedEmail]
    const updates = ['full_name = $1', 'email = $2']

    if (columns.avatarUrl) {
      values.push(nextAvatarUrl)
      updates.push(`avatar_url = $${values.length}`)
    }

    if (passwordHashToSave) {
      values.push(passwordHashToSave)
      updates.push(`password_hash = $${values.length}`)
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

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[auth/account] error:', err)
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
  }
}

