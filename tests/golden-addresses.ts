// ---------------------------------------------------------------------------
// Golden Dataset: 20 Diverse US Addresses for Prompt Evaluation (T7.1)
// ---------------------------------------------------------------------------
// Each address represents a distinct neighborhood archetype to test the AI
// narrative's ability to adapt tone, themes, and data interpretation.
// ---------------------------------------------------------------------------

export interface GoldenAddress {
  /** Full street address. */
  address: string;
  /** Latitude. */
  lat: number;
  /** Longitude. */
  lng: number;
  /** Short kebab-case descriptor for file naming. */
  label: string;
  /** Why this address tests a specific narrative scenario. */
  description: string;
  /** Themes the narrative should touch on (for human review). */
  expectedThemes: string[];
}

export const goldenAddresses: GoldenAddress[] = [
  // 1. Dense urban core
  {
    address: "30 Rockefeller Plaza, New York, NY 10112",
    lat: 40.7587,
    lng: -73.9787,
    label: "dense-urban-manhattan",
    description:
      "Midtown Manhattan. Extreme density, high rents, world-class transit, corporate offices. Tests narrative handling of ultra-urban context.",
    expectedThemes: [
      "extreme density",
      "high cost of living",
      "walkability",
      "public transit dominance",
      "mixed-use commercial/residential",
    ],
  },

  // 2. Urban residential
  {
    address: "456 DeKalb Ave, Brooklyn, NY 11205",
    lat: 40.6907,
    lng: -73.9689,
    label: "urban-residential-brooklyn",
    description:
      "Fort Greene/Clinton Hill, Brooklyn. Brownstone residential area with strong community identity. Tests nuanced neighborhood voice.",
    expectedThemes: [
      "brownstone architecture",
      "walkable neighborhood",
      "mix of renters and owners",
      "cultural institutions nearby",
      "transit access",
    ],
  },

  // 3. Wealthy suburb
  {
    address: "650 University Ave, Palo Alto, CA 94301",
    lat: 37.4419,
    lng: -122.1430,
    label: "wealthy-suburb-palo-alto",
    description:
      "Palo Alto downtown area. Extremely high home values, educated population, tech industry influence. Tests handling of wealth indicators.",
    expectedThemes: [
      "extremely high home values",
      "highly educated population",
      "tech industry proximity",
      "low density for urban area",
      "bike-friendly",
    ],
  },

  // 4. Middle-class suburb
  {
    address: "100 E Main St, Westerville, OH 43081",
    lat: 40.1262,
    lng: -82.9291,
    label: "middle-class-suburb-ohio",
    description:
      "Westerville, Ohio. Typical middle-class suburb of Columbus. Tests narrative for unremarkable but pleasant areas.",
    expectedThemes: [
      "family-oriented",
      "moderate home prices",
      "car-dependent",
      "suburban amenities",
      "stable community",
    ],
  },

  // 5. College town
  {
    address: "530 S State St, Ann Arbor, MI 48109",
    lat: 40.1092,
    lng: -83.7137,
    label: "college-town-ann-arbor",
    description:
      "Near University of Michigan campus. High rental rates, young population skew, vibrant food/nightlife. Tests age demographics narrative.",
    expectedThemes: [
      "university influence",
      "young population",
      "rental-heavy market",
      "walkable downtown",
      "food and nightlife",
    ],
  },

  // 6. Rural small town
  {
    address: "101 Main St, Galena, IL 61036",
    lat: 42.4167,
    lng: -90.4290,
    label: "rural-small-town-galena",
    description:
      "Galena, Illinois. Historic small town, low density, limited amenities. Tests narrative with sparse POI data and low population.",
    expectedThemes: [
      "small-town character",
      "historic architecture",
      "limited walkable amenities",
      "car-dependent",
      "tourism influence",
    ],
  },

  // 7. Gentrifying neighborhood
  {
    address: "2200 N Milwaukee Ave, Chicago, IL 60647",
    lat: 41.9214,
    lng: -87.6942,
    label: "gentrifying-logan-square",
    description:
      "Logan Square, Chicago. Active gentrification with rising rents and shifting demographics. Tests honest treatment of neighborhood change.",
    expectedThemes: [
      "demographic shift",
      "rising housing costs",
      "mix of old and new businesses",
      "transit access",
      "cultural tension",
    ],
  },

  // 8. Newly developed exurb
  {
    address: "4500 E Palm Valley Blvd, Round Rock, TX 78665",
    lat: 30.5268,
    lng: -97.6289,
    label: "new-development-round-rock",
    description:
      "Round Rock, TX (Austin exurb). Rapid new construction, young families, tech workers. Tests narrative for areas with new housing stock.",
    expectedThemes: [
      "rapid growth",
      "new construction",
      "family-oriented",
      "tech employment",
      "car-dependent suburban",
    ],
  },

  // 9. Food/nightlife district
  {
    address: "1014 Mission St, San Francisco, CA 94103",
    lat: 37.7793,
    lng: -122.4107,
    label: "nightlife-soma-sf",
    description:
      "SoMa, San Francisco. Dense nightlife and dining district. Tests POI-heavy narrative with high amenity counts.",
    expectedThemes: [
      "dense dining options",
      "nightlife scene",
      "high density mixed-use",
      "tech office proximity",
      "high cost of living",
    ],
  },

  // 10. Retirement community area
  {
    address: "1500 Villagio Circle, Sarasota, FL 34237",
    lat: 27.3364,
    lng: -82.5307,
    label: "retirement-sarasota",
    description:
      "Sarasota, Florida. Older population, healthcare amenities, warm climate. Tests narrative for retirement-oriented demographics.",
    expectedThemes: [
      "older population",
      "healthcare access",
      "low unemployment",
      "warm climate lifestyle",
      "owner-occupied housing",
    ],
  },

  // 11. High density mixed-use
  {
    address: "1500 Chestnut St, Philadelphia, PA 19102",
    lat: 39.9509,
    lng: -75.1674,
    label: "mixed-use-center-city-philly",
    description:
      "Center City Philadelphia. Dense mixed-use with retail, residential, and office. Tests narrative balancing multiple land uses.",
    expectedThemes: [
      "walkable urban core",
      "mixed-use development",
      "public transit",
      "historic architecture",
      "diverse dining",
    ],
  },

  // 12. Industrial/transitional area
  {
    address: "3000 W 48th Pl, Chicago, IL 60632",
    lat: 41.8068,
    lng: -87.7063,
    label: "industrial-brighton-park-chicago",
    description:
      "Brighton Park/Back of the Yards, Chicago. Industrial corridor with working-class residential. Tests honest narrative for less-polished areas.",
    expectedThemes: [
      "industrial character",
      "working-class community",
      "affordable housing",
      "immigrant community",
      "limited walkable amenities",
    ],
  },

  // 13. Historic district
  {
    address: "22 Meeting St, Charleston, SC 29401",
    lat: 32.7735,
    lng: -79.9318,
    label: "historic-charleston",
    description:
      "Historic downtown Charleston. Pre-1950 housing stock, tourism, preserved architecture. Tests year-built data narrative.",
    expectedThemes: [
      "historic architecture",
      "tourism economy",
      "high home values",
      "walkable historic core",
      "cultural heritage",
    ],
  },

  // 14. Beach/coastal community
  {
    address: "200 Pacific Coast Hwy, Hermosa Beach, CA 90254",
    lat: 33.8622,
    lng: -118.3990,
    label: "coastal-hermosa-beach",
    description:
      "Hermosa Beach, California. Coastal living, beach culture, high rents. Tests lifestyle-oriented narrative.",
    expectedThemes: [
      "beach lifestyle",
      "high housing costs",
      "active outdoor culture",
      "walkable beach town",
      "tourism influence",
    ],
  },

  // 15. Mountain/resort town
  {
    address: "100 E Meadow Dr, Vail, CO 81657",
    lat: 39.6403,
    lng: -106.3742,
    label: "mountain-resort-vail",
    description:
      "Vail, Colorado. Ski resort town with seasonal economy. Tests narrative for resort/tourism-driven areas.",
    expectedThemes: [
      "resort economy",
      "seasonal population swings",
      "extremely high home values",
      "outdoor recreation",
      "small permanent population",
    ],
  },

  // 16. Military base adjacent
  {
    address: "2001 S Clear Creek Rd, Killeen, TX 76549",
    lat: 31.0989,
    lng: -97.7281,
    label: "military-adjacent-killeen",
    description:
      "Killeen, TX (near Fort Cavazos). Military base economy, young transient population. Tests narrative for military-influenced areas.",
    expectedThemes: [
      "military base economy",
      "young population",
      "rental-heavy market",
      "affordable housing",
      "transient community",
    ],
  },

  // 17. Diverse immigrant neighborhood
  {
    address: "73-01 Roosevelt Ave, Jackson Heights, NY 11372",
    lat: 40.7496,
    lng: -73.8780,
    label: "immigrant-jackson-heights",
    description:
      "Jackson Heights, Queens. One of the most diverse neighborhoods in the US. Tests race/ethnicity data narrative.",
    expectedThemes: [
      "extreme diversity",
      "immigrant communities",
      "dense urban residential",
      "public transit dependent",
      "diverse food scene",
    ],
  },

  // 18. Arts/creative district
  {
    address: "1535 NW Flanders St, Portland, OR 97209",
    lat: 45.5266,
    lng: -122.6884,
    label: "arts-district-portland",
    description:
      "Pearl District, Portland. Converted warehouses, galleries, creative economy. Tests narrative for arts/culture-oriented areas.",
    expectedThemes: [
      "creative economy",
      "converted industrial space",
      "walkable urban",
      "high rents",
      "dining and nightlife",
    ],
  },

  // 19. Tech hub neighborhood
  {
    address: "400 Broad St, Seattle, WA 98109",
    lat: 47.6205,
    lng: -122.3493,
    label: "tech-hub-south-lake-union",
    description:
      "South Lake Union, Seattle (near Amazon HQ). Tech worker concentration, new construction, high incomes. Tests economic data narrative.",
    expectedThemes: [
      "tech industry dominance",
      "high incomes",
      "new construction",
      "rapid growth",
      "walkable mixed-use",
    ],
  },

  // 20. Working class neighborhood
  {
    address: "4800 Dearborn St, Detroit, MI 48126",
    lat: 42.3070,
    lng: -83.1541,
    label: "working-class-dearborn",
    description:
      "Dearborn, Michigan. Working-class, auto industry roots, Arab-American community. Tests narrative for manufacturing-era neighborhoods.",
    expectedThemes: [
      "manufacturing heritage",
      "working-class economy",
      "affordable housing",
      "immigrant community",
      "car-dependent",
    ],
  },
];
