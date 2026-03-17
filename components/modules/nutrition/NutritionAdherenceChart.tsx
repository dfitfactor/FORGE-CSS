type WeekRow = {
  weekLabel: string
  planned: number
  logged: number
}

export function NutritionAdherenceChart({
  weeks,
  title,
}: {
  weeks: WeekRow[]
  title?: string
}) {
  return (
    <div className="forge-card p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="forge-section-title">{title ?? 'Nutrition adherence'}</h2>
        <div className="text-xs text-forge-text-muted">{weeks.length} week{weeks.length !== 1 ? 's' : ''}</div>
      </div>

      {weeks.length === 0 ? (
        <div className="mt-4 text-sm text-forge-text-muted">No adherence data yet.</div>
      ) : (
        <div className="mt-4 space-y-2">
          {weeks.map((w) => {
            const pct = w.planned > 0 ? Math.round((w.logged / w.planned) * 100) : 0
            return (
              <div key={w.weekLabel} className="flex items-center gap-3">
                <div className="w-28 text-xs text-forge-text-muted font-mono">{w.weekLabel}</div>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-2 bg-[#D4AF37]"
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs text-forge-text-secondary font-mono">
                  {w.logged}/{w.planned}
                </div>
                <div className="w-10 text-right text-xs text-forge-text-muted font-mono">{pct}%</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

