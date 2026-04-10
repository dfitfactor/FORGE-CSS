import ExerciseReferenceReviewBoard from '@/components/modules/exercises/ExerciseReferenceReviewBoard'

export default function ExerciseReviewPage() {
  return (
    <div className="min-h-screen bg-forge-surface p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-forge-text-primary">Exercise Review</h1>
          <p className="mt-1 text-sm text-forge-text-muted">
            Review imported exercise references against the vetted FORGË exercise library before they influence enrichment or fallback workflows.
          </p>
        </div>

        <ExerciseReferenceReviewBoard />
      </div>
    </div>
  )
}
