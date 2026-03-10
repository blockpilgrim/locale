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
      className={`space-y-1.5 ${className}`}
      role="img"
      aria-label={`${label}: ${format(localValue)} (national average: ${format(nationalValue)})`}
    >
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-ink-muted">{format(localValue)}</span>
      </div>
      {/* Local value bar */}
      <div className="h-2.5 w-full rounded-full bg-warm-100">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${localPct}%` }}
        />
      </div>
      {/* National average indicator — text only, avoids misleading dual-scale bars */}
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <div className="h-1.5 w-1.5 rounded-full bg-warm-400" />
        <span>National avg: {format(nationalValue)}</span>
        {/* Position marker on the main bar scale */}
        <div className="h-px flex-1 bg-warm-200" />
        <span className="font-medium text-ink-muted">
          {nationalPct > 0 ? `${Math.round(nationalPct)}%` : ""}
        </span>
      </div>
    </div>
  );
}
