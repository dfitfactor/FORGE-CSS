import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import {
  Users, TrendingUp, AlertTriangle, CheckCircle,
  Minus
} from 'lucide-react'
import Link from 'next/link'
import { BIEReviewWidget } from '@/components/modules/clients/BIEReviewWidget'

type DashboardClientRow = {
  id: string
  full_name: string
  email: string | null
  date_of_birth: string | null
  gender: string | null
  status: string
  primary_goal: string | null
  current_stage: string | null
  bar_score: number | null
  dbi_score: number | null
  bli_score: number | null
  snapshot_updated_at: string | null
  needs_attention: boolean
}

type PendingReviewRow = {
  client_id: string
  full_name: string
  snapshot_date: string
  bar_score: number | null
  dbi_score: number | null
  bli_score: number | null
  generation_state: string | null
}

function getClientInfoScore(client: DashboardClientRow) {
  let score = 0
  if (client.email?.trim()) score += 1
  if (client.date_of_birth) score += 1
  if (client.gender?.trim()) score += 1
  if (client.primary_goal?.trim()) score += 1
  if (client.current_stage?.trim()) score += 1
  if (client.bar_score !== null && client.bar_score !== undefined) score += 1
  if (client.dbi_score !== null && client.dbi_score !== undefined) score += 1
  if (client.bli_score !== null && client.bli_score !== undefined) score += 1
  if (client.snapshot_updated_at) score += 1
  return score
}

function dedupeSparseClientRows(rows: DashboardClientRow[]) {
  const byName = new Map<string, DashboardClientRow>()

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

function dedupeRecentActivityRows(rows: Array<{
  client_name: string
  event_type: string
  title: string
  event_date: string
}>) {
  const seen = new Set<string>()

  return rows.filter((row) => {
    const key = [
      row.client_name.trim().toLowerCase(),
      row.event_type.trim().toLowerCase(),
      row.title.trim().toLowerCase(),
      row.event_date,
    ].join('::')

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function getDashboardStats(userId: string, role: 'admin' | 'coach' | 'client') {
  try {
    const accessFilter = role === 'admin' ? '' : 'AND c.coach_id = $1'
    const params = role === 'admin' ? [] : [userId]

    const [clientRows, alerts, recentActivity, pendingReviews] = await Promise.all([
      db.query<DashboardClientRow>(`
        SELECT
          c.id,
          c.full_name,
          c.email,
          c.date_of_birth::text as date_of_birth,
          c.gender,
          c.status,
          c.primary_goal,
          c.current_stage,
          CAST(bs.bar AS FLOAT) AS bar_score,
          CAST(bs.dbi AS FLOAT) AS dbi_score,
          CAST(bs.bli AS FLOAT) AS bli_score,
          bs.snapshot_updated_at,
          COALESCE(bs.needs_attention, false) AS needs_attention
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT
            created_at::text AS snapshot_updated_at,
            bar,
            dbi,
            bli,
            (
              snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
              AND (dbi > 50 OR bar < 50)
            ) AS needs_attention
          FROM behavioral_snapshots
          WHERE client_id = c.id
          ORDER BY snapshot_date DESC, created_at DESC
          LIMIT 1
        ) bs ON true
        WHERE c.status != 'churned'
          ${accessFilter}
        ORDER BY bs.snapshot_updated_at DESC NULLS LAST, c.full_name ASC
      `, params),

      db.query<{
        client_id: string
        client_name: string
        alert_type: string
        severity: string
        bar: number
        dbi: number
        snapshot_date: string
      }>(`
        SELECT
          c.id as client_id,
          c.full_name as client_name,
          CASE
            WHEN bs.dbi >= 70 THEN 'Critical DBI'
            WHEN bs.bar < 35 THEN 'Low BAR'
            WHEN bs.dbi >= 50 THEN 'Elevated DBI'
            ELSE 'Declining BAR'
          END as alert_type,
          CASE
            WHEN bs.dbi >= 70 OR bs.bar < 35 THEN 'critical'
            ELSE 'warning'
          END as severity,
          CAST(bs.bar AS FLOAT) AS bar,
          CAST(bs.dbi AS FLOAT) AS dbi,
          bs.snapshot_date::text AS snapshot_date
        FROM clients c
        JOIN behavioral_snapshots bs ON bs.client_id = c.id
        WHERE bs.snapshot_date = (
            SELECT MAX(snapshot_date) FROM behavioral_snapshots WHERE client_id = c.id
          )
          AND (bs.dbi >= 50 OR bs.bar < 50)
          AND c.status = 'active'
          ${accessFilter}
        ORDER BY bs.dbi DESC, bs.bar ASC
        LIMIT 5
      `, params),

      (async () => {
        try {
          const rows = await db.query<{
            client_name: string
            event_type: string
            title: string
            event_date: string
          }>(`
            SELECT c.full_name as client_name, te.event_type, te.title, te.event_date::text
            FROM timeline_events te
            JOIN clients c ON c.id = te.client_id
            WHERE 1=1
              ${accessFilter}
            ORDER BY te.event_date DESC, te.created_at DESC
            LIMIT 10
          `, params)
          return rows
        } catch {
          return []
        }
      })(),

      db.query<PendingReviewRow>(`
        SELECT c.id AS client_id,
               c.full_name,
               bs.snapshot_date::text AS snapshot_date,
               bs.bar_score,
               bs.dbi_score,
               bs.bli_score,
               bs.generation_state
        FROM behavioral_snapshots bs
        JOIN clients c ON c.id = bs.client_id
        WHERE bs.review_status = 'pending_review'
          ${accessFilter}
        ORDER BY bs.snapshot_date DESC
      `, params).catch(() => []),
    ])

    const clients = dedupeSparseClientRows(clientRows)
    const clientStats = {
      total: clients.length,
      active: clients.filter((client) => client.status === 'active').length,
      paused: clients.filter((client) => client.status === 'paused').length,
      needs_attention: clients.filter((client) => client.status === 'active' && client.needs_attention).length,
    }

    return { clientStats, alerts, recentActivity: dedupeRecentActivityRows(recentActivity), pendingReviews }
  } catch (err) {
    console.error('[dashboard] getDashboardStats failed:', err)
    return {
      clientStats: null,
      alerts: [] as {
        client_id: string
        client_name: string
        alert_type: string
        severity: string
        bar: number
        dbi: number
        snapshot_date: string
      }[],
      recentActivity: [] as {
        client_name: string
        event_type: string
        title: string
        event_date: string
      }[],
      pendingReviews: [] as PendingReviewRow[],
    }
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  const { clientStats, alerts, recentActivity, pendingReviews } = await getDashboardStats(session.id, session.role)

  const stats = clientStats ?? { total: 0, active: 0, paused: 0, needs_attention: 0 }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-forge-text-primary">
            Coach Dashboard
          </h1>
          <p className="text-forge-text-muted mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link href="/clients/new" className="forge-btn-gold">
          <Users className="w-4 h-4" />
          New Client
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={stats.total} icon={<Users className="w-5 h-5" />} color="forge-purple" />
        <StatCard label="Active" value={stats.active} icon={<CheckCircle className="w-5 h-5" />} color="state-stable" />
        <StatCard label="Needs Attention" value={stats.needs_attention} icon={<AlertTriangle className="w-5 h-5" />} color="state-recovery" urgent={stats.needs_attention > 0} />
        <StatCard label="Paused" value={stats.paused} icon={<Minus className="w-5 h-5" />} color="state-simplified" />
      </div>

      <div className="forge-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="forge-section-title flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-forge-gold" />
            Pending Reviews
          </h2>
          <span className="text-xs text-forge-text-muted">{pendingReviews.length} awaiting coach approval</span>
        </div>

        {pendingReviews.length === 0 ? (
          <div className="text-center py-6 text-forge-text-muted text-sm">
            No BIE reviews are waiting right now.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingReviews.map((review) => (
              <div key={`${review.client_id}-${review.snapshot_date}`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div>
                  <div className="text-sm font-semibold text-forge-text-primary">{review.full_name}</div>
                  <div className="text-xs text-forge-text-muted mt-1">
                    Check-in date {new Date(`${review.snapshot_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="text-xs text-forge-text-muted mt-2">
                    BAR {review.bar_score ?? 0} · DBI {review.dbi_score ?? 0} · BLI {review.bli_score ?? 0} · State {review.generation_state ?? 'B'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/clients/${review.client_id}`} className="text-xs text-forge-text-muted hover:text-forge-gold transition-colors">
                    Open client
                  </Link>
                  <BIEReviewWidget clientId={review.client_id} triggerLabel="Review" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="forge-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="forge-section-title flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-state-simplified" />
              Client Alerts
            </h2>
            <span className="text-xs text-forge-text-muted">{alerts.length} active</span>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-6 text-forge-text-muted text-sm">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-state-stable opacity-50" />
              All clients are in healthy behavioral states
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <Link
                  key={i}
                  href={`/clients/${alert.client_id}`}
                  className="flex items-center justify-between p-3 bg-forge-surface-3 rounded-lg hover:bg-forge-border transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      alert.severity === 'critical' ? 'bg-state-recovery animate-pulse' : 'bg-state-simplified'
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-forge-text-primary group-hover:text-white">
                        {alert.client_name}
                      </div>
                      <div className="text-xs text-forge-text-muted">{alert.alert_type}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-forge-text-muted">
                      BAR <span className={alert.bar < 50 ? 'text-state-recovery' : 'text-state-simplified'}>
                        {Number(alert.bar).toFixed(0)}
                      </span>
                    </div>
                    <div className="text-xs text-forge-text-muted">
                      DBI <span className={alert.dbi >= 70 ? 'text-state-recovery' : 'text-state-simplified'}>
                        {Number(alert.dbi).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="forge-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="forge-section-title flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-forge-gold" />
              Recent Activity
            </h2>
          </div>

          {recentActivity.length === 0 ? (
            <div className="text-center py-6 text-forge-text-muted text-sm">
              No recent activity to display
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((event, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${getEventColor(event.event_type)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-forge-text-muted">{event.client_name}</div>
                    <div className="text-sm text-forge-text-secondary truncate">{event.title}</div>
                  </div>
                  <div className="text-xs text-forge-text-muted flex-shrink-0">
                    {formatDate(event.event_date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, color, urgent = false }: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  urgent?: boolean
}) {
  return (
    <div className={`metric-card ${urgent ? 'border-state-recovery/50' : ''}`}>
      <div className={`p-2 w-fit rounded-lg bg-${color}/10 text-${color} mb-3`}>
        {icon}
      </div>
      <div className={`metric-value text-${color}`}>{value}</div>
      <div className="metric-label">{label}</div>
      {urgent && (
        <div className="text-xs text-state-recovery mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Needs review
        </div>
      )}
    </div>
  )
}

function getEventColor(eventType: string): string {
  const map: Record<string, string> = {
    stage_advance: 'bg-state-stable',
    stage_regress: 'bg-state-recovery',
    protocol_created: 'bg-forge-gold',
    protocol_updated: 'bg-state-consolidation',
    milestone_reached: 'bg-state-stable',
    disruption: 'bg-state-simplified',
    biomarker_panel: 'bg-state-rebuild',
  }
  return map[eventType] ?? 'bg-forge-border'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return `${diff}d ago`
}
