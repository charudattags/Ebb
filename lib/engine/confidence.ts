export type ConfidenceLevel = "high" | "medium" | "low";

export type ConfidenceResult = {
  level: ConfidenceLevel;
  value: number; // 0..1
  reason: string;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export type ConfidenceInput = {
  historyMonths: number;
  priorSameMonthObservations: number;
  cohortSize: number;
  currentMonthName: string; // e.g. "September"
  cohortTrade: string;
};

/**
 * confidence = f(history_months, priorSameMonthObservations, cohortSize)
 *
 * Below 13 months there is no prior same-month to compare against at all,
 * so confidence is forced low and the source is forced to the cohort
 * pattern — admitting the uncertainty is treated as a feature, not hidden.
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const { historyMonths, priorSameMonthObservations: prior, cohortSize, currentMonthName, cohortTrade } = input;

  if (historyMonths < 13) {
    const value = clamp(0.2 + (historyMonths / 12) * 0.2, 0.2, 0.4);
    return {
      level: "low",
      value: Number(value.toFixed(2)),
      reason: `Low confidence — ${historyMonths} month${historyMonths === 1 ? "" : "s"} of history, no prior ${currentMonthName} to compare against. Using the ${cohortTrade.toLowerCase()} cohort pattern.`,
    };
  }

  if (historyMonths >= 24 && prior >= 2) {
    const cohortBonus = cohortSize >= 4 ? 0.03 : 0;
    const value = clamp(0.8 + Math.min(prior - 2, 3) * 0.03 + cohortBonus, 0.8, 0.95);
    return {
      level: "high",
      value: Number(value.toFixed(2)),
      reason: `${historyMonths} months of history, ${prior} prior ${currentMonthName}s to compare against.`,
    };
  }

  if (prior >= 1) {
    const value = clamp(0.5 + Math.min(prior - 1, 2) * 0.05, 0.5, 0.7);
    return {
      level: "medium",
      value: Number(value.toFixed(2)),
      reason: `${historyMonths} months of history, ${prior} prior ${currentMonthName} to compare against.`,
    };
  }

  return {
    level: "low",
    value: 0.35,
    reason: `Low confidence — ${historyMonths} months of history but no repeated ${currentMonthName} yet to confirm the pattern.`,
  };
}
