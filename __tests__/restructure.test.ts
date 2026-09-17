import { describe, it, expect } from "vitest";
import { generateRestructureOptions } from "@/lib/engine/restructure";
import { computeSeasonality } from "@/lib/engine/seasonality";
import { simulateBuffer } from "@/lib/engine/buffer";
import type { Borrower, Cohort, MonthlyRecord } from "@/lib/types";

function makeBorrower(historyMonths: number): Borrower {
  const records: MonthlyRecord[] = [];
  for (let i = 0; i < historyMonths; i++) {
    const y = 2024 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    records.push({
      month: `${y}-${String(m).padStart(2, "0")}`,
      income: 10000,
      expenses_essential: 2500,
      expenses_business: 3000,
      txn_count: 100,
      emi_due: 2000,
      amount_paid: 2000,
      days_late: 0,
    });
  }
  return {
    id: "B999",
    name: "Test Borrower",
    trade: "Flower seller",
    region: "Karnataka",
    cohort_id: "flower_seller",
    principal: 60000,
    apr: 22,
    tenure_months: 36,
    loan_start: records[0].month,
    history_months: historyMonths,
    emi: 2000,
    monthly_records: records,
  };
}

const cohort: Cohort = {
  cohort_id: "flower_seller",
  trade: "Flower seller",
  seasonal_profile: [1.3, 1.2, 1.0, 0.9, 0.8, 0.6, 0.6, 0.7, 0.9, 1.5, 1.6, 1.3].map((v) => v / 1.0333),
  typical_recovery_weeks: 6,
  note: "test",
};

describe("generateRestructureOptions", () => {
  const borrower = makeBorrower(18);
  const seasonality = computeSeasonality(borrower.monthly_records, cohort.seasonal_profile);
  const buffer = simulateBuffer(borrower.monthly_records);
  const options = generateRestructureOptions(borrower, cohort, seasonality, buffer);

  it("always returns all four options", () => {
    const keys = options.map((o) => o.key).sort();
    expect(keys).toEqual(["BUFFER_ABSORB", "EXTEND_TENURE", "SEASONAL_WEIGHT", "SHORT_PAUSE"].sort());
  });

  it("returns a 12-month schedule for every option", () => {
    for (const o of options) {
      expect(o.schedule).toHaveLength(12);
      expect(o.months).toHaveLength(12);
      expect(o.originalSchedule).toHaveLength(12);
    }
  });

  it("keeps SEASONAL_WEIGHT interest-neutral", () => {
    const seasonalOpt = options.find((o) => o.key === "SEASONAL_WEIGHT")!;
    expect(seasonalOpt.extraInterest).toBeCloseTo(0, 5);
    expect(seasonalOpt.newTenureMonths).toBe(borrower.tenure_months);
    const total = seasonalOpt.schedule.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(borrower.emi * 12, 0);
  });

  it("charges real extra interest for EXTEND_TENURE", () => {
    const extendOpt = options.find((o) => o.key === "EXTEND_TENURE")!;
    expect(extendOpt.extraInterest).toBeGreaterThan(0);
    expect(extendOpt.newTenureMonths).toBe(borrower.tenure_months + 6);
  });

  it("marks BUFFER_ABSORB unviable when there is no shortfall to cover", () => {
    const bufferOpt = options.find((o) => o.key === "BUFFER_ABSORB")!;
    // This fixture has surplus > EMI every month, so there's no shortfall.
    expect(bufferOpt.viable).toBe(false);
  });
});
