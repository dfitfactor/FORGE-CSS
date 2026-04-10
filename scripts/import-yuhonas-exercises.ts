import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import pg from 'pg'
import type { PoolClient } from 'pg'
import { scoreExerciseNamePair } from '../lib/exercise-reference-matching'

const { Pool } = pg

const SOURCE_NAME = 'yuhonas'
const SOURCE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const RAW_DATA_DIR = path.join(process.cwd(), 'scripts', 'data')
const RAW_DATA_PATH = path.join(RAW_DATA_DIR, 'yuhonas-raw.json')
const IMPORT_NOTES = 'Initial import from free-exercise-db'

type YuhonasExercise = {
  id?: string
  name?: string
  force?: string | null
  level?: string | null
  mechanic?: string | null
  equipment?: string | null
  primaryMuscles?: string[] | null
  secondaryMuscles?: string[] | null
  instructions?: string[] | null
  category?: string | null
  images?: string[] | null
  [key: string]: unknown
}

type ExerciseColumnInfo = {
  column_name: string
}

type PrimaryExerciseRecord = {
  id: string
  exercise_name?: string | null
  movement_pattern?: string | null
  equipment?: string | null
  equipment_normalized?: string | null
  body_region?: string | null
  default_block?: string | null
  intensity?: string | null
  complexity_tier?: number | null
  [key: string]: unknown
}

type Stats = {
  totalImported: number
  totalMatched: number
  totalUnmatched: number
  totalDuplicates: number
  totalEnriched: number
  totalFlagged: number
  totalFailed: number
  totalSkipped: number
}

type NormalizedReference = {
  sourceRecordId: string
  canonicalName: string
  displayName: string
  slug: string
  category: string | null
  movementPattern: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipmentRequired: string | null
  forceType: string | null
  mechanicType: string | null
  difficultyLevel: string | null
  instructions: string[]
  imageRefs: string[]
  rawPayload: YuhonasExercise & { _normalized_complexity_tier?: number | null }
  complexityTier: number | null
  safetyFlags: string[]
  populationRestrictions: string[]
}

type MatchDecision = {
  duplicateStatus: 'confirmed_duplicate' | 'likely_duplicate' | 'unique'
  matchedExercise: PrimaryExerciseRecord | null
  matchConfidence: number | null
  matchReason: string | null
  manualReviewStatus: 'approved' | 'pending' | null
  enrichmentRecommendation: string | null
}

function buildPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  }

  return new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'forge_css',
    user: process.env.POSTGRES_USER || 'forge_admin',
    password: process.env.POSTGRES_PASSWORD || '',
  })
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || ''
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter(Boolean)
    )
  )
}

function normalizeEquipment(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return null

  const map: Record<string, string> = {
    bands: 'band',
    band: 'band',
    barbell: 'barbell',
    body: 'bodyweight',
    bodyweight: 'bodyweight',
    cable: 'cable',
    cables: 'cable',
    dumbbell: 'dumbbell',
    dumbbells: 'dumbbell',
    ez: 'barbell',
    machine: 'machine',
    other: 'other',
    kettlebells: 'kettlebell',
    kettlebell: 'kettlebell',
    trx: 'trx',
    medicine: 'other',
    exercise: 'other',
    foam: 'other',
  }

  if (map[normalized]) return map[normalized]

  for (let index = 0; index < Object.entries(map).length; index += 1) {
    const [key, mapped] = Object.entries(map)[index]
    if (normalized.includes(key)) return mapped
  }

  return normalized.replace(/\s+/g, '_')
}

function normalizeMovementPattern(exercise: YuhonasExercise) {
  const category = normalizeText(exercise.category).toLowerCase()
  const name = normalizeText(exercise.name).toLowerCase()

  if (/(squat|leg press|goblet)/.test(name)) return 'Squat'
  if (/(deadlift|hinge|rdl|good morning|hip thrust)/.test(name)) return 'Hinge'
  if (/(lunge|split squat|step-up)/.test(name)) return 'Lunge'
  if (/(row|pull-?up|lat pulldown|chin-?up)/.test(name)) return 'Pull'
  if (/(press|push-?up|dip|fly)/.test(name)) return 'Push'
  if (/(plank|rotation|twist|carry|crunch|sit-up|hollow)/.test(name)) return 'Core'
  if (category.includes('cardio')) return 'Conditioning'
  if (category.includes('stretch')) return 'Mobility'
  return toTitleCase(category) || null
}

function normalizeDifficulty(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return { level: null, complexityTier: null }

  const map: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    expert: 3,
  }

  return {
    level: normalized,
    complexityTier: map[normalized] ?? null,
  }
}

function deriveSafetyFlags(exercise: YuhonasExercise) {
  const text = [
    normalizeText(exercise.name),
    normalizeText(exercise.mechanic as string | null | undefined),
    ...(exercise.instructions ?? []).map((item) => normalizeText(item)),
  ].join(' ').toLowerCase()

  const flags: string[] = []
  if (/(snatch|clean|jerk|olympic)/.test(text)) flags.push('explosive_lift')
  if (/(behind the neck|neck press)/.test(text)) flags.push('shoulder_sensitive')
  if (/(plyometric|jump)/.test(text)) flags.push('impact_loading')
  return flags
}

function derivePopulationRestrictions(exercise: YuhonasExercise) {
  const text = [
    normalizeText(exercise.name),
    ...(exercise.instructions ?? []).map((item) => normalizeText(item)),
  ].join(' ').toLowerCase()

  const restrictions: string[] = []
  if (/(pregnan|postpartum)/.test(text)) restrictions.push('pregnancy_review')
  if (/(advanced|expert)/.test(text)) restrictions.push('advanced_only_review')
  return restrictions
}

function normalizeRecord(exercise: YuhonasExercise): NormalizedReference {
  const displayName = normalizeText(exercise.name)
  if (!displayName) {
    throw new Error('Missing exercise name')
  }

  const canonicalName = displayName.toLowerCase()
  const slug = slugify(displayName)
  if (!slug) {
    throw new Error(`Failed to generate slug for "${displayName}"`)
  }

  const category = normalizeText(exercise.category) || null
  const movementPattern = normalizeMovementPattern(exercise)
  const primaryMuscles = uniqueStrings(exercise.primaryMuscles ?? [])
  const secondaryMuscles = uniqueStrings(exercise.secondaryMuscles ?? [])
  const { level, complexityTier } = normalizeDifficulty(exercise.level)
  const equipmentRequired = normalizeEquipment(exercise.equipment)

  return {
    sourceRecordId: normalizeText(exercise.id) || slug,
    canonicalName,
    displayName,
    slug,
    category,
    movementPattern,
    primaryMuscles,
    secondaryMuscles,
    equipmentRequired,
    forceType: normalizeText(exercise.force) || null,
    mechanicType: normalizeText(exercise.mechanic) || null,
    difficultyLevel: level,
    instructions: uniqueStrings(exercise.instructions ?? []),
    imageRefs: uniqueStrings(exercise.images ?? []),
    rawPayload: {
      ...exercise,
      _normalized_complexity_tier: complexityTier,
    },
    complexityTier,
    safetyFlags: deriveSafetyFlags(exercise),
    populationRestrictions: derivePopulationRestrictions(exercise),
  }
}

async function loadRawExercises() {
  await fs.mkdir(RAW_DATA_DIR, { recursive: true })

  try {
    const existing = await fs.readFile(RAW_DATA_PATH, 'utf8')
    return JSON.parse(existing) as YuhonasExercise[]
  } catch {
    const response = await fetch(SOURCE_URL)
    if (!response.ok) {
      throw new Error(`Failed to download Yuhonas dataset: ${response.status} ${response.statusText}`)
    }

    const raw = await response.text()
    await fs.writeFile(RAW_DATA_PATH, raw, 'utf8')
    return JSON.parse(raw) as YuhonasExercise[]
  }
}

async function getExerciseColumns(client: PoolClient) {
  const columns = await client.query<ExerciseColumnInfo>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'exercises'`
  )

  return columns.rows.map((row) => row.column_name)
}

function getVariantColumns(columns: string[]) {
  const candidates = [
    'aliases',
    'alias_names',
    'alternate_names',
    'alternative_names',
    'name_variants',
    'exercise_aliases',
    'search_terms',
    'synonyms',
    'display_name',
  ]

  return candidates.filter((column) => columns.includes(column))
}

function buildExerciseSelect(columns: string[]) {
  const baseColumns = [
    'id',
    'exercise_name',
    'movement_pattern',
    'equipment',
    'equipment_normalized',
    'body_region',
    'default_block',
    'intensity',
    'complexity_tier',
  ].filter((column) => columns.includes(column))

  const variantColumns = getVariantColumns(columns)
  const selectedColumns = Array.from(new Set([...baseColumns, ...variantColumns]))

  if (!selectedColumns.includes('id') || !selectedColumns.includes('exercise_name')) {
    throw new Error('Exercises table is missing required id/exercise_name columns')
  }

  return {
    sql: `SELECT ${selectedColumns.join(', ')} FROM exercises WHERE is_active = true OR is_active IS NULL`,
    variantColumns,
    selectedColumns,
  }
}

function extractKnownNames(exercise: PrimaryExerciseRecord, variantColumns: string[]) {
  const values: string[] = []
  if (typeof exercise.exercise_name === 'string') values.push(exercise.exercise_name)

  for (const column of variantColumns) {
    const value = exercise[column]
    if (typeof value === 'string') values.push(value)
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') values.push(item)
      }
    }
  }

  return uniqueStrings(values)
}

function buildEnrichmentRecommendation(
  primary: PrimaryExerciseRecord,
  reference: NormalizedReference,
  columns: string[]
) {
  const opportunities: string[] = []

  if (columns.includes('movement_pattern') && !normalizeText(primary.movement_pattern) && reference.movementPattern) {
    opportunities.push('movement_pattern')
  }
  if (columns.includes('equipment_normalized') && !normalizeText(primary.equipment_normalized) && reference.equipmentRequired) {
    opportunities.push('equipment_normalized')
  }
  if (columns.includes('equipment') && !normalizeText(primary.equipment) && reference.equipmentRequired) {
    opportunities.push('equipment')
  }
  if (columns.includes('body_region') && !normalizeText(primary.body_region) && (reference.category || reference.primaryMuscles.length > 0)) {
    opportunities.push('body_region')
  }
  if (columns.includes('complexity_tier') && (primary.complexity_tier === null || primary.complexity_tier === undefined) && reference.complexityTier !== null) {
    opportunities.push('complexity_tier')
  }

  if (opportunities.length === 0) return null
  return `Review potential enrichment for: ${opportunities.join(', ')}`
}

function determineMatch(
  reference: NormalizedReference,
  primaryExercises: PrimaryExerciseRecord[],
  variantColumns: string[],
  primaryColumns: string[]
): MatchDecision {
  const referenceName = normalizeText(reference.displayName).toLowerCase()
  let bestMatch: PrimaryExerciseRecord | null = null
  let bestScore = 0
  let bestReason: string | null = null

  for (const exercise of primaryExercises) {
    const names = extractKnownNames(exercise, variantColumns)
    const exactName = names.find((name) => normalizeText(name).toLowerCase() === referenceName)
    if (exactName) {
      bestMatch = exercise
      bestScore = 1
      bestReason = 'exact_name_match'
      break
    }

    for (const name of names) {
      const scored = scoreExerciseNamePair(name, reference.displayName)
      if (scored && scored.score > bestScore) {
        bestMatch = exercise
        bestScore = scored.score
        bestReason = scored.reason
      }
    }
  }

  if (!bestMatch || bestScore <= 0.85) {
    return {
      duplicateStatus: 'unique',
      matchedExercise: null,
      matchConfidence: null,
      matchReason: null,
      manualReviewStatus: null,
      enrichmentRecommendation: null,
    }
  }

  const enrichmentRecommendation = buildEnrichmentRecommendation(bestMatch, reference, primaryColumns)
  const manualReviewStatus = bestScore >= 0.9 ? 'approved' : 'pending'

  return {
    duplicateStatus: bestScore === 1 ? 'confirmed_duplicate' : 'likely_duplicate',
    matchedExercise: bestMatch,
    matchConfidence: Number(bestScore.toFixed(2)),
    matchReason: bestReason,
    manualReviewStatus,
    enrichmentRecommendation,
  }
}

async function findExistingMatchCandidate(
  client: PoolClient,
  primaryExerciseId: string,
  referenceRecordId: string
) {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM exercise_match_candidates
     WHERE primary_exercise_id = $1
       AND reference_record_id = $2
     LIMIT 1`,
    [primaryExerciseId, referenceRecordId]
  )
  return result.rows[0]?.id ?? null
}

async function main() {
  const pool = buildPool()
  const stats: Stats = {
    totalImported: 0,
    totalMatched: 0,
    totalUnmatched: 0,
    totalDuplicates: 0,
    totalEnriched: 0,
    totalFlagged: 0,
    totalFailed: 0,
    totalSkipped: 0,
  }

  try {
    const exercises = await loadRawExercises()
    const client = await pool.connect()

    try {
      const primaryColumns = await getExerciseColumns(client)
      const exerciseSelect = buildExerciseSelect(primaryColumns)
      const primaryExercisesResult = await client.query<PrimaryExerciseRecord>(exerciseSelect.sql)
      const primaryExercises = primaryExercisesResult.rows
      const sourceVersion = new Date().toISOString().slice(0, 10)

      await client.query('BEGIN')

      const importResult = await client.query<{ id: string }>(
        `INSERT INTO exercise_source_imports (
           source_name, source_version, import_notes,
           total_imported, total_matched, total_unmatched, total_duplicates,
           total_enriched, total_flagged, total_failed
         )
         VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, 0)
         RETURNING id`,
        [SOURCE_NAME, sourceVersion, IMPORT_NOTES]
      )
      const sourceImportId = importResult.rows[0].id

      for (let index = 0; index < exercises.length; index += 1) {
        const exercise = exercises[index]
        try {
          const normalized = normalizeRecord(exercise)
          const match = determineMatch(normalized, primaryExercises, exerciseSelect.variantColumns, primaryColumns)

          const insertReference = await client.query<{ id: string }>(
            `INSERT INTO exercise_reference_records (
               source_import_id, source_name, source_record_id, canonical_name, display_name, slug,
               category, movement_pattern, primary_muscles, secondary_muscles, equipment_required,
               force_type, mechanic_type, difficulty_level, instructions, image_refs, raw_payload,
               normalization_status, duplicate_status, review_status, approved_for_fallback,
               safety_flags, contraindication_notes, population_restrictions, is_active, updated_at
             )
             VALUES (
               $1, $2, $3, $4, $5, $6,
               $7, $8, $9::text[], $10::text[], $11,
               $12, $13, $14, $15::text[], $16::text[], $17::jsonb,
               $18, $19, $20, $21,
               $22::text[], $23, $24::text[], true, NOW()
             )
             ON CONFLICT (slug) DO NOTHING
             RETURNING id`,
            [
              sourceImportId,
              SOURCE_NAME,
              normalized.sourceRecordId,
              normalized.canonicalName,
              normalized.displayName,
              normalized.slug,
              normalized.category,
              normalized.movementPattern,
              normalized.primaryMuscles,
              normalized.secondaryMuscles,
              normalized.equipmentRequired,
              normalized.forceType,
              normalized.mechanicType,
              normalized.difficultyLevel,
              normalized.instructions,
              normalized.imageRefs,
              JSON.stringify(normalized.rawPayload),
              'normalized',
              match.duplicateStatus,
              match.manualReviewStatus === 'approved' ? 'approved' : 'pending',
              false,
              normalized.safetyFlags,
              null,
              normalized.populationRestrictions,
            ]
          )

          let referenceRecordId = insertReference.rows[0]?.id ?? null
          if (!referenceRecordId) {
            stats.totalSkipped += 1
            const existingReference = await client.query<{ id: string }>(
              `SELECT id FROM exercise_reference_records WHERE slug = $1 LIMIT 1`,
              [normalized.slug]
            )
            referenceRecordId = existingReference.rows[0]?.id ?? null
            console.log(`↩️  Skipped existing reference slug: ${normalized.slug}`)
          } else {
            stats.totalImported += 1
          }

          if (!referenceRecordId) {
            stats.totalFailed += 1
            console.warn(`⚠️  Failed to resolve inserted reference id for slug ${normalized.slug}`)
            continue
          }

          if (match.matchedExercise && match.matchConfidence !== null && match.matchReason) {
            stats.totalMatched += 1
            stats.totalDuplicates += 1
            if (match.manualReviewStatus === 'approved' && match.enrichmentRecommendation) {
              stats.totalEnriched += 1
            }
            if (match.manualReviewStatus !== 'approved') {
              stats.totalFlagged += 1
            }

            const existingCandidateId = await findExistingMatchCandidate(
              client,
              match.matchedExercise.id,
              referenceRecordId
            )

            if (!existingCandidateId) {
              await client.query(
                `INSERT INTO exercise_match_candidates (
                   primary_exercise_id, reference_record_id, match_confidence,
                   match_reason, enrichment_recommendation, manual_review_status,
                   created_at, updated_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                [
                  match.matchedExercise.id,
                  referenceRecordId,
                  match.matchConfidence,
                  match.matchReason,
                  match.enrichmentRecommendation,
                  match.manualReviewStatus ?? 'pending',
                ]
              )
            } else {
              console.log(`↩️  Match candidate already exists for ${normalized.displayName}`)
            }
          } else {
            stats.totalUnmatched += 1
          }

          if (match.duplicateStatus === 'unique') {
            console.log(`🆕 Unique reference record queued for review: ${normalized.displayName}`)
          } else if (match.matchConfidence === 1) {
            console.log(`🔗 Exact duplicate matched: ${normalized.displayName}`)
          } else {
            console.log(`🔁 Likely duplicate matched (${match.matchConfidence}): ${normalized.displayName}`)
          }
        } catch (error) {
          stats.totalFailed += 1
          const message = error instanceof Error ? error.message : 'Unknown normalization error'
          console.error(`❌ Failed record at index ${index}: ${message}`)
        }
      }

      await client.query(
        `UPDATE exercise_source_imports
         SET total_imported = $2,
             total_matched = $3,
             total_unmatched = $4,
             total_duplicates = $5,
             total_enriched = $6,
             total_flagged = $7,
             total_failed = $8
         WHERE id = $1`,
        [
          sourceImportId,
          stats.totalImported,
          stats.totalMatched,
          stats.totalUnmatched,
          stats.totalDuplicates,
          stats.totalEnriched,
          stats.totalFlagged,
          stats.totalFailed,
        ]
      )

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    console.log(`✅ Total imported: ${stats.totalImported}`)
    console.log(`🔗 Matched to existing: ${stats.totalMatched}`)
    console.log(`🆕 Unmatched (new): ${stats.totalUnmatched}`)
    console.log(`🔁 Duplicates detected: ${stats.totalDuplicates}`)
    console.log(`✨ Enrichment opportunities: ${stats.totalEnriched}`)
    console.log(`⚠️  Flagged for review: ${stats.totalFlagged}`)
    console.log(`❌ Failed records: ${stats.totalFailed}`)
    console.log(`↩️  Skipped existing slugs: ${stats.totalSkipped}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Yuhonas import failed:', error)
  process.exit(1)
})

