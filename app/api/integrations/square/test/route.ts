import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { recordIntegrationTestResult } from '@/lib/integration-settings'
import { testSquareConnection } from '@/lib/square'

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const result = await testSquareConnection()
    const locationMessage = result.matchedLocation
      ? `Connected successfully. Location ${result.matchedLocation.id} is available.`
      : `Connected successfully. ${result.locationCount} location(s) found.`

    await recordIntegrationTestResult({
      providerKey: 'square',
      status: 'connected',
      message: locationMessage,
      actorId: actor.id,
    })

    return NextResponse.json({
      success: true,
      status: 'connected',
      message: locationMessage,
      matched_location_id: result.matchedLocation?.id ?? null,
      location_count: result.locationCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square connection failed'

    try {
      await recordIntegrationTestResult({
        providerKey: 'square',
        status: 'failed',
        message,
        actorId: actor.id,
      })
    } catch (recordError) {
      console.error('[integrations/square/test] failed to record test result:', recordError)
    }

    console.error('[integrations/square/test] POST error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
