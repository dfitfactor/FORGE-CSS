import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { getZohoBooksConfig, buildZohoRedirectUri, getZohoScopeList } from '@/lib/zoho-books'

const ZOHO_STATE_COOKIE = 'forge_zoho_oauth_state'

export async function GET(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.redirect(new URL('/accounting?zoho=unauthorized', request.url))
  }

  try {
    const config = await getZohoBooksConfig()

    if (!config.clientId || !config.clientSecret) {
      return NextResponse.redirect(new URL('/accounting?zoho=missing-client-config', request.url))
    }

    const state = crypto.randomUUID()
    const redirectUri = buildZohoRedirectUri(request)

    const authorizationUrl = new URL(`${config.accountsUrl.replace(/\/$/, '')}/oauth/v2/auth`)
    authorizationUrl.searchParams.set('scope', getZohoScopeList())
    authorizationUrl.searchParams.set('client_id', config.clientId)
    authorizationUrl.searchParams.set('state', state)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('redirect_uri', redirectUri)
    authorizationUrl.searchParams.set('access_type', 'offline')
    authorizationUrl.searchParams.set('prompt', 'consent')

    const response = NextResponse.redirect(authorizationUrl)
    response.cookies.set(ZOHO_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10,
    })

    return response
  } catch (error) {
    console.error('[integrations/zoho-books/oauth/start] GET error:', error)
    return NextResponse.redirect(new URL('/accounting?zoho=oauth-start-failed', request.url))
  }
}
