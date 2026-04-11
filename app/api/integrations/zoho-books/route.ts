import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { getIntegrationSetting, maskApiKey, upsertIntegrationSetting } from '@/lib/integration-settings'

const ZohoBooksSchema = z.object({
  display_name: z.string().trim().min(2).max(120).default('FORGE CSS Zoho Books'),
  integration_type: z.string().trim().min(1).max(80).default('accounting'),
  api_key: z.string().trim().max(500).optional().nullable(),
  base_url: z.string().trim().max(500).optional().nullable(),
  is_enabled: z.boolean().default(false),
  organization_id: z.string().trim().max(120).optional().nullable(),
})

function serializeSetting(setting: Awaited<ReturnType<typeof getIntegrationSetting>>) {
  const config = (setting?.config ?? {}) as { organization_id?: string | null }

  return {
    provider_key: 'zoho_books',
    display_name: setting?.display_name ?? 'FORGE CSS Zoho Books',
    integration_type: setting?.integration_type ?? 'accounting',
    api_key_masked: maskApiKey(setting?.api_key),
    has_api_key: Boolean(setting?.api_key),
    base_url: setting?.base_url ?? '',
    is_enabled: setting?.is_enabled ?? false,
    organization_id: config.organization_id ?? '',
    last_test_status: setting?.last_test_status ?? null,
    last_test_message: setting?.last_test_message ?? null,
    last_tested_at: setting?.last_tested_at ?? null,
    finance_scope: {
      primary_ledger: 'Zoho Books',
      inbound_sources: ['Stripe', 'Venmo', 'PayPal', 'manual invoices'],
      first_sync_event: 'package sale or invoice creation',
      reconciliation_goal: 'single accounting source of truth',
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
    const setting = await getIntegrationSetting('zoho_books')
    return NextResponse.json({ integration: serializeSetting(setting) })
  } catch (error) {
    console.error('[integrations/zoho-books] GET error:', error)
    return NextResponse.json({ error: 'Failed to load Zoho Books integration' }, { status: 500 })
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
    const parsed = ZohoBooksSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    let normalizedBaseUrl: string | null = data.base_url?.trim() ? data.base_url.trim() : null
    if (normalizedBaseUrl) {
      normalizedBaseUrl = new URL(normalizedBaseUrl).toString().replace(/\/$/, '')
    }

    const setting = await upsertIntegrationSetting({
      providerKey: 'zoho_books',
      displayName: data.display_name,
      integrationType: data.integration_type,
      apiKey: data.api_key?.trim() ? data.api_key.trim() : null,
      baseUrl: normalizedBaseUrl,
      isEnabled: data.is_enabled,
      config: {
        organization_id: data.organization_id?.trim() || null,
        sync_scope: 'finance_reconciliation_and_invoicing',
      },
      actorId: actor.id,
    })

    return NextResponse.json({
      success: true,
      integration: serializeSetting(setting),
    })
  } catch (error) {
    console.error('[integrations/zoho-books] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to save Zoho Books integration' }, { status: 500 })
  }
}
