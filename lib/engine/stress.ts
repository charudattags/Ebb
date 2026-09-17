import type { MonthlyRecord } from "@/lib/types";
import { affordable, surplus } from "@/lib/engine/affordability";
import { monthLabel } from "@/lib/engine/month";
import { mean, normalizedSlope } from "@/lib/engine/stats";
import { formatINR } from "@/lib/format";

/** emi_due(m) / affordable(m). >1 means demand exceeds capacity. Capped for display. */
export function stressRatio(m: Pick<MonthlyRecord, "income" | "expenses_essential" | "expenses_business" | "emi_due">): number {
  const aff = affordable(m);
  if (aff <= 0) return m.emi_due > 0 ? 50 : 0;
  return m.emi_due / aff;
}

export function stressRatioSeries(records: MonthlyRecord[]): number[] {
  return records.map((r) => stressRatio(r));
}

export type DistressPaymentEvent = {
  month: string;
  surplus: number;
  emiDue: number;
  amountPaid: number;
};

export type DistressPaymentResult = {
  detected: boolean;
  events: DistressPaymentEvent[];
  evidence: string[];
};

/**
 * She paid in full despite not having the surplus to cover it — she almost
 * certainly borrowed elsewhere. The single most important detector here:
 * it fires on borrowers whose repayment record looks perfect.
 */
export function detectDistressPayments(records: MonthlyRecord[]): DistressPaymentResult {
  const events: DistressPaymentEvent[] = [];
  for (const r of records) {
    const s = surplus(r);
    if (r.emi_due > 0 && r.amount_paid >= r.emi_due && s < r.emi_due) {
      events.push({ month: r.month, surplus: s, emiDue: r.emi_due, amountPaid: r.amount_paid });
    }
  }
  if (events.length === 0) {
    return { detected: false, events, evidence: [] };
  }
  const latest = events[events.length - 1];
  const evidence = [
    `${events.length} month${events.length === 1 ? "" : "s"} where the EMI was paid in full despite surplus falling short of it — most likely covered by borrowing elsewhere.`,
    `Most recent: ${monthLabel(latest.month)}, paid ${formatINR(latest.amountPaid)} against a surplus of only ${formatINR(latest.surplus)}.`,
    `A fixed repayment schedule sees a clean payment history here — this is invisible without looking at surplus directly.`,
  ];
  return { detected: true, events, evidence };
}

export type MarginCompressionResult = {
  detected: boolean;
  incomeSlope: number;
  txnSlope: number;
  evidence: string[];
};

const MARGIN_INCOME_SLOPE_THRESHOLD = -0.01; // -1%/month
const MARGIN_TXN_FLAT_BAND = 0.05; // ±5%

/** Falling income with a flat transaction count: same customers, collapsing prices. */
export function detectMarginCompression(records: MonthlyRecord[]): MarginCompressionResult {
  if (records.length < 6) {
    return { detected: false, incomeSlope: 0, txnSlope: 0, evidence: [] };
  }
  const last6 = records.slice(-6);
  const incomeSlope = normalizedSlope(last6.map((r) => r.income));
  const txnSlope = normalizedSlope(last6.map((r) => r.txn_count));
  const detected = incomeSlope <= MARGIN_INCOME_SLOPE_THRESHOLD && Math.abs(txnSlope) <= MARGIN_TXN_FLAT_BAND;
  if (!detected) {
    return { detected, incomeSlope, txnSlope, evidence: [] };
  }
  const evidence = [
    `Income has fallen ${(Math.abs(incomeSlope) * 100).toFixed(1)}%/month over the last 6 months while transaction count has stayed flat (${(txnSlope * 100).toFixed(1)}%/month).`,
    `She's serving roughly the same number of customers at falling prices — a demand problem would show fewer transactions, not just less revenue.`,
  ];
  return { detected, incomeSlope, txnSlope, evidence };
}

export type PaymentDriftResult = {
  detected: boolean;
  firstHalfAvgDays: number;
  secondHalfAvgDays: number;
  evidence: string[];
};

/** days_late trending upward over 6 months even where every payment eventually completes. */
export function detectPaymentDrift(records: MonthlyRecord[]): PaymentDriftResult {
  if (records.length < 6) {
    return { detected: false, firstHalfAvgDays: 0, secondHalfAvgDays: 0, evidence: [] };
  }
  const last6 = records.slice(-6);
  const allPaidFull = last6.every((r) => r.amount_paid >= r.emi_due);
  const firstHalfAvgDays = mean(last6.slice(0, 3).map((r) => r.days_late));
  const secondHalfAvgDays = mean(last6.slice(3).map((r) => r.days_late));
  const detected = allPaidFull && secondHalfAvgDays > firstHalfAvgDays + 1 && secondHalfAvgDays > 0;
  if (!detected) {
    return { detected, firstHalfAvgDays, secondHalfAvgDays, evidence: [] };
  }
  const evidence = [
    `Days late has drifted from an average of ${firstHalfAvgDays.toFixed(0)} to ${secondHalfAvgDays.toFixed(0)} days over the last 6 months, even though every payment was eventually made in full.`,
    `Slipping a little later each cycle is often an early sign of tightening cash flow before a payment is actually missed.`,
  ];
  return { detected, firstHalfAvgDays, secondHalfAvgDays, evidence };
}

export type EarlyWarnings = {
  distressPayment: DistressPaymentResult;
  marginCompression: MarginCompressionResult;
  paymentDrift: PaymentDriftResult;
};

export function computeEarlyWarnings(records: MonthlyRecord[]): EarlyWarnings {
  return {
    distressPayment: detectDistressPayments(records),
    marginCompression: detectMarginCompression(records),
    paymentDrift: detectPaymentDrift(records),
  };
}
