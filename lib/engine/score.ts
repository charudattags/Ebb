import type { Borrower } from "@/lib/types";
import { AFFORDABILITY_SAFETY_MARGIN } from "@/lib/engine/affordability";
import type { RestructureOption } from "@/lib/engine/restructure";
import type { ForecastPoint } from "@/lib/engine/forecast";

export type BorrowerSideScore = {
  peakStressRatio: number;
  monthsOverAffordable: number;
  extraInterest: number;
  completionProbability: number;
};

export type LenderSideScore = {
  expectedRecoveryPct: number;
  tenureChangeMonths: number;
  collectionsTouchesAvoided: number;
};

export type OptionScore = {
  key: RestructureOption["key"];
  borrower: BorrowerSideScore;
  lender: LenderSideScore;
  combinedScore: number;
};

const STRESS_RATIO_CAP = 50;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function affordableFromForecast(point: ForecastPoint): number {
  return Math.max(0, point.projectedSurplus * AFFORDABILITY_SAFETY_MARGIN);
}

export function scoreOption(option: RestructureOption, borrower: Borrower, forecast: ForecastPoint[]): OptionScore {
  const n = option.schedule.length;

  let peakStressRatio = 0;
  let monthsOverAffordable = 0;
  let baselineMonthsOverAffordable = 0;

  for (let i = 0; i < n; i++) {
    const point = forecast[Math.min(i, forecast.length - 1)];
    const aff = point ? affordableFromForecast(point) : 0;
    const payment = option.schedule[i];
    const ratio = aff > 0 ? payment / aff : payment > 0 ? STRESS_RATIO_CAP : 0;
    peakStressRatio = Math.max(peakStressRatio, Math.min(ratio, STRESS_RATIO_CAP));
    if (payment > aff) monthsOverAffordable++;
    if (option.originalSchedule[i] > aff) baselineMonthsOverAffordable++;
  }

  const stressExcess = Math.max(0, peakStressRatio - 1);
  const completionProbability = clamp(1 - 0.08 * stressExcess - 0.05 * monthsOverAffordable, 0.05, 0.98);
  const expectedRecoveryPct = clamp(1 - 0.5 * (monthsOverAffordable / Math.max(1, n)), 0.5, 1);
  const collectionsTouchesAvoided = Math.max(0, baselineMonthsOverAffordable - monthsOverAffordable);
  const tenureChangeMonths = option.newTenureMonths - borrower.tenure_months;

  const combinedScore =
    (completionProbability * 0.4 + expectedRecoveryPct * 0.4) * 100 -
    (option.extraInterest / Math.max(1, borrower.emi)) * 2 -
    monthsOverAffordable * 3;

  return {
    key: option.key,
    borrower: {
      peakStressRatio,
      monthsOverAffordable,
      extraInterest: option.extraInterest,
      completionProbability,
    },
    lender: {
      expectedRecoveryPct,
      tenureChangeMonths,
      collectionsTouchesAvoided,
    },
    combinedScore,
  };
}

export function scoreAllOptions(
  options: RestructureOption[],
  borrower: Borrower,
  forecast: ForecastPoint[]
): OptionScore[] {
  return options.map((o) => scoreOption(o, borrower, forecast));
}

export function recommendOption(scores: OptionScore[], options: RestructureOption[]): RestructureOption["key"] {
  const viableKeys = new Set(options.filter((o) => o.viable).map((o) => o.key));
  const candidates = scores.filter((s) => viableKeys.has(s.key));
  const pool = candidates.length > 0 ? candidates : scores;
  return pool.reduce((best, s) => (s.combinedScore > best.combinedScore ? s : best), pool[0]).key;
}
