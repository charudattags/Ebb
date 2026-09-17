import { describe, it, expect } from "vitest";
import { scoreOption } from "@/lib/engine/score";
import type { RestructureOption } from "@/lib/engine/restructure";
import type { ForecastPoint } from "@/lib/engine/forecast";
import type { Borrower } from "@/lib/types";

const borrower: Borrower = {
  id: "B999",
  name: "Test",
  trade: "Flower seller",
  region: "Karnataka",
  cohort_id: "flower_seller",
  principal: 60000,
  apr: 22,
  tenure_months: 24,
  loan_start: "2025-01",
  history_months: 12,
  emi: 2000,
  monthly_records: [],
};

function forecast(surplusValues: number[]): ForecastPoint[] {
  return surplusValues.map((s, i) => ({
    month: `2026-${String((i % 12) + 1).padStart(2, "0")}`,
    projectedSurplus: s,
    low: s * 0.8,
    high: s * 1.2,
  }));
}

function option(overrides: Partial<RestructureOption>): RestructureOption {
  const months = Array.from({ length: 12 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, "0")}`);
  return {
    key: "SEASONAL_WEIGHT",
    label: "test",
    mechanic: "test",
    viable: true,
    months,
    originalSchedule: new Array(12).fill(2000),
    schedule: new Array(12).fill(2000),
    newTenureMonths: 24,
    extraInterest: 0,
    ...overrides,
  };
}

describe("scoreOption", () => {
  it("gives a comfortable option a low stress ratio and high completion probability", () => {
    const opt = option({ schedule: new Array(12).fill(1000) });
    const fc = forecast(new Array(12).fill(5000)); // affordable = 5000*0.65 = 3250
    const score = scoreOption(opt, borrower, fc);
    expect(score.borrower.peakStressRatio).toBeLessThan(1);
    expect(score.borrower.monthsOverAffordable).toBe(0);
    expect(score.borrower.completionProbability).toBeGreaterThan(0.8);
  });

  it("penalizes a payment that regularly exceeds affordable capacity", () => {
    const opt = option({ schedule: new Array(12).fill(5000) });
    const fc = forecast(new Array(12).fill(1000)); // affordable = 650
    const score = scoreOption(opt, borrower, fc);
    expect(score.borrower.peakStressRatio).toBeGreaterThan(1);
    expect(score.borrower.monthsOverAffordable).toBe(12);
    expect(score.lender.expectedRecoveryPct).toBeLessThan(1);
  });

  it("reflects extra interest and tenure change on the respective sides", () => {
    const opt = option({ extraInterest: 4000, newTenureMonths: 30 });
    const fc = forecast(new Array(12).fill(5000));
    const score = scoreOption(opt, borrower, fc);
    expect(score.borrower.extraInterest).toBe(4000);
    expect(score.lender.tenureChangeMonths).toBe(6);
  });
});
