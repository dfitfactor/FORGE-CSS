'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Brain, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles } from 'lucide-react'

type Insight = {
  id: string
  client_id: string
  client_name: string
  insight_date: string
  insight_type: string
  title: string
  metrics: {
    primary: string
    secondary: string
    tertiary: string
  }
  decision: string
  constraint: string
  actions: string[]
  context: string
  tags: string[]
  confidence_score: number | null
  created_at: string
}

type ClientOption = {
  id: string
  full_name: string
}

function dedupeClientOptions(rows: ClientOption[]) {
  const byName = new Map<string, ClientOption>()

  for (const client of rows) {
    const normalizedName = client.full_name?.trim().toLowerCase()
    if (!normalizedName) continue
    if (!byName.has(normalizedName)) {
      byName.set(normalizedName, client)
    }
  }

  return Array.from(byName.values())
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatConfidence(value: number | null) {
  return value !== null ? `${Math.round(value * 100)}%` : '—'
}

function metricLines(metrics: Insight['metrics']) {
  return [metrics.primary, metrics.secondary, metrics.tertiary].filter(Boolean).slice(0, 3)
}

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [available, setAvailable] = useState(true)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [insightQuery, setInsightQuery] = useState('')
  const [expandedInsightIds, setExpandedInsightIds] = useState<Record<string, boolean>>({})

  async function loadInsights() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/ai-insights', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Failed to load AI insights')
        return
      }

      setInsights(Array.isArray(data.insights) ? data.insights : [])
      const nextClients = dedupeClientOptions(Array.isArray(data.clients) ? data.clients : [])
      setClients(nextClients)
      if (!selectedClientId && nextClients.length > 0) {
        setSelectedClientId(nextClients[0].id)
      }
      setAvailable(data.available !== false)

      if (data.error) {
        setError(data.error)
      }
    } catch {
      setError('Network error while loading AI insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInsights()
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Failed to generate AI insights')
        return
      }

      const count = Number(data.generatedCount ?? 0)
      setSuccess(`Generated ${count} insight${count === 1 ? '' : 's'}`)
      await loadInsights()
    } catch {
      setError('Network error while generating AI insights')
    } finally {
      setGenerating(false)
    }
  }

  async function handleQueryInsight() {
    if (!selectedClientId) {
      setError('Select a client before requesting an insight.')
      return
    }
    if (!insightQuery.trim()) {
      setError('Add a question or focus area for the insight.')
      return
    }

    setQuerying(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'query',
          clientId: selectedClientId,
          query: insightQuery.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Failed to get targeted insight')
        return
      }

      if (data.insight) {
        setInsights(current => [data.insight as Insight, ...current])
      }
      setSuccess('Insight generated')
    } catch {
      setError('Network error while generating targeted insight')
    } finally {
      setQuerying(false)
    }
  }

  function toggleInsightContext(insightId: string) {
    setExpandedInsightIds(current => ({
      ...current,
      [insightId]: !current[insightId],
    }))
  }

  const highConfidenceCount = insights.filter(
    insight => insight.confidence_score !== null && insight.confidence_score >= 0.75
  ).length

  const coveredClientCount = new Set(insights.map(insight => insight.client_id)).size

  return (
    <div className="min-h-screen bg-forge-surface p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-semibold text-forge-text-primary">
              <Brain className="h-6 w-6 text-forge-gold" />
              AI Insights
            </h1>
            <p className="mt-1 text-sm text-forge-text-muted">
              Weekly coach-facing summaries generated from adherence, journals, BIE state, and AI-enabled documents.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadInsights()}
              className="flex items-center gap-2 rounded-xl border border-forge-border bg-forge-surface-3/80 px-3 py-2 text-xs text-forge-text-secondary transition-colors hover:text-forge-text-primary"
            >
              <RefreshCw size={14} />
              Refresh
            </button>

            <button
              onClick={() => void handleGenerate()}
              disabled={generating || !available}
              className="forge-btn-gold flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? 'Generating...' : 'Generate Latest Insights'}
            </button>
          </div>
        </div>

        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {success}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <div className="text-2xl font-bold text-forge-text-primary">{insights.length}</div>
            <div className="mt-1 font-mono text-xs uppercase tracking-wide text-forge-text-muted">
              Stored Insights
            </div>
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <div className="text-2xl font-bold text-forge-gold">{highConfidenceCount}</div>
            <div className="mt-1 font-mono text-xs uppercase tracking-wide text-forge-text-muted">
              High Confidence
            </div>
          </div>

          <div className="rounded-xl border border-forge-border/70 bg-forge-surface-2 p-4">
            <div className="text-2xl font-bold text-emerald-400">{coveredClientCount}</div>
            <div className="mt-1 font-mono text-xs uppercase tracking-wide text-forge-text-muted">
              Clients Covered
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-forge-gold" />
            <h2 className="text-sm font-semibold text-forge-text-primary">Get Insight</h2>
          </div>
          <p className="mt-2 text-sm text-forge-text-muted">
            Ask for a targeted client analysis using uploaded documents, journals, check-ins, and adherence signals.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr_auto]">
            <select
              value={selectedClientId}
              onChange={event => setSelectedClientId(event.target.value)}
              className="rounded-xl border border-forge-border bg-forge-surface-3/60 px-3 py-2 text-sm text-forge-text-primary outline-none"
            >
              <option value="">Select client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                </option>
              ))}
            </select>
            <textarea
              value={insightQuery}
              onChange={event => setInsightQuery(event.target.value)}
              className="min-h-[84px] rounded-xl border border-forge-border bg-forge-surface-3/60 px-3 py-2 text-sm text-forge-text-primary outline-none"
              placeholder="Example: Review this client's food journal and check-ins. Are they meeting protein and calorie targets, what patterns are low, and what journal themes should be addressed next?"
            />
            <button
              onClick={() => void handleQueryInsight()}
              disabled={querying}
              className="forge-btn-gold h-fit self-start disabled:opacity-50"
            >
              {querying ? (
                <span className="flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Getting...</span>
              ) : (
                'Get Insight'
              )}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-forge-text-muted/70" />
          </div>
        ) : insights.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forge-border/70 bg-forge-surface-2 p-12 text-center">
            <Brain size={32} className="mx-auto mb-4 text-forge-text-muted/60" />
            <p className="text-sm text-forge-text-muted">No AI insights yet</p>
            <p className="mt-1 text-xs text-forge-text-muted/80">
              Generate the latest weekly summaries to populate this module.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map(insight => {
              const isExpanded = Boolean(expandedInsightIds[insight.id])
              return (
                <div key={insight.id} className="rounded-2xl border border-forge-border/70 bg-forge-surface-2 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-forge-text-primary">{insight.title}</h2>
                        <span className="rounded-full border border-forge-gold/20 bg-forge-gold/10 px-2 py-0.5 font-mono text-[10px] uppercase text-forge-gold">
                          {insight.insight_type.replace(/_/g, ' ')}
                        </span>
                        {insight.tags.map(tag => (
                          <span key={tag} className="rounded-full border border-forge-border bg-forge-surface-3/70 px-2 py-0.5 font-mono text-[10px] uppercase text-forge-text-muted">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-forge-text-muted">
                        <Link href={`/clients/${insight.client_id}`} className="transition-colors hover:text-forge-text-primary">
                          {insight.client_name}
                        </Link>
                        {' · '}
                        {formatDate(insight.insight_date)}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-forge-text-muted">Confidence</div>
                      <div className="text-sm font-bold text-forge-text-primary">
                        {formatConfidence(insight.confidence_score)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
                    <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-forge-text-muted">
                      Metrics
                    </p>
                    <div className="space-y-1">
                      {metricLines(insight.metrics).map((line, index) => (
                        <p key={`${insight.id}-metric-${index}`} className="text-sm text-forge-text-secondary">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-xl border border-forge-gold/20 bg-forge-gold/10 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-widest text-forge-gold/70">
                        Decision
                      </p>
                      <p className="mt-2 text-lg font-semibold text-forge-text-primary">
                        {insight.decision}
                      </p>
                    </div>

                    <div className="rounded-xl border border-forge-border/70 bg-forge-surface-3/60 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-widest text-forge-text-muted">
                        Constraint
                      </p>
                      <p className="mt-2 text-sm text-forge-text-secondary">
                        {insight.constraint}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-forge-text-muted">
                      Actions
                    </p>
                    <div className="space-y-2">
                      {insight.actions.slice(0, 3).map((action, index) => (
                        <div key={`${insight.id}-action-${index}`} className="flex gap-2 text-sm text-forge-text-secondary">
                          <span className="flex-shrink-0 text-forge-gold">•</span>
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {insight.context && (
                    <div className="mt-4 border-t border-forge-border/70 pt-4">
                      <button
                        onClick={() => toggleInsightContext(insight.id)}
                        className="flex items-center gap-2 text-sm text-forge-text-secondary transition-colors hover:text-forge-text-primary"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        {isExpanded ? 'Hide Context' : 'Show Context'}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 rounded-xl bg-forge-surface-3/60 p-4">
                          <p className="font-mono text-[11px] uppercase tracking-widest text-forge-text-muted">
                            Context
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-forge-text-secondary">
                            {insight.context}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

