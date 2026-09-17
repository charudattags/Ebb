import type { MonthlyRecord } from "@/lib/types";
import { surplus } from "@/lib/engine/affordability";
import { calendarMonth } from "@/lib/engine/month";
import { mean, stdev } from "@/lib/engine/stats";

export const MIN_MONTHS_FOR_OWN_SEASONALITY = 13;

function localWindowMean(values: number[], i: number, radius: number): number {
  const lo = Math.max(0, i - radius);
  const hi = Math.min(values.length - 1, i + radius);
  let sum = 0;
  let count = 0;
  for (let k = lo; k <= hi; k++) {
    if (k === i) continue;
    sum += values[k];
    count += 1;
  }
  return count > 0 ? sum / count : values[i];
}

export type SeasonalityResult = {
  /** 12 multipliers, calendar-month indexed: 0 = Jan .. 11 = Dec. Mean 1.0. */
  index: number[];
  source: "own" | "cohort";
  yearsObserved: number;
  /** Standard deviation of the index — how strongly seasonal this borrower is. */
  strength: number;
};

/**
 * Builds the borrower's own seasonal rhythm from surplus (not income),
 * since business expenses lead income by about a month and surplus is
 * the only series that captures both sides of that timing.
 */
export function computeSeasonality(records: MonthlyRecord[], cohortProfile: number[]): SeasonalityResult {
  const H = records.length;
  if (H < MIN_MONTHS_FOR_OWN_SEASONALITY) {
    return {
      index: [...cohortProfile],
      source: "cohort",
      yearsObserved: 0,
      strength: stdev(cohortProfile),
    };
  }

  // The index describes what's "normal" for each calendar month. Build it
  // from every month EXCEPT the current one, so a live shock or a recent
  // structural decline can't inflate its own baseline and disguise itself
  // as "this month is just seasonally low for her".
  const baselineRecords = records.slice(0, H - 1);
  const surplusValues = baselineRecords.map((r) => surplus(r));
  const overallMean = mean(surplusValues);

  // A non-positive mean surplus makes the ratio meaningless (sign flips,
  // division blows up) — fall back to the cohort's known rhythm instead.
  if (overallMean <= 0) {
    return {
      index: [...cohortProfile],
      source: "cohort",
      yearsObserved: 0,
      strength: stdev(cohortProfile),
    };
  }

  // Detrend before extracting the calendar-month pattern. A borrower on a
  // steady decline (or climb) has every calendar month's own history
  // biased by however far the trend had progressed when that month last
  // occurred — comparing to the whole-history mean would misread that
  // drift as seasonality. A local window (the surrounding few months,
  // excluding the point itself) tracks the trend level at that point in
  // time without extrapolating a straight line past zero, which a global
  // linear fit does for any long, steep decline.
  const floor = Math.max(Math.abs(overallMean) * 0.2, 1);
  const ratios = surplusValues.map((v, i) => {
    const localTrend = localWindowMean(surplusValues, i, 4);
    const denom = Math.abs(localTrend) > floor ? localTrend : Math.sign(localTrend || 1) * floor;
    const ratio = v / denom;
    return Math.max(-4, Math.min(4, ratio));
  });

  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  baselineRecords.forEach((r, i) => {
    const cm = calendarMonth(r.month);
    sums[cm] += ratios[i];
    counts[cm] += 1;
  });

  const index = sums.map((s, cm) => {
    if (counts[cm] === 0) return cohortProfile[cm];
    return s / counts[cm];
  });

  return {
    index,
    source: "own",
    yearsObserved: Number((H / 12).toFixed(1)),
    strength: stdev(index),
  };
}

export function priorSameMonthObservations(records: MonthlyRecord[], calMonth: number, excludeLastN = 1): number {
  const eligible = records.slice(0, Math.max(0, records.length - excludeLastN));
  return eligible.filter((r) => calendarMonth(r.month) === calMonth).length;
}
