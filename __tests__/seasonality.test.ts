import { describe, it, expect } from "vitest";
import { computeSeasonality, priorSameMonthObservations } from "@/lib/engine/seasonality";
import type { MonthlyRecord } from "@/lib/types";

function makeRecords(months: string[], surplusFn: (cm: number, i: number) => number): MonthlyRecord[] {
  return months.map((month, i) => {
    const cm = Number(month.split("-")[1]) - 1;
    const s = surplusFn(cm, i);
    return {
      month,
      income: 10000 + s,
      expenses_essential: 5000,
      expenses_business: 5000,
      txn_count: 100,
      emi_due: 3000,
      amount_paid: 3000,
      days_late: 0,
    };
  });
}

describe("seasonality", () => {
  it("falls back to the cohort profile under 13 months of history", () => {
    const months = ["2026-01", "2026-02", "2026-03"];
    const records = makeRecords(months, () => 0);
    const cohortProfile = new Array(12).fill(1);
    cohortProfile[0] = 1.5;
    const result = computeSeasonality(records, cohortProfile);
    expect(result.source).toBe("cohort");
    expect(result.yearsObserved).toBe(0);
    expect(result.index).toEqual(cohortProfile);
  });

  it("builds its own index from surplus with >=13 months of history", () => {
    // 24 months, January consistently low, July consistently high.
    const months: string[] = [];
    for (let y = 0; y < 2; y++) {
      for (let m = 1; m <= 12; m++) {
        months.push(`${2024 + y}-${String(m).padStart(2, "0")}`);
      }
    }
    const records = makeRecords(months, (cm) => 1000 + (cm === 0 ? -800 : cm === 6 ? 800 : 0));
    const result = computeSeasonality(records, new Array(12).fill(1));
    expect(result.source).toBe("own");
    expect(result.index[0]).toBeLessThan(1);
    expect(result.index[6]).toBeGreaterThan(1);
    expect(result.yearsObserved).toBeCloseTo(2, 0);
  });

  it("counts prior same-month observations excluding the current month", () => {
    const months = ["2024-09", "2025-09", "2026-09"];
    const records = makeRecords(months, () => 0);
    expect(priorSameMonthObservations(records, 8, 1)).toBe(2);
  });
});
