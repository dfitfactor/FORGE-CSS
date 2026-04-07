import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import {
  Users, TrendingUp, AlertTriangle, CheckCircle, Minus, Clock3, ClipboardCheck,
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

type StaleClientRow = {
  client_id: string
  full_name: string
  current_stage: string | null
  last_activity_type: string | null
  last_activity_at: string | null
  days_since_activity: number | null
}

type ProtocolReviewRow = {
  client_id: string
  full_name: string
  current_stage: string | null
  protocol_id: string | null
  protocol_name: string | null
  last_protocol_review_at: string | null
  days_since_review: number | null
  review_status: 'missing' | 'due' | 'overdue'
}

type AlertRow = {
  client_id: string
  client_name: string
  alert_type: string
  severity: string
  bar: number
  dbi: number
  snapshot_date: string
}

type RecentActivityRow = {
  client_name: string
  event_type: string
  title: string
  event_date: string
}

const tableColumnCache = new Map<string, Set<string>>()

async function getTableColumnSet(tableName: string) {
  const cached = tableColumnCache.get(tableName)
  if (cached) return cached

  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  )

  const set = new Set(columns.map((column) => column.column_name))
  tableColumnCache.set(tableName, set)
  return set
}

async function getProtocolTimestampExpression() {
  const protocolColumns = await getTableColumnSet('protocols')
  return protocolColumns.has('updated_at') ? 'COALESCE(p.updated_at, p.created_at)' : 'p.created_at'
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

function dedupeRecentActivityRows(rows: RecentActivityRow[]) {
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
    const protocolTimestampExpression = await getProtocolTimestampExpression()

    const [clientRows, alerts, recentActivity, pendingReviews, staleClients, protocolReviewsDue] = await Promise.all([
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

      db.query<AlertRow>(`
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
          const rows = await db.query<RecentActivityRow>(`
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

      db.query<StaleClientRow>(`
        SELECT
          c.id AS client_id,
          c.full_name,
          c.current_stage,
          activity.last_activity_type,
          activity.last_activity_at::text AS last_activity_at,
          CASE
            WHEN activity.last_activity_at IS NULL THEN NULL
            ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - activity.last_activity_at)) / 86400))::int
          END AS days_since_activity
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT event_type AS last_activity_type, event_at AS last_activity_at
          FROM (
            SELECT 'check-in submitted'::text AS event_type, MAX(checkin_date::timestamp) AS event_at
            FROM client_checkins WHERE client_id = c.id
            UNION ALL
            SELECT 'form submitted'::text, MAX(submitted_at)
            FROM form_submissions WHERE client_id = c.id
            UNION ALL
            SELECT 'booking activity'::text, MAX(COALESCE(created_at, booking_date::timestamp))
            FROM bookings WHERE client_id = c.id OR (c.email IS NOT NULL AND LOWER(client_email) = LOWER(c.email))
            UNION ALL
            SELECT 'behavior snapshot'::text, MAX(COALESCE(reviewed_at, snapshot_date::timestamp))
            FROM behavioral_snapshots WHERE client_id = c.id
            UNION ALL
            SELECT 'timeline event'::text, MAX(event_date::timestamp)
            FROM timeline_events WHERE client_id = c.id
            UNION ALL
            SELECT 'protocol updated'::text, MAX(protocol_event_at)
            FROM (
              SELECT MAX(${protocolTimestampExpression}) AS protocol_event_at
              FROM protocols p
              WHERE p.client_id = c.id
            ) protocol_events
          ) candidate_events
          WHERE event_at IS NOT NULL
          ORDER BY event_at DESC
          LIMIT 1
        ) activity ON true
        WHERE c.status = 'active'
          ${accessFilter}
          AND (activity.last_activity_at IS NULL OR activity.last_activity_at < NOW() - INTERVAL '7 days')
        ORDER BY activity.last_activity_at ASC NULLS FIRST, c.full_name ASC
      `, params).catch(() => []),

      db.query<ProtocolReviewRow>(`
        SELECT
          c.id AS client_id,
          c.full_name,
          c.current_stage,
          latest_protocol.protocol_id,
          latest_protocol.protocol_name,
          latest_protocol.last_protocol_review_at::text AS last_protocol_review_at,
          CASE
            WHEN latest_protocol.last_protocol_review_at IS NULL THEN NULL
            ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - latest_protocol.last_protocol_review_at)) / 86400))::int
          END AS days_since_review,
          CASE
            WHEN latest_protocol.protocol_id IS NULL THEN 'missing'
            WHEN latest_protocol.last_protocol_review_at < NOW() - INTERVAL '37 days' THEN 'overdue'
            ELSE 'due'
          END AS review_status
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT
            p.id AS protocol_id,
            p.name AS protocol_name,
            ${protocolTimestampExpression} AS last_protocol_review_at
          FROM protocols p
          WHERE p.client_id = c.id
          ORDER BY ${protocolTimestampExpression} DESC
          LIMIT 1
        ) latest_protocol ON true
        WHERE c.status = 'active'
          ${accessFilter}
          AND (
            latest_protocol.protocol_id IS NULL
            OR latest_protocol.last_protocol_review_at < NOW() - INTERVAL '30 days'
          )
        ORDER BY latest_protocol.last_protocol_review_at ASC NULLS FIRST, c.full_name ASC
      `, params).catch(() => []),
    ])

    const clients = dedupeSparseClientRows(clientRows)
    const clientStats = {
      total: clients.length,
      active: clients.filter((client) => client.status === 'active').length,
      paused: clients.filter((client) => client.status === 'paused').length,
      needs_attention: clients.filter((client) => client.status === 'active' && client.needs_attention).length,
      stale_clients: staleClients.length,
      protocol_reviews_due: protocolReviewsDue.length,
    }

    return {
      clientStats,
      alerts,
      recentActivity: dedupeRecentActivityRows(recentActivity),
      pendingReviews,
      staleClients,
      protocolReviewsDue,
    }
  } catch (err) {
    console.error('[dashboard] getDashboardStats failed:', err)
    return {
      clientStats: null,
      alerts: [] as AlertRow[],
      recentActivity: [] as RecentActivityRow[],
      pendingReviews: [] as PendingReviewRow[],
      staleClients: [] as StaleClientRow[],
      protocolReviewsDue: [] as ProtocolReviewRow[],
    }
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  const { clientStats, alerts, recentActivity, pendingReviews, staleClients, protocolReviewsDue } = await getDashboardStats(session.id, session.role)

  const stats = clientStats ?? {
    total: 0,
    active: 0,
    paused: 0,
    needs_attention: 0,
    stale_clients: 0,
    protocol_reviews_due: 0,
  }

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

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
        <StatCard label="Total Clients" value={stats.total} icon={<Users className="w-5 h-5" />} color="forge-purple" />
        <StatCard label="Active" value={stats.active} icon={<CheckCircle className="w-5 h-5" />} color="state-stable" />
        <StatCard label="Needs Attention" value={stats.needs_attention} icon={<AlertTriangle className="w-5 h-5" />} color="state-recovery" urgent={stats.needs_attention > 0} />
        <StatCard label="Stale 7+ Days" value={stats.stale_clients} icon={<Clock3 className="w-5 h-5" />} color="state-simplified" urgent={stats.stale_clients > 0} />
        <StatCard label="Protocol Reviews Due" value={stats.protocol_reviews_due} icon={<ClipboardCheck className="w-5 h-5" />} color="forge-gold" urgent={stats.protocol_reviews_due > 0} />
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
                    BAR {review.bar_score ?? 0} - DBI {review.dbi_score ?? 0} - BLI {review.bli_score ?? 0} - State {review.generation_state ?? 'B'}
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
              <Clock3 className="w-4 h-4 text-state-simplified" />
              Clients Not Updated This Week
            </h2>
            <span className="text-xs text-forge-text-muted">{staleClients.length} require coach attention</span>
          </div>

          {staleClients.length === 0 ? (
            <QueueEmptyState
              icon={<CheckCircle className="w-8 h-8 mx-auto mb-2 text-state-stable opacity-50" />}
              message="All active clients have fresh activity in the last 7 days."
            />
          ) : (
            <div className="space-y-3">
              {staleClients.map((client) => (
                <Link key={client.client_id} href={`/clients/${client.client_id}`} className="block rounded-xl border border-state-simplified/20 bg-state-simplified/5 p-4 transition-colors hover:border-state-simplified/40 hover:bg-state-simplified/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-forge-text-primary">{client.full_name}</div>
                      <div className="mt-1 text-xs text-forge-text-muted">
                        {client.current_stage ? `${client.current_stage} - ` : ''}
                        {formatStaleMessage(client)}
                      </div>
                    </div>
                    <span className="forge-badge border border-state-simplified/30 bg-state-simplified/10 text-state-simplified text-[11px]">
                      {client.days_since_activity ?? 7}+ days
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="forge-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="forge-section-title flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-forge-gold" />
              Protocol Reviews Due
            </h2>
            <span className="text-xs text-forge-text-muted">Every client protocol should be reviewed monthly</span>
          </div>

          {protocolReviewsDue.length === 0 ? (
            <QueueEmptyState
              icon={<CheckCircle className="w-8 h-8 mx-auto mb-2 text-state-stable opacity-50" />}
              message="All active client protocols have been reviewed within the last 30 days."
            />
          ) : (
            <div className="space-y-3">
              {protocolReviewsDue.map((review) => (
                <div key={`${review.client_id}-${review.protocol_id ?? 'missing'}`} className={`rounded-xl border p-4 ${review.review_status === 'overdue' || review.review_status === 'missing' ? 'border-state-recovery/25 bg-state-recovery/5' : 'border-forge-gold/20 bg-forge-gold/5'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-forge-text-primary">{review.full_name}</div>
                      <div className="mt-1 text-xs text-forge-text-muted">
                        {review.protocol_name ? `${review.protocol_name} - ` : 'No protocol on file - '}
                        {formatProtocolReviewMessage(review)}
                      </div>
                    </div>
                    <span className={`forge-badge border text-[11px] ${review.review_status === 'overdue' || review.review_status === 'missing' ? 'border-state-recovery/30 bg-state-recovery/10 text-state-recovery' : 'border-forge-gold/20 bg-forge-gold/10 text-forge-gold'}`}>
                      {review.review_status === 'missing' ? 'Required now' : review.review_status === 'overdue' ? 'Overdue' : 'Due soon'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Link href={`/clients/${review.client_id}`} className="text-xs text-forge-text-muted hover:text-forge-gold transition-colors">
                      Open client
                    </Link>
                    <Link href={`/clients/${review.client_id}/protocols`} className="text-xs text-forge-text-muted hover:text-forge-gold transition-colors">
                      Review protocols
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

function QueueEmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="text-center py-6 text-forge-text-muted text-sm">
      {icon}
      {message}
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

function formatStaleMessage(client: StaleClientRow) {
  if (!client.last_activity_at || !client.last_activity_type) {
    return 'No recent client activity is on file. Review and update this client.'
  }

  return `Last ${client.last_activity_type} ${formatDate(client.last_activity_at)}.`
}

function formatProtocolReviewMessage(review: ProtocolReviewRow) {
  if (review.review_status === 'missing') {
    return 'No protocol has been generated yet. Create the first protocol now.'
  }

  if (!review.last_protocol_review_at) {
    return 'Protocol review date is missing. Open the client and validate the current plan.'
  }

  if (review.review_status === 'overdue') {
    return `Last reviewed ${formatDate(review.last_protocol_review_at)}. Monthly review is overdue.`
  }

  return `Last reviewed ${formatDate(review.last_protocol_review_at)}. Monthly review window is due.`
}
