import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, getSession, hashPassword, setSessionCookie, verifyPassword } from '@/lib/auth'
import { db } from '@/lib/db'

const AccountSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  avatar_url: z.union([z.string().trim().url(), z.literal('')]).optional().nullable(),
  current_password: z.string().optional(),
  new_password: z.union([z.string().min(8).max(128), z.literal('')]).optional(),
})

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const user = await db.queryOne<{
    id: string
    email: string
    full_name: string
    role: string
    avatar_url: string | null
  }>(
    'SELECT id, email, full_name, role, avatar_url FROM users WHERE id = $1 AND is_active = true',
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
    const body = await request.json().catch(() => null)
    const parsed = AccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const normalizedEmail = data.email.toLowerCase().trim()
    const nextAvatarUrl = data.avatar_url?.trim() ? data.avatar_url.trim() : null

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

    if (passwordHashToSave) {
      await db.query(
        `UPDATE users
         SET full_name = $1,
             email = $2,
             avatar_url = $3,
             password_hash = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [data.full_name.trim(), normalizedEmail, nextAvatarUrl, passwordHashToSave, session.id]
      )
    } else {
      await db.query(
        `UPDATE users
         SET full_name = $1,
             email = $2,
             avatar_url = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [data.full_name.trim(), normalizedEmail, nextAvatarUrl, session.id]
      )
    }

    const refreshedToken = await createSession(session.id)
    setSessionCookie(refreshedToken)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[auth/account] error:', err)
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
  }
}
