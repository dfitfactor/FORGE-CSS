import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { getIntegrationSetting, recordIntegrationTestResult, upsertIntegrationSetting } from '@/lib/integration-settings'
import { buildZohoRedirectUri, exchangeZohoCodeForTokens, getZohoBooksConfig } from '@/lib/zoho-books'

const ZOHO_STATE_COOKIE = 'forge_zoho_oauth_state'

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.redirect(new URL('/accounting?zoho=unauthorized', request.url))
  }

  const redirectToAccounting = (status: string) => NextResponse.redirect(new URL(`/accounting?zoho=${status}`, request.url))

  try {
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const error = request.nextUrl.searchParams.get('error')
    const location = request.nextUrl.searchParams.get('location')
    const accountsServer = request.nextUrl.searchParams.get('accounts-server')
    const cookieState = request.cookies.get(ZOHO_STATE_COOKIE)?.value

    if (error) {
      return redirectToAccounting('oauth-denied')
    }

    if (!code || !state || !cookieState || state !== cookieState) {
      return redirectToAccounting('invalid-state')
    }

    const config = await getZohoBooksConfig()
    if (!config.clientId || !config.clientSecret) {
      return redirectToAccounting('missing-client-config')
    }

    const tokens = await exchangeZohoCodeForTokens({
      accountsUrl: config.accountsUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri: buildZohoRedirectUri(request),
    })

    const existing = await getIntegrationSetting('zoho_books')
    const existingConfig = (existing?.config ?? {}) as Record<string, unknown>
    const normalizedAccountsUrl = accountsServer?.trim()
      ? accountsServer.trim().replace(/\/$/, '')
      : config.accountsUrl
    const nextBaseUrl = tokens.api_domain
      ? `${tokens.api_domain.replace(/\/$/, '')}/books/v3`
      : config.baseUrl

    await upsertIntegrationSetting({
      providerKey: 'zoho_books',
      displayName: config.displayName,
      integrationType: config.integrationType,
      apiKey: null,
      baseUrl: nextBaseUrl,
      isEnabled: config.isEnabled,
      config: {
        ...existingConfig,
        accounts_url: normalizedAccountsUrl,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        organization_id: config.organizationId || existingConfig.organization_id || null,
        refresh_token: tokens.refresh_token || config.refreshToken || existingConfig.refresh_token || null,
        location: location || tokens.location || existingConfig.location || null,
      },
      actorId: actor.id,
    })

    await recordIntegrationTestResult({
      providerKey: 'zoho_books',
      status: 'connected',
      message: 'OAuth connected successfully',
      actorId: actor.id,
    })

    const response = redirectToAccounting('oauth-connected')
    response.cookies.set(ZOHO_STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (error) {
    console.error('[integrations/zoho-books/oauth/callback] GET error:', error)
    return redirectToAccounting('oauth-failed')
  }
}
