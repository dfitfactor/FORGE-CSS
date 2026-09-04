'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Loader2, RefreshCw, Save } from 'lucide-react'

type SquareIntegration = {
  provider_key: string
  display_name: string
  integration_type: string
  access_token_masked: string
  has_access_token: boolean
  base_url: string
  environment: 'sandbox' | 'production'
  location_id: string | null
  application_id: string | null
  webhook_signature_key_masked: string
  has_webhook_signature_key: boolean
  webhook_notification_url: string | null
  merchant_support_email: string | null
  use_for_public_checkout: boolean
  is_enabled: boolean
  last_test_status: string | null
  last_test_message: string | null
  last_tested_at: string | null
  webhook_endpoint_hint: string
}

type SquareIntegrationForm = {
  display_name: string
  integration_type: string
  access_token: string
  base_url: string
  environment: 'sandbox' | 'production'
  location_id: string
  application_id: string
  webhook_signature_key: string
  webhook_notification_url: string
  merchant_support_email: string
  use_for_public_checkout: boolean
  is_enabled: boolean
}

const INITIAL_FORM: SquareIntegrationForm = {
  access_token: '',
  application_id: '',
  base_url: '',
  display_name: 'Square',
  environment: 'sandbox',
  integration_type: 'payments',
  is_enabled: false,
  location_id: '',
  merchant_support_email: '',
  use_for_public_checkout: false,
  webhook_notification_url: '',
  webhook_signature_key: '',
}

function statusLabel(status: string | null) {
  if (status === 'connected') return 'Connected'
  if (status === 'failed') return 'Needs Attention'
  return 'Not Tested'
}

function statusClasses(status: string | null) {
  if (status === 'connected') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-400'
  return 'border-forge-border bg-forge-surface-2 text-forge-text-muted'
}

export default function SquareIntegrationCard() {
  const [integration, setIntegration] = useState<SquareIntegration | null>(null)
  const [form, setForm] = useState<SquareIntegrationForm>(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadIntegration() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/integrations/square', {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to load Square integration')
      }

      const nextIntegration = data.integration as SquareIntegration
      setIntegration(nextIntegration)
      setForm({
        access_token: '',
        application_id: nextIntegration.application_id ?? '',
        base_url: nextIntegration.base_url ?? '',
        display_name: nextIntegration.display_name ?? 'Square',
        environment: nextIntegration.environment ?? 'sandbox',
        integration_type: nextIntegration.integration_type ?? 'payments',
        is_enabled: nextIntegration.is_enabled ?? false,
        location_id: nextIntegration.location_id ?? '',
        merchant_support_email: nextIntegration.merchant_support_email ?? '',
        use_for_public_checkout: nextIntegration.use_for_public_checkout ?? false,
        webhook_notification_url: nextIntegration.webhook_notification_url ?? '',
        webhook_signature_key: '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Square integration')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadIntegration()
  }, [])

  async function saveIntegration() {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/integrations/square', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to save Square integration')
      }

      setSuccess('Square settings saved.')
      await loadIntegration()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Square integration')
    } finally {
      setSaving(false)
    }
  }

  async function testIntegration() {
    setTesting(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/integrations/square/test', {
        method: 'POST',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to test Square')
      }

      setSuccess(data.message ?? 'Square connection verified.')
      await loadIntegration()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test Square')
    } finally {
      setTesting(false)
    }
  }

  return (
    <section id="square" className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">Payments</p>
            <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">Square Checkout</h2>
            <p className="mt-2 text-sm text-forge-text-secondary">
              Configure Square hosted checkout for paid public bookings while leaving the current Stripe subscription lifecycle available for recurring billing.
            </p>
          </div>
        </div>

        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide ${statusClasses(integration?.last_test_status ?? null)}`}>
          {statusLabel(integration?.last_test_status ?? null)}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3 text-sm text-forge-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Square configuration...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="forge-label">Display Name</label>
          <input
            className="forge-input"
            value={form.display_name}
            onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
          />
        </div>

        <div>
          <label className="forge-label">Environment</label>
          <select
            className="forge-input"
            value={form.environment}
            onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value as 'sandbox' | 'production' }))}
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </div>

        <div>
          <label className="forge-label">Square Access Token</label>
          <input
            className="forge-input"
            value={form.access_token}
            onChange={(event) => setForm((current) => ({ ...current, access_token: event.target.value }))}
            placeholder={integration?.has_access_token ? integration.access_token_masked : 'sq0atp-...'}
          />
          {integration?.has_access_token ? (
            <p className="mt-2 text-xs text-forge-text-muted">Existing token saved: {integration.access_token_masked}</p>
          ) : null}
        </div>

        <div>
          <label className="forge-label">Location ID</label>
          <input
            className="forge-input"
            value={form.location_id}
            onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))}
            placeholder="L..."
          />
        </div>

        <div>
          <label className="forge-label">Application ID</label>
          <input
            className="forge-input"
            value={form.application_id}
            onChange={(event) => setForm((current) => ({ ...current, application_id: event.target.value }))}
            placeholder="sq0idp-..."
          />
        </div>

        <div>
          <label className="forge-label">Base URL</label>
          <input
            className="forge-input"
            value={form.base_url}
            onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
            placeholder="https://connect.squareupsandbox.com"
          />
        </div>

        <div>
          <label className="forge-label">Webhook Signature Key</label>
          <input
            className="forge-input"
            value={form.webhook_signature_key}
            onChange={(event) => setForm((current) => ({ ...current, webhook_signature_key: event.target.value }))}
            placeholder={integration?.has_webhook_signature_key ? integration.webhook_signature_key_masked : 'Webhook signature key'}
          />
          {integration?.has_webhook_signature_key ? (
            <p className="mt-2 text-xs text-forge-text-muted">Existing key saved: {integration.webhook_signature_key_masked}</p>
          ) : null}
        </div>

        <div>
          <label className="forge-label">Webhook Notification URL</label>
          <input
            className="forge-input"
            value={form.webhook_notification_url}
            onChange={(event) => setForm((current) => ({ ...current, webhook_notification_url: event.target.value }))}
            placeholder="https://your-domain.com/api/square/webhook"
          />
        </div>

        <div>
          <label className="forge-label">Merchant Support Email</label>
          <input
            className="forge-input"
            value={form.merchant_support_email}
            onChange={(event) => setForm((current) => ({ ...current, merchant_support_email: event.target.value }))}
            placeholder="billing@yourdomain.com"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3">
          <input
            type="checkbox"
            checked={form.use_for_public_checkout}
            onChange={(event) => setForm((current) => ({ ...current, use_for_public_checkout: event.target.checked }))}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-forge-text-primary">Use Square for public checkout</span>
            <span className="mt-1 block text-xs text-forge-text-muted">
              Paid public bookings will create Square hosted checkout links instead of Stripe sessions.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3">
          <input
            type="checkbox"
            checked={form.is_enabled}
            onChange={(event) => setForm((current) => ({ ...current, is_enabled: event.target.checked }))}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-forge-text-primary">Enable Square integration</span>
            <span className="mt-1 block text-xs text-forge-text-muted">
              Connection must be enabled before checkout provider switching can use it.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3 text-sm text-forge-text-secondary">
        Webhook endpoint: <span className="font-mono text-forge-text-primary">{integration?.webhook_endpoint_hint ?? '/api/square/webhook'}</span>
      </div>

      {integration?.last_test_message ? (
        <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 px-4 py-3 text-sm text-forge-text-secondary">
          <div className="font-medium text-forge-text-primary">Last connection test</div>
          <div className="mt-1">{integration.last_test_message}</div>
          {integration.last_tested_at ? (
            <div className="mt-2 text-xs text-forge-text-muted">
              {new Date(integration.last_tested_at).toLocaleString('en-US')}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void saveIntegration()}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-xl bg-forge-gold px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Square Settings
        </button>

        <button
          type="button"
          onClick={() => void testIntegration()}
          disabled={testing || loading}
          className="inline-flex items-center gap-2 rounded-xl border border-forge-border bg-forge-surface-3/60 px-4 py-2 text-sm text-forge-text-primary disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Test Connection
        </button>
      </div>
    </section>
  )
}
