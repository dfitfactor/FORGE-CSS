import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { BIEDisplay } from '@/components/modules/clients/BIEDisplay'
import { MacroCard } from '@/components/modules/nutrition/MacroCard'
import { NutritionAdherenceChart } from '@/components/modules/nutrition/NutritionAdherenceChart'
import { Apple, Plus } from 'lucide-react'

type Props = {
  searchParams: Promise<{ clientId?: string }>
}

async function getCoachClients(coachId: string) {
  return db.query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM clients WHERE coach_id = $1 AND status = 'active' ORDER BY full_name`,
    [coachId]
  )
}

export default async function NutritionPage({ searchParams }: Props) {
  const session = await getSession()
  if (!session) return null

  const params = await searchParams
  const clientId = params.clientId

  if (!clientId) {
    const clients = await getCoachClients(session.id)
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-forge-text-primary flex items-center gap-2 mb-1">
          <Apple className="w-6 h-6 text-forge-gold" />
          Nutrition
        </h1>
        <p className="text-forge-text-muted mb-6">
          Select a client to view nutrition overview, active protocol, and adherence.
        </p>
        {clients.length === 0 ? (
          <div className="forge-card text-center py-12 text-forge-text-muted">
            No active clients. Add a client to manage nutrition protocols.
          </div>
        ) : (
          <ul className="space-y-2">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/nutrition?clientId=${c.id}`}
                  className="forge-card-hover block p-4 rounded-xl"
                >
                  <span className="font-medium text-forge-text-primary">{c.full_name}</span>
                  <span className="text-forge-text-muted text-sm ml-2">View nutrition →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const client = await db.queryOne<{
    id: string
    full_name: string
    coach_id: string
  }>(`SELECT id, full_name, coach_id FROM clients WHERE id = $1`, [clientId])

  if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-forge-text-primary">Nutrition</h1>
        <p className="text-forge-text-muted mt-2">Client not found or access denied.</p>
      </div>
    )
  }

  const [activeProtocol, bieSnapshot, weeklyAdherence] = await Promise.all([
    db.queryOne<{
      id: string
      name: string
      version: number
      calorie_target: number
      protein_target_g: number
      carb_target_g: number
      fat_target_g: number
      meal_frequency: number | null
      protocol_payload: Record<string, unknown>
    }>(
      `SELECT id, name, version, calorie_target, protein_target_g, carb_target_g, fat_target_g, meal_frequency, protocol_payload
       FROM protocols
       WHERE client_id = $1 AND protocol_type = 'nutrition' AND is_active = true
       ORDER BY version DESC LIMIT 1`,
      [clientId]
    ),
    db.queryOne<{
      bar: number
      bli: number
      dbi: number
      cdi: number
      lsi: number
      c_lsi: number
      pps: number
      generation_state: string | null
    }>(
      `SELECT bar, bli, dbi, cdi, lsi, c_lsi, pps, generation_state
       FROM behavioral_snapshots
       WHERE client_id = $1
       ORDER BY snapshot_date DESC LIMIT 1`,
      [clientId]
    ),
    db.query<{
      week_start: string
      planned_nutrition_days: number
      logged_nutrition_days: number
    }>(
      `SELECT week_start, planned_nutrition_days, logged_nutrition_days
       FROM bar_weekly_summaries
       WHERE client_id = $1 AND week_start >= CURRENT_DATE - (6 * INTERVAL '1 week')
       ORDER BY week_start DESC`,
      [clientId]
    ),
  ])

  const bieVars = bieSnapshot
    ? {
        bar: Number(bieSnapshot.bar) || 0,
        bli: Number(bieSnapshot.bli) || 0,
        dbi: Number(bieSnapshot.dbi) || 0,
        cdi: Number(bieSnapshot.cdi) || 0,
        lsi: Number(bieSnapshot.lsi) || 0,
        cLsi: Number(bieSnapshot.c_lsi) || 0,
        pps: Number(bieSnapshot.pps) || 0,
      }
    : null

  const weeks = weeklyAdherence.map((r) => ({
    weekLabel: new Date(r.week_start).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    }),
    planned: Number(r.planned_nutrition_days) || 0,
    logged: Number(r.logged_nutrition_days) || 0,
  }))

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary flex items-center gap-2">
            <Apple className="w-6 h-6 text-forge-gold" />
            Nutrition
          </h1>
          <p className="text-forge-text-muted mt-1">{client.full_name}</p>
        </div>
        <Link
          href={`/nutrition/new?clientId=${clientId}`}
          className="forge-btn-gold inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New protocol
        </Link>
      </div>

      {!activeProtocol ? (
        <div className="forge-card border-dashed text-center py-12">
          <p className="text-forge-text-muted mb-4">No active nutrition protocol.</p>
          <Link
            href={`/nutrition/new?clientId=${clientId}`}
            className="forge-btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Generate protocol
          </Link>
        </div>
      ) : (
        <>
          <section>
            <h2 className="forge-section-title mb-3">Active protocol</h2>
            <p className="text-forge-text-secondary text-sm mb-4">
              {activeProtocol.name} · v{activeProtocol.version}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MacroCard
                kind="calories"
                value={Number(activeProtocol.calorie_target) || 0}
              />
              <MacroCard
                kind="protein"
                value={Number(activeProtocol.protein_target_g) || 0}
              />
              <MacroCard
                kind="carbs"
                value={Number(activeProtocol.carb_target_g) || 0}
              />
              <MacroCard
                kind="fat"
                value={Number(activeProtocol.fat_target_g) || 0}
              />
            </div>
          </section>

          {bieVars && (
            <section>
              <h2 className="forge-section-title mb-3">BIE guidance</h2>
              <div className="forge-card">
                <BIEDisplay
                  variables={bieVars}
                  generationState={
                    (bieSnapshot?.generation_state as 'A' | 'B' | 'C' | 'D' | 'E') ?? undefined
                  }
                  compact
                />
              </div>
            </section>
          )}

          <section>
            <NutritionAdherenceChart
              weeks={weeks}
              title="Weekly nutrition compliance"
            />
          </section>
        </>
      )}
    </div>
  )
}
