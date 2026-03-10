// ---------------------------------------------------------------------------
// Badge — Small label/tag for categories (e.g., POI categories)
// ---------------------------------------------------------------------------

interface BadgeProps {
  /** Badge text content. */
  children: React.ReactNode;
  /** Visual variant. */
  variant?: "default" | "accent" | "muted";
  /** Additional CSS classes. */
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: "bg-warm-100 text-ink-light",
  accent: "bg-accent-subtle text-accent",
  muted: "bg-warm-50 text-ink-muted",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
