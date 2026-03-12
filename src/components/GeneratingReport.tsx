"use client";

// ---------------------------------------------------------------------------
// GeneratingReport — Radar animation + cycling microcopy for the loading state
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { Container } from "@/components/Container";

const loadingSteps = [
  "Scouting local coffee shops\u2026",
  "Crunching the census data\u2026",
  "Comparing housing prices\u2026",
  "Measuring the commute times\u2026",
  "Analyzing walkability scores\u2026",
  "Checking the neighborhood\u2019s vibe\u2026",
];

export function GeneratingReport() {
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Container variant="prose">
      <div className="text-center">
        {/* Radar animation */}
        <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
          <div className="absolute z-10 h-4 w-4 rounded-full bg-accent" />
          <div className="radar-ring" style={{ animationDelay: "0s" }} />
          <div className="radar-ring" style={{ animationDelay: "1s" }} />
        </div>

        <h1 className="mb-4">Generating your report</h1>

        {/* Cycling microcopy */}
        <div className="mb-6 h-8 overflow-hidden">
          <p
            key={textIndex}
            className="text-base text-ink-muted sm:text-lg animate-fade-up"
          >
            {loadingSteps[textIndex]}
          </p>
        </div>

        <p className="text-xs text-ink-muted opacity-60">
          This page will refresh automatically.
        </p>
      </div>
    </Container>
  );
}
