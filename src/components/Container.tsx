// ---------------------------------------------------------------------------
// Container — Responsive content wrapper with variant widths
// ---------------------------------------------------------------------------

interface ContainerProps {
  /** Width variant matching design tokens. */
  variant?: "prose" | "content" | "wide";
  /** Additional CSS classes. */
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<string, string> = {
  prose: "max-w-(--container-prose)",
  content: "max-w-(--container-content)",
  wide: "max-w-(--container-wide)",
};

export function Container({
  variant = "content",
  className = "",
  children,
}: ContainerProps) {
  return (
    <div className={`mx-auto w-full px-6 ${variantClasses[variant]} ${className}`}>
      {children}
    </div>
  );
}
