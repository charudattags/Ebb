import { describe, it, expect } from "vitest";
import { stressRatio, detectDistressPayments, detectMarginCompression, detectPaymentDrift } from "@/lib/engine/stress";
import type { MonthlyRecord } from "@/lib/types";

function record(overrides: Partial<MonthlyRecord>): MonthlyRecord {
  return {
    month: "2026-01",
    income: 10000,
    expenses_essential: 3000,
    expenses_business: 3000,
    txn_count: 100,
    emi_due: 2000,
    amount_paid: 2000,
    days_late: 0,
    ...overrides,
  };
}

describe("stressRatio", () => {
  it("is 1 when EMI exactly matches affordable capacity", () => {
    // surplus = 4000, affordable = 4000*0.65 = 2600, emi=2600 -> ratio 1
    const m = record({ income: 10000, expenses_essential: 3000, expenses_business: 3000, emi_due: 2600 });
    expect(stressRatio(m)).toBeCloseTo(1, 2);
  });

  it("exceeds 1 when EMI outstrips affordable capacity", () => {
    const m = record({ emi_due: 5000 });
    expect(stressRatio(m)).toBeGreaterThan(1);
  });
});

describe("detectDistressPayments", () => {
  it("flags a month paid in full despite insufficient surplus", () => {
    const records = [
      record({ month: "2026-01", income: 5000, expenses_essential: 3000, expenses_business: 3000, emi_due: 2000, amount_paid: 2000 }),
    ];
    const result = detectDistressPayments(records);
    expect(result.detected).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("does not flag a month with genuine surplus covering the EMI", () => {
    const records = [record({ income: 10000, expenses_essential: 3000, expenses_business: 3000, emi_due: 2000, amount_paid: 2000 })];
    const result = detectDistressPayments(records);
    expect(result.detected).toBe(false);
    expect(result.events).toHaveLength(0);
  });
});

describe("detectMarginCompression", () => {
  it("flags falling income with a flat transaction count", () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      record({ month: `2026-0${i + 1}`, income: 10000 - i * 400, txn_count: 100 + (i % 2) })
    );
    const result = detectMarginCompression(records);
    expect(result.detected).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("does not flag falling income when transaction count also falls (demand loss)", () => {
    const records = Array.from({ length: 6 }, (_, i) => record({ month: `2026-0${i + 1}`, income: 10000 - i * 400, txn_count: 100 - i * 10 }));
    const result = detectMarginCompression(records);
    expect(result.detected).toBe(false);
  });
});

describe("detectPaymentDrift", () => {
  it("flags days-late creeping up even when every payment completes", () => {
    const days = [0, 1, 1, 4, 6, 8];
    const records = days.map((d, i) => record({ month: `2026-0${i + 1}`, days_late: d, amount_paid: 2000 }));
    const result = detectPaymentDrift(records);
    expect(result.detected).toBe(true);
  });

  it("does not flag a flat on-time record", () => {
    const records = Array.from({ length: 6 }, (_, i) => record({ month: `2026-0${i + 1}`, days_late: 0 }));
    const result = detectPaymentDrift(records);
    expect(result.detected).toBe(false);
  });
});
