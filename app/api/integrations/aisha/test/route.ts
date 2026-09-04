import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { getAishaWebhookUrl } from '@/lib/aisha'
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

    if (!setting?.api_key) {
      return NextResponse.json({ error: 'Add the AI-SHA CRM API key first' }, { status: 400 })
    }

    const webhookUrl = await getAishaWebhookUrl()
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${setting.api_key}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        event_type: 'connection.test',
        source_system: 'FORGE_CSS',
        test: true,
        tested_at: new Date().toISOString(),
      }),
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
