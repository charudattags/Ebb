import type { Borrower, Cohort } from "@/lib/types";
import { computeSeasonality } from "@/lib/engine/seasonality";
import { classify } from "@/lib/engine/condition";
import { computeEarlyWarnings } from "@/lib/engine/stress";
import { simulateBuffer } from "@/lib/engine/buffer";
import { forecastSurplus } from "@/lib/engine/forecast";
import { generateRestructureOptions } from "@/lib/engine/restructure";
import { scoreAllOptions, recommendOption } from "@/lib/engine/score";

/** Fallback profile for a borrower whose cohort_id doesn't match anything known. */
export const FLAT_FALLBACK_COHORT: Cohort = {
  cohort_id: "_flat_fallback",
  trade: "General trade",
  seasonal_profile: new Array(12).fill(1),
  typical_recovery_weeks: 4,
  note: "No matching cohort profile — treated as flat/non-seasonal.",
};

export function analyzeBorrower(borrower: Borrower, cohort: Cohort) {
  const seasonality = computeSeasonality(borrower.monthly_records, cohort.seasonal_profile);
  const classification = classify(borrower, cohort);
  const earlyWarnings = computeEarlyWarnings(borrower.monthly_records);
  const buffer = simulateBuffer(borrower.monthly_records);
  const forecast = forecastSurplus(borrower.monthly_records, seasonality, 12);
  const restructureOptions = generateRestructureOptions(borrower, cohort, seasonality, buffer);
  const scores = scoreAllOptions(restructureOptions, borrower, forecast);
  const recommended = recommendOption(scores, restructureOptions);

  return {
    cohort,
    seasonality,
    classification,
    earlyWarnings,
    buffer,
    forecast,
    restructureOptions,
    scores,
    recommended,
  };
}

export type BorrowerAnalysis = ReturnType<typeof analyzeBorrower>;

export * from "@/lib/engine/affordability";
export * from "@/lib/engine/month";
export * from "@/lib/engine/stats";
export * from "@/lib/engine/seasonality";
export * from "@/lib/engine/confidence";
export * from "@/lib/engine/condition";
export * from "@/lib/engine/stress";
export * from "@/lib/engine/buffer";
export * from "@/lib/engine/restructure";
export * from "@/lib/engine/score";
export * from "@/lib/engine/forecast";
