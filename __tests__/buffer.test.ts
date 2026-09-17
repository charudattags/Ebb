import { describe, it, expect } from "vitest";
import { simulateBuffer } from "@/lib/engine/buffer";
import type { MonthlyRecord } from "@/lib/types";

function record(month: string, income: number, essential: number, business: number, emi: number): MonthlyRecord {
  return {
    month,
    income,
    expenses_essential: essential,
    expenses_business: business,
    txn_count: 100,
    emi_due: emi,
    amount_paid: Math.min(emi, income - essential - business),
    days_late: 0,
  };
}

describe("simulateBuffer", () => {
  it("contributes nothing when surplus never clears the 1.3x trigger", () => {
    const records = [record("2026-01", 5000, 2000, 500, 2000)]; // surplus 2500, emi*1.3=2600
    const sim = simulateBuffer(records);
    expect(sim.months[0].contribution).toBe(0);
  });

  it("accumulates a buffer and draws it down to cover a later shortfall", () => {
    const flush = record("2026-01", 20000, 3000, 3000, 2000); // surplus 14000, well over emi*1.3
    const dip = record("2026-02", 3000, 3000, 3000, 2000); // surplus -3000, shortfall 5000
    const sim = simulateBuffer([flush, dip]);

    expect(sim.months[0].contribution).toBeGreaterThan(0);
    expect(sim.months[0].loanBufferContribution).toBeCloseTo(sim.months[0].contribution * 0.6, 5);
    expect(sim.months[0].savingsContribution).toBeCloseTo(sim.months[0].contribution * 0.4, 5);

    expect(sim.months[1].shortfall).toBe(5000);
    expect(sim.months[1].drawn).toBeGreaterThan(0);
    expect(sim.currentShortfall).toBe(5000);
  });

  it("reports wouldHaveCovered honestly when the buffer isn't enough", () => {
    const dip = record("2026-01", 1000, 3000, 3000, 2000); // shortfall with no prior buffer
    const sim = simulateBuffer([dip]);
    expect(sim.wouldHaveCovered).toBe(false);
  });

  it("reports wouldHaveCovered true when there is no current shortfall", () => {
    const healthy = record("2026-01", 10000, 3000, 3000, 2000);
    const sim = simulateBuffer([healthy]);
    expect(sim.wouldHaveCovered).toBe(true);
  });
});
