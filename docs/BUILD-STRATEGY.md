# BUILD STRATEGY: Locale

## 1. Tech Stack & Rationale

**Optimizing for:** Speed to market, highly dynamic server-side rendering (for SEO/shareability), seamless API orchestration, and developer ergonomics.
**Sacrificing:** Absolute infrastructure cost-efficiency at scale (favoring managed services initially).

* **Framework:** **Next.js (App Router)**
    * *Why:* Locale relies heavily on shareable URLs with rich Open Graph previews. Next.js excels at Server-Side Rendering (SSR) and dynamic metadata, ensuring shared links look great on social media. Its API routes allow us to securely orchestrate multiple external APIs and stream LLM responses back to the client.
* **Database:** **PostgreSQL (via Vercel Postgres / Neon)**
    * *Why:* We need to persist generated reports to power the "Shareable URLs" feature. Vercel Postgres (Neon under the hood) offers the tightest integration with the deploy target, zero-config connection pooling, and no additional service to manage. PostGIS can be enabled later if post-MVP features (e.g., "Neighborhoods Like This") require geospatial queries, but MVP has no such need.
* **Mapping & Geocoding:** **Mapbox GL JS + Mapbox APIs**
    * *Why:* Mapbox is the industry standard for highly customizable, editorial-quality interactive maps. It provides geocoding (autocomplete), routing (for the 5/10/15 min walkability isochrones), and smooth rendering of POI markers.
* **Styling:** **Tailwind CSS + Framer Motion**
    * *Why:* To achieve the "Magazine, Not Dashboard" design principle, we need precise, utility-first styling (Tailwind) and smooth, intentional micro-interactions and transitions (Framer Motion) to make the data reveal feel premium.
* **AI Synthesis:** **Anthropic Claude Sonnet 4.6 via Vercel AI SDK**
    * *Why:* The narrative is the hero feature and demands a model that maintains a specific, nuanced, and natural editorial voice without falling into the repetitive, boosterish "AI tone" (e.g., overusing words like "bustling," "tapestry," or "vibrant"). Claude Sonnet 4.6 offers the best balance of quality and cost for this use case. Vercel AI SDK handles the streaming plumbing cleanly with Next.js and provides a consistent interface if we ever need to swap models.

---

## 2. Architecture Overview


Locale will utilize a **Serverless API Orchestration** pattern. Because the core value is synthesizing disparate data sources, the backend will act as a coordinator rather than a heavy data-cruncher.

1.  **Client Layer:** Handles the address input, renders the Mapbox instance, and establishes a stream connection for the AI narrative.
2.  **Edge/Server Layer (Next.js):** * Receives the geocoded coordinates.
    * Fires parallel requests to public APIs (Census, Mapbox Isochrone, OpenStreetMap/POI provider).
    * Formats the returned JSON into a structured context prompt.
    * Sends the prompt to the LLM and streams the text response back to the client.
3.  **Persistence Layer:** When a report request is initiated, the server immediately writes a row to PostgreSQL with the slug, address, coordinates, and a `status: "generating"` flag. As the narrative stream completes and data resolves, the row is updated with the full payload (structured API data + final narrative text) and `status: "complete"`. Future requests for this address bypass the APIs and LLM entirely, serving instantly from the database. Shared links that hit a still-generating report display a brief loading state rather than a 404.
4.  **Rate Limiting:** The report generation endpoint is protected by IP-based rate limiting (e.g., Vercel Edge Middleware or upstash/ratelimit) to prevent abuse. Each report triggers paid API calls (Mapbox, LLM), so even for a portfolio piece, uncapped generation is a budget risk. A reasonable limit (e.g., 10 reports per IP per hour) prevents scripted abuse without affecting normal usage.

---

## 3. Data Architecture

The MVP requires a lightweight relational model, primarily focused on caching and retrieving generated reports.

* **`Location`:** The core entity. Stores the resolved address, latitude, longitude, city, state, and zip code.
* **`Report`:** Belongs to a Location. Contains the unique slug (for the shareable URL), the generated AI narrative, and a `JSONB` column storing the exact snapshot of data (demographics, housing, amenities) used to generate it.
    * *Why JSONB?* Storing the raw data alongside the narrative ensures the data visualizations on a shared report perfectly match the narrative, even if the underlying public API data changes months later.
* **`SearchQuery` (Optional but recommended):** Logs user inputs and autocomplete selections to analyze which neighborhoods are most requested and where the geocoder is failing.

---

## 4. Key Decisions & Trade-offs

### Decision 1: On-Demand Generation vs. Pre-Generation
* **Context:** Users expect instant results, but fetching 3-4 APIs and running an LLM prompt takes time (5-15 seconds).
* **Decision:** On-Demand Generation with Progressive Rendering (Streaming).
* **Rationale:** We cannot pre-generate every US address. We must fetch and generate on the fly. To mitigate the wait time, we will load the Mapbox UI immediately, populate the structured data sections as their respective API calls resolve, and stream the AI narrative character-by-character.
* **Trade-off:** Higher architectural complexity on the frontend to handle partial loading states, prioritized over the massive compute cost of pre-generating reports.

### Decision 2: Sourcing Point of Interest (POI) Data
* **Context:** "What's Nearby" requires accurate POI data. OpenStreetMap (OSM) is free but inconsistent. Google Places is accurate but expensive and has restrictive terms against using its data to power third-party AI models.
* **Decision:** Start with Mapbox POI API or a specialized provider like Radar/Foursquare, falling back to OSM via Overpass API only if necessary.
* **Rationale:** The "Vibe Check" relies heavily on amenity density (e.g., "coffee shops vs. dive bars"). If the POI data is sparse or inaccurate, the AI will hallucinate a false narrative, violating the "Data Is Real" principle. We must pay for reliable data here.
* **Trade-off:** Higher API operational costs in exchange for data integrity and narrative accuracy.

### Decision 3: Handling Missing Data
* **Context:** Census data or bike infrastructure data might be missing for rural or newly developed addresses.
* **Decision:** Graceful degradation. The prompt sent to the LLM will explicitly instruct it to ignore missing data fields rather than guess. The UI will hide missing sections rather than showing "N/A" or zero states.
* **Rationale:** Empty charts ruin the "Magazine" aesthetic. An honest report that focuses only on what *is* known builds more trust than a report filled with blank spaces.

### Decision 4: API Failure Handling
* **Context:** Progressive rendering means the report builds itself from multiple independent API calls. Any individual call can time out or fail, and the LLM could return low-quality output.
* **Decision:** Define a minimum viable report and degrade gracefully per-section.
* **Rationale:** The map (Mapbox) and at least one data source (Census or POI) must succeed for the report to be worth showing. If both fail, the user sees an error state with the option to retry. If one data source fails but others succeed, the report renders without that section and the AI narrative is generated from whatever data is available — with the prompt explicitly informed of what's missing. Individual section failures should never crash the full report.
* **Minimum viable report:** Map renders + at least one data section populates + AI narrative generates from available data.

---

## 5. Testing Philosophy

Right-sized for a solo, 2-week build. Testing infrastructure should earn its keep — heavy investment in what protects the core value proposition, minimal ceremony elsewhere.

* **Prompt Evaluation (Highest priority):** Maintain a "golden dataset" of 20 diverse US addresses (urban core, wealthy suburb, rural town, gentrifying neighborhood, newly developed area). When tweaking the LLM prompt, generate reports for all 20 and review them to ensure the "Vibe Check" remains honest, accurate, and consistent in tone. This is the single highest-ROI testing investment.
* **Mocked API Integration Tests:** Test the server layer's ability to handle the *shape* of external API responses, including edge cases (missing fields, partial data, timeouts). Mock Census, Mapbox, and LLM dependencies — running tests against live APIs is slow, expensive, and flaky.
* **Manual Visual QA:** Design is a core value proposition, but formal visual regression tooling (Percy, Chromatic) is overscoped for a solo 2-week build. Instead, manually verify layouts across 3–4 viewport widths (mobile, tablet, desktop, wide) and 2 browsers (Chrome, Safari) at key milestones. Revisit automated visual regression if the project grows beyond MVP.

---

## 6. Performance Considerations

* **Parallel Fetching:** The Next.js backend must use `Promise.all` to fetch Demographics, Housing, and POI data concurrently before passing it to the LLM. Sequential fetching will kill the user experience.
* **Vector Tiles for Maps:** Ensure Mapbox is utilizing vector tiles rather than raster images, keeping the initial map load under 1 second, especially on mobile networks.
* **Edge Caching:** Once a report is generated and saved to the database, its unique URL route should be heavily cached at the CDN level (e.g., Vercel Edge Network). A viral shared report on Twitter should result in zero database or LLM hits after the first load.
