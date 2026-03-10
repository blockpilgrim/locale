// ---------------------------------------------------------------------------
// Shared Framer Motion animation variants
// ---------------------------------------------------------------------------
// Single source of truth for animation patterns used across components.
// ---------------------------------------------------------------------------

/** Standard fade-up reveal animation for sections entering the viewport. */
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
