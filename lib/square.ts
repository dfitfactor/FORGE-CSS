import crypto from 'crypto'
import { getCoachSettings } from '@/lib/coach-settings'
import { getIntegrationSetting } from '@/lib/integration-settings'

export type SquareEnvironment = 'sandbox' | 'production'
export type CheckoutProvider = 'stripe' | 'square'

export type SquareConfig = {
  accessToken: string | null
  applicationId: string | null
  baseUrl: string
  displayName: string
  environment: SquareEnvironment
  isEnabled: boolean
  locationId: string | null
  merchantSupportEmail: string | null
  useForPublicCheckout: boolean
  webhookNotificationUrl: string | null
  webhookSignatureKey: string | null
}

const SQUARE_PROVIDER_KEY = 'square'
const SQUARE_VERSION = '2026-01-22'

function normalizeEnvironment(value: unknown): SquareEnvironment {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'production'
    ? 'production'
    : 'sandbox'
}

function defaultSquareBaseUrl(environment: SquareEnvironment) {
  return environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export async function getSquareConfig(): Promise<SquareConfig> {
  const setting = await getIntegrationSetting(SQUARE_PROVIDER_KEY)
  const config = (setting?.config ?? {}) as Record<string, unknown>
  const environment = normalizeEnvironment(config.environment ?? process.env.SQUARE_ENVIRONMENT)
  const coachSettings = await getCoachSettings().catch(() => null)

  const accessToken = normalizeOptionalString(setting?.api_key) ?? normalizeOptionalString(process.env.SQUARE_ACCESS_TOKEN)
  const locationId = normalizeOptionalString(config.location_id) ?? normalizeOptionalString(process.env.SQUARE_LOCATION_ID)
  const applicationId = normalizeOptionalString(config.application_id) ?? normalizeOptionalString(process.env.SQUARE_APPLICATION_ID)
  const webhookSignatureKey =
    normalizeOptionalString(config.webhook_signature_key) ??
    normalizeOptionalString(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
  const webhookNotificationUrl =
    normalizeOptionalString(config.webhook_notification_url) ??
    normalizeOptionalString(process.env.SQUARE_WEBHOOK_NOTIFICATION_URL)
  const merchantSupportEmail =
    normalizeOptionalString(config.merchant_support_email) ??
    normalizeOptionalString(process.env.SQUARE_MERCHANT_SUPPORT_EMAIL) ??
    normalizeOptionalString(coachSettings?.coachEmail)

  const useForPublicCheckout =
    config.use_for_public_checkout === true ||
    String(process.env.PUBLIC_CHECKOUT_PROVIDER ?? '').trim().toLowerCase() === 'square'

  return {
    accessToken,
    applicationId,
    baseUrl:
      normalizeOptionalString(setting?.base_url) ??
      normalizeOptionalString(process.env.SQUARE_BASE_URL) ??
      defaultSquareBaseUrl(environment),
    displayName: setting?.display_name ?? 'Square',
    environment,
    isEnabled: setting?.is_enabled ?? Boolean(accessToken && locationId),
    locationId,
    merchantSupportEmail,
    useForPublicCheckout,
    webhookNotificationUrl,
    webhookSignatureKey,
  }
}

export async function getPreferredCheckoutProvider(): Promise<CheckoutProvider> {
  const square = await getSquareConfig()
  const squareReady = square.isEnabled && square.accessToken && square.locationId
  return squareReady && square.useForPublicCheckout ? 'square' : 'stripe'
}

function buildSquareHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Square-Version': SQUARE_VERSION,
  }
}

export async function createSquarePaymentLink(input: {
  amountCents: number
  bookingId: string
  bookingName: string
  clientEmail: string
  clientPhone: string
  description: string
  redirectUrl: string
}) {
  const square = await getSquareConfig()

  if (!square.isEnabled || !square.accessToken || !square.locationId) {
    throw new Error('Square is not configured for checkout')
  }

  const response = await fetch(`${square.baseUrl}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: buildSquareHeaders(square.accessToken),
    body: JSON.stringify({
      idempotency_key: input.bookingId,
      description: input.description,
      quick_pay: {
        name: input.bookingName,
        location_id: square.locationId,
        price_money: {
          amount: input.amountCents,
          currency: 'USD',
        },
      },
      checkout_options: {
        allow_tipping: false,
        enable_coupon: false,
        merchant_support_email: square.merchantSupportEmail ?? undefined,
        redirect_url: input.redirectUrl,
      },
      pre_populated_data: {
        buyer_email: input.clientEmail,
        buyer_phone_number: input.clientPhone,
      },
      payment_note: `FORGE CSS booking ${input.bookingId}`,
    }),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const squareMessage =
      Array.isArray(payload?.errors) && payload.errors.length > 0
        ? payload.errors.map((error: { detail?: string; code?: string }) => error.detail ?? error.code).filter(Boolean).join('; ')
        : null
    throw new Error(squareMessage || 'Square checkout request failed')
  }

  return payload as {
    payment_link?: {
      id?: string
      order_id?: string
      url?: string
      long_url?: string
    }
  }
}

export async function testSquareConnection() {
  const square = await getSquareConfig()

  if (!square.accessToken) {
    throw new Error('Add the Square access token first')
  }

  const response = await fetch(`${square.baseUrl}/v2/locations`, {
    method: 'GET',
    headers: buildSquareHeaders(square.accessToken),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const squareMessage =
      Array.isArray(payload?.errors) && payload.errors.length > 0
        ? payload.errors.map((error: { detail?: string; code?: string }) => error.detail ?? error.code).filter(Boolean).join('; ')
        : null
    throw new Error(squareMessage || `Square responded with ${response.status}`)
  }

  const locations = Array.isArray(payload?.locations) ? payload.locations : []
  return {
    locationCount: locations.length,
    matchedLocation: locations.find((location: { id?: string }) => location.id === square.locationId) ?? null,
  }
}

export function verifySquareWebhookSignature(input: {
  body: string
  notificationUrl: string
  signature: string
  signatureKey: string
}) {
  const digest = crypto
    .createHmac('sha256', input.signatureKey)
    .update(input.notificationUrl + input.body)
    .digest('base64')

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(input.signature))
  } catch {
    return false
  }
}

export function extractSquarePaymentFromWebhook(payload: Record<string, any>) {
  const payment =
    payload?.data?.object?.payment ??
    payload?.data?.object?.payment_updated?.payment ??
    payload?.data?.object?.payment_updated ??
    null

  if (!payment || typeof payment !== 'object') {
    return null
  }

  return {
    amountCents: Number(payment?.amount_money?.amount ?? 0),
    id: typeof payment.id === 'string' ? payment.id : null,
    orderId: typeof payment.order_id === 'string' ? payment.order_id : null,
    status: typeof payment.status === 'string' ? payment.status : null,
  }
}
