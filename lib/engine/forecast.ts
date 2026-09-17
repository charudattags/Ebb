import type { MonthlyRecord } from "@/lib/types";
import { surplus } from "@/lib/engine/affordability";
import { calendarMonth, addMonths } from "@/lib/engine/month";
import { mean, normalizedSlope } from "@/lib/engine/stats";
import type { SeasonalityResult } from "@/lib/engine/seasonality";

export type ForecastPoint = {
  month: string;
  projectedSurplus: number;
  low: number;
  high: number;
};

/**
 * Projects surplus forward using the borrower's seasonal index and recent
 * trend. Rendered as a dashed continuation of the historical chart with a
 * shaded confidence band that widens the further out it goes.
 */
export function forecastSurplus(records: MonthlyRecord[], seasonality: SeasonalityResult, monthsAhead = 12): ForecastPoint[] {
  const surplusValues = records.map((r) => surplus(r));
  const deseasonalized = records.map((r, i) => {
    const idx = seasonality.index[calendarMonth(r.month)];
    return surplusValues[i] / (Math.abs(idx) > 0.05 ? idx : 0.05);
  });

  const recentWindow = deseasonalized.slice(-6);
  const baseline = mean(recentWindow);
  const trend = recentWindow.length >= 3 ? normalizedSlope(recentWindow) : 0;

  const lastMonth = records[records.length - 1].month;
  const out: ForecastPoint[] = [];
  for (let k = 1; k <= monthsAhead; k++) {
    const month = addMonths(lastMonth, k);
    const cm = calendarMonth(month);
    const trendAdjusted = baseline * (1 + trend * k);
    const projected = trendAdjusted * seasonality.index[cm];
    const uncertainty = Math.abs(baseline) * (0.12 + 0.015 * k) * (0.5 + seasonality.strength);
    out.push({
      month,
      projectedSurplus: projected,
      low: projected - uncertainty,
      high: projected + uncertainty,
    });
  }
  return out;
}
