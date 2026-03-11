"use client";

// ---------------------------------------------------------------------------
// GenerationOrchestrator — Sequences archetype classification → narrative
// ---------------------------------------------------------------------------
// Replaces the direct NarrativeTrigger + AutoRefresh on the report page's
// "generating" state. Orchestrates the sequence:
//
//   1. ArchetypeTrigger fires immediately → archetype classification
//   2. On archetype completion (or 5s timeout) → NarrativeTrigger fires
//   3. AutoRefresh polls throughout
//
// The 5s timeout ensures narrative generation is not blocked by a slow
// or failed archetype classification.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { ArchetypeTrigger } from "@/components/ArchetypeTrigger";
import { NarrativeTrigger } from "@/components/NarrativeTrigger";
import { AutoRefresh } from "@/components/AutoRefresh";

interface GenerationOrchestratorProps {
  slug: string;
}

export function GenerationOrchestrator({ slug }: GenerationOrchestratorProps) {
  const [archetypeDone, setArchetypeDone] = useState(false);

  const handleArchetypeComplete = useCallback(() => {
    setArchetypeDone(true);
  }, []);

  // Timeout fallback — don't block narrative on slow archetype classification.
  useEffect(() => {
    const timer = setTimeout(() => setArchetypeDone(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <ArchetypeTrigger slug={slug} onComplete={handleArchetypeComplete} />
      {archetypeDone && <NarrativeTrigger slug={slug} />}
      <AutoRefresh intervalMs={3000} />
    </>
  );
}
