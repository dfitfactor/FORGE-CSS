import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createClientToken } from '@/lib/client-auth'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(
      new URL('/portal/auth?error=invalid', request.url)
    )
  }

  try {
    const authToken = await db.queryOne<{
      id: string
      client_id: string
      expires_at: string
      used: boolean
    }>(
      `SELECT id, client_id, expires_at::text, used
       FROM client_auth_tokens WHERE token = $1`,
      [token]
    )

    if (!authToken) {
      return NextResponse.redirect(
        new URL('/portal/auth?error=invalid', request.url)
      )
    }

    if (authToken.used) {
      return NextResponse.redirect(
        new URL('/portal/auth?error=used', request.url)
      )
    }

    if (new Date(authToken.expires_at) < new Date()) {
      return NextResponse.redirect(
        new URL('/portal/auth?error=expired', request.url)
      )
    }

    await db.query(
      `UPDATE client_auth_tokens SET used = true WHERE id = $1`,
      [authToken.id]
    )

    const client = await db.queryOne<{ email: string }>(
      `SELECT email FROM clients WHERE id = $1`,
      [authToken.client_id]
    )

    if (!client) {
      return NextResponse.redirect(
        new URL('/portal/auth?error=invalid', request.url)
      )
    }

    const sessionToken = createClientToken(authToken.client_id, client.email)

    const response = NextResponse.redirect(
      new URL('/portal/dashboard', request.url)
    )

    response.cookies.set('forge_client_session', sessionToken, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7
    })

    return response
  } catch (err: any) {
    console.error('[verify]', err)
    return NextResponse.redirect(
      new URL('/portal/auth?error=server', request.url)
    )
  }
}
