import { describe, it, expect } from "vitest";
import { forecastSurplus } from "@/lib/engine/forecast";
import type { MonthlyRecord } from "@/lib/types";
import type { SeasonalityResult } from "@/lib/engine/seasonality";

function records(n: number): MonthlyRecord[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 2024 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return {
      month: `${y}-${String(m).padStart(2, "0")}`,
      income: 10000,
      expenses_essential: 3000,
      expenses_business: 3000,
      txn_count: 100,
      emi_due: 2000,
      amount_paid: 2000,
      days_late: 0,
    };
  });
}

const flatSeasonality: SeasonalityResult = {
  index: new Array(12).fill(1),
  source: "own",
  yearsObserved: 2,
  strength: 0,
};

describe("forecastSurplus", () => {
  it("projects the requested number of months forward, continuing from the last month", () => {
    const rs = records(18);
    const points = forecastSurplus(rs, flatSeasonality, 12);
    expect(points).toHaveLength(12);
    expect(points[0].month).toBe("2025-07"); // last record is 2025-06
  });

  it("widens the confidence band further into the future", () => {
    const rs = records(18);
    const points = forecastSurplus(rs, flatSeasonality, 12);
    const firstBand = points[0].high - points[0].low;
    const lastBand = points[points.length - 1].high - points[points.length - 1].low;
    expect(lastBand).toBeGreaterThan(firstBand);
  });
});
