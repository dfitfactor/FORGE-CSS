import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createClientToken } from '@/lib/client-auth'

export async function POST(request: NextRequest) {
  try {
    const { email, dateOfBirth } = await request.json()

    if (!email || !dateOfBirth) {
      return NextResponse.json(
        { error: 'Email and date of birth are required.' },
        { status: 400 }
      )
    }

    const client = await db.queryOne<{ id: string; email: string }>(
      `SELECT id, email
       FROM clients
       WHERE LOWER(email) = LOWER($1)
         AND date_of_birth = $2::date
         AND status != 'archived'
       LIMIT 1`,
      [email, dateOfBirth]
    )

    if (!client) {
      return NextResponse.json(
        { error: 'We could not verify those details.' },
        { status: 401 }
      )
    }

    const sessionToken = createClientToken(client.id, client.email)
    const response = NextResponse.json({ success: true })

    response.cookies.set('forge_client_session', sessionToken, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch (err) {
    console.error('[portal/login]', err)
    return NextResponse.json(
      { error: 'Failed to sign in' },
      { status: 500 }
    )
  }
}
