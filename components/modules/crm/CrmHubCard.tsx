'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Loader2,
  Network,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'

type IntegrationState = {
  provider_key: string
  display_name: string
  integration_type: string
  api_key_masked: string
  has_api_key: boolean
  base_url: string
  is_enabled: boolean
  last_test_status: string | null
  last_test_message: string | null
  last_tested_at: string | null
  sync_scope: {
    leads_owned_by: string
    active_clients_owned_by: string
    first_sync_event: string
    conversion_handoff: string
  }
}

type FormState = {
  display_name: string
  integration_type: string
  api_key: string
  base_url: string
  is_enabled: boolean
}

type SyncSurface = {
  label: string
  description: string
}

const SYNC_SURFACES: SyncSurface[] = [
  {
    label: 'Lead Capture',
    description: 'Public booking requests, inquiries, and new prospects should enter AI-SHA CRM first.',
  },
  {
    label: 'Nurture & Follow-Up',
    description: 'AI-SHA CRM owns outreach, qualification, and conversion automation before service delivery starts.',
  },
  {
    label: 'Conversion Handoff',
    description: 'Once a lead becomes a paying active client, FORGE CSS creates or activates the client profile.',
  },
  {
    label: 'Active Client Delivery',
    description: 'FORGE CSS remains the system of record for bookings, packages, protocols, and coaching operations.',
  },
]

function formatDateTime(value: string | null) {
  if (!value) return 'Never tested'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusStyles(status: string | null) {
  if (status === 'connected') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }

  if (status === 'failed') {
    return 'border-red-500/30 bg-red-500/10 text-red-300'
  }

  return 'border-forge-border bg-forge-surface-2 text-forge-text-muted'
}

function statusLabel(status: string | null) {
  if (status === 'connected') return 'Connected'
  if (status === 'failed') return 'Needs attention'
  return 'Not tested'
}

export default function CrmHubCard() {
  const [integration, setIntegration] = useState<IntegrationState | null>(null)
  const [form, setForm] = useState<FormState>({
    display_name: 'FORGE CSS',
    integration_type: 'other',
    api_key: '',
    base_url: '',
    is_enabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function loadIntegration() {
      setLoading(true)
      setError('')

      try {
        const res = await fetch('/api/integrations/aisha', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load CRM integration')
        }

        if (!active) return

        const nextIntegration = data.integration as IntegrationState
        setIntegration(nextIntegration)
        setForm({
          display_name: nextIntegration.display_name,
          integration_type: nextIntegration.integration_type,
          api_key: '',
          base_url: nextIntegration.base_url ?? '',
          is_enabled: nextIntegration.is_enabled,
        })
      } catch (err: unknown) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load CRM integration')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadIntegration()

    return () => {
      active = false
    }
  }, [])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/integrations/aisha', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save CRM integration')
      }

      const nextIntegration = data.integration as IntegrationState
      setIntegration(nextIntegration)
      setForm((current) => ({
        ...current,
        api_key: '',
        base_url: nextIntegration.base_url ?? '',
        is_enabled: nextIntegration.is_enabled,
      }))
      setSuccess('AI-SHA CRM configuration saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save CRM integration')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/integrations/aisha/test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error ?? 'Connection test failed')
      }

      setIntegration((current) =>
        current
          ? {
              ...current,
              last_test_status: data.status ?? (data.success ? 'connected' : 'failed'),
              last_test_message: data.message ?? '',
              last_tested_at: new Date().toISOString(),
            }
          : current
      )
      setSuccess(data.message ?? 'Connection test completed')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
        Loading AI-SHA CRM workspace...
      </section>
    )
  }

  return (
    <section className="space-y-5 rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-forge-gold/20 bg-forge-gold/10 p-3 text-forge-gold">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">CRM</p>
          <h2 className="mt-2 text-sm font-semibold text-forge-text-primary">AI-SHA CRM Handoff Workspace</h2>
          <p className="mt-2 text-sm text-forge-text-secondary">
            Save connection details now, verify the base URL handshake, and keep the lead-to-client ownership split explicit before deeper sync logic lands.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
        Boundary rule: <span className="font-medium">AI-SHA CRM owns leads and nurture</span>, while{' '}
        <span className="font-medium">FORGE CSS owns active paying clients</span>.
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-2 text-forge-gold">
              <BriefcaseBusiness className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Connection Settings</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                This is the flexible shell. Once AI-SHA shares the exact lead endpoint, we can wire live prospect submission into it.
              </p>
            </div>
          </div>

          <div>
            <label className="forge-label">Integration Name</label>
            <input
              className="forge-input"
              value={form.display_name}
              onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
              placeholder="FORGE CSS"
            />
          </div>

          <div>
            <label className="forge-label">Integration Type</label>
            <select
              className="forge-input"
              value={form.integration_type}
              onChange={(event) => setForm((current) => ({ ...current, integration_type: event.target.value }))}
            >
              <option value="other">Other</option>
              <option value="crm">CRM</option>
              <option value="automation">Automation</option>
            </select>
          </div>

          <div>
            <label className="forge-label">API Key / Token</label>
            <input
              type="password"
              className="forge-input"
              value={form.api_key}
              onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
              placeholder={integration?.has_api_key ? integration.api_key_masked || 'Saved token on file' : 'Paste the AI-SHA CRM API token'}
            />
            <p className="mt-2 text-xs text-forge-text-muted">
              {integration?.has_api_key
                ? `Saved token on file: ${integration.api_key_masked || 'masked'}`
                : 'No API key saved yet.'}
            </p>
          </div>

          <div>
            <label className="forge-label">Base URL</label>
            <input
              type="url"
              className="forge-input"
              value={form.base_url}
              onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
              placeholder="https://api.example.com/v1"
            />
            <p className="mt-2 text-xs text-forge-text-muted">
              Use the API base URL AI-SHA provides, not the public website URL.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-forge-border/70 bg-forge-surface-2 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-forge-text-primary">Enable this integration</p>
              <p className="mt-1 text-xs text-forge-text-muted">
                Saving as enabled marks AI-SHA CRM as the live lead intake owner.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, is_enabled: !current.is_enabled }))}
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                form.is_enabled
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-forge-border bg-forge-surface-3 text-forge-text-muted'
              }`}
            >
              {form.is_enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={saving} className="forge-btn-gold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>

            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={testing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-forge-border bg-forge-surface px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface-2 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </form>

        <div className="space-y-4 rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-forge-text-primary">Connection Status</h3>
              <p className="mt-1 text-sm text-forge-text-secondary">
                This verifies the shell is configured and ready for deeper lead sync work.
              </p>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusStyles(integration?.last_test_status ?? null)}`}>
              {statusLabel(integration?.last_test_status ?? null)}
            </span>
          </div>

          <div className="space-y-3 rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Saved Config</p>
              <p className="mt-2 text-sm text-forge-text-primary">{integration?.display_name || 'FORGE CSS'}</p>
              <p className="mt-1 text-sm text-forge-text-secondary">{integration?.base_url || 'No base URL saved yet'}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-forge-border bg-forge-surface-3 px-2.5 py-1 text-xs text-forge-text-secondary">
                {integration?.is_enabled ? 'Enabled' : 'Disabled'}
              </span>
              <span className="rounded-full border border-forge-border bg-forge-surface-3 px-2.5 py-1 text-xs text-forge-text-secondary">
                {integration?.has_api_key ? 'API key saved' : 'API key missing'}
              </span>
              <span className="rounded-full border border-forge-border bg-forge-surface-3 px-2.5 py-1 text-xs text-forge-text-secondary">
                {integration?.integration_type || 'other'}
              </span>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Last Test</p>
              <p className="mt-2 text-sm text-forge-text-primary">{formatDateTime(integration?.last_tested_at ?? null)}</p>
              <p className="mt-1 text-sm text-forge-text-secondary">{integration?.last_test_message || 'No connection test recorded yet.'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Lead Sync Plan</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-start gap-3">
                <UserPlus className="mt-0.5 h-4 w-4 text-forge-gold" />
                <p className="text-sm text-forge-text-secondary">
                  <span className="font-medium text-forge-text-primary">First event:</span>{' '}
                  {integration?.sync_scope.first_sync_event ?? 'public inquiry or booking request'}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 text-forge-gold" />
                <p className="text-sm text-forge-text-secondary">
                  <span className="font-medium text-forge-text-primary">Handoff:</span>{' '}
                  {integration?.sync_scope.conversion_handoff ?? 'lead converted to active paying client'}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-4 w-4 text-forge-gold" />
                <p className="text-sm text-forge-text-secondary">
                  <span className="font-medium text-forge-text-primary">FORGE ownership:</span>{' '}
                  {integration?.sync_scope.active_clients_owned_by ?? 'FORGE CSS'}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Bot className="mt-0.5 h-4 w-4 text-forge-gold" />
                <p className="text-sm text-forge-text-secondary">
                  Once the endpoint contract is known, we can map inquiry form payloads into AI-SHA without reworking this page.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {SYNC_SURFACES.map((surface) => (
          <div key={surface.label} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border/70 bg-forge-surface-2 text-forge-gold">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-forge-text-primary">{surface.label}</h3>
            <p className="mt-2 text-sm text-forge-text-secondary">{surface.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
