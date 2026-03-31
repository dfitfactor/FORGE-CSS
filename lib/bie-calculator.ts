import * as XLSX from 'xlsx'
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

type DocumentRow = {
  document_type: string | null
  title: string | null
  notes: string | null
  file_type: string | null
  file_name: string | null
  file_data: string | null
}

type DocumentEvidence = {
  adherenceScore: number | null
  dbiSignal: number | null
  lsiSignal: number | null
  cdiSignal: number | null
  bliSignal: number | null
  signalCount: number
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

function normalizeBase64(input: string | null | undefined): string | null {
  if (input == null) return null

  let s = String(input).trim()
  s = s.replace(/^data:.*?;base64,/i, '')
  s = s.replace(/\s+/g, '')
  s = s.replace(/-/g, '+').replace(/_/g, '/')

  if (!s) return null

  const padding = s.length % 4
  if (padding !== 0) {
    s = s.padEnd(s.length + (4 - padding), '=')
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null
  return s
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/\s+/g, ' ').trim()
}

function parseSpreadsheetNumber(value: unknown) {
  const cleaned = String(value ?? '').replace(/[^0-9.\-]/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function countKeywordHits(text: string, patterns: RegExp[]) {
  const corpus = text.toLowerCase()
  return patterns.reduce((count, pattern) => count + (pattern.test(corpus) ? 1 : 0), 0)
}

function readDocumentTextPreview(doc: DocumentRow, charLimit = 2500) {
  const fileType = doc.file_type?.toLowerCase() ?? ''
  const fileName = doc.file_name?.toLowerCase() ?? ''
  const normalized = normalizeBase64(doc.file_data)
  if (!normalized) return ''

  try {
    if (
      fileType.includes('text') ||
      fileType.includes('plain') ||
      fileType.includes('csv') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.csv')
    ) {
      return Buffer.from(normalized, 'base64')
        .toString('utf-8')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, charLimit)
    }

    const isSpreadsheet =
      fileType.includes('spreadsheet') ||
      fileType.includes('excel') ||
      fileType.includes('sheet') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.xlsx')

    if (!isSpreadsheet) return ''

    const workbook = XLSX.read(Buffer.from(normalized, 'base64'), { type: 'buffer' })
    const previews = workbook.SheetNames.slice(0, 2).map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
        header: 1,
        blankrows: false,
        raw: false,
        defval: '',
      })

      if (!rows.length) return ''

      const headerIndex = rows.findIndex((row) =>
        row.some((cell) => String(cell).trim().length > 0)
      )
      if (headerIndex === -1) return ''

      const headerRow = rows[headerIndex].map((cell) => String(cell).trim())
      const bodyRows = rows
        .slice(headerIndex + 1)
        .filter((row) => row.some((cell) => String(cell).trim().length > 0))
        .slice(0, 10)

      const lineItems = bodyRows.map((row) =>
        headerRow
          .slice(0, 8)
          .map((header, index) => {
            const value = String(row[index] ?? '').trim()
            return header && value ? `${header}: ${value}` : ''
          })
          .filter(Boolean)
          .join(' | ')
      )

      return [`[Sheet: ${sheetName}]`, ...lineItems].filter(Boolean).join('\n')
    })

    return previews.filter(Boolean).join('\n').slice(0, charLimit)
  } catch {
    return ''
  }
}

function analyzeDocuments(documents: DocumentRow[]): DocumentEvidence {
  if (documents.length === 0) {
    return {
      adherenceScore: null,
      dbiSignal: null,
      lsiSignal: null,
      cdiSignal: null,
      bliSignal: null,
      signalCount: 0,
    }
  }

  let nutritionEvidenceCount = 0
  let nutritionEntries = 0
  let mealMentions = 0
  let totalCalories = 0
  let totalProtein = 0
  const corpusParts: string[] = []

  for (const doc of documents) {
    const descriptor = [
      doc.document_type ?? '',
      doc.title ?? '',
      doc.notes ?? '',
      doc.file_name ?? '',
    ].join(' ')
    const preview = readDocumentTextPreview(doc)
    const docCorpus = [descriptor, preview].filter(Boolean).join('\n')
    corpusParts.push(docCorpus)

    const isNutritionEvidence =
      doc.document_type === 'nutrition_log' ||
      /food journal|nutrition log|meal log|macro log|diet log|myfitnesspal|cronometer/i.test(docCorpus)

    if (isNutritionEvidence) {
      nutritionEvidenceCount += 1
      mealMentions += countKeywordHits(docCorpus, [
        /\bbreakfast\b/,
        /\blunch\b/,
        /\bdinner\b/,
        /\bsnack\b/,
        /\bmeal\b/,
      ])
    }

    const fileType = doc.file_type?.toLowerCase() ?? ''
    const fileName = doc.file_name?.toLowerCase() ?? ''
    const isSpreadsheet =
      fileType.includes('spreadsheet') ||
      fileType.includes('excel') ||
      fileType.includes('sheet') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.xlsx')

    if (!isSpreadsheet || !isNutritionEvidence) continue

    try {
      const normalized = normalizeBase64(doc.file_data)
      if (!normalized) continue

      const workbook = XLSX.read(Buffer.from(normalized, 'base64'), { type: 'buffer' })
      for (const sheetName of workbook.SheetNames.slice(0, 3)) {
        const worksheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
          header: 1,
          blankrows: false,
          raw: false,
          defval: '',
        })
        if (!rows.length) continue

        const headerIndex = rows.findIndex((row) =>
          row.some((cell) => String(cell).trim().length > 0)
        )
        if (headerIndex === -1) continue

        const headers = rows[headerIndex].map((cell) => normalizeHeader(String(cell)))
        const entryRows = rows
          .slice(headerIndex + 1)
          .filter((row) => row.some((cell) => String(cell).trim().length > 0))
          .slice(0, 40)

        nutritionEntries += entryRows.length

        const caloriesIndex = headers.findIndex((header) => header.includes('calories'))
        const proteinIndex = headers.findIndex((header) => header.includes('protein'))

        for (const row of entryRows) {
          if (caloriesIndex >= 0) totalCalories += parseSpreadsheetNumber(row[caloriesIndex]) ?? 0
          if (proteinIndex >= 0) totalProtein += parseSpreadsheetNumber(row[proteinIndex]) ?? 0
        }
      }
    } catch {
      // Ignore parser failures and fall back to metadata/text-only heuristics.
    }
  }

  const corpus = corpusParts.join('\n').toLowerCase()
  const disruptionHits = countKeywordHits(corpus, [
    /\btravel\b/,
    /\bsick|ill|illness\b/,
    /\bstress|overwhelm|burnout\b/,
    /\bbusy|chaos|disrupt(?:ed|ion)?\b/,
    /\bpain|injury|flare\b/,
    /\bpoor sleep|insomnia|exhausted|fatigue\b/,
    /\bskip(?:ped)?|miss(?:ed|ing)\b/,
    /\boff track\b/,
  ])
  const stabilityHits = countKeywordHits(corpus, [
    /\bconsistent|routine|steady|stable\b/,
    /\benergized|confident|focused|strong\b/,
    /\bwell-rested|slept well|good sleep\b/,
    /\bon track|momentum|dialed in\b/,
    /\bprep(?:ped)?\b/,
    /\bprotein\b/,
    /\bhydration|water\b/,
  ])

  const adherenceInputs = [
    nutritionEvidenceCount > 0 ? 52 : null,
    nutritionEntries >= 20 ? 78 : nutritionEntries >= 10 ? 70 : nutritionEntries >= 3 ? 62 : null,
    mealMentions >= 6 ? 68 : mealMentions >= 3 ? 60 : null,
    totalProtein >= 120 ? 80 : totalProtein >= 80 ? 72 : totalProtein >= 40 ? 64 : null,
    totalCalories >= 1200 ? 64 : totalCalories >= 800 ? 58 : null,
  ].filter((value): value is number => value != null)

  const adherenceBase = avg(adherenceInputs)
  const adherenceScore =
    adherenceBase == null
      ? null
      : roundScore(adherenceBase + stabilityHits * 4 - disruptionHits * 5)

  const dbiSignal =
    nutritionEvidenceCount > 0 || disruptionHits > 0 || stabilityHits > 0
      ? roundScore(35 + disruptionHits * 10 - stabilityHits * 4)
      : null
  const lsiSignal =
    nutritionEvidenceCount > 0 || disruptionHits > 0 || stabilityHits > 0
      ? roundScore(52 + stabilityHits * 8 - disruptionHits * 8)
      : null
  const cdiSignal =
    disruptionHits > 0 || stabilityHits > 0
      ? roundScore(38 + disruptionHits * 8 - stabilityHits * 3)
      : null
  const bliSignal =
    nutritionEvidenceCount > 0 || disruptionHits > 0 || stabilityHits > 0 || adherenceScore != null
      ? roundScore(
          (dbiSignal ?? 42) * 0.4 +
          ((100 - (adherenceScore ?? 55)) * 0.25) +
          ((cdiSignal ?? 40) * 0.2) +
          ((100 - (lsiSignal ?? 58)) * 0.15)
        )
      : null

  const signalCount =
    Number(adherenceScore != null) +
    Number(dbiSignal != null) +
    Number(lsiSignal != null) +
    Number(cdiSignal != null) +
    Number(bliSignal != null)

  return {
    adherenceScore,
    dbiSignal,
    lsiSignal,
    cdiSignal,
    bliSignal,
    signalCount,
  }
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
  const [adherenceRows, checkinRows, journalRows, clientRow, documentRows] = await Promise.all([
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
    db.query<DocumentRow>(
      `SELECT document_type, title, notes, file_type, file_name,
              encode(file_data, 'base64') AS file_data
       FROM client_documents
       WHERE client_id = $1
         AND include_in_ai = true
       ORDER BY created_at DESC
       LIMIT 8`,
      [clientId]
    ),
  ])

  const checkinCount = checkinRows.length
  const journalCount = journalRows.length
  const docEvidence = analyzeDocuments(documentRows)

  let data_quality: BIEScoresResult['data_quality']
  if (checkinCount >= 1 && journalCount >= 1) data_quality = 'full'
  else if (checkinCount >= 1 && docEvidence.signalCount > 0) data_quality = 'full'
  else if (journalCount >= 1 && docEvidence.signalCount > 0) data_quality = 'partial'
  else if (docEvidence.signalCount > 0) data_quality = 'partial'
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
  } else if (docEvidence.adherenceScore != null) {
    bar = roundScore(docEvidence.adherenceScore)
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
  } else if (docEvidence.bliSignal != null) {
    bli = roundScore(docEvidence.bliSignal)
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
    dbi = docEvidence.dbiSignal != null ? roundScore(docEvidence.dbiSignal) : 20
  } else {
    const calculatedDbi = roundScore(Math.min(100, flagPoints + missedPoints))
    dbi =
      docEvidence.dbiSignal != null
        ? roundScore(calculatedDbi * 0.85 + docEvidence.dbiSignal * 0.15)
        : calculatedDbi
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
  } else if (docEvidence.cdiSignal != null) {
    cdi = roundScore(docEvidence.cdiSignal)
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
    lsi = docEvidence.lsiSignal != null ? roundScore(docEvidence.lsiSignal) : 50
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
    const calculatedLsi = roundScore(regularity * 0.4 + sScore * 0.3 + eScore * 0.3)
    lsi =
      docEvidence.lsiSignal != null
        ? roundScore(calculatedLsi * 0.85 + docEvidence.lsiSignal * 0.15)
        : calculatedLsi
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
  const params = [
    clientId,
    scores.bar,
    scores.dbi,
    scores.bli,
    scores.cdi,
    scores.lsi,
    scores.pps,
    scores.generation_state,
  ]

  // Support both schemas:
  // - newer: bar_score/dbi_score/bli_score + updated_at
  // - older/seeded: bar/dbi/bli + created_at
  try {
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
      params
    )
    return
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Only fall back on missing-column / missing-updated_at schema mismatch.
    if (
      !msg.includes('bar_score') &&
      !msg.includes('dbi_score') &&
      !msg.includes('bli_score') &&
      !msg.includes('updated_at')
    ) {
      throw err
    }
  }

  await db.query(
    `INSERT INTO behavioral_snapshots
      (client_id, bar, dbi, bli, cdi, lsi, pps,
       generation_state, snapshot_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, NOW())
     ON CONFLICT (client_id, snapshot_date)
     DO UPDATE SET
       bar = EXCLUDED.bar,
       dbi = EXCLUDED.dbi,
       bli = EXCLUDED.bli,
       cdi = EXCLUDED.cdi,
       lsi = EXCLUDED.lsi,
       pps = EXCLUDED.pps,
       generation_state = EXCLUDED.generation_state`,
    params
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
