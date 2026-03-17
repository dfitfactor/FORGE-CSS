'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Users, Plus, Search, X } from 'lucide-react'

type Client = {
  id: string; full_name: string; email: string
  current_stage: string; status: string; program_tier: string | null
  primary_goal: string | null; bar: number | null; dbi: number | null
  generation_state: string | null
}

const STAGE_LABELS: Record<string, string> = {
  foundations: 'Foundation', optimization: 'Optimization',
  resilience: 'Resilience', growth: 'Growth', empowerment: 'Empowerment',
}
const TIER_LABELS: Record<string, string> = {
  forge_lite: 'Lite', forge_core: 'Core', forge_elite: 'Elite',
}
const STATE_COLORS: Record<string, string> = {
  A: 'state-badge-a', B: 'state-badge-b', C: 'state-badge-c',
  D: 'state-badge-d', E: 'state-badge-e',
}

function ClientCard({ client }: { client: Client }) {
  const bar = client.bar ? Number(client.bar) : null
  const dbi = client.dbi ? Number(client.dbi) : null
  const barColor = bar !== null ? bar >= 80 ? 'text-state-stable' : bar >= 65 ? 'text-state-simplified' : 'text-state-recovery' : 'text-forge-text-muted'
  const dbiColor = dbi !== null ? dbi >= 70 ? 'text-state-recovery' : dbi >= 50 ? 'text-state-simplified' : 'text-state-stable' : 'text-forge-text-muted'
  const initials = client.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Link href={`/clients/${client.id}`} className="forge-card-hover group animate-slide-up">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-forge-purple flex items-center justify-center text-sm font-bold text-forge-gold flex-shrink-0">{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-forge-text-primary group-hover:text-white truncate">{client.full_name}</div>
          <div className="text-xs text-forge-text-muted truncate">{client.email}</div>
        </div>
        <span className={`forge-badge text-xs flex-shrink-0 ${client.status === 'active' ? 'bg-state-stable/10 text-state-stable border border-state-stable/30' : 'bg-forge-surface-3 text-forge-text-muted border border-forge-border'}`}>{client.status}</span>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="stage-badge">{STAGE_LABELS[client.current_stage] ?? client.current_stage}</span>
        {client.program_tier && <span className="forge-badge bg-forge-surface-3 text-forge-text-secondary border border-forge-border text-xs">{TIER_LABELS[client.program_tier] ?? client.program_tier}</span>}
        {client.generation_state && <span className={`forge-badge text-xs ${STATE_COLORS[client.generation_state] ?? ''}`}>State {client.generation_state}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-forge-surface-3 rounded-lg p-2.5">
          <div className="text-xs text-forge-text-muted mb-1">BAR</div>
          <div className={`text-lg font-bold font-mono ${barColor}`}>{bar !== null ? bar.toFixed(0) : '-'}</div>
          {bar !== null && <div className="bie-bar mt-1"><div className={`bie-bar-fill ${bar >= 80 ? 'bg-state-stable' : bar >= 65 ? 'bg-state-simplified' : 'bg-state-recovery'}`} style={{ width: `${bar}%` }} /></div>}
        </div>
        <div className="bg-forge-surface-3 rounded-lg p-2.5">
          <div className="text-xs text-forge-text-muted mb-1">DBI</div>
          <div className={`text-lg font-bold font-mono ${dbiColor}`}>{dbi !== null ? dbi.toFixed(0) : '-'}</div>
          {dbi !== null && <div className="bie-bar mt-1"><div className={`bie-bar-fill ${dbi >= 70 ? 'bg-state-recovery' : dbi >= 50 ? 'bg-state-simplified' : 'bg-state-stable'}`} style={{ width: `${dbi}%` }} /></div>}
        </div>
      </div>
      {client.primary_goal && <p className="text-xs text-forge-text-muted truncate border-t border-forge-border pt-3">🎯 {client.primary_goal}</p>}
    </Link>
  )
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => { setClients(d.clients ?? d ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return clients.filter(c => {
      const matchesQuery = !q || c.full_name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.primary_goal?.toLowerCase().includes(q) || c.current_stage?.toLowerCase().includes(q)
      const matchesStage = stageFilter === 'all' || c.current_stage === stageFilter
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter
      return matchesQuery && matchesStage && matchesStatus
    })
  }, [clients, query, stageFilter, statusFilter])

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-forge-text-primary flex items-center gap-3"><Users className="w-6 h-6 text-forge-gold" />Clients</h1>
          <p className="text-forge-text-muted mt-1">{loading ? 'Loading...' : `${filtered.length} of ${clients.length} clients`}</p>
        </div>
        <Link href="/clients/new" className="forge-btn-gold"><Plus className="w-4 h-4" />Add Client</Link>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-muted pointer-events-none" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, email, goal..." className="forge-input pl-9 pr-9" autoFocus />
          {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-forge-text-muted hover:text-forge-text-primary"><X className="w-4 h-4" /></button>}
        </div>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="forge-input w-auto min-w-[140px]">
          <option value="all">All Stages</option>
          {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="forge-input w-auto min-w-[130px]">
          <option value="all">All Status</option>
          {['active','paused','graduated','churned'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
      </div>
      {!loading && query && filtered.length === 0 && (
        <div className="forge-card text-center py-10">
          <Search className="w-8 h-8 mx-auto mb-3 text-forge-text-muted opacity-40" />
          <p className="text-forge-text-muted">No clients match "{query}"</p>
          <button onClick={() => { setQuery(''); setStageFilter('all'); setStatusFilter('all') }} className="mt-3 text-sm text-forge-gold hover:underline">Clear filters</button>
        </div>
      )}
      {!loading && clients.length === 0 && (
        <div className="forge-card text-center py-16">
          <Users className="w-12 h-12 mx-auto mb-4 text-forge-text-muted opacity-50" />
          <h3 className="text-lg font-medium text-forge-text-secondary mb-2">No clients yet</h3>
          <Link href="/clients/new" className="forge-btn-gold"><Plus className="w-4 h-4" />Add First Client</Link>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(client => <ClientCard key={client.id} client={client} />)}
        </div>
      )}
    </div>
  )
}