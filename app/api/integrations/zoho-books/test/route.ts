import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { getIntegrationSetting, recordIntegrationTestResult } from '@/lib/integration-settings'

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const setting = await getIntegrationSetting('zoho_books')
    const config = (setting?.config ?? {}) as { organization_id?: string | null }

    if (!setting?.base_url) {
      return NextResponse.json({ error: 'Add the Zoho Books base URL first' }, { status: 400 })
    }

    if (!setting.api_key) {
      return NextResponse.json({ error: 'Add the Zoho Books API key first' }, { status: 400 })
    }

    const testUrl = config.organization_id
      ? `${setting.base_url}/organizations/${config.organization_id}`
      : setting.base_url

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${setting.api_key}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const message = response.ok
      ? `Connected successfully (${response.status})`
      : `Connection reached Zoho Books but returned ${response.status}`

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
