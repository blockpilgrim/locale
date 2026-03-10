// ---------------------------------------------------------------------------
// SectionHeader — Section heading with optional label and subtitle
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
    <div className={`mb-8 ${className}`}>
      {label && (
        <p className="mb-2 text-xs font-medium tracking-widest uppercase text-accent">
          {label}
        </p>
      )}
      <h2 className="font-serif">{title}</h2>
      {subtitle && (
        <p className="mt-2 text-base text-ink-muted">{subtitle}</p>
      )}
    </div>
  );
}
