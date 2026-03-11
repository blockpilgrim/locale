// ---------------------------------------------------------------------------
// Homepage — Server component with client islands
// ---------------------------------------------------------------------------
// SEO-critical content (hero text, featured report cards) is server-rendered.
// The interactive AddressInput + generation flow is a client island
// (HomepageClient).
// ---------------------------------------------------------------------------

import { HomepageClient } from "@/components/HomepageClient";
import { FeaturedCard } from "@/components/FeaturedCard";

/** Hardcoded example report cards for discovery (Flow 3 in PRODUCT.md).
 *  Includes coordinates so FeaturedCard can POST to /api/report/generate. */
const FEATURED_REPORTS = [
  {
    address: "350 5th Ave",
    fullAddress: "350 5th Ave, New York, NY 10118",
    city: "New York",
    state: "NY",
    teaser:
      "Midtown Manhattan at its most iconic -- sky-high density, world-class transit, and the Empire State Building as your neighbor.",
    latitude: 40.7484,
    longitude: -73.9857,
  },
  {
    address: "1600 Pennsylvania Ave NW",
    fullAddress: "1600 Pennsylvania Ave NW, Washington, DC 20500",
    city: "Washington",
    state: "DC",
    teaser:
      "The most famous address in America, nestled in a walkable corridor of monuments, museums, and government power.",
    latitude: 38.8977,
    longitude: -77.0365,
  },
  {
    address: "Fisherman's Wharf",
    fullAddress: "Fisherman's Wharf, San Francisco, CA 94133",
    city: "San Francisco",
    state: "CA",
    teaser:
      "Iconic waterfront living where sea lions, sourdough bread, and fog-kissed bay views define the daily rhythm.",
    latitude: 37.808,
    longitude: -122.4177,
  },
  {
    address: "1000 Vin Scully Ave",
    fullAddress: "1000 Vin Scully Ave, Los Angeles, CA 90012",
    city: "Los Angeles",
    state: "CA",
    teaser:
      "Echo Park-adjacent in the heart of LA -- a neighborhood where tacos, Dodger dogs, and cultural diversity collide.",
    latitude: 34.0739,
    longitude: -118.24,
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero section — warm gradient with editorial typography */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pt-32">
        {/* Background gradient */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(45,90,61,0.06) 0%, transparent 70%), linear-gradient(180deg, #FAF7F2 0%, #F5F0E8 100%)",
          }}
        />

        <main className="relative z-10 w-full max-w-xl text-center">
          {/* Logo/brand mark */}
          <div className="mb-8 flex items-center justify-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-accent">
              Neighborhood Intelligence
            </p>
            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
          </div>

          <h1 className="mb-6 leading-[1.08]">
            Know your neighborhood
            <br />
            <span className="text-accent">before you move in.</span>
          </h1>

          <p className="mx-auto max-w-md text-lg leading-relaxed text-ink-muted">
            Enter any US address and get an AI-powered, data-driven portrait of
            what it&apos;s actually like to live there.
          </p>

          {/* Client island: AddressInput + generation flow */}
          <HomepageClient />
        </main>
      </section>

      {/* Featured report cards */}
      <section className="relative border-t border-border-light px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-(--container-content)">
          <div className="mb-12 flex items-center gap-3 justify-center">
            <div className="h-px w-12 bg-accent/30" />
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-accent">
              Explore
            </p>
            <div className="h-px w-12 bg-accent/30" />
          </div>

          <h2 className="mb-4 text-center font-serif">
            See what a report looks like
          </h2>
          <p className="mx-auto mb-14 max-w-(--container-prose) text-center text-base text-ink-muted leading-relaxed">
            Explore example reports for some of America&apos;s most iconic
            addresses. Reports are generated on first visit.
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURED_REPORTS.map((report) => (
              <FeaturedCard key={report.fullAddress} report={report} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-light px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-(--container-content) flex flex-col items-center gap-3">
          <p className="font-serif text-sm font-semibold tracking-tight text-ink">
            Locale
          </p>
          <p className="text-center text-xs text-ink-muted leading-relaxed">
            AI-powered neighborhood intelligence. Data from U.S. Census Bureau,
            OpenStreetMap, and Mapbox. Narratives by Claude.
          </p>
        </div>
      </footer>
    </div>
  );
}
