import { db } from '@/lib/db'

export type BIEScoresResult = {
  bar: number | null
  bli: number
  dbi: number
  cdi: number
  lsi: number
  pps: number
  generation_state: string
  data_quality: 'full' | 'partial' | 'insufficient'
}

type AdherenceRow = {
  completed: boolean
  record_type: string
  record_date: string
  session_type: string | null
  completion_pct: number | null
}

type CheckinRow = {
  workout_consistency: number | null
  nutrition_adherence: number | null
  sleep_quality: number | null
  stress_rating: number | null
  energy_level: number | null
  checkin_date: string
  workout_types: string | null
  nutrition_challenges: string | null
  digestion_rating: number | null
  mindset_rating: number | null
  recovery_quality: number | null
}

type JournalRow = {
  sleep_quality: number | null
  energy_level: number | null
  stress_level: number | null
  mood: number | null
  travel_flag: boolean | null
  illness_flag: boolean | null
  work_stress_flag: boolean | null
  family_stress_flag: boolean | null
  entry_date: string
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function roundScore(n: number) {
  return Math.round(clamp(n, 0, 100))
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function parseDate(d: string): Date {
  return new Date(`${d}T12:00:00`)
}

function computeCheckinRegularityScore(checkinDates: string[]): number {
  if (checkinDates.length < 2) {
    return checkinDates.length === 1 ? 45 : 50
  }
  const sorted = [...checkinDates].map(parseDate).sort((a, b) => a.getTime() - b.getTime())
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000)
  }
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const deviationFromWeekly = Math.abs(avgGap - 7)
  return clamp(100 - deviationFromWeekly * 6, 0, 100)
}

function computeGenerationState(bar: number, dbi: number): string {
  if (bar >= 80 && dbi < 30) return 'A'
  if (bar >= 65 && dbi < 50) return 'B'
  if (bar >= 50 && dbi < 70) return 'C'
  if (dbi >= 70 || bar < 35) return 'D'
  return 'E'
}

export async function calculateBIEScores(clientId: string): Promise<BIEScoresResult> {
  const [adherenceRows, checkinRows, journalRows, clientRow] = await Promise.all([
    db.query<AdherenceRow>(
      `SELECT
         (record_type = 'session_completed'
           OR COALESCE(completion_pct, 0) >= 80) AS completed,
         record_type,
         record_date::text AS record_date,
         session_type,
         completion_pct
       FROM adherence_records
       WHERE client_id = $1
         AND record_date >= CURRENT_DATE - INTERVAL '28 days'
       ORDER BY record_date DESC`,
      [clientId]
    ),
    db.query<CheckinRow>(
      `SELECT workout_consistency, nutrition_adherence,
              sleep_quality, stress_rating, energy_level,
              checkin_date::text AS checkin_date, workout_types, nutrition_challenges,
              digestion_rating, mindset_rating, recovery_quality
       FROM client_checkins
       WHERE client_id = $1
       ORDER BY checkin_date DESC
       LIMIT 4`,
      [clientId]
    ),
    db.query<JournalRow>(
      `SELECT sleep_quality, energy_level, stress_level,
              mood, travel_flag, illness_flag, work_stress_flag,
              family_stress_flag, entry_date::text AS entry_date
       FROM journal_entries
       WHERE client_id = $1
         AND entry_date >= CURRENT_DATE - INTERVAL '14 days'
       ORDER BY entry_date DESC`,
      [clientId]
    ),
    db.queryOne<{ sessions_per_week: number | null; current_stage: string | null }>(
      `SELECT sessions_per_week, current_stage FROM clients WHERE id = $1`,
      [clientId]
    ),
  ])

  const checkinCount = checkinRows.length
  const journalCount = journalRows.length

  let data_quality: BIEScoresResult['data_quality']
  if (checkinCount >= 1 && journalCount >= 1) data_quality = 'full'
  else if (checkinCount < 1 && journalCount < 3) data_quality = 'insufficient'
  else data_quality = 'partial'

  // --- BAR ---
  const adherenceTotal = adherenceRows.length
  const adherenceCompleted = adherenceRows.filter((r) => r.completed).length
  let sessionRate =
    adherenceTotal > 0 ? (adherenceCompleted / adherenceTotal) * 100 : null

  const wcVals = checkinRows
    .map((c) => c.workout_consistency)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)))
    .map((v) => clamp(Number(v) * 10, 0, 100))
  const wcAvg = wcVals.length > 0 ? avg(wcVals)! : null

  let bar: number | null = null
  if (adherenceTotal > 0 && wcAvg != null) {
    bar = roundScore(sessionRate! * 0.7 + wcAvg * 0.3)
  } else if (adherenceTotal > 0) {
    bar = roundScore(sessionRate!)
  } else if (wcAvg != null) {
    bar = roundScore(wcAvg)
  }

  // --- BLI ---
  const stressCheckin = checkinRows
    .map((c) => c.stress_rating)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)))
    .map((v) => clamp(Number(v) * 10, 0, 100))

  const stressJournal = journalRows
    .map((j) => j.stress_level)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)))
    .map((v) => clamp(Number(v) * 20, 0, 100))

  const ciStress = avg(stressCheckin)
  const jStress = avg(stressJournal)

  let bli: number
  if (ciStress != null && jStress != null) {
    bli = roundScore(ciStress * 0.6 + jStress * 0.4)
  } else if (ciStress != null) {
    bli = roundScore(ciStress)
  } else if (jStress != null) {
    bli = roundScore(jStress)
  } else {
    bli = 45
  }

  // --- DBI ---
  const missedSessions = adherenceRows.filter((r) => {
    if (r.record_type === 'session_missed') return true
    if (r.record_type === 'session_partial') {
      const p = r.completion_pct
      return p == null || Number(p) < 80
    }
    return false
  }).length
  const missedPoints = missedSessions * 8

  const rawFlagsByDay = new Map<string, number>()
  for (const j of journalRows) {
    const day = j.entry_date
    let pts = 0
    if (j.travel_flag) pts += 15
    if (j.illness_flag) pts += 15
    if (j.work_stress_flag) pts += 15
    if (j.family_stress_flag) pts += 15
    rawFlagsByDay.set(day, (rawFlagsByDay.get(day) ?? 0) + pts)
  }
  let flagPoints = 0
  rawFlagsByDay.forEach((v) => {
    flagPoints += Math.min(25, v)
  })

  let dbi: number
  if (journalRows.length === 0 && missedSessions === 0) {
    dbi = 20
  } else {
    dbi = roundScore(Math.min(100, flagPoints + missedPoints))
  }

  // --- CDI ---
  const mindsetVals = checkinRows
    .map((c) => c.mindset_rating)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)))
    .map((v) => (10 - Number(v)) * 10)

  let cdi: number
  if (mindsetVals.length > 0) {
    cdi = roundScore(avg(mindsetVals)!)
  } else if (ciStress != null) {
    cdi = roundScore(ciStress)
  } else {
    cdi = 35
  }

  // --- LSI ---
  const sleepVals = checkinRows
    .map((c) => c.sleep_quality)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)))
    .map((v) => clamp(Number(v) * 10, 0, 100))
  const energyVals = checkinRows
    .map((c) => c.energy_level)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)))
    .map((v) => clamp(Number(v) * 10, 0, 100))

  const checkinDates = checkinRows.map((c) => c.checkin_date)
  const regularity = computeCheckinRegularityScore(checkinDates)

  let lsi: number
  if (checkinCount === 0) {
    lsi = 50
  } else if (checkinCount === 1) {
    const s = avg(sleepVals)
    const e = avg(energyVals)
    const parts: number[] = []
    if (s != null) parts.push(s * 0.5)
    if (e != null) parts.push(e * 0.5)
    lsi =
      parts.length > 0
        ? roundScore((parts.reduce((a, b) => a + b, 0) / parts.length) * 2 * 0.85)
        : 50
  } else {
    const s = avg(sleepVals)
    const e = avg(energyVals)
    const sScore = s ?? 50
    const eScore = e ?? 50
    lsi = roundScore(regularity * 0.4 + sScore * 0.3 + eScore * 0.3)
  }

  // --- PPS ---
  const barForPps = bar ?? 0
  const pps = Math.round(
    barForPps * 0.4 + (100 - bli) * 0.25 + (100 - dbi) * 0.2 + lsi * 0.15
  )
  const ppsClamped = clamp(pps, 0, 100)

  const genBar = bar ?? 0
  const generation_state = computeGenerationState(genBar, dbi)

  void clientRow?.sessions_per_week
  void clientRow?.current_stage

  return {
    bar,
    bli,
    dbi,
    cdi,
    lsi,
    pps: ppsClamped,
    generation_state,
    data_quality,
  }
}

/** Numeric scores for persistence (BAR null → 0). */
export function bieScoresForPersistence(r: BIEScoresResult) {
  return {
    bar: r.bar ?? 0,
    bli: r.bli,
    dbi: r.dbi,
    cdi: r.cdi,
    lsi: r.lsi,
    pps: r.pps,
    generation_state: r.generation_state,
  }
}

export async function upsertBIESnapshot(
  clientId: string,
  scores: ReturnType<typeof bieScoresForPersistence>
) {
  await db.query(
    `INSERT INTO behavioral_snapshots
      (client_id, bar_score, dbi_score, bli_score, cdi, lsi, pps,
       generation_state, snapshot_date, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, NOW())
     ON CONFLICT (client_id, snapshot_date)
     DO UPDATE SET
       bar_score = EXCLUDED.bar_score,
       dbi_score = EXCLUDED.dbi_score,
       bli_score = EXCLUDED.bli_score,
       cdi = EXCLUDED.cdi,
       lsi = EXCLUDED.lsi,
       pps = EXCLUDED.pps,
       generation_state = EXCLUDED.generation_state,
       updated_at = NOW()`,
    [
      clientId,
      scores.bar,
      scores.dbi,
      scores.bli,
      scores.cdi,
      scores.lsi,
      scores.pps,
      scores.generation_state,
    ]
  )
}

/**
 * Recalculates BIE and persists when data is sufficient.
 * Swallows errors — use after successful writes; log failures.
 */
export async function tryRecalculateAndSaveBIESnapshot(clientId: string): Promise<void> {
  const result = await calculateBIEScores(clientId)
  if (result.data_quality === 'insufficient') return
  await upsertBIESnapshot(clientId, bieScoresForPersistence(result))
}
