"use client";

// ---------------------------------------------------------------------------
// WhatsNearbySection — POI categories, counts, nearest essentials
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import type { PoiResult, PoiCategory } from "@/lib/poi";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/Badge";

interface WhatsNearbySectionProps {
  poi: PoiResult | null;
  className?: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

/** Category labels and icons (emoji as lightweight icons). */
const CATEGORY_META: Record<
  PoiCategory,
  { label: string; icon: string }
> = {
  dining: { label: "Dining", icon: "fork.and.knife" },
  groceries: { label: "Groceries", icon: "cart" },
  parks: { label: "Parks", icon: "leaf" },
  fitness: { label: "Fitness", icon: "dumbbell" },
  nightlife: { label: "Nightlife", icon: "moon" },
  healthcare: { label: "Healthcare", icon: "cross" },
  shopping: { label: "Shopping", icon: "bag" },
  education: { label: "Education", icon: "book" },
};

/** Simple text-based category icon. */
const CATEGORY_ICONS: Record<PoiCategory, string> = {
  dining: "Dining",
  groceries: "Grocery",
  parks: "Parks",
  fitness: "Fitness",
  nightlife: "Nightlife",
  healthcare: "Health",
  shopping: "Shopping",
  education: "Education",
};

export function WhatsNearbySection({
  poi,
  className = "",
}: WhatsNearbySectionProps) {
  if (!poi) return null;
  if (poi.totalCount === 0) return null;

  const categoriesWithItems = poi.byCategory.filter((c) => c.count > 0);
  const { nearestEssentials } = poi;

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={className}
    >
      <SectionHeader
        label="Amenities"
        title="What's Nearby"
        subtitle={`${poi.totalCount} points of interest within walking distance`}
      />

      {/* Nearest essentials */}
      {(nearestEssentials.grocery ||
        nearestEssentials.pharmacy ||
        nearestEssentials.park) && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {nearestEssentials.grocery && (
            <div className="rounded-lg border border-border-light bg-surface p-5">
              <p className="text-xs font-medium tracking-wide uppercase text-ink-muted">
                Nearest Grocery
              </p>
              <p className="mt-1 font-serif text-lg text-ink">
                {nearestEssentials.grocery.name || "Unnamed"}
              </p>
              <p className="mt-1 text-sm text-accent font-medium">
                {nearestEssentials.grocery.walkingMinutes} min walk
              </p>
            </div>
          )}
          {nearestEssentials.pharmacy && (
            <div className="rounded-lg border border-border-light bg-surface p-5">
              <p className="text-xs font-medium tracking-wide uppercase text-ink-muted">
                Nearest Pharmacy
              </p>
              <p className="mt-1 font-serif text-lg text-ink">
                {nearestEssentials.pharmacy.name || "Unnamed"}
              </p>
              <p className="mt-1 text-sm text-accent font-medium">
                {nearestEssentials.pharmacy.walkingMinutes} min walk
              </p>
            </div>
          )}
          {nearestEssentials.park && (
            <div className="rounded-lg border border-border-light bg-surface p-5">
              <p className="text-xs font-medium tracking-wide uppercase text-ink-muted">
                Nearest Park
              </p>
              <p className="mt-1 font-serif text-lg text-ink">
                {nearestEssentials.park.name || "Unnamed"}
              </p>
              <p className="mt-1 text-sm text-accent font-medium">
                {nearestEssentials.park.walkingMinutes} min walk
              </p>
            </div>
          )}
        </div>
      )}

      {/* Category grid */}
      {categoriesWithItems.length > 0 && (
        <div>
          <h4 className="mb-4 font-serif text-lg">By Category</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {categoriesWithItems.map((cat) => {
              const meta = CATEGORY_META[cat.category];
              return (
                <div
                  key={cat.category}
                  className="rounded-lg border border-border-light bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">
                      {meta.label}
                    </span>
                    <Badge variant="accent">{cat.count}</Badge>
                  </div>
                  {/* Top named items */}
                  <div className="mt-2 space-y-1">
                    {cat.items
                      .filter((i) => i.name)
                      .slice(0, 3)
                      .map((item) => (
                        <p
                          key={item.id}
                          className="truncate text-xs text-ink-muted"
                          title={`${item.name} (${item.walkingMinutes} min walk)`}
                        >
                          {item.name}{" "}
                          <span className="text-ink-muted/60">
                            {item.walkingMinutes}m
                          </span>
                        </p>
                      ))}
                    {cat.count > 3 && (
                      <p className="text-xs text-ink-muted">
                        +{cat.count - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Density summary */}
      <div className="mt-8 flex flex-wrap gap-2">
        {categoriesWithItems.map((cat) => (
          <Badge key={cat.category} variant="muted">
            {CATEGORY_ICONS[cat.category]} ({cat.count})
          </Badge>
        ))}
      </div>

      <p className="mt-8 text-xs text-ink-muted">
        Source: OpenStreetMap via Overpass API
      </p>
    </motion.section>
  );
}
