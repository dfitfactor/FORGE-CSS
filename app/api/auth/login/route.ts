import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'
import { z } from 'zod'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Race a promise against a timeout so a hung DB connection returns an error
// instead of leaving the request pending indefinitely.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`DB_TIMEOUT after ${ms}ms`)), ms)
    ),
  ])
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = LoginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, password } = parsed.data

    let user: {
      id: string
      email: string
      full_name: string
      role: string
      password_hash: string
      is_active: boolean
    } | null

    try {
      user = await withTimeout(
        db.queryOne<{
          id: string
          email: string
          full_name: string
          role: string
          password_hash: string
          is_active: boolean
        }>(
          `SELECT id, email, full_name, role, password_hash, is_active
           FROM users WHERE email = $1`,
          [email.toLowerCase().trim()]
        ),
        5000
      )
    } catch (dbErr: any) {
      const msg = dbErr?.message || 'Unknown DB error'
      console.error('[auth/login] DB error:', msg)
      // Surface the real error in dev so it is easy to diagnose
      return NextResponse.json(
        { error: 'Database error', detail: msg },
        { status: 503 }
      )
    }

    if (!user || !user.is_active) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id])
      .catch((err) => console.warn('[auth/login] last_login_at update failed:', err.message))

    const token = await createSession(user.id, {
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    })

    cookies().set({
      name: 'forge_session',
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
      maxAge: 60 * 60 * 24 * 7,
    })

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[auth/login] error:', err)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
