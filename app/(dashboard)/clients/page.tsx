'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Search, AlertTriangle, ChevronUp, ChevronDown,
  ArrowRight, Zap, Filter
} from 'lucide-react'
import { useDashboardPreviewMode } from '@/lib/use-dashboard-preview-mode'

type Client = {
  id: string
  full_name: string
  email: string
  date_of_birth: string | null
  age: number | null
  gender: string | null
  status: string
  current_stage: string | null
  primary_goal: string | null
  bar_score: number | null
  dbi_score: number | null
  bli_score: number | null
  gps: number | null
  snapshot_updated_at: string | null
  last_session: string | null
}
function getClientInfoScore(client: Client) {
  let score = 0
  if (client.email?.trim()) score += 1
  if (client.date_of_birth) score += 1
  if (client.age !== null && client.age !== undefined) score += 1
  if (client.gender?.trim()) score += 1
  if (client.primary_goal?.trim()) score += 1
  if (client.current_stage?.trim()) score += 1
  if (client.bar_score !== null && client.bar_score !== undefined) score += 1
  if (client.dbi_score !== null && client.dbi_score !== undefined) score += 1
  if (client.bli_score !== null && client.bli_score !== undefined) score += 1
  if (client.gps !== null && client.gps !== undefined) score += 1
  if (client.snapshot_updated_at) score += 1
  if (client.last_session) score += 1
  return score
}

function dedupeSparseClientRows(rows: Client[]) {
  const byName = new Map<string, Client>()

  for (const client of rows) {
    const normalizedName = client.full_name?.trim().toLowerCase()
    if (!normalizedName) continue

    const existing = byName.get(normalizedName)
    if (!existing) {
      byName.set(normalizedName, client)
      continue
    }

    const existingScore = getClientInfoScore(existing)
    const currentScore = getClientInfoScore(client)
    const existingSparse = existingScore <= 1
    const currentSparse = currentScore <= 1

    if (existingSparse && currentScore > existingScore) {
      byName.set(normalizedName, client)
    } else if (!existingSparse && currentSparse) {
      continue
    } else if (currentScore > existingScore) {
      byName.set(normalizedName, client)
    }
  }

  return Array.from(byName.values())
}

const STAGES = ['all', 'foundations', 'optimization', 'resilience', 'growth', 'empowerment']
const STAGE_COLORS: Record<string, string> = {
  foundations: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  optimization: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  resilience: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  growth: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  empowerment: 'text-forge-gold bg-forge-gold/10 border-forge-gold/20',
}

function getGpsLabel(gps: number) {
  if (gps >= 80) return 'On Track'
  if (gps >= 65) return 'Good Progress'
  if (gps >= 50) return 'Needs Attention'
  if (gps >= 35) return 'At Risk'
  return 'Intervention Needed'
}

function BIEBar({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || value === undefined) {
    return <span className="text-forge-text-muted/70 text-xs font-mono">-</span>
  }
  const v = Number(value)
  if (isNaN(v)) {
    return <span className="text-forge-text-muted/70 text-xs font-mono">-</span>
  }
  const isGood = invert ? v <= 40 : v >= 65
  const isMid = invert ? v <= 60 : v >= 45
  const color = isGood ? 'text-emerald-400' : isMid ? 'text-forge-gold' : 'text-red-400'
  return <span className={`text-xs font-mono font-bold ${color}`}>{Math.round(v)}</span>
}

function GPSBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-forge-text-muted/70 text-xs font-mono">-</span>
  }

  const gps = Math.round(value)
  let color = 'text-red-400'
  if (gps >= 80) color = 'text-emerald-400'
  else if (gps >= 65) color = 'text-forge-gold'
  else if (gps >= 50) color = 'text-amber-400'
  else if (gps >= 35) color = 'text-orange-400'

  return <span title={getGpsLabel(gps)} className={`text-xs font-mono font-bold ${color}`}>{gps}%</span>
}

function PriorityCard({ client }: { client: Client }) {
  const bar = Number(client.bar_score)
  const dbi = Number(client.dbi_score)
  const bli = Number(client.bli_score)
  const reasons = []
  if (bar < 50) reasons.push(`BAR ${Math.round(bar)} - low adherence`)
  if (dbi > 60) reasons.push(`DBI ${Math.round(dbi)} - high disruption`)
  if (bli > 65) reasons.push(`BLI ${Math.round(bli)} - elevated load`)

  return (
    <Link href={`/clients/${client.id}`}
      className="bg-forge-surface-2 border border-amber-500/30 rounded-2xl p-5 hover:border-amber-500/60 transition-all group block">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-forge-text-primary group-hover:text-forge-gold transition-colors">{client.full_name}</p>
          <p className="text-xs text-forge-text-muted capitalize mt-0.5">{client.current_stage}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-amber-400" />
          <span className="text-[10px] font-mono text-amber-400 uppercase">Needs Attention</span>
        </div>
      </div>
      <div className="space-y-1.5 mb-3">
        {reasons.map((reason, index) => (
          <div key={index} className="flex items-center gap-2 text-xs text-forge-text-secondary">
            <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
            {reason}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-forge-border/60">
        <div className="flex gap-3 text-xs text-forge-text-muted">
          <span>BAR <BIEBar value={client.bar_score} /></span>
          <span>DBI <BIEBar value={client.dbi_score} invert /></span>
          <span>BLI <BIEBar value={client.bli_score} invert /></span>
        </div>
        <ArrowRight size={13} className="text-forge-text-muted/70 group-hover:text-forge-gold transition-colors" />
      </div>
    </Link>
  )
}

type SortKey = 'full_name' | 'current_stage' | 'bar' | 'dbi' | 'bli' | 'gps' | 'last_session'

export default function ClientsPage() {
  const previewMode = useDashboardPreviewMode()
  const isDesktopPreview = previewMode === 'desktop'
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    fetch('/api/clients')
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error ?? `Request failed (${r.status})`)
        return data
      })
      .then(d => {
        const nextClients = Array.isArray(d) ? d.filter((client): client is Client => Boolean(client?.id && client?.full_name?.trim())) : []
        setClients(dedupeSparseClientRows(nextClients))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const priorityClients = clients
    .filter(c => {
      if (c.status !== 'active') return false
      const bar = c.bar_score !== null ? Number(c.bar_score) : null
      const dbi = c.dbi_score !== null ? Number(c.dbi_score) : null
      const bli = c.bli_score !== null ? Number(c.bli_score) : null
      return (bar !== null && bar < 50) ||
        (dbi !== null && dbi > 60) ||
        (bli !== null && bli > 65)
    })
    .sort((a, b) => {
      const at = a.snapshot_updated_at ? new Date(a.snapshot_updated_at).getTime() : 0
      const bt = b.snapshot_updated_at ? new Date(b.snapshot_updated_at).getTime() : 0
      return bt - at
    })
    .slice(0, 3)

  const filtered = clients
    .filter(c => {
      if (statusFilter === 'active' && c.status !== 'active') return false
      if (statusFilter === 'inactive' && c.status === 'active') return false
      if (stageFilter !== 'all' && c.current_stage !== stageFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return c.full_name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.primary_goal?.toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => {
      let av: string | number = 0
      let bv: string | number = 0
      if (sortKey === 'full_name') { av = a.full_name; bv = b.full_name }
      else if (sortKey === 'current_stage') { av = a.current_stage ?? ''; bv = b.current_stage ?? '' }
      else if (sortKey === 'bar') { av = Number(a.bar_score ?? -1); bv = Number(b.bar_score ?? -1) }
      else if (sortKey === 'dbi') { av = Number(a.dbi_score ?? -1); bv = Number(b.dbi_score ?? -1) }
      else if (sortKey === 'bli') { av = Number(a.bli_score ?? -1); bv = Number(b.bli_score ?? -1) }
      else if (sortKey === 'gps') { av = Number(a.gps ?? -1); bv = Number(b.gps ?? -1) }
      else if (sortKey === 'last_session') { av = a.last_session ?? ''; bv = b.last_session ?? '' }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={10} className="text-forge-text-muted/60" />
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-forge-gold" />
      : <ChevronDown size={10} className="text-forge-gold" />
  }

  function ThBtn({ col, label }: { col: SortKey; label: string }) {
    return (
      <button onClick={() => toggleSort(col)}
        className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-forge-text-muted hover:text-forge-text-primary transition-colors">
        {label}<SortIcon col={col} />
      </button>
    )
  }

  return (
    <div className={`min-h-screen bg-forge-surface ${isDesktopPreview ? 'p-4 md:p-8' : 'p-4'}`}>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className={`flex flex-col gap-4 ${isDesktopPreview ? 'sm:flex-row sm:items-center sm:justify-between' : ''}`}>
          <div>
            <h1 className="text-xl font-bold text-forge-text-primary">Clients</h1>
            <p className="text-sm text-forge-text-muted mt-0.5">{clients.filter(c => c.status === 'active').length} active · {clients.length} total</p>
          </div>
          <Link href="/clients/new" className={`forge-btn-gold inline-flex w-full items-center justify-center gap-2 text-sm ${isDesktopPreview ? 'sm:w-auto' : ''}`}>
            <Plus size={15} /> New Client
          </Link>
        </div>

        {priorityClients.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={13} className="text-amber-400" />
              <p className="text-xs font-mono uppercase tracking-widest text-amber-400/70">Requires Attention</p>
            </div>
            <div className={`grid grid-cols-1 gap-3 ${isDesktopPreview ? 'md:grid-cols-3' : ''}`}>
              {priorityClients.map(c => <PriorityCard key={c.id} client={c} />)}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-forge-text-primary/25" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients..."
                className="forge-input pl-8 py-2 text-sm w-full"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-forge-text-primary/25" />
              {(['all', 'active', 'inactive'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all
                    ${statusFilter === s ? 'bg-forge-gold text-forge-purple-dark' : 'bg-forge-surface-3/80 text-forge-text-muted hover:text-forge-text-primary'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STAGES.map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all
                  ${stageFilter === s ? 'bg-forge-gold text-forge-purple-dark' : 'bg-forge-surface-3/80 text-forge-text-muted hover:text-forge-text-primary'}`}>
                {s === 'all' ? 'All Stages' : s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Zap size={20} className="text-forge-text-muted/60 animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-forge-surface-2 border border-dashed border-forge-border/70 rounded-2xl p-12 text-center">
            <Users size={32} className="mx-auto mb-4 text-forge-text-muted/60" />
            <p className="text-sm text-forge-text-muted">{search || stageFilter !== 'all' ? 'No clients match your filters' : 'No clients yet'}</p>
            {!search && stageFilter === 'all' && (
              <Link href="/clients/new" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-forge-gold text-forge-purple-dark text-sm font-semibold rounded-xl">
                <Plus size={14} /> Add First Client
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-forge-surface-2 border border-forge-border/70 rounded-2xl overflow-hidden">
            <div className={`space-y-3 p-3 ${isDesktopPreview ? 'md:hidden' : ''}`}>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/clients/${c.id}`)}
                  className={`w-full rounded-2xl border border-forge-border/70 bg-forge-surface-3/50 p-4 text-left transition-colors hover:bg-forge-surface-3/80 ${c.status !== 'active' ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-forge-text-primary">{c.full_name}</p>
                      <p className="mt-1 truncate text-xs text-forge-text-muted">{c.email}</p>
                    </div>
                    <ArrowRight size={14} className="mt-0.5 flex-shrink-0 text-forge-text-muted/60" />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase capitalize ${STAGE_COLORS[c.current_stage ?? ''] ?? 'text-forge-text-muted bg-forge-surface-3/70 border-forge-border'}`}>
                      {c.current_stage ?? '-'}
                    </span>
                    <span className="rounded-full border border-forge-border bg-forge-surface-2 px-2 py-0.5 text-[10px] text-forge-text-secondary">
                      {c.last_session ? new Date(c.last_session).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No recent session'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl border border-forge-border/60 bg-forge-surface-2 px-3 py-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-forge-text-muted">BAR</div>
                      <div className="mt-1"><BIEBar value={c.bar_score} /></div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-forge-text-muted">DBI</div>
                      <div className="mt-1"><BIEBar value={c.dbi_score} invert /></div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-forge-text-muted">BLI</div>
                      <div className="mt-1"><BIEBar value={c.bli_score} invert /></div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-forge-text-muted">GPS</div>
                      <div className="mt-1"><GPSBadge value={c.gps} /></div>
                    </div>
                  </div>

                  {c.primary_goal ? (
                    <p className="mt-3 line-clamp-2 text-xs text-forge-text-muted">{c.primary_goal}</p>
                  ) : null}
                </button>
              ))}
            </div>
            <div className={`overflow-x-auto ${isDesktopPreview ? 'hidden md:block' : 'hidden'}`}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-forge-border/70 bg-forge-surface-3/50">
                    <th className="text-left px-5 py-3"><ThBtn col="full_name" label="Client" /></th>
                    <th className="text-left px-4 py-3"><ThBtn col="current_stage" label="Stage" /></th>
                    <th className="text-left px-4 py-3 hidden md:table-cell"><span className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">DOB</span></th>
                    <th className="text-center px-4 py-3 hidden md:table-cell"><span className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Age</span></th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell"><span className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Gender</span></th>
                    <th className="text-center px-4 py-3"><ThBtn col="bar" label="BAR" /></th>
                    <th className="text-center px-4 py-3"><ThBtn col="dbi" label="DBI" /></th>
                    <th className="text-center px-4 py-3"><ThBtn col="bli" label="BLI" /></th>
                    <th className="text-center px-4 py-3"><ThBtn col="gps" label="GPS" /></th>
                    <th className="text-left px-4 py-3 hidden md:table-cell"><ThBtn col="last_session" label="Last Session" /></th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell"><span className="text-[10px] font-mono uppercase tracking-widest text-forge-text-muted">Goal</span></th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}
                      onClick={() => router.push(`/clients/${c.id}`)}
                      className={`border-b border-forge-border/60 last:border-0 cursor-pointer hover:bg-forge-surface-3/60 transition-colors
                        ${c.status !== 'active' ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm font-semibold text-forge-text-primary">{c.full_name}</p>
                          <p className="text-xs text-forge-text-muted truncate max-w-[180px]">{c.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase capitalize
                          ${STAGE_COLORS[c.current_stage ?? ''] ?? 'text-forge-text-muted bg-forge-surface-3/70 border-forge-border'}`}>
                          {c.current_stage ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-forge-text-muted font-mono">
                          {c.date_of_birth ? new Date(`${c.date_of_birth}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center hidden md:table-cell"><span className="text-xs text-forge-text-secondary font-mono">{c.age ?? '-'}</span></td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-forge-text-muted capitalize">{c.gender ? c.gender.replace(/_/g, ' ') : '-'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center"><BIEBar value={c.bar_score} /></td>
                      <td className="px-4 py-3.5 text-center"><BIEBar value={c.dbi_score} invert /></td>
                      <td className="px-4 py-3.5 text-center"><BIEBar value={c.bli_score} invert /></td>
                      <td className="px-4 py-3.5 text-center"><GPSBadge value={c.gps} /></td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-forge-text-muted font-mono">
                          {c.last_session ? new Date(c.last_session).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-forge-text-muted truncate max-w-[160px] block">{c.primary_goal ?? '-'}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <ArrowRight size={13} className="text-forge-text-muted/60 group-hover:text-forge-text-primary" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`border-t border-forge-border/60 px-4 py-3 text-center flex flex-col gap-2 ${isDesktopPreview ? 'md:px-5 md:text-left md:flex-row md:items-center md:justify-between' : ''}`}>
              <p className="text-xs text-forge-text-primary/25">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-forge-text-muted/70 font-mono">Click any row to open client</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

