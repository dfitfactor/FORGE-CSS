import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import { ArrowLeft, Utensils, Droplets, Zap } from 'lucide-react'

type MealSlot = {
  foods: string; protein: string; carbs: string
  fats: string; timing: string; notes: string
}

type BSLDSDay = {
  breakfast: MealSlot; morningSnack: MealSlot
  lunch: MealSlot; dinner: MealSlot; eveningSnack: MealSlot
}

type HydrationEntry = {
  timing: string; amount: string; notes: string
}

type NutritionStructure = {
  dailyCalories: number; proteinG: number; carbG: number; fatG: number
  mealFrequency: number; mealTiming: string; complexityLevel: string
  hydrationTargetOz: number
  hydrationSchedule: HydrationEntry[]
  bsldsTemplate: { trainingDay: BSLDSDay; restDay: BSLDSDay }
  keyGuidelines: string[]
  disruption_protocol: string
}

type Protocol = {
  id: string; name: string; protocol_type: string; stage: string
  generation_state: string | null; calorie_target: number | null
  protein_target_g: number | null; carb_target_g: number | null
  fat_target_g: number | null; effective_date: string; generated_by: string
  notes: string | null
  protocol_payload: {
    nutritionStructure?: NutritionStructure
    rationale?: string
    clientFacingMessage?: string
  }
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'B — Breakfast',
  morningSnack: 'S — Morning Snack',
  lunch: 'L — Lunch',
  dinner: 'D — Dinner',
  eveningSnack: 'S — Evening Snack',
}

const MEAL_COLORS: Record<string, string> = {
  breakfast: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  morningSnack: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  lunch: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  dinner: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  eveningSnack: 'text-white/50 bg-white/4 border-white/10',
}

function MealTable({ day, label }: { day: BSLDSDay; label: string }) {
  const slots = ['breakfast', 'morningSnack', 'lunch', 'dinner', 'eveningSnack'] as const
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono uppercase tracking-widest text-white/50 bg-white/6 border border-white/10 px-3 py-1 rounded-full">{label}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/3">
              <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35 w-[22%]">Meal</th>
              <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35 w-[30%]">Foods</th>
              <th className="text-center px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35">Protein</th>
              <th className="text-center px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35">Carbs</th>
              <th className="text-center px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35">Fats</th>
              <th className="text-center px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35 hidden md:table-cell">Timing</th>
              <th className="text-left px-3 py-2.5 text-xs font-mono uppercase tracking-widest text-white/35 hidden lg:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody>
            {slots.map(slot => {
              const meal = day[slot]
              if (!meal) return null
              return (
                <tr key={slot} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-1 rounded-full border font-mono uppercase tracking-wide ${MEAL_COLORS[slot]}`}>
                      {MEAL_LABELS[slot]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/70">{meal.foods}</td>
                  <td className="px-3 py-3 text-center font-mono text-emerald-400 text-xs font-bold">{meal.protein}</td>
                  <td className="px-3 py-3 text-center font-mono text-amber-400 text-xs font-bold">{meal.carbs}</td>
                  <td className="px-3 py-3 text-center font-mono text-blue-400 text-xs font-bold">{meal.fats}</td>
                  <td className="px-3 py-3 text-center text-xs text-white/40 hidden md:table-cell font-mono">{meal.timing}</td>
                  <td className="px-3 py-3 text-xs text-white/35 hidden lg:table-cell">{meal.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function NutritionPage({ params }: { params: { clientId: string } }) {
  const session = await getSession()
  if (!session) return null

  const [client, protocol] = await Promise.all([
    db.queryOne<{ id: string; full_name: string; coach_id: string; current_stage: string }>(
      `SELECT id, full_name, coach_id, current_stage FROM clients WHERE id = $1`,
      [params.clientId]
    ),
    db.queryOne<Protocol>(
      `SELECT id, name, protocol_type, stage, generation_state,
              calorie_target, protein_target_g, carb_target_g, fat_target_g,
              effective_date::text, generated_by, notes, protocol_payload
       FROM protocols
       WHERE client_id = $1
       AND protocol_type IN ('nutrition', 'composite')
       AND is_active = true
       ORDER BY CASE protocol_type WHEN 'nutrition' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
      [params.clientId]
    ),
  ])

  if (!client || client.coach_id !== session.id) return notFound()

  const ns = protocol?.protocol_payload?.nutritionStructure

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={'/clients/' + params.clientId}
              className="w-9 h-9 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Nutrition</h1>
              <p className="text-sm text-white/40">{client.full_name}</p>
            </div>
          </div>
          <Link href={'/clients/' + params.clientId + '/protocols'}
            className="px-3 py-2 bg-white/6 border border-white/10 rounded-xl text-xs text-white/50 hover:text-white transition-colors flex items-center gap-1.5">
            <Utensils size={12} /> Manage Protocols
          </Link>
        </div>

        {!protocol ? (
          <div className="bg-[#111111] border border-dashed border-white/8 rounded-2xl p-12 text-center">
            <Utensils size={32} className="mx-auto mb-4 text-white/15" />
            <p className="text-sm text-white/40">No active nutrition protocol</p>
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
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-base font-semibold text-white">{protocol.name}</h2>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-mono uppercase">Active</span>
                {protocol.generated_by === 'ai' && <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full font-mono uppercase">AI Generated</span>}
              </div>
              <p className="text-xs text-white/35 capitalize mb-4">{protocol.stage} stage · State {protocol.generation_state ?? '—'} · Effective {protocol.effective_date}</p>

              {/* Macro targets */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Calories', value: ns?.dailyCalories ?? protocol.calorie_target ?? '—', color: 'text-white', unit: 'kcal' },
                  { label: 'Protein', value: ns?.proteinG ?? protocol.protein_target_g ?? '—', color: 'text-emerald-400', unit: 'g' },
                  { label: 'Carbs', value: ns?.carbG ?? protocol.carb_target_g ?? '—', color: 'text-amber-400', unit: 'g' },
                  { label: 'Fats', value: ns?.fatG ?? protocol.fat_target_g ?? '—', color: 'text-blue-400', unit: 'g' },
                ].map(m => (
                  <div key={m.label} className="bg-white/3 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">{m.label}</p>
                    <p className={`text-xl font-bold ${m.color}`}>{m.value}<span className="text-xs font-normal text-white/30 ml-0.5">{m.unit}</span></p>
                  </div>
                ))}
              </div>
            </div>

            {/* Meal timing + hydration row */}
            {ns && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Meal timing */}
                <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
                  <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Meal Timing</p>
                  <p className="text-sm text-white/65 leading-relaxed">{ns.mealTiming}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-white/40">
                    <span>{ns.mealFrequency} meals/day</span>
                    <span>·</span>
                    <span>{ns.complexityLevel}</span>
                  </div>
                </div>

                {/* Hydration */}
                <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Droplets size={14} className="text-blue-400" />
                    <p className="text-xs font-mono uppercase tracking-widest text-white/30">Hydration Target</p>
                    <span className="text-sm font-bold text-blue-400 ml-auto">{ns.hydrationTargetOz ?? 90} oz/day</span>
                  </div>
                  {ns.hydrationSchedule?.length > 0 ? (
                    <div className="space-y-2">
                      {ns.hydrationSchedule.map((h, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-white/40">{h.timing}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-400">{h.amount}</span>
                            {h.notes && <span className="text-white/25">{h.notes}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-white/40">Morning (waking)</span><span className="font-mono text-blue-400">16-20 oz</span></div>
                      <div className="flex justify-between"><span className="text-white/40">Between meals</span><span className="font-mono text-blue-400">24-32 oz</span></div>
                      <div className="flex justify-between"><span className="text-white/40">Early evening</span><span className="font-mono text-blue-400">12-16 oz</span></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BSLDS Meal Plan Tables */}
            {ns?.bsldsTemplate ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">BSLDS Meal Structure</h2>
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="text-xs text-white/25 font-mono">Breakfast · Snack · Lunch · Dinner · Snack</span>
                </div>
                <MealTable day={ns.bsldsTemplate.trainingDay} label="Training Day" />
                <MealTable day={ns.bsldsTemplate.restDay} label="Rest Day" />
              </div>
            ) : (
              <div className="bg-[#111111] border border-white/8 rounded-2xl p-6 text-center">
                <p className="text-sm text-white/40">No meal plan structure available</p>
                <p className="text-xs text-white/25 mt-1">Regenerate a composite protocol to include BSLDS meal tables</p>
              </div>
            )}

            {/* Key guidelines */}
            {ns?.keyGuidelines?.length > 0 && (
              <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-4">Key Guidelines</p>
                <div className="space-y-3">
                  {ns.keyGuidelines.map((g, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-[#D4AF37] flex-shrink-0 mt-0.5 text-xs font-bold font-mono">{String(i + 1).padStart(2, '0')}</span>
                      <p className="text-sm text-white/65 leading-relaxed">{g}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disruption protocol */}
            {ns?.disruption_protocol && (
              <div className="bg-amber-500/6 border border-amber-500/20 rounded-2xl p-5">
                <p className="text-xs font-mono uppercase tracking-widest text-amber-400/70 mb-2">When Life Disrupts the Plan</p>
                <p className="text-sm text-white/60 leading-relaxed">{ns.disruption_protocol}</p>
              </div>
            )}

            {/* Client message */}
            {protocol.protocol_payload?.clientFacingMessage && (
              <div className="bg-[#111111] border border-white/8 rounded-2xl p-5">
                <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Client Message</p>
                <p className="text-sm text-white/60 leading-relaxed">{protocol.protocol_payload.clientFacingMessage}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}