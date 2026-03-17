import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import {
  ArrowLeft, Milestone, Dumbbell, TrendingUp, TrendingDown,
  Star, FlaskConical, MessageSquare, Calendar, Zap
} from 'lucide-react'

type TimelineEvent = {
  id: string
  event_date: string
  event_type: string
  title: string
  description: string | null
}

const EVENT_ICONS: Record<string, any> = {
  stage_advance: TrendingUp,
  stage_change: TrendingUp,
  stage_regress: TrendingDown,
  stage_regression: TrendingDown,
  protocol_created: Dumbbell,
  protocol_updated: Dumbbell,
  biomarker_panel: FlaskConical,
  milestone_reached: Star,
  milestone: Star,
  disruption: Calendar,
  disruption_event: Calendar,
  coach_note: MessageSquare,
  check_in: MessageSquare,
  intake: Zap,
}

const EVENT_COLORS: Record<string, string> = {
  stage_advance: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  stage_change: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  stage_regress: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  stage_regression: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  protocol_created: 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20',
  protocol_updated: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  biomarker_panel: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  milestone_reached: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  milestone: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  disruption: 'text-red-400 bg-red-400/10 border-red-400/20',
  disruption_event: 'text-red-400 bg-red-400/10 border-red-400/20',
  intake: 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20',
}

function groupByMonth(events: TimelineEvent[]) {
  const groups: Record<string, TimelineEvent[]> = {}
  for (const e of events) {
    const key = e.event_date.slice(0, 7)
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  }
  return groups
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMonth(key: string) {
  const [year, m] = key.split('-')
  return new Date(Number(year), Number(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default async function TimelinePage({ params }: { params: { clientId: string } }) {
  const session = await getSession()
  if (!session) return null

  const [client, events] = await Promise.all([
    db.queryOne<{ id: string; full_name: string; coach_id: string; current_stage: string; intake_date: string }>(
      `SELECT id, full_name, coach_id, current_stage, intake_date::text FROM clients WHERE id = $1`,
      [params.clientId]
    ),
    db.query<TimelineEvent>(
      `SELECT id, event_date::text, event_type, title, description
       FROM timeline_events WHERE client_id = $1
       ORDER BY event_date DESC, created_at DESC`,
      [params.clientId]
    ),
  ])

  if (!client || client.coach_id !== session.id) return notFound()

  const grouped = groupByMonth(events)
  const months = Object.keys(grouped).sort().reverse()

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <Link href={'/clients/' + params.clientId}
            className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">Timeline</h1>
            <p className="text-sm text-white/40">{client.full_name} · since {client.intake_date ?? 'N/A'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Events', value: events.length },
            { label: 'Stage Changes', value: events.filter(e => e.event_type.includes('stage')).length },
            { label: 'Protocols', value: events.filter(e => e.event_type.includes('protocol')).length },
          ].map(s => (
            <div key={s.label} className="bg-[#111111] border border-white/8 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#D4AF37]">{s.value}</div>
              <div className="text-xs text-white/35 mt-1 font-mono uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>

        {events.length === 0 ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Milestone size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No timeline events yet</p>
            <p className="text-xs text-white/25 mt-1">Events are recorded automatically as the client progresses</p>
          </div>
        ) : (
          <div className="space-y-8">
            {months.map(month => (
              <div key={month}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-mono uppercase tracking-widest text-white/30">{formatMonth(month)}</span>
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="text-xs text-white/20 font-mono">{grouped[month].length}</span>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-white/6" />
                  <div className="space-y-4 pl-10">
                    {grouped[month].map(event => {
                      const Icon = EVENT_ICONS[event.event_type] ?? Milestone
                      const colorClass = EVENT_COLORS[event.event_type] ?? 'text-white/50 bg-white/4 border-white/8'
                      return (
                        <div key={event.id} className="relative">
                          <div className={`absolute -left-10 w-8 h-8 rounded-full border flex items-center justify-center ${colorClass}`}>
                            <Icon size={13} />
                          </div>
                          <div className="bg-[#111111] border border-white/6 rounded-xl p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white/85">{event.title}</p>
                                {event.description && (
                                  <p className="text-xs text-white/40 mt-1 leading-relaxed">{event.description}</p>
                                )}
                              </div>
                              <span className="text-xs text-white/25 font-mono shrink-0">{formatDate(event.event_date)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}