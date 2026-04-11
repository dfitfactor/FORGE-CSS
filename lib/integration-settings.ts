import { db } from '@/lib/db'

export type IntegrationSettingRecord = {
  id: string
  provider_key: string
  display_name: string
  integration_type: string
  api_key: string | null
  base_url: string | null
  is_enabled: boolean
  config: Record<string, unknown> | null
  last_test_status: string | null
  last_test_message: string | null
  last_tested_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export async function ensureIntegrationSettingsTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS integration_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    integration_type TEXT NOT NULL DEFAULT 'other',
    api_key TEXT,
    base_url TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_test_status TEXT,
    last_test_message TEXT,
    last_tested_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)

  await db.query(`CREATE INDEX IF NOT EXISTS integration_settings_type_idx
    ON integration_settings (integration_type)`)
}

export function maskApiKey(value: string | null | undefined) {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

export async function getIntegrationSetting(providerKey: string) {
  await ensureIntegrationSettingsTable()

  return db.queryOne<IntegrationSettingRecord>(
    `SELECT id,
            provider_key,
            display_name,
            integration_type,
            api_key,
            base_url,
            is_enabled,
            config,
            last_test_status,
            last_test_message,
            last_tested_at,
            created_by,
            updated_by,
            created_at,
            updated_at
     FROM integration_settings
     WHERE provider_key = $1`,
    [providerKey]
  )
}

export async function upsertIntegrationSetting(input: {
  providerKey: string
  displayName: string
  integrationType: string
  apiKey: string | null
  baseUrl: string | null
  isEnabled: boolean
  config?: Record<string, unknown>
  actorId: string
}) {
  await ensureIntegrationSettingsTable()

  const existing = await getIntegrationSetting(input.providerKey)
  const nextApiKey = input.apiKey ?? existing?.api_key ?? null

  return db.queryOne<IntegrationSettingRecord>(
    `INSERT INTO integration_settings (
       provider_key,
       display_name,
       integration_type,
       api_key,
       base_url,
       is_enabled,
       config,
       created_by,
       updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
     ON CONFLICT (provider_key)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       integration_type = EXCLUDED.integration_type,
       api_key = EXCLUDED.api_key,
       base_url = EXCLUDED.base_url,
       is_enabled = EXCLUDED.is_enabled,
       config = EXCLUDED.config,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id,
               provider_key,
               display_name,
               integration_type,
               api_key,
               base_url,
               is_enabled,
               config,
               last_test_status,
               last_test_message,
               last_tested_at,
               created_by,
               updated_by,
               created_at,
               updated_at`,
    [
      input.providerKey,
      input.displayName,
      input.integrationType,
      nextApiKey,
      input.baseUrl,
      input.isEnabled,
      JSON.stringify(input.config ?? {}),
      input.actorId,
    ]
  )
}

export async function recordIntegrationTestResult(input: {
  providerKey: string
  status: 'connected' | 'failed'
  message: string
  actorId: string
}) {
  await ensureIntegrationSettingsTable()

  return db.query(
    `UPDATE integration_settings
     SET last_test_status = $2,
         last_test_message = $3,
         last_tested_at = NOW(),
         updated_by = $4,
         updated_at = NOW()
     WHERE provider_key = $1`,
    [input.providerKey, input.status, input.message, input.actorId]
  )
}
