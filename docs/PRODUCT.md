# PRODUCT.md — Locale

---

## Vision

Locale transforms any US address into a beautifully designed, AI-narrated neighborhood intelligence report. It gives people the kind of local knowledge that usually takes months of living somewhere to develop — synthesized from public data and delivered as a rich, shareable narrative in seconds.

## Problem Statement

People making where-to-live decisions — relocating for a job, exploring remote-work flexibility, weighing neighborhoods within a city — face a fragmented information landscape. Zillow and Redfin are optimized to sell listings. Niche.com and AreaVibes surface raw stats with little context. Google Maps answers "what's nearby" but not "what's it like." Social media is anecdotal and biased.

No single product synthesizes publicly available data into a narrative that conveys what a place actually *feels like* to live in. The gap between "median household income: $72,400" and "this is a neighborhood where young families walk to the farmers market on Saturday mornings" is where real understanding lives — and that gap is currently filled only by word-of-mouth and personal experience.

Locale closes that gap.

## Personas

### 1. The Relocator — Maya

**Background:** 31, UX designer. Received a job offer in Denver. Currently lives in Philadelphia. Has visited Denver twice as a tourist but has no sense of the neighborhoods.

**Goals:**
- Quickly understand the character and livability of 3–4 Denver neighborhoods
- Compare them along dimensions she cares about (walkability, food scene, proximity to work)
- Feel confident she's choosing a neighborhood that fits her lifestyle, not just her commute

**Pain points:**
- Zillow shows her listings, not neighborhoods
- Reddit threads are 3 years old and contradictory
- She doesn't know anyone in Denver to ask
- Visiting each neighborhood in person would take days she doesn't have

**How Locale helps:** Maya enters candidate addresses and gets instant, data-backed narratives that tell her what daily life looks like in each area — what she can walk to, who her neighbors would be, and what the tradeoffs are.

### 2. The Curious Local — David

**Background:** 42, accountant. Has lived in his Chicago neighborhood for 8 years. Saw a Locale report shared on Twitter and wants to see what the data says about his own block.

**Goals:**
- See his neighborhood reflected through data — demographics, amenities, walkability
- Validate (or challenge) his own lived experience against objective data
- Share the report with friends as a conversation piece

**Pain points:**
- Has never seen a comprehensive, well-designed profile of his own neighborhood
- Census data exists but is impenetrable
- Finds it amusing/interesting to see familiar places described through a fresh lens

**How Locale helps:** David enters his address, reads the AI narrative, and thinks "yeah, that's exactly right" — or "huh, I never thought of it that way." He shares the link with neighbors. This is the viral use case.

### 3. The Remote Explorer — Anika

**Background:** 28, software engineer. Works fully remote. Currently in a small town and considering moving somewhere with more energy. Has complete geographic flexibility but finds it paralyzing.

**Goals:**
- Explore neighborhoods in cities she's considering (Austin, Portland, Raleigh) without visiting
- Understand what daily life looks like for someone without a commute
- Find areas that match her priorities: walkable, good coffee shops, under $1,800/month rent

**Pain points:**
- Too many options with no framework for narrowing them down
- Cost-of-living calculators give a number but no texture
- "Best neighborhoods" listicles are generic and sponsored
- She can't visit 6 cities to "get a feel" for each one

**How Locale helps:** Anika explores candidate addresses and gets rich, opinionated narratives that go beyond stats — helping her develop a feel for places she's never set foot in.

---

## Design Principles

### 1. Every Section Must Earn Its Existence Beyond Text

The primary differentiator over asking an AI chatbot "tell me about this neighborhood" is that Locale is a *visual, interactive, data-driven product* — not a text response. Every section of the report must provide value that a chat response fundamentally cannot: interactive maps, isochrone overlays, structured data visualizations, geographic context, plotted POI markers. If a section could be fully replaced by a paragraph of text, it needs to be rethought or cut.

### 2. Data Is Real, Not Generated

The AI narrative synthesizes and interprets — but the underlying data comes from public APIs (Census, OpenStreetMap, Mapbox), not from the AI's training data. This is what makes Locale reliable for *any* US address, including suburban and less-known areas where a chatbot would hallucinate or resort to city-level generics. Data provenance should be visible and attributable throughout.

### 3. Magazine, Not Dashboard

The report format is a designed, editorial experience — closer to a Monocle city guide than a Grafana dashboard. Information is sequenced for narrative flow, not dumped in a grid. Each section has a clear purpose in the story of "what's it like to live here." The design quality itself is part of the product's value proposition.

### 4. Honest Over Flattering

The AI narrative and data presentation must acknowledge tradeoffs and shortcomings. Generic boosterism ("great neighborhood!") destroys trust. Specificity and honesty ("walkable to restaurants but you'll drive to the grocery store") build it. The tone is a knowledgeable local friend — warm but candid.

---

## Features

### MVP

#### 1. Address Input with Geocoding Autocomplete

**Description:** A polished input experience that accepts any US street address and resolves it to precise coordinates. Autocomplete suggestions appear as the user types, reducing friction and preventing invalid entries.

**User stories:**
- As a user, I can type a partial address and select from autocomplete suggestions so that I don't need to know the exact format
- As a user, I receive clear feedback if my address can't be resolved

**Acceptance criteria:**
- Autocomplete suggestions appear after 3+ characters
- Suggestions are limited to US addresses
- Selecting a suggestion immediately initiates report generation
- Invalid or unresolvable addresses surface a clear, helpful error state

---

#### 2. Interactive Neighborhood Map

**Description:** A map centered on the input address showing the surrounding area, with a walkability isochrone overlay indicating what's reachable on foot within 5, 10, and 15 minutes. Nearby points of interest are plotted as categorized markers.

**User stories:**
- As a user, I can see my selected address in geographic context so that I understand its physical surroundings
- As a user, I can see how far I could walk in 5, 10, and 15 minutes so that I understand the area's walkability
- As a user, I can see nearby amenities plotted on the map so that I understand what's accessible

**Acceptance criteria:**
- Map renders centered on the input address with an appropriate zoom level
- Isochrone rings for 5, 10, and 15-minute walking distances are displayed
- Nearby POIs are plotted with category-appropriate markers
- Map is interactive (pan, zoom) on both desktop and mobile
- Map loads within a reasonable timeframe and does not block other report content

---

#### 3. Neighborhood Data Sections

**Description:** Structured data presented across distinct thematic sections, each with purposeful visualizations. Data is sourced from public APIs and presented in context — not as raw stats, but as information with meaning.

**Sections:**

**a. Demographics Snapshot**
- Population density, median age, household composition (singles, families, roommates)
- Educational attainment, racial/ethnic diversity index
- How this area compares to the city and national averages

**b. Housing Profile**
- Median home value and median rent
- Owner vs. renter ratio
- Age of housing stock (pre-war, mid-century, new construction)
- Housing density and type (single-family, apartments, mixed)

**c. Getting Around**
- Walkability assessment based on isochrone analysis and POI density
- Transit stop count and proximity
- Commute patterns (how residents get to work, average commute time)
- Bike infrastructure presence (where data is available)

**d. What's Nearby — Amenity Landscape**
- Categorized count and breakdown of nearby POIs (dining, groceries, parks, fitness, nightlife, healthcare, shopping, education)
- Notable density or absence of specific categories
- Walking/biking time to nearest essentials (grocery store, pharmacy, park)

**e. Economic Profile**
- Median household income
- Employment rate and dominant industries
- Context: how income compares to local cost of living

**User stories:**
- As a user, I can understand the demographic makeup of the neighborhood so that I know who my potential neighbors are
- As a user, I can understand the housing market at a glance so that I can assess affordability
- As a user, I can see what's within walking distance so that I can evaluate daily convenience
- As a user, I can see economic context so that I can gauge the area's stability and character

**Acceptance criteria:**
- Each section displays real data sourced from public APIs (Census ACS, OpenStreetMap, Mapbox)
- Data is contextualized with comparisons (vs. city average, vs. national average) where meaningful
- Visualizations are used where they communicate more effectively than numbers alone
- Sections gracefully handle missing or unavailable data without breaking the report
- All data sources are attributed

---

#### 4. The Vibe Check — AI Neighborhood Narrative

**Description:** The centerpiece of every report. A 3–5 paragraph AI-generated narrative that synthesizes all available data into a vivid, opinionated-but-fair portrait of what the neighborhood feels like. Written in the voice of a knowledgeable local friend — warm, specific, honest about tradeoffs.

The narrative should cover:
- Overall character and personality of the area
- Who tends to live here and what daily life looks like
- Standout qualities (what makes this area distinctive)
- Honest shortcomings or tradeoffs
- A sense of the area's trajectory (stable, changing, emerging) where data supports it

**User stories:**
- As a user, I want a plain-language summary of what the neighborhood is like so that I can quickly assess whether it fits my lifestyle
- As a user, I want the narrative to feel honest and specific — not generic or boosterish — so that I can trust its perspective
- As a user, I want the narrative to surface insights I wouldn't get from raw data alone

**Acceptance criteria:**
- Narrative is generated from actual data (demographics, amenities, walkability, economics) — never fabricated
- Tone is warm, specific, and conversational — like a knowledgeable friend, not a real estate listing
- Narrative acknowledges tradeoffs and shortcomings, not just positives
- Each report's narrative is unique and specific to that location — no generic filler
- Narrative renders within an acceptable timeframe (streaming permitted)

---

#### 5. Shareable Report URLs

**Description:** Every generated report is persisted and accessible at a unique, human-readable URL. When shared on social media or messaging, the link renders a rich preview (title, neighborhood summary, map thumbnail) that invites clicks.

**User stories:**
- As a user, I want to share a report with a friend or partner by sending them a link
- As a user, I want the shared link to display a compelling preview on social media and messaging apps
- As someone who received a shared link, I want to see the full report without needing to sign up or re-enter the address

**Acceptance criteria:**
- Each report has a unique, persistent URL
- Shared links render Open Graph previews (title, description, image)
- Reports are accessible without authentication
- Shared report pages include a clear entry point to generate a new report

---

#### 6. Responsive Design

**Description:** The entire experience — input, map, data sections, narrative, sharing — works beautifully on both desktop and mobile. This is not a "works on mobile" checkbox; the mobile experience should feel intentional and considered.

**User stories:**
- As a mobile user, I can generate and read a full report with the same quality as on desktop
- As a mobile user sharing a link from social media, I land on a polished, readable experience

**Acceptance criteria:**
- All report sections are readable and navigable on screens 375px and wider
- Map is interactive and usable on touch devices
- Data visualizations adapt appropriately to smaller viewports
- No horizontal scrolling on any standard device width

---

### Post-MVP

#### 1. Side-by-Side Comparison

**Description:** Generate reports for two addresses and view them in a comparison layout that highlights differences and similarities across every dimension. Designed for the core "which neighborhood should I choose?" decision.

**User stories:**
- As a user weighing two neighborhoods, I want to see them compared directly so that differences are immediately visible
- As a user, I want the AI to summarize the key tradeoffs between the two areas

**Acceptance criteria:**
- User can select two addresses for comparison
- All data sections display side-by-side with highlighted differences
- AI generates a comparative narrative summarizing tradeoffs
- Comparison reports are shareable via unique URLs

---

#### 2. Personalized Relevance Filters

**Description:** Before generating a report, users can indicate what matters most to them (e.g., walkability, nightlife, family-friendliness, affordability). The report then emphasizes those dimensions and the AI narrative is tailored to their priorities.

**User stories:**
- As a user with specific lifestyle priorities, I want the report to emphasize what I care about so that I can evaluate fitness quickly
- As a user who doesn't care about schools, I don't want school-adjacent data taking up real estate in my report

**Acceptance criteria:**
- Users can select 2–3 priority dimensions before generating a report
- Data sections and narrative are weighted toward selected priorities
- Default (no priorities selected) produces a balanced, general report

---

#### 3. "Neighborhoods Like This"

**Description:** Based on the demographic, amenity, and character profile of the current neighborhood, suggest similar neighborhoods in other cities. Helps users discover new places and supports the "where should I move?" use case.

**User stories:**
- As a user who loves my current neighborhood, I want to find similar areas in cities I'm considering moving to
- As an explorer, I want to discover neighborhoods I wouldn't have found on my own

---

#### 4. PDF Export

**Description:** Download the full report as a well-formatted PDF for offline reference, printing, or sharing with people who prefer documents over links.

---

#### 5. Neighborhood Personality Archetype

**Description:** Classify each neighborhood into an archetype (e.g., "College Town Energy," "Quiet Suburbia with a Pulse," "Gritty Arts District in Transition") based on data patterns. A memorable label that makes reports more shareable and comparable.

---

## User Flows

### Flow 1: Generate a Report (Primary)

1. User lands on the homepage
2. User sees a prominent address input with a clear value proposition
3. User types an address; autocomplete suggestions appear
4. User selects an address
5. Loading state is displayed while data is fetched and the AI narrative is generated
6. Report loads: map, narrative, and data sections populate
7. User scrolls through the report, exploring each section
8. User interacts with the map (pan, zoom, tap POI markers)
9. User shares the report via URL or social sharing controls
10. User optionally enters a new address to generate another report

### Flow 2: View a Shared Report (Secondary)

1. User clicks a shared link (from social media, messaging, or email)
2. Full pre-generated report loads immediately
3. User reads and explores the report
4. User sees a clear call-to-action to generate a report for their own address
5. User enters their own address → transitions to Flow 1, step 4

### Flow 3: Explore from Homepage (Discovery)

1. User lands on the homepage
2. User sees featured/example reports for well-known neighborhoods
3. User clicks an example report to see what a full report looks like
4. User is inspired to generate a report for their own address → transitions to Flow 1, step 3

---

## Success Metrics

### Engagement
- **Reports generated** — primary indicator of product utility
- **Report completion rate** — percentage of users who scroll through the full report (vs. bouncing after the map)
- **Time on report** — depth of engagement with generated content

### Virality
- **Share rate** — reports shared / reports generated
- **Referral traffic** — visits originating from shared report links
- **Social mentions** — organic references on social media

### Retention
- **Multi-report users** — users who generate reports for 2+ addresses in a session
- **Return visits** — users who come back to generate new reports

### Quality
- **Narrative relevance** — qualitative assessment that AI narratives are specific, accurate, and insightful (not generic)
- **Data accuracy** — spot-check alignment between reported data and source data

---

*This document describes what Locale is and who it serves. It does not prescribe technical implementation, go-to-market strategy, or timeline.*
