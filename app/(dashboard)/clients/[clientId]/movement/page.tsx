import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import { ArrowLeft, Dumbbell, Zap, Shield, Star, ChevronRight } from 'lucide-react'

type ExerciseBlock = {
  exerciseName: string; sets: number; reps: string
  tempo?: string; loadGuidance?: string; coachingCue?: string; swapOption?: string
}

type SessionStructure = {
  frequency: number; sessionsPerWeek: number; sessionType: string
  complexityCeiling: number; volumeLevel: string
  activationBlock: ExerciseBlock[]
  primaryBlock: ExerciseBlock[]
  accessoryBlock: ExerciseBlock[]
  finisherBlock?: ExerciseBlock[]
}

type Protocol = {
  id: string; name: string; protocol_type: string; stage: string
  generation_state: string | null; sessions_per_week: number | null
  complexity_ceiling: number | null; volume_target: string | null
  bar_at_generation: number | null; effective_date: string
  protocol_payload: { sessionStructure?: SessionStructure; rationale?: string; clientFacingMessage?: string }
  generated_by: string; notes: string | null
}

function BlockTable({ title, exercises, color }: { title: string; exercises: ExerciseBlock[]; color: string }) {
  if (!exercises?.length) return null
  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg w-fit ${color}`}>
        <span className="text-xs font-mono uppercase tracking-widest font-semibold">{title}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/3">
              <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35 w-[35%]">Exercise</th>
              <th className="text-center px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35">Sets</th>
              <th className="text-center px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35">Reps</th>
              <th className="text-center px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35">Tempo</th>
              <th className="text-left px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35 hidden md:table-cell">Load</th>
              <th className="text-left px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35 hidden lg:table-cell">Cue</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map((ex, i) => (
              <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-white/85">{ex.exerciseName}</div>
                  {ex.swapOption && (
                    <div className="text-xs text-blue-400/60 mt-0.5 flex items-center gap-1">
                      <ChevronRight size={10} /> {ex.swapOption}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-center font-mono text-white/70">{ex.sets}</td>
                <td className="px-3 py-3 text-center font-mono text-white/70">{ex.reps}</td>
                <td className="px-3 py-3 text-center font-mono text-white/50 text-xs">{ex.tempo ?? '—'}</td>
                <td className="px-3 py-3 text-xs text-[#D4AF37]/70 hidden md:table-cell">{ex.loadGuidance ?? '—'}</td>
                <td className="px-3 py-3 text-xs text-white/40 hidden lg:table-cell">{ex.coachingCue ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function MovementPage({ params }: { params: { clientId: string } }) {
  const session = await getSession()
  if (!session) return null

  const [client, protocol] = await Promise.all([
    db.queryOne<{ id: string; full_name: string; coach_id: string; current_stage: string }>(
      `SELECT id, full_name, coach_id, current_stage FROM clients WHERE id = $1`,
      [params.clientId]
    ),
    db.queryOne<Protocol>(
      `SELECT id, name, protocol_type, stage, generation_state,
              sessions_per_week, complexity_ceiling, volume_target,
              bar_at_generation, effective_date::text,
              protocol_payload, generated_by, notes
       FROM protocols
       WHERE client_id = $1
       AND protocol_type IN ('movement', 'composite')
       AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [params.clientId]
    ),
  ])

  if (!client || client.coach_id !== session.id) return notFound()

  const ss = protocol?.protocol_payload?.sessionStructure

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + params.clientId}
              className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Movement</h1>
              <p className="text-sm text-white/40">{client.full_name}</p>
            </div>
          </div>
          <Link href={'/clients/' + params.clientId + '/protocols'}
            className="px-3 py-2 bg-white/6 border border-white/10 rounded-xl text-xs text-white/50 hover:text-white transition-colors flex items-center gap-1.5">
            <Dumbbell size={12} /> Manage Protocols
          </Link>
        </div>

        {!protocol ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Dumbbell size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No active movement protocol</p>
            <p className="text-xs text-white/25 mt-1">Generate a protocol from the Protocols page</p>
            <Link href={'/clients/' + params.clientId + '/protocols'}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-black text-sm font-semibold rounded-xl">
              <Zap size={14} /> Generate Protocol
            </Link>
          </div>
        ) : (
          <>
            {/* Protocol header */}
            <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="text-base font-semibold text-white">{protocol.name}</h2>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-mono uppercase">Active</span>
                    {protocol.generated_by === 'ai' && <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full font-mono uppercase">AI Generated</span>}
                  </div>
                  <p className="text-xs text-white/35 capitalize">{protocol.stage} stage · State {protocol.generation_state ?? '—'} · Effective {protocol.effective_date}</p>
                </div>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                {[
                  { label: 'Sessions/Week', value: ss?.sessionsPerWeek ?? protocol.sessions_per_week ?? '—' },
                  { label: 'Session Type', value: ss?.sessionType ?? '—' },
                  { label: 'Complexity', value: ss?.complexityCeiling ? 'Tier ' + ss.complexityCeiling : protocol.complexity_ceiling ? 'Tier ' + protocol.complexity_ceiling : '—' },
                  { label: 'Volume', value: ss?.volumeLevel ?? protocol.volume_target ?? '—' },
                ].map(s => (
                  <div key={s.label} className="bg-white/3 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">{s.label}</p>
                    <p className="text-sm font-bold text-white">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rationale */}
            {protocol.protocol_payload?.rationale && (
              <div className="bg-[#D4AF37]/6 border border-[#D4AF37]/15 rounded-2xl p-4">
                <p className="text-xs font-mono uppercase tracking-widest text-[#D4AF37]/60 mb-2">Protocol Rationale</p>
                <p className="text-sm text-white/60 leading-relaxed">{protocol.protocol_payload.rationale}</p>
              </div>
            )}

            {/* Exercise blocks */}
            {ss ? (
              <div className="space-y-6">
                <BlockTable
                  title="Activation"
                  exercises={ss.activationBlock}
                  color="bg-blue-500/10 text-blue-400 border border-blue-500/20"
                />
                <BlockTable
                  title="Primary"
                  exercises={ss.primaryBlock}
                  color="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                />
                <BlockTable
                  title="Accessory"
                  exercises={ss.accessoryBlock}
                  color="bg-amber-500/10 text-amber-400 border border-amber-500/20"
                />
                {ss.finisherBlock?.length ? (
                  <BlockTable
                    title="Finisher"
                    exercises={ss.finisherBlock}
                    color="bg-red-500/10 text-red-400 border border-red-500/20"
                  />
                ) : null}
              </div>
            ) : (
              <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 text-center">
                <p className="text-sm text-white/40">This protocol does not contain a movement session structure</p>
                <p className="text-xs text-white/25 mt-1">Generate a movement or composite protocol to see exercise tables here</p>
              </div>
            )}

            {/* Client facing message */}
            {protocol.protocol_payload?.clientFacingMessage && (
              <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Client Message</p>
                <p className="text-sm text-white/60 leading-relaxed">{protocol.protocol_payload.clientFacingMessage}</p>
              </div>
            )}

            {/* Notes */}
            {protocol.notes && (
              <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Protocol Notes</p>
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{protocol.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}