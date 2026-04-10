import assert from 'node:assert/strict'
import { scoreExerciseNamePair } from '../lib/exercise-reference-matching'

function expectExact(primary: string, reference: string) {
  const result = scoreExerciseNamePair(primary, reference)
  assert.ok(result, `Expected a match for ${primary} vs ${reference}`)
  assert.equal(result.reason, 'exact_name_match')
}

function expectFuzzyAtLeast(primary: string, reference: string, minimumScore: number) {
  const result = scoreExerciseNamePair(primary, reference)
  assert.ok(result, `Expected a fuzzy-capable match for ${primary} vs ${reference}`)
  assert.ok(result.score >= minimumScore, `Expected score >= ${minimumScore} but got ${result.score} for ${primary} vs ${reference}`)
}

function expectNoMatch(primary: string, reference: string) {
  const result = scoreExerciseNamePair(primary, reference)
  assert.equal(result, null, `Expected no match for ${primary} vs ${reference}, got ${JSON.stringify(result)}`)
}

function expectReviewOnly(primary: string, reference: string) {
  const result = scoreExerciseNamePair(primary, reference)
  assert.ok(result, `Expected a review-only fuzzy match for ${primary} vs ${reference}`)
  assert.equal(result.reason, 'fuzzy_name_match')
  assert.ok(result.score < 0.9, `Expected score < 0.9 for ${primary} vs ${reference}, got ${result.score}`)
}

expectExact('Arm Circles', 'Arm Circles')
expectExact('Plyo Push-Up', 'Plyo Push-up')
expectFuzzyAtLeast('Split Squat', 'Split Squats', 0.9)
expectFuzzyAtLeast('Banded Good Morning', 'Band Good Morning', 0.9)
expectFuzzyAtLeast("World's Greatest Stretch", "World's Greatest Stretch", 0.9)

expectNoMatch('Incline Push-Up', 'Decline Push-Up')
expectNoMatch('DB Overhead Tricep Extension', 'Sled Overhead Triceps Extension')
expectNoMatch('Standing Wood Chop', 'Standing Cable Wood Chop')

expectReviewOnly('DB Romanian Deadlift', 'Romanian Deadlift')
expectReviewOnly('KB Push Press', 'Push Press')
expectReviewOnly('KB Overhead Squat', 'Overhead Squat')

console.log('exercise reference matcher tests passed')
