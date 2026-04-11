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
    const setting = await getIntegrationSetting('aisha_crm')

    if (!setting?.base_url) {
      return NextResponse.json({ error: 'Add the AI-SHA CRM base URL first' }, { status: 400 })
    }

    if (!setting.api_key) {
      return NextResponse.json({ error: 'Add the AI-SHA CRM API key first' }, { status: 400 })
    }

    const response = await fetch(setting.base_url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${setting.api_key}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const message = response.ok
      ? `Connected successfully (${response.status})`
      : `Connection reached CRM but returned ${response.status}`

    await recordIntegrationTestResult({
      providerKey: 'aisha_crm',
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
        providerKey: 'aisha_crm',
        status: 'failed',
        message,
        actorId: actor.id,
      })
    } catch (recordError) {
      console.error('[integrations/aisha/test] failed to record test result:', recordError)
    }

    console.error('[integrations/aisha/test] POST error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
