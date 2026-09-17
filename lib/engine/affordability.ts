import type { MonthlyRecord } from "@/lib/types";

/**
 * Safety margin applied to surplus before it's treated as money Ebb can
 * put toward a restructured payment. Shown in the UI as an assumption,
 * never hidden — Ebb should never propose a plan that spends every rupee
 * a borrower has.
 */
export const AFFORDABILITY_SAFETY_MARGIN = 0.65;

export function surplus(m: Pick<MonthlyRecord, "income" | "expenses_essential" | "expenses_business">): number {
  return m.income - m.expenses_essential - m.expenses_business;
}

export function affordable(m: Pick<MonthlyRecord, "income" | "expenses_essential" | "expenses_business">): number {
  return Math.max(0, surplus(m) * AFFORDABILITY_SAFETY_MARGIN);
}

export function surplusSeries(records: MonthlyRecord[]): number[] {
  return records.map((m) => surplus(m));
}

export function affordableSeries(records: MonthlyRecord[]): number[] {
  return records.map((m) => affordable(m));
}
