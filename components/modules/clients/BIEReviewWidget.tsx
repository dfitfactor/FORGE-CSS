'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

type ReviewSnapshot = {
  id: string
  snapshot_date?: string | null
  bar_score?: number | null
  dbi_score?: number | null
  bli_score?: number | null
  cdi?: number | null
  lsi?: number | null
  pps?: number | null
  generation_state?: string | null
}

type ReviewPayload = {
  snapshots: ReviewSnapshot[]
  latestWeeklyCheckin: {
    responses: Record<string, unknown> | string | null
    submitted_at: string | null
  } | null
}

function labelize(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function toNumberInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n)) : ''
}

export function BIEReviewWidget({
  clientId,
  triggerLabel = 'Review',
  inline = false,
}: {
  clientId: string
  triggerLabel?: string
  inline?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<ReviewPayload | null>(null)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('')
  const [form, setForm] = useState({
    bar_score: '',
    dbi_score: '',
    bli_score: '',
    cdi: '',
    lsi: '',
    pps: '',
    generation_state: '',
    coach_review_notes: '',
  })

  useEffect(() => {
    if (!open) return
    let active = true
    async function loadReview() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/clients/${clientId}/bie/review`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !active) {
          setError(data.error || 'Failed to load review data')
          return
        }
        const nextPayload = data as ReviewPayload
        setPayload(nextPayload)
        const current = nextPayload.snapshots?.[0]
        if (current) {
          setSelectedSnapshotId(current.id)
          setForm({
            bar_score: toNumberInput(current.bar_score),
            dbi_score: toNumberInput(current.dbi_score),
            bli_score: toNumberInput(current.bli_score),
            cdi: toNumberInput(current.cdi),
            lsi: toNumberInput(current.lsi),
            pps: toNumberInput(current.pps),
            generation_state: String(current.generation_state || 'B'),
            coach_review_notes: '',
          })
        }
      } catch {
        if (active) setError('Network error — please try again')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadReview()
    return () => {
      active = false
    }
  }, [clientId, open])

  const responses = useMemo(() => {
    const raw = payload?.latestWeeklyCheckin?.responses
    if (!raw) return [] as Array<[string, unknown]>
    if (typeof raw === 'string') {
      try {
        return Object.entries(JSON.parse(raw) as Record<string, unknown>)
      } catch {
        return []
      }
    }
    return Object.entries(raw)
  }, [payload])

  async function submitReview(action: 'approve' | 'revise_and_approve') {
    if (!selectedSnapshotId) {
      setError('No pending snapshot selected')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/bie/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotId: selectedSnapshotId,
          bar_score: Number(form.bar_score || 0),
          dbi_score: Number(form.dbi_score || 0),
          bli_score: Number(form.bli_score || 0),
          cdi: Number(form.cdi || 0),
          lsi: Number(form.lsi || 0),
          pps: Number(form.pps || 0),
          generation_state: form.generation_state || 'B',
          coach_review_notes: form.coach_review_notes,
          action,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Review failed')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  const panel = (
    <div style={{ background: '#111111', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '16px', padding: '20px', color: '#fff', maxWidth: inline ? '100%' : '820px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Pending coach review
          </div>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>Review weekly check-in scores</div>
        </div>
        {!inline ? (
          <button type="button" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#999' }}>
          <Loader2 size={16} className="animate-spin" /> Loading review data...
        </div>
      ) : null}

      {!loading && payload?.snapshots?.length === 0 ? (
        <p style={{ color: '#888', fontSize: '14px' }}>No pending review snapshots were found.</p>
      ) : null}

      {!loading && payload?.snapshots?.length ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            {([
              ['BAR', 'bar_score'],
              ['DBI', 'dbi_score'],
              ['BLI', 'bli_score'],
              ['CDI', 'cdi'],
              ['LSI', 'lsi'],
              ['PPS', 'pps'],
            ] as const).map(([label, key]) => (
              <div key={key}>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '6px' }}>{label}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form[key]}
                  onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                  style={{ width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 12px', color: '#fff' }}
                />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '6px' }}>State</label>
              <input
                value={form.generation_state}
                onChange={(e) => setForm((current) => ({ ...current, generation_state: e.target.value }))}
                style={{ width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 12px', color: '#fff' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '6px' }}>Coach Review Notes</label>
            <textarea
              value={form.coach_review_notes}
              onChange={(e) => setForm((current) => ({ ...current, coach_review_notes: e.target.value }))}
              rows={4}
              style={{ width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', color: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
              Latest weekly check-in responses
            </div>
            <div style={{ display: 'grid', gap: '8px', maxHeight: inline ? '420px' : '320px', overflowY: 'auto' }}>
              {responses.length ? responses.map(([key, value]) => (
                <div key={key} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>{labelize(key)}</div>
                  <div style={{ color: '#fff', fontSize: '14px' }}>{Array.isArray(value) ? value.join(', ') : String(value ?? '')}</div>
                </div>
              )) : <p style={{ color: '#888', fontSize: '14px' }}>No weekly check-in responses found.</p>}
            </div>
          </div>

          {error ? <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</p> : null}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => submitReview('approve')} disabled={saving} style={{ background: '#D4AF37', color: '#000', border: 'none', borderRadius: '10px', padding: '12px 16px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Approve'}
            </button>
            <button type="button" onClick={() => submitReview('revise_and_approve')} disabled={saving} style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '12px 16px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              Revise & Approve
            </button>
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <>
      {!inline ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ background: '#D4AF37', color: '#000', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          {triggerLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{ background: '#D4AF37', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          {open ? 'Close Review' : triggerLabel}
        </button>
      )}

      {inline && open ? <div style={{ marginTop: '16px' }}>{panel}</div> : null}

      {!inline && open ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 60 }}>
          {panel}
        </div>
      ) : null}
    </>
  )
}
