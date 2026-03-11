// ---------------------------------------------------------------------------
// Shared Framer Motion animation variants
// ---------------------------------------------------------------------------
// Single source of truth for animation patterns used across components.
// Import from here -- do not redefine per-component.
// ---------------------------------------------------------------------------

/** Standard fade-up reveal animation for sections entering the viewport. */
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

/** Simple opacity fade for subtle reveals. */
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/** Scale-in for cards and contained elements. */
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

/** Use as parent container with staggerChildren for cascading reveals. */
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};
