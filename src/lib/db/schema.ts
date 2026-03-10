import {
  pgTable,
  serial,
  text,
  doublePrecision,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").unique().notNull(),
    status: text("status", { enum: ["generating", "complete", "failed"] })
      .default("generating")
      .notNull(),
    data: jsonb("data"),
    narrative: text("narrative"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("reports_location_id_idx").on(table.locationId)],
);

// ---------------------------------------------------------------------------
// Search Queries (analytics)
// ---------------------------------------------------------------------------
export const searchQueries = pgTable("search_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  selectedAddress: text("selected_address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
