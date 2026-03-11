// ---------------------------------------------------------------------------
// ComparisonBar — Horizontal bar showing local value vs national average
// ---------------------------------------------------------------------------
// Simple CSS-based visualization. No chart library needed.
// ---------------------------------------------------------------------------

interface ComparisonBarProps {
  /** Short label for the metric. */
  label: string;
  /** The local value. */
  localValue: number;
  /** The national average value. */
  nationalValue: number;
  /** Format function for display (e.g., to add $ or %). */
  format?: (value: number) => string;
  /** Maximum value for the bar scale. If omitted, uses the larger of the two values * 1.2. */
  maxValue?: number;
  /** Additional CSS classes. */
  className?: string;
}

function defaultFormat(value: number): string {
  return value.toLocaleString();
}

export function ComparisonBar({
  label,
  localValue,
  nationalValue,
  format = defaultFormat,
  maxValue,
  className = "",
}: ComparisonBarProps) {
  const max = maxValue ?? Math.max(localValue, nationalValue) * 1.2;
  const localPct = max > 0 ? Math.min((localValue / max) * 100, 100) : 0;
  const nationalPct =
    max > 0 ? Math.min((nationalValue / max) * 100, 100) : 0;

  return (
    <div
      className={`space-y-2 ${className}`}
      role="img"
      aria-label={`${label}: ${format(localValue)} (national average: ${format(nationalValue)})`}
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-ink min-w-0 truncate">{label}</span>
        <span className="font-serif text-base font-semibold text-ink tabular-nums shrink-0">
          {format(localValue)}
        </span>
      </div>
      {/* Local value bar */}
      <div className="relative h-3 w-full rounded-full bg-warm-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light transition-all duration-700 ease-out"
          style={{ width: `${localPct}%` }}
        />
        {/* National average marker */}
        {nationalPct > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-warm-500 transition-all duration-500"
            style={{ left: `${nationalPct}%` }}
            title={`National avg: ${format(nationalValue)}`}
          />
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <div className="h-2 w-0.5 rounded-full bg-warm-500" />
        <span>National avg: {format(nationalValue)}</span>
      </div>
    </div>
  );
}
