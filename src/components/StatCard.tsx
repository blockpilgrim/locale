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
      className={`group relative overflow-hidden rounded-xl border border-border-light bg-surface p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5 ${className}`}
    >
      {/* Subtle top accent line */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent/20 via-accent/40 to-accent/20" />
      <p className="text-[11px] font-semibold tracking-wide uppercase text-ink-muted">
        {label}
      </p>
      <p className="mt-1.5 font-serif text-2xl text-ink sm:text-[1.75rem] leading-tight tracking-tight">{value}</p>
      {comparison && (
        <p className={`mt-1.5 text-sm leading-snug ${trendColor}`}>{comparison}</p>
      )}
    </div>
  );
}
