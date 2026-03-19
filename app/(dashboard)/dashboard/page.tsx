import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { 
  Users, TrendingUp, AlertTriangle, CheckCircle, 
  Zap, ArrowUp, ArrowDown, Minus 
} from 'lucide-react'
import Link from 'next/link'

async function getDashboardStats(coachId: string) {
  try {
    const [clientStats, alerts, recentActivity] = await Promise.all([
      db.queryOne<{
        total: number
        active: number
        paused: number
        needs_attention: number
      }>(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'paused' THEN 1 END) as paused,
          COUNT(CASE WHEN EXISTS (
            SELECT 1 FROM behavioral_snapshots bs 
            WHERE bs.client_id = clients.id 
            AND bs.snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
            AND (bs.dbi_score > 50 OR bs.bar_score < 50)
          ) THEN 1 END) as needs_attention
        FROM clients WHERE coach_id = $1 AND status != 'churned'
      `, [coachId]),

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
            WHEN bs.dbi_score >= 70 THEN 'Critical DBI'
            WHEN bs.bar_score < 35 THEN 'Low BAR'
            WHEN bs.dbi_score >= 50 THEN 'Elevated DBI'
            ELSE 'Declining BAR'
          END as alert_type,
          CASE 
            WHEN bs.dbi_score >= 70 OR bs.bar_score < 35 THEN 'critical'
            ELSE 'warning'
          END as severity,
          bs.bar_score AS bar,
          bs.dbi_score AS dbi,
          bs.snapshot_date::text
        FROM clients c
        JOIN behavioral_snapshots bs ON bs.client_id = c.id
        WHERE c.coach_id = $1
          AND bs.snapshot_date = (
            SELECT MAX(snapshot_date) FROM behavioral_snapshots WHERE client_id = c.id
          )
          AND (bs.dbi_score >= 50 OR bs.bar_score < 50)
          AND c.status = 'active'
        ORDER BY bs.dbi_score DESC, bs.bar_score ASC
        LIMIT 5
      `, [coachId]),

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
            WHERE c.coach_id = $1
            ORDER BY te.event_date DESC, te.created_at DESC
            LIMIT 10
          `, [coachId])
          return rows
        } catch {
          return []
        }
      })(),
    ])

    return { clientStats, alerts, recentActivity }
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
    }
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  const { clientStats, alerts, recentActivity } = await getDashboardStats(session.id)

  const stats = clientStats ?? { total: 0, active: 0, paused: 0, needs_attention: 0 }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
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

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Clients"
          value={stats.total}
          icon={<Users className="w-5 h-5" />}
          color="forge-purple"
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon={<CheckCircle className="w-5 h-5" />}
          color="state-stable"
        />
        <StatCard
          label="Needs Attention"
          value={stats.needs_attention}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="state-recovery"
          urgent={stats.needs_attention > 0}
        />
        <StatCard
          label="Paused"
          value={stats.paused}
          icon={<Minus className="w-5 h-5" />}
          color="state-simplified"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts Panel */}
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

        {/* Recent Activity */}
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
