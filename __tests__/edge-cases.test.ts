import { describe, it, expect } from "vitest";
import { classify, type ClassificationLabel } from "@/lib/engine/condition";
import type { Cohort, MonthlyRecord, RawBorrower } from "@/lib/types";

const COHORT: Cohort = {
  cohort_id: "test_cohort",
  trade: "Test trade",
  seasonal_profile: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  typical_recovery_weeks: 4,
  note: "synthetic",
};

function monthAt(i: number): string {
  const y = 2024 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function records(n: number, fn: (i: number) => Partial<MonthlyRecord>): MonthlyRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    month: monthAt(i),
    income: 5000,
    expenses_essential: 1500,
    expenses_business: 1500,
    txn_count: 40,
    emi_due: i === n - 1 ? 1200 : 1200,
    amount_paid: 1200,
    days_late: 0,
    ...fn(i),
  }));
}

function borrower(monthly_records: MonthlyRecord[]): RawBorrower {
  return {
    id: "EDGE",
    name: "Edge Case",
    trade: "Test trade",
    region: "Test",
    cohort_id: "test_cohort",
    principal: 50000,
    apr: 24,
    tenure_months: 12,
    loan_start: monthly_records[0]?.month ?? "2024-01",
    history_months: monthly_records.length,
    emi: 1200,
    monthly_records,
  };
}

const VALID_LABELS: ClassificationLabel[] = ["SEASONAL", "STRUCTURAL", "TEMPORARY", "IMPROVING", "STABLE"];

function expectValid(b: RawBorrower) {
  const { ground_truth: _gt, ...rest } = b;
  const result = classify(rest, COHORT);
  expect(VALID_LABELS).toContain(result.label);
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(result.evidence.length).toBeGreaterThan(0);
  return result;
}

describe("classifier edge cases never crash and always return a valid label", () => {
  it("single month of history", () => {
    expectValid(borrower(records(1, () => ({}))));
  });

  it("all-zero income", () => {
    expectValid(
      borrower(records(18, () => ({ income: 0, expenses_essential: 0, expenses_business: 0, amount_paid: 0, emi_due: 1200 })))
    );
  });

  it("constant values every month", () => {
    expectValid(borrower(records(24, () => ({}))));
  });

  it("always-negative surplus", () => {
    expectValid(borrower(records(18, () => ({ income: 1000, expenses_essential: 1500, expenses_business: 1500 }))));
  });

  it("exactly-zero surplus every month", () => {
    expectValid(borrower(records(18, () => ({ income: 3000, expenses_essential: 1500, expenses_business: 1500 }))));
  });

  it("huge values", () => {
    expectValid(
      borrower(records(18, () => ({ income: 5_000_000_000, expenses_essential: 1_000_000_000, expenses_business: 1_000_000_000, emi_due: 900_000_000, amount_paid: 900_000_000 })))
    );
  });

  it("exactly 12 months — below MIN_HISTORY, never structural/temporary/improving, confidence stays low", () => {
    const result = expectValid(
      borrower(records(12, (i) => ({ income: 3000 + i * 400, emi_due: 1200, amount_paid: 1200 })))
    );
    expect(["STRUCTURAL", "TEMPORARY", "IMPROVING"]).not.toContain(result.label);
    expect(result.confidence).toBeLessThan(0.45);
  });

  it("exactly 13 months — meets MIN_HISTORY", () => {
    expectValid(borrower(records(13, (i) => ({ income: 3000 + i * 400 }))));
  });

  it("gapped series (missing months in the sequence)", () => {
    const base = records(20, (i) => ({}));
    const gapped = base.filter((_, i) => i % 5 !== 3); // drop every 5th month, keep months field as-is (non-contiguous)
    expectValid(borrower(gapped));
  });

  it("one huge outlier month among otherwise steady history", () => {
    expectValid(
      borrower(
        records(20, (i) => (i === 10 ? { income: 500_000, expenses_business: 2000 } : {}))
      )
    );
  });
});

describe("classifier is deterministic and order-independent", () => {
  it("returns identical output across repeated calls", () => {
    const b = borrower(records(24, (i) => ({ income: 4000 + (i % 12) * 200 })));
    const { ground_truth: _gt, ...rest } = b;
    const first = classify(rest, COHORT);
    const second = classify(rest, COHORT);
    expect(second).toEqual(first);
  });

  it("classifying one borrower does not affect the result for another", () => {
    const a = borrower(records(24, (i) => ({ income: 4000 + (i % 12) * 200 })));
    const c = borrower(records(18, (i) => ({ income: 1000, expenses_essential: 1500, expenses_business: 1500 })));
    const { ground_truth: gtA, ...restA } = a;
    const { ground_truth: gtC, ...restC } = c;

    const aFirst = classify(restA, COHORT);
    classify(restC, COHORT);
    const aSecond = classify(restA, COHORT);

    expect(aSecond).toEqual(aFirst);
  });
});
