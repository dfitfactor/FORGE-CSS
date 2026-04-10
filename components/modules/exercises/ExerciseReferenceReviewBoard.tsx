'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react'

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'all'

type Candidate = {
  id: string
  primary_exercise_id: string
  primary_exercise_name: string
  reference_record_id: string
  reference_display_name: string | null
  reference_category: string | null
  reference_movement_pattern: string | null
  reference_equipment_required: string | null
  reference_difficulty_level: string | null
  duplicate_status: string
  review_status: string
  approved_for_fallback: boolean
  match_confidence: number | null
  match_reason: string | null
  enrichment_recommendation: string | null
  manual_review_status: 'pending' | 'approved' | 'rejected' | 'enriched'
  created_at: string
  updated_at: string
}

type Counts = {
  pending: number
  approved: number
  rejected: number
}

const FILTERS: Array<{ value: ReviewStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

function formatStatusTone(status: string) {
  if (status === 'approved') return 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20'
  if (status === 'rejected') return 'bg-rose-500/10 text-rose-300 border-rose-400/20'
  return 'bg-amber-500/10 text-amber-300 border-amber-400/20'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function prettyLabel(value: string | null | undefined) {
  if (!value) return 'Not provided'
  return value.replace(/_/g, ' ')
}

export default function ExerciseReferenceReviewBoard() {
  const [filter, setFilter] = useState<ReviewStatus>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0 })
  const [savingId, setSavingId] = useState<string | null>(null)

  async function loadQueue(nextFilter: ReviewStatus) {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/exercises/review?status=${nextFilter}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load exercise review queue')
      }

      setCandidates(Array.isArray(payload?.candidates) ? payload.candidates : [])
      setCounts(payload?.counts ?? { pending: 0, approved: 0, rejected: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exercise review queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQueue(filter)
  }, [filter])

  async function handleDecision(candidateId: string, action: 'approve' | 'reject') {
    setSavingId(candidateId)
    setError(null)

    try {
      const response = await fetch('/api/exercises/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, action }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update review decision')
      }

      await loadQueue(filter)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update review decision')
    } finally {
      setSavingId(null)
    }
  }

  const visibleCount = useMemo(() => candidates.length, [candidates])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="forge-card p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-forge-text-muted">Pending</div>
          <div className="mt-3 text-3xl font-semibold text-amber-300">{counts.pending}</div>
          <p className="mt-2 text-sm text-forge-text-muted">Candidates waiting on a coach decision.</p>
        </div>
        <div className="forge-card p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-forge-text-muted">Approved</div>
          <div className="mt-3 text-3xl font-semibold text-emerald-300">{counts.approved}</div>
          <p className="mt-2 text-sm text-forge-text-muted">Confirmed duplicates or enrichment links.</p>
        </div>
        <div className="forge-card p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-forge-text-muted">Rejected</div>
          <div className="mt-3 text-3xl font-semibold text-rose-300">{counts.rejected}</div>
          <p className="mt-2 text-sm text-forge-text-muted">Pairs kept out of the vetted library path.</p>
        </div>
      </div>

      <div className="forge-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-forge-text-primary">Reference Match Queue</h2>
            <p className="mt-1 max-w-3xl text-sm text-forge-text-muted">
              Review imported exercise matches without changing the authoritative FORGË library. Approving a match confirms the
              reference record as a duplicate of your primary exercise. Rejecting leaves the primary library untouched.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  filter === option.value
                    ? 'border-forge-gold bg-forge-gold text-forge-purple-dark'
                    : 'border-forge-border bg-forge-surface-3 text-forge-text-secondary hover:text-forge-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
          <ShieldAlert className="h-4 w-4 flex-shrink-0 text-cyan-300" />
          <span>Primary FORGË records remain the source of truth. This queue only governs secondary-reference matching.</span>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        ) : null}

        <div className="mt-5 text-sm text-forge-text-muted">
          Showing {visibleCount} {visibleCount === 1 ? 'candidate' : 'candidates'} in the {filter} view.
        </div>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-forge-border bg-forge-surface-3/40 px-4 py-6 text-sm text-forge-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading exercise review queue...
          </div>
        ) : candidates.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-forge-border bg-forge-surface-3/30 px-5 py-10 text-center">
            <div className="text-lg font-medium text-forge-text-primary">No candidates in this view</div>
            <p className="mt-2 text-sm text-forge-text-muted">
              Once the import pipeline surfaces new duplicates or fuzzy matches, they’ll show up here for review.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {candidates.map((candidate) => {
              const isSaving = savingId === candidate.id

              return (
                <div key={candidate.id} className="rounded-2xl border border-forge-border bg-forge-surface-3/30 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-forge-gold/25 bg-forge-gold/10 px-2.5 py-1 text-xs font-medium text-forge-gold">
                          {candidate.match_confidence !== null ? `${Math.round(candidate.match_confidence * 100)}% confidence` : 'No score'}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${formatStatusTone(candidate.manual_review_status)}`}>
                          {prettyLabel(candidate.manual_review_status)}
                        </span>
                        <span className="rounded-full border border-forge-border bg-forge-surface-2 px-2.5 py-1 text-xs text-forge-text-secondary">
                          {prettyLabel(candidate.match_reason)}
                        </span>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-[0.24em] text-forge-text-muted">Primary Exercise</div>
                        <div className="mt-1 text-lg font-semibold text-forge-text-primary">{candidate.primary_exercise_name}</div>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-[0.24em] text-forge-text-muted">Imported Reference</div>
                        <div className="mt-1 text-lg font-semibold text-forge-text-primary">
                          {candidate.reference_display_name || 'Untitled reference record'}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[320px]">
                      <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-forge-text-muted">Category</div>
                        <div className="mt-1 text-sm text-forge-text-primary">{prettyLabel(candidate.reference_category)}</div>
                      </div>
                      <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-forge-text-muted">Movement</div>
                        <div className="mt-1 text-sm text-forge-text-primary">{prettyLabel(candidate.reference_movement_pattern)}</div>
                      </div>
                      <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-forge-text-muted">Equipment</div>
                        <div className="mt-1 text-sm text-forge-text-primary">{prettyLabel(candidate.reference_equipment_required)}</div>
                      </div>
                      <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-forge-text-muted">Difficulty</div>
                        <div className="mt-1 text-sm text-forge-text-primary">{prettyLabel(candidate.reference_difficulty_level)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-forge-text-muted">Duplicate Status</div>
                      <div className="mt-1 text-sm text-forge-text-primary">{prettyLabel(candidate.duplicate_status)}</div>
                    </div>
                    <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-forge-text-muted">Reference Review</div>
                      <div className="mt-1 text-sm text-forge-text-primary">{prettyLabel(candidate.review_status)}</div>
                    </div>
                    <div className="rounded-xl border border-forge-border bg-forge-surface-2 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-forge-text-muted">Queued</div>
                      <div className="mt-1 text-sm text-forge-text-primary">{formatDate(candidate.created_at)}</div>
                    </div>
                  </div>

                  {candidate.enrichment_recommendation ? (
                    <div className="mt-4 rounded-xl border border-forge-gold/20 bg-forge-gold/5 px-4 py-3 text-sm text-forge-text-secondary">
                      <span className="font-medium text-forge-text-primary">Suggested enrichment:</span> {candidate.enrichment_recommendation}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-forge-text-muted">Updated {formatDate(candidate.updated_at)}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDecision(candidate.id, 'approve')}
                        disabled={isSaving || candidate.manual_review_status === 'approved'}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve Match
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDecision(candidate.id, 'reject')}
                        disabled={isSaving || candidate.manual_review_status === 'rejected'}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        Reject Match
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
