import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import { BIEDisplay } from '@/components/modules/clients/BIEDisplay'
import { ClientActionsMenu } from '@/components/modules/clients/ClientActionsMenu'
import { BIEScoreCard } from '@/components/modules/clients/BIEScoreCard'
import { SessionBankCard } from '@/components/modules/clients/SessionBankCard'
import {
  ArrowLeft, Dumbbell, Apple, BookOpen, FlaskConical,
  TrendingUp, Clock, Zap, Activity, Ruler, ClipboardList, Edit, FileText,
  AlertTriangle, ClipboardCheck, CheckCircle,
} from 'lucide-react'

const tableColumnCache = new Map<string, Set<string>>()

type ClientReviewSummary = {
  last_activity_at: string | null
  last_activity_type: string | null
  days_since_activity: number | null
}

type ProtocolReviewSummary = {
  protocol_id: string | null
  protocol_name: string | null
  last_protocol_review_at: string | null
  days_since_review: number | null
  review_status: 'missing' | 'due' | 'overdue' | 'current'
}

function calculateAge(dateOfBirth: string | null | undefined) {
  if (!dateOfBirth) return null
  const birthDate = new Date(`${dateOfBirth}T00:00:00`)
  if (Number.isNaN(birthDate.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  const dayDiff = today.getDate() - birthDate.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }
  return age
}

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

async function getClientDetail(clientId: string, coachId: string) {
  const client = await db.queryOne<Record<string, any>>(
    `SELECT * FROM clients WHERE id = $1`,
    [clientId]
  )
  if (!client) return null

  if (typeof client.coach_id === 'string' && client.coach_id !== coachId) return null

  const protocolTimestampExpression = await getProtocolTimestampExpression()

  const [
    latestSnapshot,
    recentTimeline,
    pendingReviewCount,
    lastActivity,
    protocolReview,
  ] = await Promise.all([
    (async () => {
      try {
        return await db.queryOne<{
          bar: number; bli: number; dbi: number; cdi: number
          lsi: number; c_lsi: number; pps: number; gps: number | null
          generation_state: string; generation_state_label: string
        }>(`SELECT bar_score as bar, bli_score as bli, dbi_score as dbi, cdi, lsi, c_lsi, pps, gps, generation_state, generation_state_label
            FROM behavioral_snapshots WHERE client_id = $1
            ORDER BY snapshot_date DESC LIMIT 1`, [clientId])
      } catch {
        try {
          return await db.queryOne<{
            bar: number; bli: number; dbi: number; cdi: number
            lsi: number; c_lsi: number; pps: number; gps: number | null
            generation_state: string; generation_state_label: string
          }>(`SELECT bar_score as bar, bli_score as bli, dbi_score as dbi, cdi, lsi, c_lsi, pps,
                  NULL::INTEGER as gps, generation_state, generation_state_label
              FROM behavioral_snapshots WHERE client_id = $1
              ORDER BY snapshot_date DESC LIMIT 1`, [clientId])
        } catch {
          return null
        }
      }
    })(),

    (async () => {
      try {
        return await db.query<{ event_date: string; event_type: string; title: string }>(
          `SELECT event_date::text, event_type, title
           FROM timeline_events WHERE client_id = $1
           ORDER BY event_date DESC, created_at DESC LIMIT 5`,
          [clientId]
        )
      } catch {
        return []
      }
    })(),

    db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM behavioral_snapshots
       WHERE client_id = $1
         AND review_status = 'pending_review'`,
      [clientId]
    ).then((row) => Number(row?.count ?? 0)).catch(() => 0),

    db.queryOne<ClientReviewSummary>(`
      SELECT
        activity.last_activity_at::text AS last_activity_at,
        activity.last_activity_type,
        CASE
          WHEN activity.last_activity_at IS NULL THEN NULL
          ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - activity.last_activity_at)) / 86400))::int
        END AS days_since_activity
      FROM (
        SELECT event_type AS last_activity_type, event_at AS last_activity_at
        FROM (
          SELECT 'check-in submitted'::text AS event_type, MAX(checkin_date::timestamp) AS event_at
          FROM client_checkins WHERE client_id = $1
          UNION ALL
          SELECT 'form submitted'::text, MAX(submitted_at)
          FROM form_submissions WHERE client_id = $1
          UNION ALL
          SELECT 'booking activity'::text, MAX(COALESCE(created_at, booking_date::timestamp))
          FROM bookings WHERE client_id = $1 OR ($2 IS NOT NULL AND LOWER(client_email) = LOWER($2))
          UNION ALL
          SELECT 'behavior snapshot'::text, MAX(COALESCE(reviewed_at, snapshot_date::timestamp))
          FROM behavioral_snapshots WHERE client_id = $1
          UNION ALL
          SELECT 'timeline event'::text, MAX(event_date::timestamp)
          FROM timeline_events WHERE client_id = $1
          UNION ALL
          SELECT 'protocol updated'::text, MAX(protocol_event_at)
          FROM (
            SELECT MAX(${protocolTimestampExpression}) AS protocol_event_at
            FROM protocols p
            WHERE p.client_id = $1
          ) protocol_events
        ) candidate_events
        WHERE event_at IS NOT NULL
        ORDER BY event_at DESC
        LIMIT 1
      ) activity
    `, [clientId, client.email ?? null]).catch(() => null),

    db.queryOne<ProtocolReviewSummary>(`
      SELECT
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
          WHEN latest_protocol.last_protocol_review_at < NOW() - INTERVAL '30 days' THEN 'due'
          ELSE 'current'
        END AS review_status
      FROM (
        SELECT
          p.id AS protocol_id,
          p.name AS protocol_name,
          ${protocolTimestampExpression} AS last_protocol_review_at
        FROM protocols p
        WHERE p.client_id = $1
        ORDER BY ${protocolTimestampExpression} DESC
        LIMIT 1
      ) latest_protocol
    `, [clientId]).catch(() => null),
  ])

  return { client, latestSnapshot, recentTimeline, pendingReviewCount, lastActivity, protocolReview }
}

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return `${diff} days ago`
}

export default async function ClientDetailPage({ params }: { params: { clientId: string } }) {
  try {
    const session = await getSession()
    if (!session) return null

    const data = await getClientDetail(params.clientId, session.id)
    if (!data) return notFound()

    const { client, latestSnapshot, recentTimeline, pendingReviewCount, lastActivity, protocolReview } = data
    const snap = latestSnapshot

    const fullName = typeof client.full_name === 'string' && client.full_name.trim().length > 0 ? client.full_name.trim() : 'Client'
    const email = typeof client.email === 'string' && client.email.trim().length > 0 ? client.email.trim() : null
    const currentStage = typeof client.current_stage === 'string' && client.current_stage.trim().length > 0 ? client.current_stage.trim() : null
    const status = typeof client.status === 'string' && client.status.trim().length > 0 ? client.status.trim() : 'active'
    const primaryGoal = typeof client.primary_goal === 'string' && client.primary_goal.trim().length > 0 ? client.primary_goal.trim() : null
    const weightLbs = typeof client.weight_lbs === 'number' ? client.weight_lbs : Number(client.weight_lbs)
    const dateOfBirth = typeof client.date_of_birth === 'string' && client.date_of_birth.trim().length > 0 ? client.date_of_birth.trim() : null
    const gender = typeof client.gender === 'string' && client.gender.trim().length > 0 ? client.gender.trim() : null
    const age = calculateAge(dateOfBirth)

    const stageEnteredAt = client.stage_entered_at
    const weeksInStage = stageEnteredAt
      ? Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24 * 7))
      : 0
    const initials = fullName.split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'CL'
    const isStaleClient = (lastActivity?.days_since_activity ?? 0) >= 7 || !lastActivity?.last_activity_at
    const protocolReviewStatus = protocolReview?.review_status ?? 'missing'
    const protocolNeedsReview = protocolReviewStatus !== 'current'

    const NAV_SECTIONS = [
      { href: 'movement', label: 'Movement', icon: Dumbbell, desc: 'Protocol, sessions, BIE guidance' },
      { href: 'nutrition', label: 'Nutrition', icon: Apple, desc: 'Macro targets and compliance' },
      { href: 'adherence', label: 'Adherence', icon: Activity, desc: 'BAR trend and session log' },
      { href: 'journals', label: 'Journals', icon: BookOpen, desc: 'Check-ins and AI signals' },
      { href: 'biomarkers', label: 'Biomarkers', icon: FlaskConical, desc: 'Lab panels and health markers' },
      { href: 'measurements', label: 'Measurements', icon: Ruler, desc: 'Body composition progress' },
      { href: 'checkins', label: 'Accountability & Habits', icon: ClipboardList, desc: 'Weekly check-ins and monthly self-assessments' },
      { href: 'protocols', label: 'Protocols', icon: Zap, desc: 'All generated protocols' },
      { href: 'timeline', label: 'Timeline', icon: Clock, desc: 'Full client journey history' },
      { href: 'documents', label: 'Documents', icon: FileText, desc: 'Uploads for AI insights and protocols' },
      { href: 'forms', label: 'Forms', icon: ClipboardList, desc: 'Completed client submissions and PDFs' },
    ]

    return (
      <div className="p-8 space-y-6 animate-fade-in">
        <Link href="/clients" className="flex items-center gap-2 text-sm text-forge-text-muted hover:text-forge-text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Clients
        </Link>

        <div className="forge-card space-y-5">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-full bg-forge-purple flex items-center justify-center text-xl font-bold text-forge-gold glow-purple flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-forge-text-primary">{client.full_name}</h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {email && <span className="text-sm text-forge-text-muted">{email}</span>}
                    <span className="stage-badge capitalize">{currentStage ?? '-'}</span>
                    {snap?.generation_state && (
                      <span className="forge-badge text-xs">State {snap.generation_state}</span>
                    )}
                    <span className={`forge-badge text-xs ${status === 'active' ? 'bg-state-stable/10 text-state-stable border border-state-stable/30' : 'bg-forge-surface-3 text-forge-text-muted border border-forge-border'}`}>
                      {status}
                    </span>
                    {isStaleClient ? (
                      <span className="forge-badge text-xs bg-state-simplified/10 text-state-simplified border border-state-simplified/30">
                        Update required
                      </span>
                    ) : (
                      <span className="forge-badge text-xs bg-state-stable/10 text-state-stable border border-state-stable/30">
                        Activity current
                      </span>
                    )}
                    {protocolNeedsReview ? (
                      <span className={`forge-badge text-xs ${protocolReviewStatus === 'overdue' || protocolReviewStatus === 'missing' ? 'bg-state-recovery/10 text-state-recovery border border-state-recovery/30' : 'bg-forge-gold/10 text-forge-gold border border-forge-gold/30'}`}>
                        {protocolReviewStatus === 'missing' ? 'Protocol needed' : protocolReviewStatus === 'overdue' ? 'Protocol review overdue' : 'Protocol review due'}
                      </span>
                    ) : (
                      <span className="forge-badge text-xs bg-state-stable/10 text-state-stable border border-state-stable/30">
                        Protocol current
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 items-center">
                  <Link href={`/clients/${client.id}/protocols/new`} className="forge-btn-gold text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Generate Protocol
                  </Link>
                  <Link href={`/clients/${client.id}/edit`} className="forge-btn-secondary text-sm flex items-center gap-2">
                    <Edit className="w-4 h-4" /> Edit Profile
                  </Link>
                  <ClientActionsMenu clientId={client.id} clientName={client.full_name} />
                </div>
              </div>
              {primaryGoal && (
                <div className="mt-3 text-sm text-forge-text-secondary">{primaryGoal}</div>
              )}
              <div className="flex gap-6 mt-4 flex-wrap">
                <div>
                  <div className="text-xs text-forge-text-muted">In Stage</div>
                  <div className="text-sm font-medium text-forge-text-secondary">{weeksInStage}w</div>
                </div>
                <div>
                  <div className="text-xs text-forge-text-muted">Last Client Activity</div>
                  <div className="text-sm font-medium text-forge-text-secondary">
                    {lastActivity?.last_activity_at
                      ? `${lastActivity.last_activity_type ?? 'Activity'} ${formatRelativeDate(lastActivity.last_activity_at)}`
                      : 'No activity recorded'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-forge-text-muted">Protocol Review</div>
                  <div className="text-sm font-medium text-forge-text-secondary">
                    {protocolReview?.last_protocol_review_at
                      ? `${formatRelativeDate(protocolReview.last_protocol_review_at)}${protocolNeedsReview ? ' - review now' : ''}`
                      : 'No protocol on file'}
                  </div>
                </div>
                {dateOfBirth && (
                  <div>
                    <div className="text-xs text-forge-text-muted">DOB / Age</div>
                    <div className="text-sm font-medium text-forge-text-secondary">
                      {new Date(`${dateOfBirth}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {age !== null ? ` - ${age}` : ''}
                    </div>
                  </div>
                )}
                {gender && (
                  <div>
                    <div className="text-xs text-forge-text-muted">Gender</div>
                    <div className="text-sm font-medium text-forge-text-secondary capitalize">
                      {gender.replace(/_/g, ' ')}
                    </div>
                  </div>
                )}
                {Number.isFinite(weightLbs) && weightLbs > 0 && (
                  <div>
                    <div className="text-xs text-forge-text-muted">Weight</div>
                    <div className="text-sm font-medium text-forge-text-secondary">{weightLbs} lb</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {(isStaleClient || protocolNeedsReview) && (
            <div className="grid gap-3 md:grid-cols-2">
              {isStaleClient ? (
                <div className="rounded-xl border border-state-simplified/25 bg-state-simplified/10 p-4">
                  <div className="flex items-center gap-2 text-state-simplified text-sm font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    Client update required
                  </div>
                  <p className="mt-2 text-sm text-forge-text-secondary">
                    {lastActivity?.last_activity_at
                      ? `Last ${lastActivity.last_activity_type ?? 'activity'} was ${formatRelativeDate(lastActivity.last_activity_at)}. Review check-ins, bookings, or notes so this client does not go more than a week without follow-up.`
                      : 'No recent activity is on file for this client. Open the profile and log a follow-up this week.'}
                  </p>
                </div>
              ) : null}

              {protocolNeedsReview ? (
                <div className={`rounded-xl border p-4 ${protocolReviewStatus === 'overdue' || protocolReviewStatus === 'missing' ? 'border-state-recovery/25 bg-state-recovery/10' : 'border-forge-gold/25 bg-forge-gold/10'}`}>
                  <div className={`flex items-center gap-2 text-sm font-semibold ${protocolReviewStatus === 'overdue' || protocolReviewStatus === 'missing' ? 'text-state-recovery' : 'text-forge-gold'}`}>
                    <ClipboardCheck className="w-4 h-4" />
                    {protocolReviewStatus === 'missing' ? 'Protocol required' : protocolReviewStatus === 'overdue' ? 'Protocol review overdue' : 'Protocol review due'}
                  </div>
                  <p className="mt-2 text-sm text-forge-text-secondary">
                    {protocolReviewStatus === 'missing'
                      ? 'This client does not have a current protocol on file. Generate a protocol before the next monthly review window passes.'
                      : protocolReview?.last_protocol_review_at
                      ? `The current protocol was last touched ${formatRelativeDate(protocolReview.last_protocol_review_at)}. Review it this month and update the plan if needed.`
                      : 'Review the client protocol this month and document any changes.'}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <Link href={`/clients/${client.id}/protocols`} className="text-xs text-forge-text-muted hover:text-forge-gold transition-colors">
                      Open protocols
                    </Link>
                    <Link href={`/clients/${client.id}/protocols/new`} className="text-xs text-forge-text-muted hover:text-forge-gold transition-colors">
                      Generate new protocol
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <BIEScoreCard
          clientId={client.id}
          primaryGoal={primaryGoal}
          initialScores={snap ? {
            bar: Number(snap.bar),
            dbi: Number(snap.dbi),
            bli: Number(snap.bli),
            cdi: Number(snap.cdi),
            lsi: Number(snap.lsi),
            pps: Number(snap.pps),
            gps: typeof snap.gps === 'number' ? Number(snap.gps) : null,
          } : null}
          pendingReviewCount={pendingReviewCount}
        />

        <SessionBankCard clientId={client.id} />

        {snap && (
          <div className="forge-card">
            <h2 className="forge-section-title flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-forge-gold" /> Behavioral Intelligence Variables
            </h2>
            <BIEDisplay
              variables={{
                bar: Number(snap.bar), bli: Number(snap.bli), dbi: Number(snap.dbi),
                cdi: Number(snap.cdi), lsi: Number(snap.lsi), cLsi: Number(snap.c_lsi),
                pps: Number(snap.pps),
              }}
              generationState={snap.generation_state}
            />
          </div>
        )}

        <div>
          <h2 className="forge-section-title mb-4">Client Sections</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {NAV_SECTIONS.map(({ href, label, icon: Icon, desc }) => (
              <Link key={href} href={`/clients/${client.id}/${href}`} className="forge-card-hover p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-forge-purple/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-forge-gold" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-forge-text-primary">{label}</div>
                  <div className="text-xs text-forge-text-muted mt-0.5">{desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {recentTimeline.length > 0 && (
          <div className="forge-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="forge-section-title flex items-center gap-2">
                <Clock className="w-4 h-4 text-forge-gold" /> Recent Activity
              </h2>
              <Link href={`/clients/${client.id}/timeline`} className="text-xs text-forge-text-muted hover:text-forge-gold transition-colors">
                Full timeline
              </Link>
            </div>
            <div className="space-y-2">
              {recentTimeline.map((event, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5">
                  <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 bg-forge-gold/60" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-forge-text-secondary truncate">{event.title}</div>
                    <div className="text-xs text-forge-text-muted">
                      {event.event_date ? new Date(event.event_date).toLocaleDateString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in (err as any)) {
      const digest = String((err as any).digest)
      if (digest === 'NEXT_NOT_FOUND' || digest.startsWith('NEXT_REDIRECT')) throw err
    }
    console.error('[clients/[clientId]] page error:', err)
    return (
      <div className="p-8 space-y-4">
        <Link href="/clients" className="flex items-center gap-2 text-sm text-forge-text-muted hover:text-forge-text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Clients
        </Link>
        <div className="forge-card">
          <h1 className="text-lg font-bold text-forge-text-primary">Client Profile</h1>
          <p className="text-sm text-forge-text-muted mt-2">
            This client profile could not be loaded in the current staging environment.
          </p>
        </div>
      </div>
    )
  }
}
