import type { Borrower, Cohort } from "@/lib/types";
import { calendarMonth, addMonths } from "@/lib/engine/month";
import { mean } from "@/lib/engine/stats";
import type { SeasonalityResult } from "@/lib/engine/seasonality";
import type { BufferSimulation } from "@/lib/engine/buffer";

export type RestructureOptionKey = "BUFFER_ABSORB" | "SEASONAL_WEIGHT" | "SHORT_PAUSE" | "EXTEND_TENURE";

const SCHEDULE_MONTHS = 12;

export type RestructureOption = {
  key: RestructureOptionKey;
  label: string;
  mechanic: string;
  viable: boolean;
  viabilityNote?: string;
  months: string[]; // 12 calendar months, starting at the current month
  originalSchedule: number[]; // 12 values, all = emi
  schedule: number[]; // 12 values, the option's actual payments
  newTenureMonths: number;
  extraInterest: number;
};

function emiFor(principal: number, apr: number, tenureMonths: number): number {
  const r = apr / 1200;
  if (r === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (principal * r * factor) / (factor - 1);
}

function outstandingBalance(principal: number, apr: number, tenureMonths: number, paymentsMade: number): number {
  const r = apr / 1200;
  if (r === 0) return Math.max(0, principal * (1 - paymentsMade / tenureMonths));
  const growth = Math.pow(1 + r, tenureMonths);
  const growthN = Math.pow(1 + r, paymentsMade);
  return Math.max(0, (principal * (growth - growthN)) / (growth - 1));
}

/**
 * Four restructuring options, always all four. Every schedule is 12 months
 * starting at the borrower's current month, so they compare like-for-like
 * regardless of how much tenure is actually left on the loan.
 */
export function generateRestructureOptions(
  borrower: Borrower,
  cohort: Cohort,
  seasonality: SeasonalityResult,
  buffer: BufferSimulation
): RestructureOption[] {
  const { principal, apr, tenure_months, history_months, emi } = borrower;
  const currentMonth = borrower.monthly_records[borrower.monthly_records.length - 1].month;

  const paymentsMadeBeforeNow = Math.max(0, history_months - 1);
  const remainingMonths = Math.max(1, tenure_months - paymentsMadeBeforeNow);
  const outstanding = outstandingBalance(principal, apr, tenure_months, paymentsMadeBeforeNow);

  const months = Array.from({ length: SCHEDULE_MONTHS }, (_, i) => addMonths(currentMonth, i));
  const originalSchedule = new Array(SCHEDULE_MONTHS).fill(emi);

  const options: RestructureOption[] = [];

  // 1. BUFFER_ABSORB — no schedule change, her accumulated buffer covers it.
  {
    options.push({
      key: "BUFFER_ABSORB",
      label: "Absorb from buffer",
      mechanic: "No schedule change. Her accumulated loan buffer — built from savings in her flush months — covers this month's shortfall directly.",
      viable: buffer.wouldHaveCovered && buffer.currentShortfall > 0,
      viabilityNote:
        buffer.currentShortfall <= 0
          ? "No shortfall this month — nothing for the buffer to cover."
          : buffer.wouldHaveCovered
            ? undefined
            : `Buffer balance isn't enough this time — it would cover ₹${Math.round(buffer.currentDrawn).toLocaleString("en-IN")} of the ₹${Math.round(buffer.currentShortfall).toLocaleString("en-IN")} shortfall.`,
      months,
      originalSchedule,
      schedule: [...originalSchedule],
      newTenureMonths: tenure_months,
      extraInterest: 0,
    });
  }

  // 2. SEASONAL_WEIGHT — reshape when she pays, not how much overall.
  {
    const weights = months.map((m) => Math.max(0.15, seasonality.index[calendarMonth(m)]));
    const avgWeight = mean(weights);
    const raw = weights.map((w) => emi * (w / avgWeight));
    const total = raw.reduce((a, b) => a + b, 0);
    const targetTotal = emi * SCHEDULE_MONTHS;
    const scale = total > 0 ? targetTotal / total : 1;
    const schedule = raw.map((p) => p * scale);

    options.push({
      key: "SEASONAL_WEIGHT",
      label: "Weight to her seasonal rhythm",
      mechanic: "Payments scale with her own seasonal pattern — more when business is up, less when it's down. Same tenure, same principal, same total interest.",
      viable: true,
      months,
      originalSchedule,
      schedule,
      newTenureMonths: tenure_months,
      extraInterest: 0,
    });
  }

  // 3. SHORT_PAUSE — 2 months cut to 25%, spread over the next 6.
  {
    const pausedMonths = 2;
    const reducedPayment = emi * 0.25;
    const shortfallTotal = pausedMonths * (emi - reducedPayment);
    const repayWindow = 6;
    const extraPerMonth = shortfallTotal / repayWindow;
    const r = apr / 1200;
    const extraInterest = shortfallTotal * r * 2; // simple interest on the deferred amount

    const schedule = months.map((_, i) => {
      if (i < pausedMonths) return reducedPayment;
      if (i < pausedMonths + repayWindow) return emi + extraPerMonth;
      return emi;
    });

    options.push({
      key: "SHORT_PAUSE",
      label: "Short pause",
      mechanic: `Next 2 months drop to 25% of EMI. The shortfall is spread across the following 6 months.`,
      viable: remainingMonths > pausedMonths,
      months,
      originalSchedule,
      schedule,
      newTenureMonths: tenure_months,
      extraInterest,
    });
  }

  // 4. EXTEND_TENURE — flat EMI recomputed over tenure + 6 months.
  {
    const newRemainingMonths = remainingMonths + 6;
    const newEmi = emiFor(outstanding, apr, newRemainingMonths);
    const totalInterestOriginal = emi * remainingMonths - outstanding;
    const totalInterestNew = newEmi * newRemainingMonths - outstanding;
    const extraInterest = totalInterestNew - totalInterestOriginal;

    const schedule = new Array(SCHEDULE_MONTHS).fill(newEmi);

    options.push({
      key: "EXTEND_TENURE",
      label: "Extend tenure",
      mechanic: `Flat EMI of ₹${Math.round(newEmi).toLocaleString("en-IN")} recomputed over ${newRemainingMonths} months instead of ${remainingMonths} (tenure +6 months).`,
      viable: true,
      months,
      originalSchedule,
      schedule,
      newTenureMonths: tenure_months + 6,
      extraInterest,
    });
  }

  return options;
}
