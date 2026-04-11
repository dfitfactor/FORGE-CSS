import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { getIntegrationSetting, maskApiKey, upsertIntegrationSetting } from '@/lib/integration-settings'
import { buildZohoRedirectUri, getZohoScopeList } from '@/lib/zoho-books'

const ZohoBooksSchema = z.object({
  display_name: z.string().trim().min(2).max(120).default('FORGE CSS Zoho Books'),
  integration_type: z.string().trim().min(1).max(80).default('accounting'),
  client_id: z.string().trim().max(255).optional().nullable(),
  client_secret: z.string().trim().max(255).optional().nullable(),
  accounts_url: z.string().trim().max(500).optional().nullable(),
  base_url: z.string().trim().max(500).optional().nullable(),
  organization_id: z.string().trim().max(120).optional().nullable(),
  is_enabled: z.boolean().default(false),
})

function serializeSetting(setting: Awaited<ReturnType<typeof getIntegrationSetting>>, request: NextRequest) {
  const config = (setting?.config ?? {}) as {
    organization_id?: string | null
    accounts_url?: string | null
    client_id?: string | null
    client_secret?: string | null
    refresh_token?: string | null
    location?: string | null
  }

  return {
    provider_key: 'zoho_books',
    display_name: setting?.display_name ?? 'FORGE CSS Zoho Books',
    integration_type: setting?.integration_type ?? 'accounting',
    client_id: config.client_id ?? '',
    has_client_secret: Boolean(config.client_secret),
    client_secret_masked: maskApiKey(config.client_secret),
    has_refresh_token: Boolean(config.refresh_token),
    refresh_token_masked: maskApiKey(config.refresh_token),
    accounts_url: config.accounts_url ?? 'https://accounts.zoho.com',
    base_url: setting?.base_url ?? 'https://www.zohoapis.com/books/v3',
    is_enabled: setting?.is_enabled ?? false,
    organization_id: config.organization_id ?? '',
    location: config.location ?? '',
    last_test_status: setting?.last_test_status ?? null,
    last_test_message: setting?.last_test_message ?? null,
    last_tested_at: setting?.last_tested_at ?? null,
    oauth: {
      redirect_uri: buildZohoRedirectUri(request),
      scopes: getZohoScopeList(),
    },
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
    return NextResponse.json({ integration: serializeSetting(setting, request) })
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
    let normalizedBaseUrl: string | null = data.base_url?.trim() ? data.base_url.trim() : 'https://www.zohoapis.com/books/v3'
    if (normalizedBaseUrl) {
      normalizedBaseUrl = new URL(normalizedBaseUrl).toString().replace(/\/$/, '')
    }

    let normalizedAccountsUrl = data.accounts_url?.trim() ? data.accounts_url.trim() : 'https://accounts.zoho.com'
    normalizedAccountsUrl = new URL(normalizedAccountsUrl).toString().replace(/\/$/, '')

    const existing = await getIntegrationSetting('zoho_books')
    const existingConfig = (existing?.config ?? {}) as {
      refresh_token?: string | null
      client_secret?: string | null
      location?: string | null
    }

    const setting = await upsertIntegrationSetting({
      providerKey: 'zoho_books',
      displayName: data.display_name,
      integrationType: data.integration_type,
      apiKey: null,
      baseUrl: normalizedBaseUrl,
      isEnabled: data.is_enabled,
      config: {
        organization_id: data.organization_id?.trim() || null,
        accounts_url: normalizedAccountsUrl,
        client_id: data.client_id?.trim() || null,
        client_secret: data.client_secret?.trim() || existingConfig.client_secret || null,
        refresh_token: existingConfig.refresh_token || null,
        location: existingConfig.location || null,
        sync_scope: 'finance_reconciliation_and_invoicing',
      },
      actorId: actor.id,
    })

    return NextResponse.json({
      success: true,
      integration: serializeSetting(setting, request),
    })
  } catch (error) {
    console.error('[integrations/zoho-books] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to save Zoho Books integration' }, { status: 500 })
  }
}
