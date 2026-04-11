import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { recordIntegrationTestResult } from '@/lib/integration-settings'
import { getZohoBooksConfig, refreshZohoAccessToken } from '@/lib/zoho-books'

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const config = await getZohoBooksConfig()

    if (!config.clientId) {
      return NextResponse.json({ error: 'Add the Zoho client ID first' }, { status: 400 })
    }

    if (!config.clientSecret) {
      return NextResponse.json({ error: 'Add the Zoho client secret first' }, { status: 400 })
    }

    if (!config.organizationId) {
      return NextResponse.json({ error: 'Add the Zoho organization ID first' }, { status: 400 })
    }

    if (!config.refreshToken) {
      return NextResponse.json({ error: 'Authorize Zoho Books first to generate a refresh token' }, { status: 400 })
    }

    const token = await refreshZohoAccessToken(config)

    const response = await fetch(
      `${token.apiDomain.replace(/\/$/, '')}/books/v3/contacts?organization_id=${encodeURIComponent(config.organizationId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${token.accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    )

    const message = response.ok
      ? `Connected successfully (${response.status})`
      : `Zoho Books responded with ${response.status}`

    await recordIntegrationTestResult({
      providerKey: 'zoho_books',
      status: response.ok ? 'connected' : 'failed',
      message,
      actorId: actor.id,
    })

    return NextResponse.json({
      success: response.ok,
      status: response.ok ? 'connected' : 'failed',
      message,
      http_status: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed'

    try {
      await recordIntegrationTestResult({
        providerKey: 'zoho_books',
        status: 'failed',
        message,
        actorId: actor.id,
      })
    } catch (recordError) {
      console.error('[integrations/zoho-books/test] failed to record test result:', recordError)
    }

    console.error('[integrations/zoho-books/test] POST error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
