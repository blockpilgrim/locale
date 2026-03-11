"use client";

// ---------------------------------------------------------------------------
// WhatsNearbySection — POI categories, counts, nearest essentials
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import type { PoiResult, PoiCategory } from "@/lib/poi";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/Badge";
import { fadeUp } from "@/lib/motion";

interface WhatsNearbySectionProps {
  poi: PoiResult | null;
  className?: string;
}

/** Category display labels. */
const CATEGORY_META: Record<PoiCategory, { label: string }> = {
  dining: { label: "Dining" },
  groceries: { label: "Groceries" },
  parks: { label: "Parks" },
  fitness: { label: "Fitness" },
  nightlife: { label: "Nightlife" },
  healthcare: { label: "Healthcare" },
  shopping: { label: "Shopping" },
  education: { label: "Education" },
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
        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {nearestEssentials.grocery && (
            <div className="relative overflow-hidden rounded-xl border border-border-light bg-surface p-5 sm:p-6">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-data-1/30 via-data-1/60 to-data-1/30" />
              <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
                Nearest Grocery
              </p>
              <p className="mt-1.5 font-serif text-base text-ink sm:text-lg truncate">
                {nearestEssentials.grocery.name || "Unnamed"}
              </p>
              <p className="mt-2 text-sm text-accent font-semibold">
                {nearestEssentials.grocery.walkingMinutes} min walk
              </p>
            </div>
          )}
          {nearestEssentials.pharmacy && (
            <div className="relative overflow-hidden rounded-xl border border-border-light bg-surface p-5 sm:p-6">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-data-4/30 via-data-4/60 to-data-4/30" />
              <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
                Nearest Pharmacy
              </p>
              <p className="mt-1.5 font-serif text-base text-ink sm:text-lg truncate">
                {nearestEssentials.pharmacy.name || "Unnamed"}
              </p>
              <p className="mt-2 text-sm text-accent font-semibold">
                {nearestEssentials.pharmacy.walkingMinutes} min walk
              </p>
            </div>
          )}
          {nearestEssentials.park && (
            <div className="relative overflow-hidden rounded-xl border border-border-light bg-surface p-5 sm:p-6">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent/30 via-accent/60 to-accent/30" />
              <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
                Nearest Park
              </p>
              <p className="mt-1.5 font-serif text-base text-ink sm:text-lg truncate">
                {nearestEssentials.park.name || "Unnamed"}
              </p>
              <p className="mt-2 text-sm text-accent font-semibold">
                {nearestEssentials.park.walkingMinutes} min walk
              </p>
            </div>
          )}
        </div>
      )}

      {/* Category grid */}
      {categoriesWithItems.length > 0 && (
        <div>
          <h4 className="mb-5 font-serif text-lg">By Category</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {categoriesWithItems.map((cat) => {
              const meta = CATEGORY_META[cat.category];
              return (
                <div
                  key={cat.category}
                  className="rounded-xl border border-border-light bg-surface p-4 sm:p-5 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">
                      {meta.label}
                    </span>
                    <Badge variant="accent">{cat.count}</Badge>
                  </div>
                  {/* Top named items */}
                  <div className="mt-3 space-y-1.5">
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
                          <span className="text-accent/60 font-medium">
                            {item.walkingMinutes}m
                          </span>
                        </p>
                      ))}
                    {cat.count > 3 && (
                      <p className="text-xs text-ink-muted font-medium">
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
            {CATEGORY_META[cat.category].label} ({cat.count})
          </Badge>
        ))}
      </div>

      <p className="mt-10 border-t border-border-light pt-4 text-xs text-ink-muted">
        Source: OpenStreetMap via Overpass API
      </p>
    </motion.section>
  );
}
