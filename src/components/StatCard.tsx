// ---------------------------------------------------------------------------
// StatCard — Card showing a stat with label, value, and optional comparison
// ---------------------------------------------------------------------------

interface StatCardProps {
  /** Short label describing the stat (e.g., "Median Home Value"). */
  label: string;
  /** The formatted value (e.g., "$345,000"). */
  value: string;
  /** Optional comparison label (e.g., "vs. $281,900 nationally"). */
  comparison?: string;
  /** Optional trend direction for visual indicator. */
  trend?: "higher" | "lower" | "neutral";
  /** Additional CSS classes. */
  className?: string;
}

export function StatCard({
  label,
  value,
  comparison,
  trend,
  className = "",
}: StatCardProps) {
  const trendColor =
    trend === "higher"
      ? "text-accent"
      : trend === "lower"
        ? "text-data-4"
        : "text-ink-muted";

  return (
    <div
      className={`rounded-lg border border-border-light bg-surface p-5 ${className}`}
    >
      <p className="text-xs font-medium tracking-wide uppercase text-ink-muted">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
      {comparison && (
        <p className={`mt-1 text-sm ${trendColor}`}>{comparison}</p>
      )}
    </div>
  );
}
