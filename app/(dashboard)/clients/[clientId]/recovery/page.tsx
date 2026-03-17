import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import { ArrowLeft, Heart, Moon, Brain, Zap, Activity } from 'lucide-react'

type Protocol = {
  name: string; stage: string; generation_state: string | null
  effective_date: string; generated_by: string
  protocol_payload: {
    recoveryStructure?: {
      sleepTarget: string; stressReductionProtocol: string
      activeRecoveryDays: number; mobilityMinutes: number
      keyRecoveryPractices: string[]
    }
    rationale?: string; clientFacingMessage?: string
  }
}

type JournalEntry = {
  entry_date: string; sleep_hours: number | null; sleep_quality: number | null
  stress_level: number | null; energy_level: number | null; mood: number | null
  travel_flag: boolean; illness_flag: boolean
  work_stress_flag: boolean; family_stress_flag: boolean
}

function avg(vals: (number | null)[]): number | null {
  const clean = vals.filter(v => v !== null) as number[]
  return clean.length ? Math.round(clean.reduce((a, b) => a + b, 0) / clean.length * 10) / 10 : null
}

function ScoreBar({ value, max = 5, goodHigh = true }: { value: number | null; max?: number; goodHigh?: boolean }) {
  if (!value) return <span className="text-white/20 text-xs">—</span>
  const pct = (value / max) * 100
  const isGood = goodHigh ? value >= max * 0.7 : value <= max * 0.4
  const color = isGood ? 'bg-emerald-500' : value >= max * 0.5 ? 'bg-[#D4AF37]' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: pct + '%' }} />
      </div>
      <span className="text-xs font-bold text-white/70 w-8 text-right font-mono">{value}/{max}</span>
    </div>
  )
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function RecoveryPage({ params }: { params: { clientId: string } }) {
  const session = await getSession()
  if (!session) return null

  const [client, protocol, journals] = await Promise.all([
    db.queryOne<{ id: string; full_name: string; coach_id: string; current_stage: string }>(
      `SELECT id, full_name, coach_id, current_stage FROM clients WHERE id = $1`,
      [params.clientId]
    ),
    db.queryOne<Protocol>(
      `SELECT name, stage, generation_state, effective_date::text,
              generated_by, protocol_payload
       FROM protocols
       WHERE client_id = $1
       AND protocol_type IN ('recovery', 'composite')
       AND is_active = true
       ORDER BY CASE protocol_type WHEN 'recovery' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
      [params.clientId]
    ),
    db.query<JournalEntry>(
      `SELECT entry_date::text, sleep_hours, sleep_quality, stress_level,
              energy_level, mood, travel_flag, illness_flag,
              work_stress_flag, family_stress_flag
       FROM journal_entries
       WHERE client_id = $1
       ORDER BY entry_date DESC LIMIT 14`,
      [params.clientId]
    ),
  ])

  if (!client || client.coach_id !== session.id) return notFound()

  const rs = protocol?.protocol_payload?.recoveryStructure
  const avgSleep = avg(journals.map(j => j.sleep_quality))
  const avgStress = avg(journals.map(j => j.stress_level))
  const avgEnergy = avg(journals.map(j => j.energy_level))
  const avgMood = avg(journals.map(j => j.mood))
  const avgSleepHours = avg(journals.map(j => j.sleep_hours))
  const recentFlags = journals.filter(j =>
    j.travel_flag || j.illness_flag || j.work_stress_flag || j.family_stress_flag
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + params.clientId}
              className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Recovery</h1>
              <p className="text-sm text-white/40">{client.full_name}</p>
            </div>
          </div>
          <Link href={'/clients/' + params.clientId + '/protocols'}
            className="px-3 py-2 bg-white/6 border border-white/10 rounded-xl text-xs text-white/50 hover:text-white transition-colors flex items-center gap-1.5">
            <Heart size={12} /> Manage Protocols
          </Link>
        </div>

        {journals.length > 0 && (
          <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-4">14-Day Recovery Averages <span className="text-white/20 ml-2 normal-case font-sans">from journal entries</span></p>
            <div className="space-y-4">
              {([
                { label: 'Sleep Quality', icon: Moon, value: avgSleep, max: 5, goodHigh: true, color: 'text-blue-400' },
                { label: 'Energy Level', icon: Zap, value: avgEnergy, max: 5, goodHigh: true, color: 'text-[#D4AF37]' },
                { label: 'Mood', icon: Heart, value: avgMood, max: 5, goodHigh: true, color: 'text-emerald-400' },
                { label: 'Stress Level', icon: Brain, value: avgStress, max: 5, goodHigh: false, color: 'text-red-400' },
              ] as const).map(m => {
                const Icon = m.icon
                return (
                  <div key={m.label} className="flex items-center gap-3">
                    <Icon size={14} className={m.color} />
                    <span className="text-xs text-white/50 w-28">{m.label}</span>
                    <div className="flex-1"><ScoreBar value={m.value} max={m.max} goodHigh={m.goodHigh} /></div>
                  </div>
                )
              })}
            </div>
            {avgSleepHours && (
              <div className="mt-4 pt-4 border-t border-white/6 flex items-center gap-3">
                <Moon size={14} className="text-blue-400" />
                <span className="text-xs text-white/50">Avg Sleep Duration</span>
                <span className="text-sm font-bold text-white ml-auto font-mono">{avgSleepHours}h</span>
              </div>
            )}
          </div>
        )}

        {recentFlags.length > 0 && (
          <div className="bg-red-500/6 border border-red-500/20 rounded-2xl p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-red-400/70 mb-3">Recent Disruption Flags</p>
            <div className="space-y-2">
              {recentFlags.slice(0, 5).map((j, i) => {
                const flags = []
                if (j.travel_flag) flags.push('Travel')
                if (j.illness_flag) flags.push('Illness')
                if (j.work_stress_flag) flags.push('Work Stress')
                if (j.family_stress_flag) flags.push('Family Stress')
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-white/40 font-mono">{formatDate(j.entry_date)}</span>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {flags.map(f => <span key={f} className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">{f}</span>)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!protocol ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Heart size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No active recovery protocol</p>
            <p className="text-xs text-white/25 mt-1">Generate a composite protocol to include recovery guidance</p>
            <Link href={'/clients/' + params.clientId + '/protocols'}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-black text-sm font-semibold rounded-xl">
              <Zap size={14} /> Generate Protocol
            </Link>
          </div>
        ) : rs ? (
          <>
            <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <h2 className="text-sm font-semibold text-white">{protocol.name}</h2>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-mono uppercase">Active</span>
                {protocol.generated_by === 'ai' && <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full font-mono uppercase">AI Generated</span>}
              </div>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {([
                  { label: 'Sleep Target', value: rs.sleepTarget, icon: Moon, color: 'text-blue-400' },
                  { label: 'Recovery Days', value: rs.activeRecoveryDays + '/week', icon: Activity, color: 'text-emerald-400' },
                  { label: 'Mobility', value: rs.mobilityMinutes + ' min/day', icon: Heart, color: 'text-[#D4AF37]' },
                ] as const).map(s => {
                  const Icon = s.icon
                  return (
                    <div key={s.label} className="bg-white/3 rounded-xl p-3 text-center">
                      <Icon size={14} className={`mx-auto mb-1 ${s.color}`} />
                      <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">{s.label}</p>
                      <p className="text-sm font-bold text-white">{s.value}</p>
                    </div>
                  )
                })}
              </div>
              {rs.stressReductionProtocol && (
                <div className="bg-blue-500/6 border border-blue-500/15 rounded-xl p-4 mb-4">
                  <p className="text-xs font-mono uppercase tracking-widest text-blue-400/70 mb-2">Stress Reduction Protocol</p>
                  <p className="text-sm text-white/60 leading-relaxed">{rs.stressReductionProtocol}</p>
                </div>
              )}
              {rs.keyRecoveryPractices?.length > 0 && (
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Key Recovery Practices</p>
                  <div className="space-y-2">
                    {rs.keyRecoveryPractices.map((p, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-[#D4AF37] flex-shrink-0 text-xs font-bold font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                        <p className="text-sm text-white/65 leading-relaxed">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {protocol.protocol_payload?.clientFacingMessage && (
              <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Client Message</p>
                <p className="text-sm text-white/60 leading-relaxed">{protocol.protocol_payload.clientFacingMessage}</p>
              </div>
            )}
          </>
        ) : (
          <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 text-center">
            <p className="text-sm text-white/40">This protocol does not contain recovery guidance</p>
            <p className="text-xs text-white/25 mt-1">Regenerate a composite protocol to include recovery structure</p>
          </div>
        )}

        {journals.length > 0 && (
          <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-4">14-Day Log</p>
            <div className="space-y-2">
              {journals.map((j, i) => {
                const hasFlags = j.travel_flag || j.illness_flag || j.work_stress_flag || j.family_stress_flag
                return (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-white/30 font-mono w-16 shrink-0">{formatDate(j.entry_date)}</span>
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      {j.sleep_quality && <span className="flex items-center gap-1 text-blue-400/70"><Moon size={9} />{j.sleep_quality}/5</span>}
                      {j.energy_level && <span className="flex items-center gap-1 text-[#D4AF37]/70"><Zap size={9} />{j.energy_level}/5</span>}
                      {j.mood && <span className="flex items-center gap-1 text-emerald-400/70"><Heart size={9} />{j.mood}/5</span>}
                      {j.stress_level && <span className="flex items-center gap-1 text-red-400/70"><Brain size={9} />{j.stress_level}/5</span>}
                    </div>
                    {hasFlags && <span className="text-red-400/60 shrink-0">⚑</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}