// ---------------------------------------------------------------------------
// Skeleton — Loading placeholder with shimmer animation
// ---------------------------------------------------------------------------

interface SkeletonProps {
  /** Width class (e.g., "w-full", "w-3/4"). Defaults to full width. */
  width?: string;
  /** Height class (e.g., "h-4", "h-8"). Defaults to h-4. */
  height?: string;
  /** Whether to apply rounded-full for circular shapes. */
  rounded?: boolean;
  /** Additional CSS classes. */
  className?: string;
}

export function Skeleton({
  width = "w-full",
  height = "h-4",
  rounded = false,
  className = "",
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-warm-200 ${width} ${height} ${rounded ? "rounded-full" : "rounded"} ${className}`}
      aria-hidden="true"
    />
  );
}

/** A group of skeleton lines for text-like loading states. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? "w-2/3" : "w-full"}
          height="h-4"
        />
      ))}
    </div>
  );
}
