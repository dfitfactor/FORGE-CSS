import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireRole } from '@/lib/auth'
import { getIntegrationSetting, maskApiKey, upsertIntegrationSetting } from '@/lib/integration-settings'
import { getSquareConfig } from '@/lib/square'

const SquareIntegrationSchema = z.object({
  display_name: z.string().trim().min(2).max(120).default('Square'),
  integration_type: z.string().trim().min(1).max(80).default('payments'),
  access_token: z.string().trim().max(500).optional().nullable(),
  base_url: z.string().trim().max(500).optional().nullable(),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  location_id: z.string().trim().max(120).optional().nullable(),
  application_id: z.string().trim().max(120).optional().nullable(),
  webhook_signature_key: z.string().trim().max(500).optional().nullable(),
  webhook_notification_url: z.string().trim().max(500).optional().nullable(),
  merchant_support_email: z.string().trim().max(255).optional().nullable(),
  use_for_public_checkout: z.boolean().default(false),
  is_enabled: z.boolean().default(false),
})

function normalizeOptionalUrl(value: string | null | undefined) {
  if (!value?.trim()) return null
  return new URL(value.trim()).toString().replace(/\/$/, '')
}

function serializeSetting(
  setting: Awaited<ReturnType<typeof getIntegrationSetting>>,
  squareConfig: Awaited<ReturnType<typeof getSquareConfig>>
) {
  const config = (setting?.config ?? {}) as Record<string, unknown>

  return {
    provider_key: 'square',
    display_name: setting?.display_name ?? squareConfig.displayName,
    integration_type: setting?.integration_type ?? 'payments',
    access_token_masked: maskApiKey(setting?.api_key ?? squareConfig.accessToken),
    has_access_token: Boolean(setting?.api_key ?? squareConfig.accessToken),
    base_url: setting?.base_url ?? squareConfig.baseUrl,
    environment: squareConfig.environment,
    location_id: typeof config.location_id === 'string' ? config.location_id : squareConfig.locationId,
    application_id: typeof config.application_id === 'string' ? config.application_id : squareConfig.applicationId,
    webhook_signature_key_masked: maskApiKey(
      typeof config.webhook_signature_key === 'string' ? config.webhook_signature_key : squareConfig.webhookSignatureKey
    ),
    has_webhook_signature_key: Boolean(
      (typeof config.webhook_signature_key === 'string' ? config.webhook_signature_key : squareConfig.webhookSignatureKey) ?? ''
    ),
    webhook_notification_url:
      (typeof config.webhook_notification_url === 'string' ? config.webhook_notification_url : squareConfig.webhookNotificationUrl) ?? null,
    merchant_support_email:
      (typeof config.merchant_support_email === 'string' ? config.merchant_support_email : squareConfig.merchantSupportEmail) ?? null,
    use_for_public_checkout: squareConfig.useForPublicCheckout,
    is_enabled: setting?.is_enabled ?? squareConfig.isEnabled,
    last_test_status: setting?.last_test_status ?? null,
    last_test_message: setting?.last_test_message ?? null,
    last_tested_at: setting?.last_tested_at ?? null,
    webhook_endpoint_hint: '/api/square/webhook',
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
    const [setting, squareConfig] = await Promise.all([
      getIntegrationSetting('square'),
      getSquareConfig(),
    ])

    return NextResponse.json({
      integration: serializeSetting(setting, squareConfig),
    })
  } catch (error) {
    console.error('[integrations/square] GET error:', error)
    return NextResponse.json({ error: 'Failed to load Square integration' }, { status: 500 })
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
    const parsed = SquareIntegrationSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data

    const setting = await upsertIntegrationSetting({
      providerKey: 'square',
      displayName: data.display_name,
      integrationType: data.integration_type,
      apiKey: data.access_token?.trim() ? data.access_token.trim() : null,
      baseUrl: normalizeOptionalUrl(data.base_url),
      isEnabled: data.is_enabled,
      config: {
        environment: data.environment,
        location_id: data.location_id?.trim() || null,
        application_id: data.application_id?.trim() || null,
        webhook_signature_key: data.webhook_signature_key?.trim() || null,
        webhook_notification_url: normalizeOptionalUrl(data.webhook_notification_url),
        merchant_support_email: data.merchant_support_email?.trim() || null,
        use_for_public_checkout: data.use_for_public_checkout,
      },
      actorId: actor.id,
    })

    const squareConfig = await getSquareConfig()

    return NextResponse.json({
      success: true,
      integration: serializeSetting(setting, squareConfig),
    })
  } catch (error) {
    console.error('[integrations/square] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to save Square integration' }, { status: 500 })
  }
}
