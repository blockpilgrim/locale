// ---------------------------------------------------------------------------
// Shared formatting utilities
// ---------------------------------------------------------------------------

/** Format a number as USD currency (e.g., 72400 → "$72,400"). */
export function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}
