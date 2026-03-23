import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createSession, hashPassword, setSessionCookie } from '@/lib/auth'

const SignupSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = SignupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { full_name, email, password } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    const existing = await db.queryOne<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = $1 LIMIT 1',
      [normalizedEmail]
    )

    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const password_hash = await hashPassword(password)

    const user = await db.queryOne<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, 'coach', true)
       RETURNING id`,
      [normalizedEmail, password_hash, full_name.trim()]
    )

    if (!user?.id) {
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    const token = await createSession(user.id)
    setSessionCookie(token)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[auth/signup] error:', err)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
