'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Search, AlertTriangle, ChevronUp, ChevronDown,
  ArrowRight, Zap, Filter
} from 'lucide-react'

type Client = {
  id: string; full_name: string; email: string
  status: string
  current_stage: string | null
  primary_goal: string | null
  bar_score: number | null
  dbi_score: number | null
  bli_score: number | null
  snapshot_updated_at: string | null
  last_session: string | null
}

const STAGES = ['all', 'foundations', 'optimization', 'resilience', 'growth', 'empowerment']
const STAGE_COLORS: Record<string, string> = {
  foundations: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  optimization: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  resilience: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  growth: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  empowerment: 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20',
}

function BIEBar({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || value === undefined) {
    return <span className="text-white/20 text-xs font-mono">—</span>
  }
  const v = Number(value)
  if (isNaN(v)) {
    return <span className="text-white/20 text-xs font-mono">—</span>
  }
  const isGood = invert ? v <= 40 : v >= 65
  const isMid = invert ? v <= 60 : v >= 45
  const color = isGood ? 'text-emerald-400' : isMid ? 'text-[#D4AF37]' : 'text-red-400'
  return <span className={`text-xs font-mono font-bold ${color}`}>{Math.round(v)}</span>
}

function PriorityCard({ client }: { client: Client }) {
  const bar = Number(client.bar_score)
  const dbi = Number(client.dbi_score)
  const bli = Number(client.bli_score)
  const reasons = []
  if (bar < 50) reasons.push(`BAR ${Math.round(bar)} — low adherence`)
  if (dbi > 60) reasons.push(`DBI ${Math.round(dbi)} — high disruption`)
  if (bli > 65) reasons.push(`BLI ${Math.round(bli)} — elevated load`)

  return (
    <Link href={`/clients/${client.id}`}
      className="bg-[#111111] border border-amber-500/30 rounded-2xl p-5 hover:border-amber-500/60 transition-all group block">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white group-hover:text-[#D4AF37] transition-colors">{client.full_name}</p>
          <p className="text-xs text-white/35 capitalize mt-0.5">{client.current_stage}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-amber-400" />
          <span className="text-[10px] font-mono text-amber-400 uppercase">Needs Attention</span>
        </div>
      </div>
      <div className="space-y-1.5 mb-3">
        {reasons.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-white/50">
            <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
            {r}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-white/6">
        <div className="flex gap-3 text-xs text-white/30">
          <span>BAR <BIEBar value={client.bar_score} /></span>
          <span>DBI <BIEBar value={client.dbi_score} invert /></span>
          <span>BLI <BIEBar value={client.bli_score} invert /></span>
        </div>
        <ArrowRight size={13} className="text-white/20 group-hover:text-[#D4AF37] transition-colors" />
      </div>
    </Link>
  )
}

type SortKey = 'full_name' | 'current_stage' | 'bar' | 'dbi' | 'bli' | 'last_session'

export default function ClientsPage() {
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
      .then(d => { setClients(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Priority clients — low BAR, high DBI, or high BLI (null-safe)
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

  // Filtered + sorted list
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
      let av: string | number = 0, bv: string | number = 0
      if (sortKey === 'full_name') { av = a.full_name; bv = b.full_name }
      else if (sortKey === 'current_stage') { av = a.current_stage ?? ''; bv = b.current_stage ?? '' }
      else if (sortKey === 'bar') { av = Number(a.bar_score ?? -1); bv = Number(b.bar_score ?? -1) }
      else if (sortKey === 'dbi') { av = Number(a.dbi_score ?? -1); bv = Number(b.dbi_score ?? -1) }
      else if (sortKey === 'bli') { av = Number(a.bli_score ?? -1); bv = Number(b.bli_score ?? -1) }
      else if (sortKey === 'last_session') { av = a.last_session ?? ''; bv = b.last_session ?? '' }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={10} className="text-white/15" />
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-[#D4AF37]" />
      : <ChevronDown size={10} className="text-[#D4AF37]" />
  }

  function ThBtn({ col, label }: { col: SortKey; label: string }) {
    return (
      <button onClick={() => toggleSort(col)}
        className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-white/30 hover:text-white transition-colors">
        {label}<SortIcon col={col} />
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Clients</h1>
            <p className="text-sm text-white/40 mt-0.5">{clients.filter(c => c.status === 'active').length} active · {clients.length} total</p>
          </div>
          <Link href="/clients/new"
            className="forge-btn-gold flex items-center gap-2 text-sm">
            <Plus size={15} /> New Client
          </Link>
        </div>

        {/* Priority cards */}
        {priorityClients.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={13} className="text-amber-400" />
              <p className="text-xs font-mono uppercase tracking-widest text-amber-400/70">Requires Attention</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {priorityClients.map(c => <PriorityCard key={c.id} client={c} />)}
            </div>
          </div>
        )}

        {/* Filters + search */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients..."
                className="forge-input pl-8 py-2 text-sm w-full"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-white/25" />
              {(['all', 'active', 'inactive'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all
                    ${statusFilter === s ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STAGES.map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all
                  ${stageFilter === s ? 'bg-[#D4AF37] text-black' : 'bg-white/6 text-white/40 hover:text-white'}`}>
                {s === 'all' ? 'All Stages' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Client table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Zap size={20} className="text-white/15 animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Users size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">{search || stageFilter !== 'all' ? 'No clients match your filters' : 'No clients yet'}</p>
            {!search && stageFilter === 'all' && (
              <Link href="/clients/new" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-black text-sm font-semibold rounded-xl">
                <Plus size={14} /> Add First Client
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-[#111111] border border-white/8 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8 bg-white/2">
                    <th className="text-left px-5 py-3"><ThBtn col="full_name" label="Client" /></th>
                    <th className="text-left px-4 py-3"><ThBtn col="current_stage" label="Stage" /></th>
                    <th className="text-center px-4 py-3"><ThBtn col="bar" label="BAR" /></th>
                    <th className="text-center px-4 py-3"><ThBtn col="dbi" label="DBI" /></th>
                    <th className="text-center px-4 py-3"><ThBtn col="bli" label="BLI" /></th>
                    <th className="text-left px-4 py-3 hidden md:table-cell"><ThBtn col="last_session" label="Last Session" /></th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Goal</span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={c.id}
                      onClick={() => router.push(`/clients/${c.id}`)}
                      className={`border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/3 transition-colors
                        ${c.status !== 'active' ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm font-semibold text-white">{c.full_name}</p>
                          <p className="text-xs text-white/30 truncate max-w-[180px]">{c.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase capitalize
                          ${STAGE_COLORS[c.current_stage ?? ''] ?? 'text-white/40 bg-white/5 border-white/10'}`}>
                          {c.current_stage ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center"><BIEBar value={c.bar_score} /></td>
                      <td className="px-4 py-3.5 text-center"><BIEBar value={c.dbi_score} invert /></td>
                      <td className="px-4 py-3.5 text-center"><BIEBar value={c.bli_score} invert /></td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-white/35 font-mono">
                          {c.last_session ? new Date(c.last_session).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-white/35 truncate max-w-[160px] block">{c.primary_goal ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <ArrowRight size={13} className="text-white/15 group-hover:text-white" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-white/6 flex items-center justify-between">
              <p className="text-xs text-white/25">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-white/20 font-mono">Click any row to open client</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}