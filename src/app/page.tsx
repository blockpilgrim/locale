// ---------------------------------------------------------------------------
// Homepage — Server component with client islands
// ---------------------------------------------------------------------------
// SEO-critical content (hero text, featured report cards) is server-rendered.
// The interactive AddressInput + generation flow is a client island
// (HomepageClient).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { HomepageClient } from "@/components/HomepageClient";

/** Hardcoded example report cards for discovery (Flow 3 in PRODUCT.md). */
const FEATURED_REPORTS = [
  {
    address: "350 5th Ave",
    city: "New York",
    state: "NY",
    teaser:
      "Midtown Manhattan at its most iconic -- sky-high density, world-class transit, and the Empire State Building as your neighbor.",
    slug: "350-5th-ave-new-york-ny",
  },
  {
    address: "1600 Pennsylvania Ave NW",
    city: "Washington",
    state: "DC",
    teaser:
      "The most famous address in America, nestled in a walkable corridor of monuments, museums, and government power.",
    slug: "1600-pennsylvania-ave-nw-washington-dc",
  },
  {
    address: "Fisherman's Wharf",
    city: "San Francisco",
    state: "CA",
    teaser:
      "Iconic waterfront living where sea lions, sourdough bread, and fog-kissed bay views define the daily rhythm.",
    slug: "fishermans-wharf-san-francisco-ca",
  },
  {
    address: "1000 Vin Scully Ave",
    city: "Los Angeles",
    state: "CA",
    teaser:
      "Echo Park-adjacent in the heart of LA -- a neighborhood where tacos, Dodger dogs, and cultural diversity collide.",
    slug: "1000-vin-scully-ave-los-angeles-ca",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero section */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-24">
        <main className="w-full max-w-(--container-prose) text-center">
          <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent">
            Neighborhood Intelligence
          </p>
          <h1 className="mb-6">
            Know the neighborhood
            <br />
            before you move in.
          </h1>
          <p className="text-lg text-ink-muted">
            Enter any US address and get an AI-powered, data-driven portrait of
            what it&apos;s actually like to live there.
          </p>

          {/* Client island: AddressInput + generation flow */}
          <HomepageClient />
        </main>
      </section>

      {/* Featured report cards */}
      <section className="border-t border-border-light bg-surface-warm px-6 py-20">
        <div className="mx-auto max-w-(--container-content)">
          <p className="mb-2 text-center text-xs font-medium tracking-widest uppercase text-accent">
            Explore
          </p>
          <h2 className="mb-4 text-center font-serif">
            See what a report looks like
          </h2>
          <p className="mx-auto mb-12 max-w-(--container-prose) text-center text-base text-ink-muted">
            Explore example reports for some of America&apos;s most iconic
            addresses. Reports are generated on first visit.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURED_REPORTS.map((report) => (
              <Link
                key={report.slug}
                href={`/report/${report.slug}`}
                className="group rounded-xl border border-border-light bg-surface p-6 shadow-sm transition-all hover:border-accent-muted hover:shadow-md"
              >
                <p className="text-xs font-medium tracking-wide uppercase text-accent">
                  {report.city}, {report.state}
                </p>
                <h3 className="mt-2 font-serif text-lg leading-snug text-ink group-hover:text-accent transition-colors">
                  {report.address}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {report.teaser}
                </p>
                <p className="mt-4 text-sm font-medium text-accent">
                  Explore &rarr;
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-light px-6 py-8">
        <p className="text-center text-xs text-ink-muted">
          Locale &mdash; AI-powered neighborhood intelligence. Data from U.S.
          Census Bureau, OpenStreetMap, and Mapbox. Narratives by Claude.
        </p>
      </footer>
    </div>
  );
}
