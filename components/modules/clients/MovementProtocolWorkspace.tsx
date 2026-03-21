'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, History, RotateCcw, Save, SlidersHorizontal, Zap } from 'lucide-react'
import type { MovementWorkspaceData } from '@/lib/protocol-workspaces'

type Props = {
  clientId: string
  clientName: string
  initialData: MovementWorkspaceData
}

type OverrideFormState = {
  target: string
  exerciseName: string
  sets: string
  reps: string
  loadGuidance: string
  sessionsPerWeek: string
  volumeLevel: string
  reason: string
}

type ExecutionLogFormState = {
  exerciseId: string
  completedSessions: string
  completedSets: string
  completedReps: string
  load: string
  notes: string
}

const BLOCK_LABELS = {
  activationBlock: 'Activation',
  primaryBlock: 'Primary',
  accessoryBlock: 'Accessory',
  finisherBlock: 'Finisher',
} as const

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function MovementProtocolWorkspace({ clientId, clientName, initialData }: Props) {
  const [data, setData] = useState(initialData)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [overrideForm, setOverrideForm] = useState<OverrideFormState>({
    target: 'sessionStructure',
    exerciseName: '',
    sets: '',
    reps: '',
    loadGuidance: '',
    sessionsPerWeek: '',
    volumeLevel: '',
    reason: '',
  })
  const [executionLogForm, setExecutionLogForm] = useState<ExecutionLogFormState>({
    exerciseId: '',
    completedSessions: '',
    completedSets: '',
    completedReps: '',
    load: '',
    notes: '',
  })

  const protocol = data.protocol
  const exercises = protocol
    ? [
        ...protocol.displayBlocks.activationBlock,
        ...protocol.displayBlocks.primaryBlock,
        ...protocol.displayBlocks.accessoryBlock,
        ...protocol.displayBlocks.finisherBlock,
      ]
    : []

  async function refreshWorkspace() {
    try {
      const response = await fetch(`/api/clients/${clientId}/movement`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to refresh movement workspace')
      setData(payload)
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh movement workspace')
    }
  }

  async function submitAction(body: Record<string, unknown>, message: string) {
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/movement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save movement update')
      setData(payload.workspace as MovementWorkspaceData)
      setSuccess(message)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save movement update')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleExecutionLogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!protocol || !executionLogForm.exerciseId) return
    const exercise = exercises.find(item => item.id === executionLogForm.exerciseId)
    if (!exercise) return

    await submitAction(
      {
        action: 'log_execution',
        protocolId: protocol.id,
        exerciseId: exercise.id,
        exerciseName: exercise.exerciseName,
        completedSessions: executionLogForm.completedSessions ? Number(executionLogForm.completedSessions) : null,
        completedSets: executionLogForm.completedSets ? Number(executionLogForm.completedSets) : null,
        completedReps: executionLogForm.completedReps || null,
        load: executionLogForm.load || null,
        notes: executionLogForm.notes || null,
      },
      'Execution log saved'
    )

    setExecutionLogForm(current => ({
      ...current,
      completedSessions: '',
      completedSets: '',
      completedReps: '',
      load: '',
      notes: '',
    }))
  }

  async function handleOverrideSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!protocol) return

    const change: Record<string, unknown> = {}
    if (overrideForm.target === 'sessionStructure') {
      if (overrideForm.sessionsPerWeek) change.sessionsPerWeek = Number(overrideForm.sessionsPerWeek)
      if (overrideForm.volumeLevel.trim()) change.volumeLevel = overrideForm.volumeLevel.trim()
    } else {
      if (overrideForm.exerciseName.trim()) change.exerciseName = overrideForm.exerciseName.trim()
      if (overrideForm.sets) change.sets = Number(overrideForm.sets)
      if (overrideForm.reps.trim()) change.reps = overrideForm.reps.trim()
      if (overrideForm.loadGuidance.trim()) change.loadGuidance = overrideForm.loadGuidance.trim()
    }

    if (!Object.keys(change).length) {
      setError('Add a movement change before saving the override.')
      return
    }

    await submitAction(
      {
        action: 'add_override',
        protocolId: protocol.id,
        target: overrideForm.target,
        change,
        reason: overrideForm.reason.trim(),
      },
      'Coach override applied'
    )

    setOverrideForm(current => ({
      ...current,
      exerciseName: '',
      sets: '',
      reps: '',
      loadGuidance: '',
      sessionsPerWeek: '',
      volumeLevel: '',
      reason: '',
    }))
  }

  async function handleRevert(overrideId: string) {
    if (!protocol) return
    await submitAction(
      {
        action: 'revert_override',
        protocolId: protocol.id,
        overrideId,
      },
      'Override reverted'
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/clients/${clientId}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/6 text-white/50 hover:text-white">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Movement</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refreshWorkspace()} className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white">
              Refresh
            </button>
            <Link href={`/clients/${clientId}/protocols`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white">
              <Zap size={12} /> Manage Protocols
            </Link>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {success ? <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

        {!protocol ? (
          <div className="rounded-2xl border border-dashed border-white/8 bg-[#111111] p-10 text-center text-sm text-white/45">
            No active movement or composite protocol is available yet.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-white">{protocol.name}</h2>
                  <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[10px] font-mono uppercase text-white/60">Protocol</span>
                  <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-mono uppercase text-[#D4AF37]">Adjusted</span>
                </div>
                <p className="mt-2 text-xs text-white/35">
                  {protocol.stage} stage · State {protocol.generationState ?? '—'} · Effective {protocol.effectiveDate}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/4 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">Sessions / Week</div>
                    <div className="mt-1 text-lg font-semibold text-white">{protocol.sessionStructure?.sessionsPerWeek ?? '—'}</div>
                    <div className="mt-1 text-xs text-[#D4AF37]">Adjusted: {protocol.adjustedSessionStructure?.sessionsPerWeek ?? protocol.sessionStructure?.sessionsPerWeek ?? '—'}</div>
                  </div>
                  <div className="rounded-xl bg-white/4 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">Volume</div>
                    <div className="mt-1 text-lg font-semibold text-white capitalize">{protocol.sessionStructure?.volumeLevel ?? '—'}</div>
                    <div className="mt-1 text-xs text-[#D4AF37] capitalize">Adjusted: {protocol.adjustedSessionStructure?.volumeLevel ?? protocol.sessionStructure?.volumeLevel ?? '—'}</div>
                  </div>
                  <div className="rounded-xl bg-white/4 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">Active Overrides</div>
                    <div className="mt-1 text-lg font-semibold text-white">{protocol.activeOverrides.length}</div>
                    <div className="mt-1 text-xs text-white/40">Execution logs: {protocol.executionLog.length}</div>
                  </div>
                </div>
                {protocol.rationale ? <div className="mt-4 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/6 p-4 text-sm text-white/65">{protocol.rationale}</div> : null}
              </div>

              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Coach Override System</h2>
                </div>
                <p className="mt-3 text-sm text-white/50">
                  The saved protocol stays intact. All movement edits live as timestamped overrides that reference protocol exercise IDs for future AI reads and version tracking.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <h2 className="text-sm font-semibold text-white">Current Program View</h2>
              <div className="mt-4 space-y-5">
                {(Object.keys(protocol.displayBlocks) as Array<keyof typeof protocol.displayBlocks>).map(blockKey => {
                  const block = protocol.displayBlocks[blockKey]
                  if (!block.length) return null

                  return (
                    <div key={blockKey} className="space-y-3">
                      <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-widest text-white/55">
                        {BLOCK_LABELS[blockKey]}
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-white/8">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/8 bg-white/3">
                              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-white/35">Exercise</th>
                              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-white/35">Protocol</th>
                              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-white/35">Adjusted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {block.map(exercise => (
                              <tr key={exercise.id} className="border-b border-white/5 last:border-0 align-top">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-white/85">{exercise.original.exerciseName}</div>
                                  {exercise.exerciseName !== exercise.original.exerciseName ? <div className="mt-1 text-xs text-[#D4AF37]">Swap: {exercise.exerciseName}</div> : null}
                                </td>
                                <td className="px-4 py-3 text-white/55">
                                  <div>{exercise.original.sets} sets x {exercise.original.reps}</div>
                                  <div className="mt-1 text-xs">Load: {exercise.original.loadGuidance ?? 'As written'}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className={exercise.adjusted ? 'font-semibold text-[#D4AF37]' : 'text-white/70'}>
                                    {exercise.sets} sets x {exercise.reps}
                                  </div>
                                  <div className="mt-1 text-xs text-white/45">Load: {exercise.loadGuidance ?? exercise.original.loadGuidance ?? 'No change'}</div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <form onSubmit={handleExecutionLogSubmit} className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <Save size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Execution Log</h2>
                </div>
                <div className="mt-4 space-y-3">
                  <select value={executionLogForm.exerciseId} onChange={event => setExecutionLogForm(current => ({ ...current, exerciseId: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none">
                    <option value="">Select protocol exercise</option>
                    {exercises.map(exercise => (
                      <option key={exercise.id} value={exercise.id}>
                        {BLOCK_LABELS[exercise.block]} · {exercise.exerciseName}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={executionLogForm.completedSessions} onChange={event => setExecutionLogForm(current => ({ ...current, completedSessions: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Completed sessions" />
                    <input value={executionLogForm.completedSets} onChange={event => setExecutionLogForm(current => ({ ...current, completedSets: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Completed sets" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={executionLogForm.completedReps} onChange={event => setExecutionLogForm(current => ({ ...current, completedReps: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Completed reps" />
                    <input value={executionLogForm.load} onChange={event => setExecutionLogForm(current => ({ ...current, load: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Load used" />
                  </div>
                  <textarea value={executionLogForm.notes} onChange={event => setExecutionLogForm(current => ({ ...current, notes: event.target.value }))} className="min-h-[96px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Session notes" />
                </div>
                <button type="submit" disabled={submitting || !executionLogForm.exerciseId} className="mt-4 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
                  Save Execution Log
                </button>
              </form>

              <form onSubmit={handleOverrideSubmit} className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Coach Overrides</h2>
                </div>
                <div className="mt-4 space-y-3">
                  <select value={overrideForm.target} onChange={event => setOverrideForm(current => ({ ...current, target: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none">
                    <option value="sessionStructure">Session structure</option>
                    {exercises.map(exercise => (
                      <option key={exercise.id} value={exercise.id}>
                        {BLOCK_LABELS[exercise.block]} · {exercise.original.exerciseName}
                      </option>
                    ))}
                  </select>
                  {overrideForm.target === 'sessionStructure' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input value={overrideForm.sessionsPerWeek} onChange={event => setOverrideForm(current => ({ ...current, sessionsPerWeek: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Sessions / week" />
                      <input value={overrideForm.volumeLevel} onChange={event => setOverrideForm(current => ({ ...current, volumeLevel: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Volume level" />
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input value={overrideForm.exerciseName} onChange={event => setOverrideForm(current => ({ ...current, exerciseName: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Swap exercise" />
                        <input value={overrideForm.loadGuidance} onChange={event => setOverrideForm(current => ({ ...current, loadGuidance: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Load target" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input value={overrideForm.sets} onChange={event => setOverrideForm(current => ({ ...current, sets: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted sets" />
                        <input value={overrideForm.reps} onChange={event => setOverrideForm(current => ({ ...current, reps: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted reps" />
                      </div>
                    </>
                  )}
                  <textarea value={overrideForm.reason} onChange={event => setOverrideForm(current => ({ ...current, reason: event.target.value }))} className="min-h-[96px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Coach reason for this override" required />
                </div>
                <button type="submit" disabled={submitting} className="mt-4 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
                  Apply Override
                </button>
              </form>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <RotateCcw size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Active Overrides</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {protocol.activeOverrides.length === 0 ? (
                    <p className="text-sm text-white/45">No movement overrides yet.</p>
                  ) : (
                    protocol.activeOverrides.map(override => (
                      <div key={override.id} className="rounded-xl border border-white/8 bg-white/4 p-4">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">{override.target}</div>
                        <div className="mt-1 text-sm text-white/75">{override.reason}</div>
                        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs text-[#D4AF37]">
                          {JSON.stringify(override.change, null, 2)}
                        </pre>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/35">
                          <span>{formatTimestamp(override.timestamp)}</span>
                          <button type="button" onClick={() => void handleRevert(override.id)} className="rounded-xl border border-white/10 px-3 py-1.5 text-white/65 hover:text-white">
                            Revert to Original
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-[#D4AF37]" />
                    <h2 className="text-sm font-semibold text-white">Movement History</h2>
                  </div>
                  <div className="mt-4 space-y-3">
                    {data.history.map(item => (
                      <div key={item.id} className="rounded-xl border border-white/8 bg-white/4 p-4 text-sm text-white/65">
                        <div className="font-medium text-white/80">{item.name}</div>
                        <div className="mt-1 text-xs text-white/40">{item.stage} stage · Effective {item.effective_date}</div>
                        <div className="mt-2 text-xs text-white/45">
                          Sessions/week: {item.sessions_per_week ?? '—'} · Volume: {item.volume_target ?? '—'} · Overrides: {item.override_count}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-[#D4AF37]" />
                    <h2 className="text-sm font-semibold text-white">Execution History</h2>
                  </div>
                  <div className="mt-4 space-y-3">
                    {protocol.executionLog.length === 0 ? (
                      <p className="text-sm text-white/45">No movement sessions logged yet.</p>
                    ) : (
                      protocol.executionLog.map(entry => (
                        <div key={entry.id} className="rounded-xl border border-white/8 bg-white/4 p-4 text-sm text-white/65">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-white/80">{entry.exercise_name}</div>
                            <div className="text-xs text-white/35">{formatTimestamp(entry.timestamp)}</div>
                          </div>
                          <div className="mt-2 text-xs text-white/45">
                            Sessions: {entry.completed_sessions ?? '—'} · Sets: {entry.completed_sets ?? '—'} · Reps: {entry.completed_reps ?? '—'} · Load: {entry.load ?? '—'}
                          </div>
                          {entry.notes ? <div className="mt-2 text-sm text-white/60">{entry.notes}</div> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
