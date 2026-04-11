import { NextRequest } from 'next/server'
import { getIntegrationSetting } from '@/lib/integration-settings'

export type ZohoBooksConfig = {
  displayName: string
  integrationType: string
  clientId: string
  clientSecret: string
  refreshToken: string
  organizationId: string
  accountsUrl: string
  baseUrl: string
  isEnabled: boolean
}

type ZohoTokenResponse = {
  access_token: string
  refresh_token?: string
  api_domain?: string
  token_type?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export function buildZohoRedirectUri(request: NextRequest) {
  return new URL('/api/integrations/zoho-books/oauth/callback', request.url).toString()
}

export function getZohoScopeList() {
  return [
    'ZohoBooks.contacts.ALL',
    'ZohoBooks.invoices.ALL',
    'ZohoBooks.customerpayments.ALL',
    'ZohoBooks.settings.READ',
  ].join(',')
}

export async function getZohoBooksConfig() {
  const setting = await getIntegrationSetting('zoho_books')
  const config = (setting?.config ?? {}) as {
    client_id?: string | null
    client_secret?: string | null
    refresh_token?: string | null
    organization_id?: string | null
    accounts_url?: string | null
  }

  return {
    displayName: setting?.display_name ?? 'FORGE CSS Zoho Books',
    integrationType: setting?.integration_type ?? 'accounting',
    clientId: config.client_id?.trim() ?? '',
    clientSecret: config.client_secret?.trim() ?? '',
    refreshToken: config.refresh_token?.trim() ?? '',
    organizationId: config.organization_id?.trim() ?? '',
    accountsUrl: config.accounts_url?.trim() || 'https://accounts.zoho.com',
    baseUrl: setting?.base_url?.trim() || 'https://www.zohoapis.com/books/v3',
    isEnabled: setting?.is_enabled ?? false,
  } satisfies ZohoBooksConfig
}

export async function exchangeZohoCodeForTokens(input: {
  accountsUrl: string
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(`${input.accountsUrl.replace(/\/$/, '')}/oauth/v2/token?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cache: 'no-store',
  })

  const data = (await response.json().catch(() => ({}))) as ZohoTokenResponse

  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Failed to exchange Zoho authorization code')
  }

  return data
}

export async function refreshZohoAccessToken(config: ZohoBooksConfig) {
  const params = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  })

  const response = await fetch(`${config.accountsUrl.replace(/\/$/, '')}/oauth/v2/token?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cache: 'no-store',
  })

  const data = (await response.json().catch(() => ({}))) as ZohoTokenResponse

  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to refresh Zoho access token')
  }

  return {
    accessToken: data.access_token,
    apiDomain: data.api_domain || 'https://www.zohoapis.com',
    expiresIn: data.expires_in ?? 3600,
  }
}
