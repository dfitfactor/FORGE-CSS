'use client'

import { type FormEvent, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, History, Loader2, RotateCcw, SlidersHorizontal, Utensils, Zap } from 'lucide-react'
import type { NutritionWorkspaceData } from '@/lib/protocol-workspaces'

type Props = {
  clientId: string
  clientName: string
  initialData: NutritionWorkspaceData
}

type OverrideFormState = {
  target: string
  dailyCalories: string
  proteinG: string
  carbG: string
  fatG: string
  mealFrequency: string
  mealTiming: string
  complexityLevel: string
  mealTime: string
  mealName: string
  foods: string
  notes: string
  reason: string
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function macroValue(value: number | undefined) {
  return typeof value === 'number' ? value : '-'
}

function displayValue(display: string | undefined, value: number | undefined, unit: string) {
  if (display && display.trim().length > 0) return display
  return `${macroValue(value)} ${unit}`
}

export default function NutritionProtocolWorkspace({ clientId, clientName, initialData }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState(initialData)
  const [submitting, setSubmitting] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [overrideForm, setOverrideForm] = useState<OverrideFormState>({
    target: 'macro',
    dailyCalories: '',
    proteinG: '',
    carbG: '',
    fatG: '',
    mealFrequency: '',
    mealTiming: '',
    complexityLevel: '',
    mealTime: '',
    mealName: '',
    foods: '',
    notes: '',
    reason: '',
  })

  const protocol = data.protocol
  const mealPlan = protocol?.nutritionStructure?.mealPlan ?? []
  const adjustedMealPlan = protocol?.adjustedNutritionStructure?.mealPlan ?? []

  async function refreshWorkspace() {
    try {
      const response = await fetch(`/api/clients/${clientId}/nutrition`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to refresh nutrition workspace')
      setData(payload)
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh nutrition workspace')
    }
  }

  async function submitAction(body: Record<string, unknown>, message: string) {
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/nutrition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save nutrition update')
      setData(payload.workspace as NutritionWorkspaceData)
      setSuccess(message)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save nutrition update')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOverrideSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!protocol) return

    const change: Record<string, unknown> = {}

    if (overrideForm.target === 'macro') {
      if (overrideForm.dailyCalories) change.dailyCalories = Number(overrideForm.dailyCalories)
      if (overrideForm.proteinG) change.proteinG = Number(overrideForm.proteinG)
      if (overrideForm.carbG) change.carbG = Number(overrideForm.carbG)
      if (overrideForm.fatG) change.fatG = Number(overrideForm.fatG)
      if (overrideForm.mealFrequency) change.mealFrequency = Number(overrideForm.mealFrequency)
      if (overrideForm.mealTiming.trim()) change.mealTiming = overrideForm.mealTiming.trim()
      if (overrideForm.complexityLevel.trim()) change.complexityLevel = overrideForm.complexityLevel.trim()
    } else {
      if (overrideForm.mealTime.trim()) change.time = overrideForm.mealTime.trim()
      if (overrideForm.mealName.trim()) change.meal = overrideForm.mealName.trim()
      if (overrideForm.foods.trim()) change.foods = overrideForm.foods.trim()
      if (overrideForm.notes.trim()) change.notes = overrideForm.notes.trim()
    }

    if (!Object.keys(change).length) {
      setError('Add a nutrition change before saving the override.')
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
      'Nutrition override applied'
    )

    setOverrideForm(current => ({
      ...current,
      dailyCalories: '',
      proteinG: '',
      carbG: '',
      fatG: '',
      mealFrequency: '',
      mealTiming: '',
      complexityLevel: '',
      mealTime: '',
      mealName: '',
      foods: '',
      notes: '',
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

  async function handleDownloadPdf() {
    if (!printRef.current || !protocol) return

    setDownloadingPdf(true)
    setError(null)

    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      const imageData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imageHeight = (canvas.height * pdfWidth) / canvas.width

      let heightLeft = imageHeight
      let position = 0

      pdf.addImage(imageData, 'PNG', 0, position, pdfWidth, imageHeight)
      heightLeft -= pdfHeight

      while (heightLeft > 0) {
        position = heightLeft - imageHeight
        pdf.addPage()
        pdf.addImage(imageData, 'PNG', 0, position, pdfWidth, imageHeight)
        heightLeft -= pdfHeight
      }

      pdf.save(`${clientName.replace(/\s+/g, '_')}_nutrition_protocol.pdf`)
    } catch {
      setError('Unable to download nutrition PDF right now.')
    } finally {
      setDownloadingPdf(false)
    }
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
              <h1 className="text-lg font-bold text-white">Nutrition</h1>
              <p className="text-sm text-white/40">{clientName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refreshWorkspace()} className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white">
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white disabled:opacity-60"
            >
              {downloadingPdf ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download PDF
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
            No active nutrition or composite protocol is available yet.
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
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {[
                    {
                      label: 'Calories',
                      original: displayValue((protocol.nutritionStructure as any)?.dailyCaloriesDisplay, protocol.nutritionStructure?.dailyCalories, 'kcal'),
                      adjusted: displayValue((protocol.adjustedNutritionStructure as any)?.dailyCaloriesDisplay, protocol.adjustedNutritionStructure?.dailyCalories, 'kcal'),
                    },
                    {
                      label: 'Protein',
                      original: displayValue((protocol.nutritionStructure as any)?.proteinDisplay, protocol.nutritionStructure?.proteinG, 'g'),
                      adjusted: displayValue((protocol.adjustedNutritionStructure as any)?.proteinDisplay, protocol.adjustedNutritionStructure?.proteinG, 'g'),
                    },
                    {
                      label: 'Carbs',
                      original: displayValue((protocol.nutritionStructure as any)?.carbDisplay, protocol.nutritionStructure?.carbG, 'g'),
                      adjusted: displayValue((protocol.adjustedNutritionStructure as any)?.carbDisplay, protocol.adjustedNutritionStructure?.carbG, 'g'),
                    },
                    {
                      label: 'Fats',
                      original: displayValue((protocol.nutritionStructure as any)?.fatDisplay, protocol.nutritionStructure?.fatG, 'g'),
                      adjusted: displayValue((protocol.adjustedNutritionStructure as any)?.fatDisplay, protocol.adjustedNutritionStructure?.fatG, 'g'),
                    },
                  ].map(item => (
                    <div key={item.label} className="rounded-xl bg-white/4 p-3">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">{item.label}</div>
                      <div className="mt-1 text-lg font-semibold text-white">{item.original}</div>
                      <div className="mt-1 text-xs text-[#D4AF37]">Adjusted: {item.adjusted}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Coach Override System</h2>
                </div>
                <p className="mt-3 text-sm text-white/50">
                  Nutrition adjustments stay layered on top of the protocol, with timestamped deltas that can feed future AI protocol updates and adherence-based refinements.
                </p>
                <div className="mt-4 rounded-xl bg-white/4 p-3 text-sm text-white/60">
                  Active overrides: <span className="font-semibold text-white">{protocol.activeOverrides.length}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <Utensils size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Current Plan View</h2>
                </div>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-white/8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8 bg-white/3">
                        <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-white/35">Meal</th>
                        <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-white/35">Protocol</th>
                        <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-widest text-white/35">Adjusted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mealPlan.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-white/45" colSpan={3}>No meal plan is available inside this protocol payload.</td>
                        </tr>
                      ) : (
                        mealPlan.map((meal, index) => {
                          const adjustedMeal = adjustedMealPlan[index] ?? meal
                          return (
                            <tr key={`${meal.time}-${index}`} className="border-b border-white/5 last:border-0 align-top">
                              <td className="px-4 py-3">
                                <div className="font-medium text-white/80">{meal.meal}</div>
                                <div className="mt-1 text-xs text-white/40">{meal.time}</div>
                              </td>
                              <td className="px-4 py-3 text-white/60">
                                <div>{meal.foods}</div>
                                {meal.notes ? <div className="mt-1 text-xs text-white/35">{meal.notes}</div> : null}
                              </td>
                              <td className="px-4 py-3">
                                <div className={adjustedMeal.foods !== meal.foods || adjustedMeal.meal !== meal.meal ? 'text-[#D4AF37]' : 'text-white/60'}>
                                  {adjustedMeal.foods}
                                </div>
                                {adjustedMeal.notes ? <div className="mt-1 text-xs text-white/35">{adjustedMeal.notes}</div> : null}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <form onSubmit={handleOverrideSubmit} className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Coach Overrides</h2>
                </div>
                <div className="mt-4 space-y-3">
                  <select value={overrideForm.target} onChange={event => setOverrideForm(current => ({ ...current, target: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none">
                    <option value="macro">Macro plan</option>
                    {mealPlan.map((meal, index) => (
                      <option key={`${meal.time}-${index}`} value={`mealPlan:${index}`}>
                        {meal.time} · {meal.meal}
                      </option>
                    ))}
                  </select>
                  {overrideForm.target === 'macro' ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input value={overrideForm.dailyCalories} onChange={event => setOverrideForm(current => ({ ...current, dailyCalories: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted calories" />
                        <input value={overrideForm.proteinG} onChange={event => setOverrideForm(current => ({ ...current, proteinG: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted protein" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input value={overrideForm.carbG} onChange={event => setOverrideForm(current => ({ ...current, carbG: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted carbs" />
                        <input value={overrideForm.fatG} onChange={event => setOverrideForm(current => ({ ...current, fatG: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted fats" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input value={overrideForm.mealFrequency} onChange={event => setOverrideForm(current => ({ ...current, mealFrequency: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Meal frequency" />
                        <input value={overrideForm.complexityLevel} onChange={event => setOverrideForm(current => ({ ...current, complexityLevel: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Complexity level" />
                      </div>
                      <input value={overrideForm.mealTiming} onChange={event => setOverrideForm(current => ({ ...current, mealTiming: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Meal timing guidance" />
                    </>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input value={overrideForm.mealTime} onChange={event => setOverrideForm(current => ({ ...current, mealTime: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted meal time" />
                        <input value={overrideForm.mealName} onChange={event => setOverrideForm(current => ({ ...current, mealName: event.target.value }))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Adjusted meal name" />
                      </div>
                      <textarea value={overrideForm.foods} onChange={event => setOverrideForm(current => ({ ...current, foods: event.target.value }))} className="min-h-[96px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Food substitutions or digestion-friendly changes" />
                      <textarea value={overrideForm.notes} onChange={event => setOverrideForm(current => ({ ...current, notes: event.target.value }))} className="min-h-[72px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Meal notes" />
                    </>
                  )}
                  <textarea value={overrideForm.reason} onChange={event => setOverrideForm(current => ({ ...current, reason: event.target.value }))} className="min-h-[96px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Reason for this adjustment" required />
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
                  <h2 className="text-sm font-semibold text-white">Active Nutrition Overrides</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {protocol.activeOverrides.length === 0 ? (
                    <p className="text-sm text-white/45">No nutrition overrides yet.</p>
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

              <div className="rounded-2xl border border-white/8 bg-[#111111] p-5">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-[#D4AF37]" />
                  <h2 className="text-sm font-semibold text-white">Nutrition History</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {data.history.map(item => (
                    <div key={item.id} className="rounded-xl border border-white/8 bg-white/4 p-4 text-sm text-white/65">
                      <div className="font-medium text-white/80">{item.name}</div>
                      <div className="mt-1 text-xs text-white/40">{item.stage} stage · Effective {item.effective_date}</div>
                      <div className="mt-2 text-xs text-white/45">
                        Calories: {item.calorie_target ?? '—'} · Protein: {item.protein_target_g ?? '—'} · Overrides: {item.override_count}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {protocol ? (
        <div className="pointer-events-none fixed -left-[10000px] top-0 w-[900px] bg-white text-[#2f2f2f]" ref={printRef}>
          <div className="px-10 py-8">
            <div className="border-b border-[#8f8f8f] pb-4">
              <div className="text-[24px] font-semibold uppercase tracking-[0.18em] text-[#3d3d3d]">Nutrition Protocol</div>
              <div className="mt-2 text-[12px] uppercase tracking-[0.12em] text-[#767676]">
                {clientName} | {protocol.name} | {protocol.effectiveDate}
              </div>
            </div>

            <div className="mt-8 border-t border-[#8f8f8f] pt-2">
              <div className="text-[15px] font-bold uppercase tracking-[0.04em] text-[#3d3d3d]">Nutrition Targets</div>
              <table className="mt-3 w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#efefef]">
                    <th className="border border-[#d0d0d0] px-3 py-2 text-left">Plan</th>
                    <th className="border border-[#d0d0d0] px-3 py-2 text-left">Calories</th>
                    <th className="border border-[#d0d0d0] px-3 py-2 text-left">Protein</th>
                    <th className="border border-[#d0d0d0] px-3 py-2 text-left">Carbs</th>
                    <th className="border border-[#d0d0d0] px-3 py-2 text-left">Fat</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-[#d0d0d0] px-3 py-2 font-medium">Protocol</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.nutritionStructure as any)?.dailyCaloriesDisplay, protocol.nutritionStructure?.dailyCalories, 'kcal')}</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.nutritionStructure as any)?.proteinDisplay, protocol.nutritionStructure?.proteinG, 'g')}</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.nutritionStructure as any)?.carbDisplay, protocol.nutritionStructure?.carbG, 'g')}</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.nutritionStructure as any)?.fatDisplay, protocol.nutritionStructure?.fatG, 'g')}</td>
                  </tr>
                  <tr>
                    <td className="border border-[#d0d0d0] px-3 py-2 font-medium">Adjusted</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.adjustedNutritionStructure as any)?.dailyCaloriesDisplay, protocol.adjustedNutritionStructure?.dailyCalories, 'kcal')}</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.adjustedNutritionStructure as any)?.proteinDisplay, protocol.adjustedNutritionStructure?.proteinG, 'g')}</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.adjustedNutritionStructure as any)?.carbDisplay, protocol.adjustedNutritionStructure?.carbG, 'g')}</td>
                    <td className="border border-[#d0d0d0] px-3 py-2">{displayValue((protocol.adjustedNutritionStructure as any)?.fatDisplay, protocol.adjustedNutritionStructure?.fatG, 'g')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-8 border-t border-[#8f8f8f] pt-2">
              <div className="text-[15px] font-bold uppercase tracking-[0.04em] text-[#3d3d3d]">Sample Training Day Meal Plan (Structure)</div>
              <table className="mt-3 w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#efefef]">
                    <th className="border border-[#d0d0d0] px-3 py-2 text-left">Meal</th>
                    <th className="border border-[#d0d0d0] px-3 py-2 text-left">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {(protocol.adjustedNutritionStructure?.mealPlan ?? protocol.nutritionStructure?.mealPlan ?? []).map((meal, index) => (
                    <tr key={`${meal.time}-${index}`}>
                      <td className="border border-[#d0d0d0] px-3 py-2 font-medium">{meal.meal || meal.time || `Meal ${index + 1}`}</td>
                      <td className="border border-[#d0d0d0] px-3 py-2">{meal.foods || meal.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 border-t border-[#8f8f8f] pt-2">
              <div className="text-[15px] font-bold uppercase tracking-[0.04em] text-[#3d3d3d]">Macronutrient Execution & Timing</div>
              <div className="mt-4">
                <div className="text-[14px] font-semibold text-[#3d3d3d]">Protein (Foundation)</div>
                <ul className="mt-2 list-disc pl-5 text-[12px] leading-6 text-[#505050]">
                  <li>{macroValue(protocol.adjustedNutritionStructure?.proteinG ?? protocol.nutritionStructure?.proteinG)} g daily</li>
                  <li>Protein stays anchored across the full week.</li>
                  <li>Distribute protein across meals for recovery and appetite control.</li>
                  <li>Use the adjusted plan when coach overrides are active.</li>
                </ul>
              </div>
              <div className="mt-5">
                <div className="text-[14px] font-semibold text-[#3d3d3d]">Carbohydrates (Performance & Shape)</div>
                <ul className="mt-2 list-disc pl-5 text-[12px] leading-6 text-[#505050]">
                  <li>Center carbs around training and higher-demand parts of the day.</li>
                  <li>Reduce complexity before reducing consistency.</li>
                  <li>Coach substitutions and digestion changes remain layered over the protocol.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
