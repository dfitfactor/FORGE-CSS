import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Users, Plus, Search, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react'

async function getClients(coachId: string) {
  return db.query<{
    id: string
    full_name: string
    email: string
    current_stage: string
    status: string
    program_tier: string
    primary_goal: string
    intake_date: string
    bar: number | null
    dbi: number | null
    generation_state: string | null
    stage_entered_at: string
  }>(`
    SELECT 
      c.id, c.full_name, c.email, c.current_stage, c.status,
      c.program_tier, c.primary_goal,
      c.intake_date::text, c.stage_entered_at::text,
      bs.bar, bs.dbi, bs.generation_state
    FROM clients c
    LEFT JOIN LATERAL (
      SELECT bar, dbi, generation_state
      FROM behavioral_snapshots
      WHERE client_id = c.id
      ORDER BY snapshot_date DESC
      LIMIT 1
    ) bs ON true
    WHERE c.coach_id = $1
    ORDER BY 
      CASE WHEN c.status = 'active' THEN 0 ELSE 1 END,
      c.full_name ASC
  `, [coachId])
}

const STAGE_LABELS: Record<string, string> = {
  foundations: 'Foundation',
  optimization: 'Optimization',
  resilience: 'Resilience',
  growth: 'Growth',
  empowerment: 'Empowerment',
}

const TIER_LABELS: Record<string, string> = {
  forge_lite: 'Lite',
  forge_core: 'Core',
  forge_elite: 'Elite',
}

export default async function ClientsPage() {
  const session = await getSession()
  if (!session) return null

  const clients = await getClients(session.id)

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-forge-text-primary flex items-center gap-3">
            <Users className="w-6 h-6 text-forge-gold" />
            Clients
          </h1>
          <p className="text-forge-text-muted mt-1">{clients.length} clients in your roster</p>
        </div>
        <Link href="/clients/new" className="forge-btn-gold">
          <Plus className="w-4 h-4" />
          Add Client
        </Link>
      </div>

      {/* Client Grid */}
      {clients.length === 0 ? (
        <div className="forge-card text-center py-16">
          <Users className="w-12 h-12 mx-auto mb-4 text-forge-text-muted opacity-50" />
          <h3 className="text-lg font-medium text-forge-text-secondary mb-2">No clients yet</h3>
          <p className="text-forge-text-muted mb-6">Add your first client to begin their FORGE journey.</p>
          <Link href="/clients/new" className="forge-btn-gold">
            <Plus className="w-4 h-4" />
            Add First Client
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  )
}

function ClientCard({ client }: { client: {
  id: string
  full_name: string
  email: string
  current_stage: string
  status: string
  program_tier: string
  primary_goal: string
  bar: number | null
  dbi: number | null
  generation_state: string | null
}}) {
  const bar = client.bar ? Number(client.bar) : null
  const dbi = client.dbi ? Number(client.dbi) : null

  const barColor = bar !== null
    ? bar >= 80 ? 'text-state-stable' : bar >= 65 ? 'text-state-simplified' : 'text-state-recovery'
    : 'text-forge-text-muted'

  const dbiColor = dbi !== null
    ? dbi >= 70 ? 'text-state-recovery' : dbi >= 50 ? 'text-state-simplified' : 'text-state-stable'
    : 'text-forge-text-muted'

  const stateColors: Record<string, string> = {
    A: 'state-badge-a', B: 'state-badge-b', C: 'state-badge-c',
    D: 'state-badge-d', E: 'state-badge-e',
  }

  const initials = client.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <Link href={`/clients/${client.id}`} className="forge-card-hover group animate-slide-up">
      <div className="flex items-start gap-3 mb-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full bg-forge-purple flex items-center justify-center text-sm font-bold text-forge-gold flex-shrink-0">
          {initials}
        </div>

        {/* Name & status */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-forge-text-primary group-hover:text-white truncate">
            {client.full_name}
          </div>
          <div className="text-xs text-forge-text-muted truncate">{client.email}</div>
        </div>

        {/* Status */}
        <span className={`forge-badge text-xs flex-shrink-0 ${
          client.status === 'active' 
            ? 'bg-state-stable/10 text-state-stable border border-state-stable/30'
            : 'bg-forge-surface-3 text-forge-text-muted border border-forge-border'
        }`}>
          {client.status}
        </span>
      </div>

      {/* Stage & tier */}
      <div className="flex items-center gap-2 mb-4">
        <span className="stage-badge">
          {STAGE_LABELS[client.current_stage] ?? client.current_stage}
        </span>
        {client.program_tier && (
          <span className="forge-badge bg-forge-surface-3 text-forge-text-secondary border border-forge-border text-xs">
            {TIER_LABELS[client.program_tier] ?? client.program_tier}
          </span>
        )}
        {client.generation_state && (
          <span className={`forge-badge text-xs ${stateColors[client.generation_state] ?? ''}`}>
            State {client.generation_state}
          </span>
        )}
      </div>

      {/* BIE metrics */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-forge-surface-3 rounded-lg p-2.5">
          <div className="text-xs text-forge-text-muted mb-1">BAR</div>
          <div className={`text-lg font-bold font-mono ${barColor}`}>
            {bar !== null ? bar.toFixed(0) : '—'}
          </div>
          {bar !== null && (
            <div className="bie-bar mt-1">
              <div className={`bie-bar-fill ${bar >= 80 ? 'bg-state-stable' : bar >= 65 ? 'bg-state-simplified' : 'bg-state-recovery'}`}
                style={{ width: `${bar}%` }} />
            </div>
          )}
        </div>
        <div className="bg-forge-surface-3 rounded-lg p-2.5">
          <div className="text-xs text-forge-text-muted mb-1">DBI</div>
          <div className={`text-lg font-bold font-mono ${dbiColor}`}>
            {dbi !== null ? dbi.toFixed(0) : '—'}
          </div>
          {dbi !== null && (
            <div className="bie-bar mt-1">
              <div className={`bie-bar-fill ${dbi >= 70 ? 'bg-state-recovery' : dbi >= 50 ? 'bg-state-simplified' : 'bg-state-stable'}`}
                style={{ width: `${dbi}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Goal */}
      {client.primary_goal && (
        <p className="text-xs text-forge-text-muted truncate border-t border-forge-border pt-3">
          🎯 {client.primary_goal}
        </p>
      )}
    </Link>
  )
}
