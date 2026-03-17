import { clsx } from 'clsx'

type Kind = 'calories' | 'protein' | 'carbs' | 'fat'

const LABELS: Record<Kind, { label: string; unit: string }> = {
  calories: { label: 'Calories', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbs: { label: 'Carbs', unit: 'g' },
  fat: { label: 'Fat', unit: 'g' },
}

export function MacroCard({ kind, value }: { kind: Kind; value: number }) {
  const meta = LABELS[kind]
  return (
    <div className={clsx('forge-card p-4')}>
      <div className="text-xs font-mono uppercase tracking-widest text-forge-text-muted">
        {meta.label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-forge-text-primary">{Math.round(value)}</div>
        <div className="text-sm text-forge-text-muted">{meta.unit}</div>
      </div>
    </div>
  )
}

