import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { getIntegrationSetting, maskApiKey, upsertIntegrationSetting } from '@/lib/integration-settings'

const AishaIntegrationSchema = z.object({
  display_name: z.string().trim().min(2).max(120).default('FORGE CSS'),
  integration_type: z.string().trim().min(1).max(80).default('other'),
  api_key: z.string().trim().max(500).optional().nullable(),
  base_url: z.string().trim().max(500).optional().nullable(),
  is_enabled: z.boolean().default(false),
})

function serializeSetting(setting: Awaited<ReturnType<typeof getIntegrationSetting>>) {
  return {
    provider_key: 'aisha_crm',
    display_name: setting?.display_name ?? 'FORGE CSS',
    integration_type: setting?.integration_type ?? 'other',
    api_key_masked: maskApiKey(setting?.api_key),
    has_api_key: Boolean(setting?.api_key),
    base_url: setting?.base_url ?? '',
    is_enabled: setting?.is_enabled ?? false,
    last_test_status: setting?.last_test_status ?? null,
    last_test_message: setting?.last_test_message ?? null,
    last_tested_at: setting?.last_tested_at ?? null,
    sync_scope: {
      leads_owned_by: 'AI-SHA CRM',
      active_clients_owned_by: 'FORGE CSS',
      first_sync_event: 'public inquiry or booking request',
      conversion_handoff: 'lead converted to active paying client',
    },
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const setting = await getIntegrationSetting('aisha_crm')
    return NextResponse.json({ integration: serializeSetting(setting) })
  } catch (error) {
    console.error('[integrations/aisha] GET error:', error)
    return NextResponse.json({ error: 'Failed to load CRM integration' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request)
  let actor

  try {
    actor = requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    const parsed = AishaIntegrationSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    let normalizedBaseUrl: string | null = data.base_url?.trim() ? data.base_url.trim() : null
    if (normalizedBaseUrl) {
      normalizedBaseUrl = new URL(normalizedBaseUrl).toString().replace(/\/$/, '')
    }

    const setting = await upsertIntegrationSetting({
      providerKey: 'aisha_crm',
      displayName: data.display_name,
      integrationType: data.integration_type,
      apiKey: data.api_key?.trim() ? data.api_key.trim() : null,
      baseUrl: normalizedBaseUrl,
      isEnabled: data.is_enabled,
      config: {
        sync_scope: 'lead_intake_to_active_client_handoff',
      },
      actorId: actor.id,
    })

    return NextResponse.json({
      success: true,
      integration: serializeSetting(setting),
    })
  } catch (error) {
    console.error('[integrations/aisha] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to save CRM integration' }, { status: 500 })
  }
}
