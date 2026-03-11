// ---------------------------------------------------------------------------
// SectionHeader — Section heading with decorative accent and optional subtitle
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  /** Small uppercase label above the title. */
  label?: string;
  /** Main section title (rendered as h2). */
  title: string;
  /** Subtitle below the title. */
  subtitle?: string;
  /** Additional CSS classes for the wrapper. */
  className?: string;
}

export function SectionHeader({
  label,
  title,
  subtitle,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`mb-10 ${className}`}>
      {label && (
        <div className="mb-3 flex items-center gap-3">
          <div className="h-px w-8 bg-accent/40" />
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-accent">
            {label}
          </p>
        </div>
      )}
      <h2 className="font-serif">{title}</h2>
      {subtitle && (
        <p className="mt-2 text-base text-ink-muted leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
