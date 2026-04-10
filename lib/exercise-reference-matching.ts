export type ExerciseNameMatch =
  | { score: 1; reason: 'exact_name_match' }
  | { score: number; reason: 'fuzzy_name_match' }

const EQUIPMENT_MODIFIER_GROUPS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'dumbbell', patterns: [/\bdb\b/i, /\bdumbbell(s)?\b/i] },
  { key: 'kettlebell', patterns: [/\bkb\b/i, /\bkettlebell(s)?\b/i] },
  { key: 'barbell', patterns: [/\bbarbell\b/i, /\baxle\b/i] },
  { key: 'band', patterns: [/\bband(ed|s)?\b/i] },
  { key: 'cable', patterns: [/\bcable\b/i, /\bpulley\b/i] },
  { key: 'sled', patterns: [/\bsled\b/i] },
  { key: 'bodyweight', patterns: [/\bbodyweight\b/i, /\bbody[- ]?weight\b/i] },
  { key: 'machine', patterns: [/\bmachine\b/i] },
]

const POSITION_MODIFIER_GROUPS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'incline', patterns: [/\bincline\b/i] },
  { key: 'decline', patterns: [/\bdecline\b/i] },
  { key: 'standing', patterns: [/\bstanding\b/i] },
  { key: 'seated', patterns: [/\bseated\b/i] },
]

function normalizeText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || ''
}

function singularizeToken(token: string) {
  if (token.length <= 3) return token
  if (token.endsWith('ss')) return token
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.endsWith('s')) return token.slice(0, -1)
  return token
}

function canonicalTokens(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      if (token === 'banded') return 'band'
      if (token === 'bands') return 'band'
      if (token === 'pushup') return 'push'
      if (token === 'push') return 'push'
      return singularizeToken(token)
    })
}

function canonicalName(value: string) {
  return canonicalTokens(value).join(' ')
}

function collectModifierKeys(value: string, groups: Array<{ key: string; patterns: RegExp[] }>) {
  const matches = new Set<string>()
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    if (group.patterns.some((pattern) => pattern.test(value))) {
      matches.add(group.key)
    }
  }
  return Array.from(matches)
}

function stripProtectedModifiers(tokens: string[]) {
  const blocked = new Set([
    'db',
    'dumbbell',
    'kb',
    'kettlebell',
    'barbell',
    'band',
    'banded',
    'cable',
    'sled',
    'standing',
    'seated',
    'incline',
    'decline',
    'bodyweight',
    'machine',
  ])

  return tokens.filter((token) => !blocked.has(token))
}

function toBigrams(value: string) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized.length < 2) return [normalized]

  const result: string[] = []
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.push(normalized.slice(index, index + 2))
  }
  return result
}

function similarityScore(a: string, b: string) {
  const left = toBigrams(a)
  const right = toBigrams(b)
  const rightSet = new Set(right)
  let matches = 0

  for (let index = 0; index < left.length; index += 1) {
    if (rightSet.has(left[index])) matches += 1
  }

  const denominator = left.length + right.length
  if (denominator === 0) return 0
  return (2 * matches) / denominator
}

function sameModifierFamily(left: string[], right: string[]) {
  if (left.length === 0 && right.length === 0) return true
  if (left.length === 0 || right.length === 0) return false
  return left.some((item) => right.includes(item))
}

function hasStrictOneSidedEquipmentMismatch(left: string[], right: string[]) {
  const strictEquipment = ['cable', 'sled', 'machine']
  return strictEquipment.some((item) => left.includes(item) !== right.includes(item))
}

export function scoreExerciseNamePair(primaryName: string, referenceName: string): ExerciseNameMatch | null {
  const primaryCanonical = canonicalName(primaryName)
  const referenceCanonical = canonicalName(referenceName)

  if (!primaryCanonical || !referenceCanonical) return null
  if (primaryCanonical === referenceCanonical) {
    return { score: 1, reason: 'exact_name_match' }
  }

  const primaryEquipment = collectModifierKeys(primaryName, EQUIPMENT_MODIFIER_GROUPS)
  const referenceEquipment = collectModifierKeys(referenceName, EQUIPMENT_MODIFIER_GROUPS)
  const primaryPosition = collectModifierKeys(primaryName, POSITION_MODIFIER_GROUPS)
  const referencePosition = collectModifierKeys(referenceName, POSITION_MODIFIER_GROUPS)

  if (
    primaryPosition.includes('incline') && referencePosition.includes('decline') ||
    primaryPosition.includes('decline') && referencePosition.includes('incline')
  ) {
    return null
  }

  if (
    primaryPosition.includes('standing') && referencePosition.includes('seated') ||
    primaryPosition.includes('seated') && referencePosition.includes('standing')
  ) {
    return null
  }

  if (primaryEquipment.length > 0 && referenceEquipment.length > 0 && !sameModifierFamily(primaryEquipment, referenceEquipment)) {
    return null
  }

  if (hasStrictOneSidedEquipmentMismatch(primaryEquipment, referenceEquipment)) {
    return null
  }

  const primaryBase = stripProtectedModifiers(canonicalTokens(primaryName)).join(' ')
  const referenceBase = stripProtectedModifiers(canonicalTokens(referenceName)).join(' ')

  let score = Math.max(
    similarityScore(primaryCanonical, referenceCanonical),
    primaryBase && referenceBase ? similarityScore(primaryBase, referenceBase) * 0.97 : 0
  )

  if (primaryEquipment.length !== referenceEquipment.length) score -= 0.06
  if ((primaryEquipment.length === 0) !== (referenceEquipment.length === 0)) score -= 0.05
  if (primaryPosition.length !== referencePosition.length) score -= 0.05

  score = Number(Math.max(0, Math.min(1, score)).toFixed(2))

  if (score < 0.85) return null
  return { score, reason: 'fuzzy_name_match' }
}
