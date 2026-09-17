import type { MonthlyRecord } from "@/lib/types";
import { surplus } from "@/lib/engine/affordability";

export const BUFFER_TRIGGER_MULTIPLE = 1.3; // surplus must exceed EMI x this to contribute
export const BUFFER_CONTRIBUTION_CAP_OF_EXCESS = 0.25;
export const BUFFER_CONTRIBUTION_CAP_OF_SURPLUS = 0.15;
export const BUFFER_LOAN_SHARE = 0.6;
export const BUFFER_SAVINGS_SHARE = 0.4;

export type BufferMonth = {
  month: string;
  surplus: number;
  shortfall: number;
  contribution: number;
  loanBufferContribution: number;
  savingsContribution: number;
  drawn: number;
  loanBufferBalance: number;
  savingsBalance: number;
};

export type BufferSimulation = {
  months: BufferMonth[];
  wouldHaveCovered: boolean;
  currentShortfall: number;
  currentDrawn: number;
};

/**
 * Retroactively simulates a buffer built from a borrower's own surplus in
 * flush months, then auto-drawn against shortfalls later. This is Ebb's
 * differentiator: it pre-empts the dip rather than only rescheduling debt.
 */
export function simulateBuffer(records: MonthlyRecord[]): BufferSimulation {
  let loanBalance = 0;
  let savingsBalance = 0;
  const months: BufferMonth[] = [];

  for (const r of records) {
    const s = surplus(r);
    const shortfall = Math.max(0, r.emi_due - s);

    let contribution = 0;
    if (s > r.emi_due * BUFFER_TRIGGER_MULTIPLE) {
      contribution = Math.min(
        BUFFER_CONTRIBUTION_CAP_OF_EXCESS * (s - r.emi_due),
        BUFFER_CONTRIBUTION_CAP_OF_SURPLUS * s
      );
    }
    const loanBufferContribution = contribution * BUFFER_LOAN_SHARE;
    const savingsContribution = contribution * BUFFER_SAVINGS_SHARE;
    loanBalance += loanBufferContribution;
    savingsBalance += savingsContribution;

    let drawn = 0;
    if (shortfall > 0) {
      drawn = Math.min(loanBalance, shortfall);
      loanBalance -= drawn;
    }

    months.push({
      month: r.month,
      surplus: s,
      shortfall,
      contribution,
      loanBufferContribution,
      savingsContribution,
      drawn,
      loanBufferBalance: loanBalance,
      savingsBalance,
    });
  }

  const last = months[months.length - 1];
  const wouldHaveCovered = last ? last.drawn >= last.shortfall : true;

  return {
    months,
    wouldHaveCovered,
    currentShortfall: last?.shortfall ?? 0,
    currentDrawn: last?.drawn ?? 0,
  };
}
