'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { LEAD_STATUSES, leadFullName, leadStatusLabel, type LeadRecord, type LeadStatus } from '@/lib/leads'

function formatDateTime(value: string | null) {
  if (!value) return 'Not available'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function badgeTone(value: string) {
  switch (value) {
    case 'won':
    case 'true':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    case 'lost':
    case 'failed':
      return 'border-red-500/30 bg-red-500/10 text-red-200'
    case 'connected':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
    default:
      return 'border-forge-border bg-forge-surface-3 text-forge-text-secondary'
  }
}

export function LeadDetailPanel({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [lead, setLead] = useState<LeadRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<LeadStatus>('new')
  const [notes, setNotes] = useState('')
  const [nextAction, setNextAction] = useState('')

  async function loadLead(showSpinner = true) {
    if (showSpinner) setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/leads/${leadId}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load lead')

      const nextLead = data.lead as LeadRecord
      setLead(nextLead)
      setStatus((nextLead.status as LeadStatus) ?? 'new')
      setNotes(nextLead.notes ?? '')
      setNextAction(nextLead.next_action ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lead')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLead()
  }, [leadId])

  async function handleSave() {
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes,
          next_action: nextAction,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update lead')

      await loadLead(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lead')
    } finally {
      setSaving(false)
    }
  }

  async function handleConvert() {
    if (!lead) return

    const confirmed = window.confirm(
      `Convert ${leadFullName(lead)} to a FORGE client? This will create a client record and send a welcome email.`
    )
    if (!confirmed) return

    setConverting(true)
    setError('')

    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to convert lead')

      await loadLead(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert lead')
    } finally {
      setConverting(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
        Loading lead details...
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
        {error || 'Lead not found.'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-forge-text-primary">{leadFullName(lead)}</h2>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${badgeTone(lead.status)}`}>
              {leadStatusLabel(lead.status)}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${badgeTone(String(lead.aisha_synced ? 'connected' : 'pending'))}`}>
              {lead.aisha_synced ? 'Ai-SHA synced' : 'Pending sync'}
            </span>
          </div>
          <p className="mt-2 text-sm text-forge-text-muted">{lead.email}{lead.phone ? ` | ${lead.phone}` : ''}{lead.company ? ` | ${lead.company}` : ''}</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadLead(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-forge-border bg-forge-surface px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {!lead.converted_to_client ? (
            <button type="button" disabled={converting} onClick={() => void handleConvert()} className="forge-btn-gold">
              {converting ? 'Converting...' : 'Convert to Client'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
            <h3 className="text-lg font-semibold text-forge-text-primary">Lead Information</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Source</p>
                <p className="mt-2 text-sm text-forge-text-primary">{lead.source ?? 'Unknown'}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Score</p>
                <p className="mt-2 text-sm text-forge-text-primary">{lead.score ?? 'No score'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Goal</p>
                <p className="mt-2 text-sm text-forge-text-primary">{lead.goal || 'No goal captured yet.'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-forge-text-secondary">{lead.notes || 'No notes yet.'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Next Action</p>
                <p className="mt-2 text-sm text-forge-text-secondary">{lead.next_action || 'No next action set.'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
            <h3 className="text-lg font-semibold text-forge-text-primary">Stage Management</h3>
            <p className="mt-1 text-sm text-forge-text-muted">Updating the stage here sends the stage change back to Ai-SHA automatically.</p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="forge-label">Status</label>
                <select className="forge-input" value={status} onChange={(event) => setStatus(event.target.value as LeadStatus)}>
                  {LEAD_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {leadStatusLabel(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="forge-label">Next Action</label>
                <input className="forge-input" value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
              </div>

              <div>
                <label className="forge-label">Notes</label>
                <textarea className="forge-input min-h-[150px]" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>

              <button type="button" disabled={saving} onClick={() => void handleSave()} className="forge-btn-gold">
                {saving ? 'Saving...' : 'Save Lead Updates'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
            <h3 className="text-lg font-semibold text-forge-text-primary">Sync + Conversion</h3>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Ai-SHA Sync</p>
                <p className="mt-2 text-forge-text-primary">{lead.aisha_synced ? 'Lead synced successfully' : 'Lead has not synced yet'}</p>
                <p className="mt-1 text-forge-text-muted">Last synced: {formatDateTime(lead.aisha_synced_at)}</p>
              </div>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Last Ai-SHA Event</p>
                <p className="mt-2 text-forge-text-primary">{lead.last_aisha_event || 'No event recorded'}</p>
                <p className="mt-1 text-forge-text-muted">{formatDateTime(lead.last_aisha_event_at)}</p>
              </div>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Created</p>
                <p className="mt-2 text-forge-text-primary">{formatDateTime(lead.created_at)}</p>
              </div>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Last Updated</p>
                <p className="mt-2 text-forge-text-primary">{formatDateTime(lead.updated_at)}</p>
              </div>

              {lead.converted_to_client ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
                  <p className="font-medium">This lead has already been converted.</p>
                  <p className="mt-1 text-sm">Converted at {formatDateTime(lead.converted_at)}.</p>
                  {lead.client_id ? (
                    <Link href={`/clients/${lead.client_id}`} className="mt-3 inline-block text-sm font-medium text-white underline underline-offset-4">
                      Open linked client
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-cyan-100">
                  <p className="font-medium">Ready to convert</p>
                  <p className="mt-1 text-sm">Converting creates a CSS client record and sends a welcome email.</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
            <h3 className="text-lg font-semibold text-forge-text-primary">Raw Payload</h3>
            <details className="mt-4 rounded-xl border border-forge-border bg-forge-surface-3 p-4">
              <summary className="cursor-pointer text-sm font-medium text-forge-text-primary">Expand debug payload</summary>
              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs text-forge-text-secondary">
                {JSON.stringify(lead.raw_payload ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
