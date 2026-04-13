'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCw, Sparkles, UserPlus, Users } from 'lucide-react'
import { LEAD_SOURCES, LEAD_STATUSES, leadFullName, leadStatusLabel, type LeadRecord, type LeadSource, type LeadStatus } from '@/lib/leads'

type LeadStats = {
  total_leads: number
  this_month: number
  this_week: number
  discovery_booked: number
  total_won: number
  total_lost: number
  conversion_rate: number
}

type CreateLeadForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  source: LeadSource
  goal: string
  notes: string
  next_action: string
}

const STATUS_COLUMNS: LeadStatus[] = [
  'new',
  'contacted',
  'discovery_booked',
  'discovery_complete',
  'proposal_sent',
  'won',
  'lost',
  'nurture',
]

const EMPTY_FORM: CreateLeadForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company: '',
  source: 'manual',
  goal: '',
  notes: '',
  next_action: '',
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function daysSince(dateString: string) {
  const then = new Date(dateString).getTime()
  const diff = Date.now() - then
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function sourceTone(source: string | null) {
  switch (source) {
    case 'instagram':
      return 'border-pink-500/30 bg-pink-500/10 text-pink-200'
    case 'youtube':
      return 'border-red-500/30 bg-red-500/10 text-red-200'
    case 'referral':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    case 'paid_ads':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    case 'website':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
    default:
      return 'border-forge-border bg-forge-surface-3 text-forge-text-secondary'
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'won':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    case 'lost':
      return 'border-red-500/30 bg-red-500/10 text-red-200'
    case 'proposal_sent':
      return 'border-forge-gold/30 bg-forge-gold/10 text-forge-gold'
    case 'discovery_booked':
    case 'discovery_complete':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
    default:
      return 'border-forge-border bg-forge-surface-3 text-forge-text-secondary'
  }
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-forge-text-primary">{value}</p>
      <p className="mt-2 text-xs text-forge-text-secondary">{detail}</p>
    </div>
  )
}

export function LeadsDashboard() {
  const [stats, setStats] = useState<LeadStats | null>(null)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<CreateLeadForm>(EMPTY_FORM)
  const [statusDrafts, setStatusDrafts] = useState<Record<string, LeadStatus | ''>>({})
  const [actioningLeadId, setActioningLeadId] = useState<string | null>(null)

  async function loadData(showSpinner = true) {
    if (showSpinner) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    setError('')

    try {
      const [statsRes, leadsRes] = await Promise.all([
        fetch('/api/leads/stats', { cache: 'no-store' }),
        fetch('/api/leads', { cache: 'no-store' }),
      ])

      const statsData = await statsRes.json().catch(() => ({}))
      const leadsData = await leadsRes.json().catch(() => ({}))

      if (!statsRes.ok) throw new Error(statsData.error ?? 'Failed to load lead stats')
      if (!leadsRes.ok) throw new Error(leadsData.error ?? 'Failed to load leads')

      setStats(statsData.stats as LeadStats)
      setLeads((leadsData.leads ?? []) as LeadRecord[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const leadsByStatus = useMemo(() => {
    const grouped = new Map<string, LeadRecord[]>()
    for (const status of STATUS_COLUMNS) grouped.set(status, [])
    for (const lead of leads) {
      const bucket = grouped.get(lead.status) ?? []
      bucket.push(lead)
      grouped.set(lead.status, bucket)
    }
    return grouped
  }, [leads])

  const recentLeads = useMemo(() => leads.slice(0, 20), [leads])

  async function handleCreateLead() {
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(data.error ?? 'Failed to create lead')

      setModalOpen(false)
      setForm(EMPTY_FORM)
      await loadData(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStageSave(lead: LeadRecord) {
    const nextStatus = statusDrafts[lead.id]
    if (!nextStatus || nextStatus === lead.status) return

    setActioningLeadId(lead.id)
    setError('')

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update stage')

      setStatusDrafts((current) => {
        const next = { ...current }
        delete next[lead.id]
        return next
      })
      await loadData(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stage')
    } finally {
      setActioningLeadId(null)
    }
  }

  async function handleConvert(lead: LeadRecord) {
    const confirmed = window.confirm(`Convert ${leadFullName(lead)} to a FORGE client? This will create a client record and send a welcome email.`)
    if (!confirmed) return

    setActioningLeadId(lead.id)
    setError('')

    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to convert lead')
      await loadData(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert lead')
    } finally {
      setActioningLeadId(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-10 text-center text-forge-text-muted">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
        Loading leads dashboard...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
          <Sparkles className="h-4 w-4 text-cyan-200" />
          Ai-SHA owns leads pre-conversion. FORGE CSS owns client delivery after win.
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadData(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-forge-border bg-forge-surface px-4 py-2 text-sm text-forge-text-primary transition-all hover:bg-forge-surface-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={() => setModalOpen(true)} className="forge-btn-gold inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total Leads" value={String(stats?.total_leads ?? 0)} detail="All locally stored Ai-SHA and CSS leads." />
        <StatCard label="New This Month" value={String(stats?.this_month ?? 0)} detail="Fresh leads created this month." />
        <StatCard label="New This Week" value={String(stats?.this_week ?? 0)} detail="Fresh leads created this week." />
        <StatCard label="Discovery Calls" value={String(stats?.discovery_booked ?? 0)} detail="Leads currently booked for discovery." />
        <StatCard label="Conversion Rate" value={`${stats?.conversion_rate ?? 0}%`} detail="Won leads divided by total leads." />
        <StatCard label="Total Won" value={String(stats?.total_won ?? 0)} detail="Leads converted into CSS clients." />
      </div>

      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-forge-gold" />
          <h2 className="text-lg font-semibold text-forge-text-primary">Pipeline View</h2>
        </div>
        <p className="mt-1 text-sm text-forge-text-muted">Track every lead by stage, score, and next action.</p>

        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[1100px] grid-cols-8 gap-4">
            {STATUS_COLUMNS.map((status) => (
              <div key={status} className="rounded-2xl border border-forge-border/70 bg-forge-surface-3/50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold capitalize text-forge-text-primary">{leadStatusLabel(status)}</h3>
                    <p className="text-xs text-forge-text-muted">{leadsByStatus.get(status)?.length ?? 0} leads</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${statusTone(status)}`}>
                    {leadStatusLabel(status)}
                  </span>
                </div>

                <div className="space-y-3">
                  {(leadsByStatus.get(status) ?? []).map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block rounded-xl border border-forge-border/70 bg-forge-surface-2 p-3 transition-all hover:border-forge-gold/30 hover:bg-forge-surface"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-forge-text-primary">{leadFullName(lead)}</p>
                          <p className="text-xs text-forge-text-muted">{lead.email}</p>
                        </div>
                        {typeof lead.score === 'number' ? (
                          <span className="rounded-full border border-forge-gold/20 bg-forge-gold/10 px-2 py-0.5 text-[10px] font-semibold text-forge-gold">
                            {lead.score}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${sourceTone(lead.source)}`}>
                          {lead.source ?? 'unknown'}
                        </span>
                        <span className="text-[11px] text-forge-text-muted">{daysSince(lead.created_at)}d ago</span>
                      </div>

                      <p className="mt-3 text-xs text-forge-text-secondary">
                        <span className="font-medium text-forge-text-primary">Next:</span> {lead.next_action || 'No next action set'}
                      </p>
                    </Link>
                  ))}

                  {(leadsByStatus.get(status) ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-forge-border bg-forge-surface-2 p-3 text-xs text-forge-text-muted">
                      No leads in this stage.
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-forge-gold" />
          <h2 className="text-lg font-semibold text-forge-text-primary">Recent Leads</h2>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-forge-border text-left text-xs uppercase tracking-wide text-forge-text-muted">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Score</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Next Action</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead) => {
                const draftStatus = statusDrafts[lead.id] || lead.status
                const disabled = actioningLeadId === lead.id

                return (
                  <tr key={lead.id} className="border-b border-forge-border/60 align-top">
                    <td className="px-3 py-3 font-medium text-forge-text-primary">{leadFullName(lead)}</td>
                    <td className="px-3 py-3 text-forge-text-secondary">{lead.email}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${sourceTone(lead.source)}`}>
                        {lead.source ?? 'unknown'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${statusTone(lead.status)}`}>
                        {leadStatusLabel(lead.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-forge-text-secondary">{lead.score ?? '-'}</td>
                    <td className="px-3 py-3 text-forge-text-secondary">{formatDate(lead.created_at)}</td>
                    <td className="px-3 py-3 text-forge-text-secondary">{lead.next_action || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[240px] flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Link href={`/leads/${lead.id}`} className="text-xs font-medium text-forge-gold transition-colors hover:text-white">
                            View
                          </Link>
                          {!lead.converted_to_client ? (
                            <button
                              type="button"
                              onClick={() => void handleConvert(lead)}
                              disabled={disabled}
                              className="text-xs font-medium text-cyan-200 transition-colors hover:text-white disabled:opacity-50"
                            >
                              Convert
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-300">Converted</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={draftStatus}
                            onChange={(event) =>
                              setStatusDrafts((current) => ({
                                ...current,
                                [lead.id]: event.target.value as LeadStatus,
                              }))
                            }
                            className="forge-input h-9 min-w-0 text-xs"
                          >
                            {LEAD_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {leadStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleStageSave(lead)}
                            disabled={disabled || draftStatus === lead.status}
                            className="rounded-lg border border-forge-border bg-forge-surface px-3 py-2 text-xs text-forge-text-primary transition-all hover:bg-forge-surface-2 disabled:opacity-50"
                          >
                            {disabled ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-forge-border bg-forge-surface-2 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-forge-text-primary">Add Lead</h3>
                <p className="mt-1 text-sm text-forge-text-muted">Create a manual lead in CSS and push it to Ai-SHA.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-sm text-forge-text-muted transition-colors hover:text-white">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="forge-label">First Name</label>
                <input className="forge-input" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} />
              </div>
              <div>
                <label className="forge-label">Last Name</label>
                <input className="forge-input" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} />
              </div>
              <div>
                <label className="forge-label">Email</label>
                <input className="forge-input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div>
                <label className="forge-label">Phone</label>
                <input className="forge-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
              <div>
                <label className="forge-label">Company</label>
                <input className="forge-input" value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} />
              </div>
              <div>
                <label className="forge-label">Source</label>
                <select className="forge-input" value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as LeadSource }))}>
                  {LEAD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="forge-label">Goal</label>
                <input className="forge-input" value={form.goal} onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="forge-label">Next Action</label>
                <input className="forge-input" value={form.next_action} onChange={(event) => setForm((current) => ({ ...current, next_action: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="forge-label">Notes</label>
                <textarea className="forge-input min-h-[120px]" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-forge-border bg-forge-surface px-4 py-2 text-sm text-forge-text-primary">
                Cancel
              </button>
              <button type="button" disabled={submitting} onClick={() => void handleCreateLead()} className="forge-btn-gold">
                {submitting ? 'Creating...' : 'Create Lead'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
