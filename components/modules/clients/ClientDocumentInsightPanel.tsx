'use client'

import { useState } from 'react'
import { Brain, Loader2, Sparkles } from 'lucide-react'

type InsightResponse = {
  title: string
  confidence: number
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
}

type Props = {
  clientId: string
  aiDocCount: number
}

const SUGGESTED_QUERIES = [
  'What are the biggest health or recovery risks in these uploaded documents?',
  'What nutrition issues show up across these files?',
  'What should I adjust in this client’s plan based on these docs?',
]

export function ClientDocumentInsightPanel({ clientId, aiDocCount }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<InsightResponse | null>(null)

  async function runInsight(question: string) {
    const trimmed = question.trim()
    if (!trimmed) {
      setError('Enter a question for AI Insights.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/clients/${clientId}/documents/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to generate insight')
      }

      setResult(data.insight as InsightResponse)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Failed to generate insight')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#111111] border border-[#D4AF37]/20 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white uppercase tracking-widest font-mono">
            <Brain className="w-4 h-4 text-[#D4AF37]" />
            Document AI Insights
          </div>
          <p className="mt-2 text-sm text-white/45">
            Ask questions about this client’s uploaded documents. The analysis is scoped to this client only, using only their AI-enabled docs and their own profile context.
          </p>
        </div>
        <div className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-3 py-1 text-xs text-[#D4AF37]">
          {aiDocCount} AI doc{aiDocCount === 1 ? '' : 's'}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {SUGGESTED_QUERIES.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setQuery(suggestion)
              void runInsight(suggestion)
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65 transition-colors hover:text-white"
          >
            <Sparkles className="inline-block w-3 h-3 mr-1 text-[#D4AF37]" />
            {suggestion}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          rows={4}
          className="forge-input resize-none"
          placeholder="Ask AI to analyze this client’s uploaded documents..."
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void runInsight(query)}
            disabled={loading || aiDocCount === 0}
            className="forge-btn-gold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? 'Analyzing...' : 'Ask AI'}
          </button>
          {aiDocCount === 0 ? <span className="text-xs text-white/35">Mark documents as included in AI to enable this.</span> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-white/8 bg-black/20 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">{result.title}</h3>
              <p className="mt-1 text-xs text-white/35">Confidence {Math.round(result.confidence * 100)}%</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {result.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2 py-1 text-[10px] uppercase tracking-wide text-[#D4AF37]">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">Primary</div>
              <div className="mt-2 text-sm text-white/85">{result.metrics.primary}</div>
            </div>
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">Secondary</div>
              <div className="mt-2 text-sm text-white/85">{result.metrics.secondary}</div>
            </div>
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">Tertiary</div>
              <div className="mt-2 text-sm text-white/85">{result.metrics.tertiary}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/35">Decision</div>
              <p className="mt-2 text-sm text-white">{result.decision}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/35">Constraint</div>
              <p className="mt-2 text-sm text-white/80">{result.constraint}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/35">Context</div>
              <p className="mt-2 text-sm text-white/75">{result.context}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/35">Actions</div>
              <div className="mt-2 space-y-2">
                {result.actions.map((action) => (
                  <div key={action} className="text-sm text-white/85">
                    {action}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
