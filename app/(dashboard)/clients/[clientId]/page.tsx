import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import { BIEDisplay } from '@/components/modules/clients/BIEDisplay'
import { ClientActionsMenu } from '@/components/modules/clients/ClientActionsMenu'
import { BIEScoreCard } from '@/components/modules/clients/BIEScoreCard'
import {
  ArrowLeft, Dumbbell, Apple, BookOpen, FlaskConical,
  TrendingUp, Clock, Zap, Activity, Ruler, ClipboardList, Edit, FileText 
} from 'lucide-react'

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

async function getClientDetail(clientId: string, coachId: string) {
  const client = await db.queryOne<Record<string, any>>(
    `SELECT * FROM clients WHERE id = $1`,
    [clientId]
  )
  if (!client) return null

  // If coach_id exists in this schema, enforce it. Otherwise (staging schema),
  // allow access to avoid crashing due to missing column.
  if (typeof client.coach_id === 'string' && client.coach_id !== coachId) return null

  const latestSnapshot = await (async () => {
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
  })()

  const recentTimeline = await (async () => {
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
  })()

  return { client, latestSnapshot, recentTimeline }
}

export default async function ClientDetailPage({ params }: { params: { clientId: string } }) {
  try {
    const session = await getSession()
    if (!session) return null

    const data = await getClientDetail(params.clientId, session.id)
    if (!data) return notFound()

    const { client, latestSnapshot, recentTimeline } = data
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

  const NAV_SECTIONS = [
    { href: 'movement',     label: 'Movement',     icon: Dumbbell,      desc: 'Protocol, sessions, BIE guidance' },
    { href: 'nutrition',    label: 'Nutrition',    icon: Apple,         desc: 'Macro targets and compliance' },
    { href: 'adherence',    label: 'Adherence',    icon: Activity,      desc: 'BAR trend and session log' },
    { href: 'journals',     label: 'Journals',     icon: BookOpen,      desc: 'Check-ins and AI signals' },
    { href: 'biomarkers',   label: 'Biomarkers',   icon: FlaskConical,  desc: 'Lab panels and health markers' },
    { href: 'measurements', label: 'Measurements', icon: Ruler,         desc: 'Body composition progress' },
    { href: 'checkins',     label: 'Accountability & Habits',    icon: ClipboardList, desc: 'Weekly check-ins and monthly self-assessments' },
    { href: 'protocols',    label: 'Protocols',    icon: Zap,           desc: 'All generated protocols' },
    { href: 'timeline',     label: 'Timeline',     icon: Clock,         desc: 'Full client journey history' },
    { href: 'documents',    label: 'Documents',    icon: FileText,      desc: 'Uploads for AI insights and protocols' },
  ]

    return (
      <div className="p-8 space-y-6 animate-fade-in">
        <Link href="/clients" className="flex items-center gap-2 text-sm text-forge-text-muted hover:text-forge-text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Clients
        </Link>

      <div className="forge-card">
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
                  <span className="stage-badge capitalize">{currentStage ?? '—'}</span>
                  {snap?.generation_state && (
                    <span className="forge-badge text-xs">State {snap.generation_state}</span>
                  )}
                  <span className={`forge-badge text-xs ${status === 'active' ? 'bg-state-stable/10 text-state-stable border border-state-stable/30' : 'bg-forge-surface-3 text-forge-text-muted border border-forge-border'}`}>
                    {status}
                  </span>
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
            <div className="flex gap-6 mt-4">
              <div>
                <div className="text-xs text-forge-text-muted">In Stage</div>
                <div className="text-sm font-medium text-forge-text-secondary">{weeksInStage}w</div>
              </div>
              {dateOfBirth && (
                <div>
                  <div className="text-xs text-forge-text-muted">DOB / Age</div>
                  <div className="text-sm font-medium text-forge-text-secondary">
                    {new Date(`${dateOfBirth}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {age !== null ? ` · ${age}` : ''}
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
      />

      {snap && (
        <div className="forge-card">
          <h2 className="forge-section-title flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-forge-gold" /> Behavioral Intelligence Variables
          </h2>
          <BIEDisplay
            variables={{
              bar: Number(snap.bar), bli: Number(snap.bli), dbi: Number(snap.dbi),
              cdi: Number(snap.cdi), lsi: Number(snap.lsi), cLsi: Number(snap.c_lsi),
              pps: Number(snap.pps)
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
    // Preserve Next.js control-flow errors (notFound/redirect) so they behave correctly.
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
