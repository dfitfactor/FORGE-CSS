'use client'

import { type FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  History,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Zap,
} from 'lucide-react'
import type { MovementWorkspaceData } from '@/lib/protocol-workspaces'
import { normalizeLoad } from '@/lib/protocol-overrides'

type Props = {
  clientId: string
  clientName: string
  initialData: MovementWorkspaceData
}

type EditorState = {
  exerciseName: string
  sets: string
  reps: string
  loadGuidance: string
  tempo: string
  variation: string
  reason: string
}

type SessionOverrideState = {
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

type BlockKey = 'activationBlock' | 'primaryBlock' | 'accessoryBlock' | 'finisherBlock'

const BLOCK_LABELS: Record<BlockKey, string> = {
  activationBlock: 'Activation',
  primaryBlock: 'Primary',
  accessoryBlock: 'Accessory',
  finisherBlock: 'Finisher',
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function summarizeChange(change: Record<string, unknown>) {
  const parts: string[] = []
  if (typeof change.exerciseName === 'string') parts.push(`swap to ${change.exerciseName}`)
  if (typeof change.sets === 'number') parts.push(`sets ${change.sets}`)
  if (typeof change.reps === 'string') parts.push(`reps ${change.reps}`)
  if (typeof change.loadGuidance === 'string') parts.push(`load ${change.loadGuidance}`)
  if (typeof change.tempo === 'string') parts.push(`tempo ${change.tempo}`)
  if (typeof change.variation === 'string' && change.variation.trim()) parts.push(`variation ${change.variation}`)
  if (typeof change.sessionsPerWeek === 'number') parts.push(`sessions/week ${change.sessionsPerWeek}`)
  if (typeof change.volumeLevel === 'string') parts.push(`volume ${change.volumeLevel}`)
  if (change.removed === true) parts.push('removed from adjusted plan')
  return parts.join(' | ') || 'Coach adjustment recorded'
}

function buildEditors(data: MovementWorkspaceData) {
  const protocol = data.protocol
  if (!protocol) return {}

  const exercises = [
    ...protocol.displayBlocks.activationBlock,
    ...protocol.displayBlocks.primaryBlock,
    ...protocol.displayBlocks.accessoryBlock,
    ...protocol.displayBlocks.finisherBlock,
  ]

  return Object.fromEntries(
    exercises.map(exercise => [
      exercise.id,
      {
        exerciseName: exercise.exerciseName,
        sets: String(exercise.sets),
        reps: exercise.reps,
        loadGuidance: normalizeLoad(exercise.loadGuidance, exercise.exerciseName),
        tempo: exercise.tempo ?? '',
        variation: exercise.variation ?? '',
        reason: '',
      } satisfies EditorState,
    ])
  ) as Record<string, EditorState>
}

function hasExerciseDraftChanges(
  editor: EditorState,
  exercise: {
    exerciseName: string
    sets: number
    reps: string
    loadGuidance?: string
    tempo?: string
    variation?: string
  }
) {
  return (
    editor.exerciseName.trim() !== exercise.exerciseName ||
    editor.sets.trim() !== String(exercise.sets) ||
    editor.reps.trim() !== exercise.reps ||
    editor.loadGuidance.trim() !== normalizeLoad(exercise.loadGuidance, exercise.exerciseName) ||
    editor.tempo.trim() !== (exercise.tempo ?? '') ||
    editor.variation.trim() !== (exercise.variation ?? '')
  )
}

export default function MovementProtocolWorkspace({ clientId, clientName, initialData }: Props) {
  const [data, setData] = useState(initialData)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [adjustMode, setAdjustMode] = useState(false)
  const [editors, setEditors] = useState<Record<string, EditorState>>(buildEditors(initialData))
  const [sessionOverride, setSessionOverride] = useState<SessionOverrideState>({
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
  const exercises = useMemo(
    () =>
      protocol
        ? [
            ...protocol.displayBlocks.activationBlock,
            ...protocol.displayBlocks.primaryBlock,
            ...protocol.displayBlocks.accessoryBlock,
            ...protocol.displayBlocks.finisherBlock,
          ]
        : [],
    [protocol]
  )

  function syncWorkspace(nextData: MovementWorkspaceData) {
    setData(nextData)
    setEditors(buildEditors(nextData))
  }

  async function refreshWorkspace() {
    try {
      const response = await fetch(`/api/clients/${clientId}/movement`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to refresh movement workspace')
      syncWorkspace(payload)
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

      syncWorkspace(payload.workspace as MovementWorkspaceData)
      setSuccess(message)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save movement update')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveExerciseChange(exerciseId: string, change: Record<string, unknown>, reason: string, message: string) {
    if (!protocol) return
    if (!reason.trim()) {
      setError('Add a coach reason before saving this exercise adjustment.')
      return
    }

    await submitAction(
      {
        action: 'add_override',
        protocolId: protocol.id,
        target: exerciseId,
        change,
        reason: reason.trim(),
      },
      message
    )
  }

  async function handleSaveExercise(exerciseId: string) {
    const editor = editors[exerciseId]
    if (!editor) return

    const parsedSets = Number(editor.sets)
    if (!Number.isFinite(parsedSets) || parsedSets <= 0) {
      setError('Sets must be a valid number before saving.')
      return
    }

    await saveExerciseChange(
      exerciseId,
      {
        exerciseName: editor.exerciseName.trim(),
        sets: parsedSets,
        reps: editor.reps.trim(),
        loadGuidance: normalizeLoad(editor.loadGuidance.trim(), editor.exerciseName.trim()),
        tempo: editor.tempo.trim(),
        variation: editor.variation.trim(),
      },
      editor.reason,
      'Exercise override applied'
    )
  }

  async function handleRemoveExercise(exerciseId: string) {
    const editor = editors[exerciseId]
    if (!editor) return

    await saveExerciseChange(
      exerciseId,
      { removed: true },
      editor.reason || 'Removed from adjusted plan',
      'Exercise removed from adjusted plan'
    )
  }

  async function handleSessionOverrideSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!protocol) return

    if (!sessionOverride.reason.trim()) {
      setError('Add a coach reason before saving the protocol-level adjustment.')
      return
    }

    const change: Record<string, unknown> = {}
    if (sessionOverride.sessionsPerWeek.trim()) {
      const parsed = Number(sessionOverride.sessionsPerWeek)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Sessions per week must be a valid number.')
        return
      }
      change.sessionsPerWeek = parsed
    }
    if (sessionOverride.volumeLevel.trim()) change.volumeLevel = sessionOverride.volumeLevel.trim()

    if (!Object.keys(change).length) {
      setError('Add at least one protocol-level adjustment before saving.')
      return
    }

    await submitAction(
      {
        action: 'add_override',
        protocolId: protocol.id,
        target: 'sessionStructure',
        change,
        reason: sessionOverride.reason.trim(),
      },
      'Protocol-level override applied'
    )

    setSessionOverride({ sessionsPerWeek: '', volumeLevel: '', reason: '' })
  }

  async function handleExecutionLogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!protocol || !executionLogForm.exerciseId) {
      setError('Select an exercise before logging execution.')
      return
    }

    const exercise = exercises.find(item => item.id === executionLogForm.exerciseId)
    if (!exercise) {
      setError('Unable to find that exercise in the current protocol.')
      return
    }

    await submitAction(
      {
        action: 'log_execution',
        protocolId: protocol.id,
        exerciseId: exercise.id,
        exerciseName: exercise.exerciseName,
        completedSessions: executionLogForm.completedSessions ? Number(executionLogForm.completedSessions) : null,
        completedSets: executionLogForm.completedSets ? Number(executionLogForm.completedSets) : null,
        completedReps: executionLogForm.completedReps || null,
        load: normalizeLoad(executionLogForm.load || exercise.loadGuidance, exercise.exerciseName),
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

  if (!protocol) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-dashed border-white/8 bg-[#111111] p-10 text-center text-sm text-white/45">
          No active movement or composite protocol is available yet.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/clients/${clientId}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/6 text-white/50 hover:text-white"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Movement</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAdjustMode(current => !current)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                adjustMode
                  ? 'bg-[#D4AF37] text-black'
                  : 'border border-white/10 bg-white/6 text-white/70 hover:text-white'
              }`}
            >
              <PencilLine size={14} /> {adjustMode ? 'Exit Adjust Mode' : 'Adjust Protocol'}
            </button>
            <button
              type="button"
              onClick={() => void refreshWorkspace()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <Link
              href={`/clients/${clientId}/protocols`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white"
            >
              <Zap size={12} /> Manage Protocols
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-white">{protocol.name}</h2>
              <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[10px] font-mono uppercase text-white/60">
                Protocol
              </span>
              <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-mono uppercase text-[#D4AF37]">
                Adjusted
              </span>
            </div>
            <p className="mt-2 text-xs text-white/35">
              {protocol.stage} stage | State {protocol.generationState ?? '-'} | Effective {protocol.effectiveDate}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/4 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">Sessions / Week</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {protocol.sessionStructure?.sessionsPerWeek ?? '-'}
                </div>
                <div className="mt-1 text-xs text-[#D4AF37]">
                  Adjusted: {protocol.adjustedSessionStructure?.sessionsPerWeek ?? protocol.sessionStructure?.sessionsPerWeek ?? '-'}
                </div>
              </div>
              <div className="rounded-xl bg-white/4 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">Volume</div>
                <div className="mt-1 text-lg font-semibold capitalize text-white">
                  {protocol.sessionStructure?.volumeLevel ?? '-'}
                </div>
                <div className="mt-1 text-xs capitalize text-[#D4AF37]">
                  Adjusted: {protocol.adjustedSessionStructure?.volumeLevel ?? protocol.sessionStructure?.volumeLevel ?? '-'}
                </div>
              </div>
              <div className="rounded-xl bg-white/4 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">Coach Changes</div>
                <div className="mt-1 text-lg font-semibold text-white">{protocol.activeOverrides.length}</div>
                <div className="mt-1 text-xs text-white/40">Execution logs: {protocol.executionLog.length}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-[#D4AF37]" />
              <h2 className="text-sm font-semibold text-white">Override Summary</h2>
            </div>
            <div className="mt-4 rounded-xl border border-white/8 bg-white/4 p-4">
              {data.overrideIntelligence.bullets.length > 0 ? (
                <div className="space-y-2">
                  {data.overrideIntelligence.bullets.map((item, index) => (
                    <div key={`${item}-${index}`} className="flex gap-2 text-sm text-white/70">
                      <span className="text-[#D4AF37]">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/45">No override patterns have accumulated yet.</p>
              )}
            </div>
          </div>
        </div>

        {adjustMode ? (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <div className="flex items-center gap-2">
                <PencilLine size={14} className="text-[#D4AF37]" />
                <h2 className="text-sm font-semibold text-white">Coach Override Workspace</h2>
              </div>
              <p className="mt-2 text-sm text-white/45">
                Adjust exercise-level details inline. The original protocol remains preserved and every change is stored as a coach override.
              </p>

              <div className="mt-4 space-y-5">
                {(Object.keys(protocol.displayBlocks) as BlockKey[]).map(blockKey => {
                  const block = protocol.displayBlocks[blockKey]
                  if (!block.length) return null

                  return (
                    <div key={blockKey} className="space-y-3">
                      <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-widest text-white/55">
                        {BLOCK_LABELS[blockKey]}
                      </div>
                      {block.map(exercise => {
                        const editor = editors[exercise.id]
                        if (!editor) return null

                        const hasDraftChanges = hasExerciseDraftChanges(editor, exercise)

                        return (
                          <div key={exercise.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.15fr]">
                              <div>
                                <div className="text-xs font-mono uppercase tracking-widest text-white/30">Protocol</div>
                                <div className="mt-2 space-y-1 text-sm text-white/45">
                                  <div className="font-medium text-white/60">{exercise.original.exerciseName}</div>
                                  <div>
                                    {exercise.original.sets} sets x {exercise.original.reps}
                                  </div>
                                  <div>
                                    Load: {normalizeLoad(exercise.original.loadGuidance, exercise.original.exerciseName)}
                                  </div>
                                  <div>Tempo: {exercise.original.tempo ?? '-'}</div>
                                </div>
                              </div>

                              <div>
                                <div className="text-xs font-mono uppercase tracking-widest text-[#D4AF37]">Adjusted</div>
                                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                  <input
                                    value={editor.exerciseName}
                                    onChange={event =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: { ...current[exercise.id], exerciseName: event.target.value },
                                      }))
                                    }
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    placeholder="Exercise name"
                                  />
                                  <input
                                    value={editor.variation}
                                    onChange={event =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: { ...current[exercise.id], variation: event.target.value },
                                      }))
                                    }
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    placeholder="Variation"
                                  />
                                  <input
                                    value={editor.sets}
                                    onChange={event =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: { ...current[exercise.id], sets: event.target.value },
                                      }))
                                    }
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    placeholder="Sets"
                                  />
                                  <input
                                    value={editor.reps}
                                    onChange={event =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: { ...current[exercise.id], reps: event.target.value },
                                      }))
                                    }
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    placeholder="Reps"
                                  />
                                  <input
                                    value={editor.loadGuidance}
                                    onChange={event =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: { ...current[exercise.id], loadGuidance: event.target.value },
                                      }))
                                    }
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    placeholder="Load"
                                  />
                                  <input
                                    value={editor.tempo}
                                    onChange={event =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: { ...current[exercise.id], tempo: event.target.value },
                                      }))
                                    }
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    placeholder="Tempo"
                                  />
                                </div>

                                <textarea
                                  value={editor.reason}
                                  onChange={event =>
                                    setEditors(current => ({
                                      ...current,
                                      [exercise.id]: { ...current[exercise.id], reason: event.target.value },
                                    }))
                                  }
                                  className="mt-3 min-h-[76px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                  placeholder="Coach reason"
                                />

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveExercise(exercise.id)}
                                    disabled={submitting}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
                                  >
                                    <Save size={12} /> Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: {
                                          ...current[exercise.id],
                                          exerciseName: current[exercise.id].variation || current[exercise.id].exerciseName,
                                        },
                                      }))
                                    }
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/65 hover:text-white"
                                  >
                                    <RefreshCw size={12} /> Swap Exercise
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditors(current => ({
                                        ...current,
                                        [exercise.id]: {
                                          ...current[exercise.id],
                                          variation: current[exercise.id].variation || `Variation for ${exercise.exerciseName}`,
                                        },
                                      }))
                                    }
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/65 hover:text-white"
                                  >
                                    <Plus size={12} /> Add Variation
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleRemoveExercise(exercise.id)}
                                    disabled={submitting}
                                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:text-red-100 disabled:opacity-60"
                                  >
                                    <Trash2 size={12} /> Remove
                                  </button>
                                </div>

                                <div className="mt-3 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/8 px-3 py-2 text-xs text-[#D4AF37]">
                                  Adjusted preview: {editor.sets || exercise.sets} sets x {editor.reps || exercise.reps} | Load{' '}
                                  {normalizeLoad(editor.loadGuidance || exercise.loadGuidance, editor.exerciseName || exercise.exerciseName)} | Tempo{' '}
                                  {editor.tempo || exercise.tempo || '-'}
                                </div>

                                {exercise.removed ? (
                                  <div className="mt-2 text-xs text-red-300">Adjusted status: removed from active plan</div>
                                ) : null}
                                {exercise.variation ? (
                                  <div className="mt-2 text-xs text-blue-300">Variation: {exercise.variation}</div>
                                ) : null}
                                {!exercise.adjusted && hasDraftChanges ? (
                                  <div className="mt-2 text-xs text-white/45">Draft changes ready to save.</div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-6">
              <form onSubmit={handleSessionOverrideSubmit} className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Protocol-Level Adjustments</h2>
                </div>
                <p className="mt-2 text-sm text-white/45">
                  Layer volume or frequency adjustments on top of the movement protocol without changing the original plan.
                </p>
                <div className="mt-4 space-y-3">
                  <input
                    value={sessionOverride.sessionsPerWeek}
                    onChange={event => setSessionOverride(current => ({ ...current, sessionsPerWeek: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                    placeholder="Adjusted sessions per week"
                  />
                  <input
                    value={sessionOverride.volumeLevel}
                    onChange={event => setSessionOverride(current => ({ ...current, volumeLevel: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                    placeholder="Adjusted volume level"
                  />
                  <textarea
                    value={sessionOverride.reason}
                    onChange={event => setSessionOverride(current => ({ ...current, reason: event.target.value }))}
                    className="min-h-[84px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                    placeholder="Coach reason"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  <Save size={14} /> Save Protocol Adjustment
                </button>
              </form>

              <form onSubmit={handleExecutionLogSubmit} className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Execution Log</h2>
                </div>
                <p className="mt-2 text-sm text-white/45">
                  Track completed sessions, sets, reps, loads, and recovery notes so the next protocol can adapt to real execution.
                </p>
                <div className="mt-4 space-y-3">
                  <select
                    value={executionLogForm.exerciseId}
                    onChange={event => setExecutionLogForm(current => ({ ...current, exerciseId: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="">Select exercise</option>
                    {exercises.map(exercise => (
                      <option key={exercise.id} value={exercise.id}>
                        {BLOCK_LABELS[exercise.block]} | {exercise.exerciseName}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={executionLogForm.completedSessions}
                      onChange={event => setExecutionLogForm(current => ({ ...current, completedSessions: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      placeholder="Completed sessions"
                    />
                    <input
                      value={executionLogForm.completedSets}
                      onChange={event => setExecutionLogForm(current => ({ ...current, completedSets: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      placeholder="Completed sets"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={executionLogForm.completedReps}
                      onChange={event => setExecutionLogForm(current => ({ ...current, completedReps: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      placeholder="Completed reps"
                    />
                    <input
                      value={executionLogForm.load}
                      onChange={event => setExecutionLogForm(current => ({ ...current, load: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      placeholder="Load used"
                    />
                  </div>
                  <textarea
                    value={executionLogForm.notes}
                    onChange={event => setExecutionLogForm(current => ({ ...current, notes: event.target.value }))}
                    className="min-h-[96px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                    placeholder="Execution notes, fatigue, swaps, or adherence context"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  <Save size={14} /> Log Session
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <div className="flex items-center gap-2">
                <PencilLine size={14} className="text-[#D4AF37]" />
                <h2 className="text-sm font-semibold text-white">Current Movement Plan</h2>
              </div>
              <div className="mt-4 space-y-5">
                {(Object.keys(protocol.displayBlocks) as BlockKey[]).map(blockKey => {
                  const block = protocol.displayBlocks[blockKey].filter(exercise => !exercise.removed)
                  if (!block.length) return null

                  return (
                    <div key={blockKey} className="space-y-3">
                      <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-widest text-white/55">
                        {BLOCK_LABELS[blockKey]}
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-white/8">
                        <table className="w-full text-sm">
                          <thead className="bg-white/4 text-[11px] uppercase tracking-widest text-white/35">
                            <tr>
                              <th className="px-4 py-3 text-left">Exercise</th>
                              <th className="px-4 py-3 text-left">Protocol</th>
                              <th className="px-4 py-3 text-left">Adjusted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {block.map(exercise => (
                              <tr key={exercise.id} className="border-t border-white/6 align-top">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-white">{exercise.exerciseName}</div>
                                  {exercise.variation ? (
                                    <div className="mt-1 text-xs text-[#D4AF37]">Variation: {exercise.variation}</div>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3 text-white/40">
                                  <div>{exercise.original.sets} sets x {exercise.original.reps}</div>
                                  <div className="mt-1">
                                    Load {normalizeLoad(exercise.original.loadGuidance, exercise.original.exerciseName)}
                                  </div>
                                  <div className="mt-1">Tempo {exercise.original.tempo ?? '-'}</div>
                                </td>
                                <td className={`px-4 py-3 ${exercise.adjusted ? 'text-[#D4AF37]' : 'text-white/75'}`}>
                                  <div>{exercise.sets} sets x {exercise.reps}</div>
                                  <div className="mt-1">
                                    Load {normalizeLoad(exercise.loadGuidance, exercise.exerciseName)}
                                  </div>
                                  <div className="mt-1">Tempo {exercise.tempo ?? '-'}</div>
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

            <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-[#D4AF37]" />
                <h2 className="text-sm font-semibold text-white">Coach-First Editing</h2>
              </div>
              <p className="mt-3 text-sm text-white/50">
                Use Adjust Protocol to edit sets, reps, load, tempo, swaps, removals, and variations while preserving the original protocol underneath.
              </p>
              <div className="mt-4 rounded-xl bg-white/4 p-4 text-sm text-white/65">
                Every movement change feeds the override-intelligence system so the next generated protocol can adapt to real coaching behavior.
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
            <div className="flex items-center gap-2">
              <RotateCcw size={14} className="text-[#D4AF37]" />
              <h2 className="text-sm font-semibold text-white">Active Movement Overrides</h2>
            </div>
            <div className="mt-4 space-y-3">
              {protocol.activeOverrides.length === 0 ? (
                <p className="text-sm text-white/45">No movement overrides yet.</p>
              ) : (
                protocol.activeOverrides.map(override => (
                  <div key={override.id} className="rounded-xl border border-white/8 bg-white/4 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">{override.target}</div>
                      <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-mono uppercase text-[#D4AF37]">
                        Adjusted
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-white/75">{override.reason}</div>
                    <div className="mt-2 text-xs text-[#D4AF37]">{summarizeChange(override.change)}</div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/35">
                      <span>{formatTimestamp(override.timestamp)}</span>
                      <button
                        type="button"
                        onClick={() => void handleRevert(override.id)}
                        className="rounded-xl border border-white/10 px-3 py-1.5 text-white/65 hover:text-white"
                      >
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
                    <div className="mt-1 text-xs text-white/40">
                      {item.stage} stage | Effective {item.effective_date}
                    </div>
                    <div className="mt-2 text-xs text-white/45">
                      Sessions/week: {item.sessions_per_week ?? '-'} | Volume: {item.volume_target ?? '-'} | Overrides: {item.override_count}
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
                  <p className="text-sm text-white/45">No movement execution logs yet.</p>
                ) : (
                  protocol.executionLog.map(entry => (
                    <div key={entry.id} className="rounded-xl border border-white/8 bg-white/4 p-4 text-sm text-white/65">
                      <div className="font-medium text-white/80">{entry.exercise_name}</div>
                      <div className="mt-1 text-xs text-white/40">{formatTimestamp(entry.timestamp)}</div>
                      <div className="mt-2 text-xs text-white/50">
                        Sessions: {entry.completed_sessions ?? '-'} | Sets: {entry.completed_sets ?? '-'} | Reps: {entry.completed_reps ?? '-'} | Load: {entry.load ?? 'Bodyweight'}
                      </div>
                      {entry.notes ? <div className="mt-2 text-xs text-white/55">{entry.notes}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
              <div className="flex items-center gap-2">
                <History size={14} className="text-[#D4AF37]" />
                <h2 className="text-sm font-semibold text-white">Change Log</h2>
              </div>
              <div className="mt-4 space-y-3">
                {data.changeLog.length === 0 ? (
                  <p className="text-sm text-white/45">No logged protocol changes yet.</p>
                ) : (
                  data.changeLog.map(item => (
                    <div key={item.id} className="rounded-xl border border-white/8 bg-white/4 p-4 text-sm text-white/65">
                      <div className="font-medium text-white/80">{item.action}</div>
                      <div className="mt-1 text-xs text-white/40">{formatTimestamp(item.created_at)}</div>
                      {item.change_summary ? <div className="mt-2 text-xs text-white/55">{item.change_summary}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
