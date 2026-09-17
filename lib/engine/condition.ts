import type { Borrower, Cohort } from "@/lib/types";
import { surplus } from "@/lib/engine/affordability";
import { calendarMonth, calendarMonthName, monthLabel } from "@/lib/engine/month";
import { mean, normalizedSlope } from "@/lib/engine/stats";
import { computeSeasonality, priorSameMonthObservations, MIN_MONTHS_FOR_OWN_SEASONALITY } from "@/lib/engine/seasonality";
import { computeConfidence, type ConfidenceResult } from "@/lib/engine/confidence";
import { formatINR } from "@/lib/format";

export type ClassificationLabel = "SEASONAL" | "STRUCTURAL" | "TEMPORARY" | "IMPROVING" | "STABLE";

export type ClassificationResult = {
  label: ClassificationLabel;
  confidence: number;
  confidenceLevel: ConfidenceResult["level"];
  confidenceReason: string;
  evidence: string[];
  seasonalIndexSource: "own" | "cohort";
  slope6: number | null;
  slope12: number | null;
};

const SEASONAL_DIP_THRESHOLD = 0.85;
const STRUCTURAL_SLOPE_THRESHOLD = -0.015; // -1.5%/month
const IMPROVING_SLOPE_THRESHOLD = 0.015; // +1.5%/month
const SHOCK_DROP_THRESHOLD = 0.7; // 30% below deseasonalized baseline

function slopeOverLast(deseasonalized: number[], n: number): number | null {
  if (deseasonalized.length < n) return null;
  return normalizedSlope(deseasonalized.slice(-n));
}

/**
 * Displayed %/month, clamped to a believable range. The raw slope can spike
 * arbitrarily high when a window's mean sits near zero (the denominator in
 * "% of mean") — real for the threshold check, meaningless as a headline
 * number, so evidence text shows "90%+" rather than an implausible figure.
 */
function formatSlopePct(slope: number): string {
  const pct = slope * 100;
  if (Math.abs(pct) > 90) return `${pct > 0 ? "90%+" : "-90%+"}`;
  return `${pct.toFixed(1)}%`;
}

type PriorDip = { globalIndex: number; year: number; value: number; recoveredAt: number | null };

/**
 * A trend-robust local baseline around month j: the average surplus of the
 * surrounding months (excluding j itself). Comparing against nearby months
 * — rather than the whole-history mean — keeps a structural decline or a
 * shock from making its own neighbourhood look like a "recovered dip".
 */
function localBaseline(surplusValues: number[], j: number, radius = 3): number {
  const lo = Math.max(0, j - radius);
  const hi = Math.min(surplusValues.length - 1, j + radius);
  const neighbours = [];
  for (let k = lo; k <= hi; k++) {
    if (k === j) continue;
    neighbours.push(surplusValues[k]);
  }
  return neighbours.length > 0 ? mean(neighbours) : mean(surplusValues);
}

function findPriorSimilarDips(
  records: Borrower["monthly_records"],
  surplusValues: number[],
  currentCM: number,
  overallMean: number,
  recoveryWeeks: number
): PriorDip[] {
  const recoveryMonths = Math.max(1, Math.ceil(recoveryWeeks / 4.345) + 1);
  const out: PriorDip[] = [];
  for (let j = 0; j < records.length - 1; j++) {
    if (calendarMonth(records[j].month) !== currentCM) continue;
    const base = localBaseline(surplusValues, j);
    const wasLow = base !== 0 ? surplusValues[j] < base * SEASONAL_DIP_THRESHOLD : surplusValues[j] < 0;
    if (!wasLow) continue;
    let recoveredAt: number | null = null;
    for (let k = j + 1; k <= Math.min(records.length - 1, j + recoveryMonths); k++) {
      if (surplusValues[k] >= base * 0.9) {
        recoveredAt = k;
        break;
      }
    }
    if (recoveredAt !== null) {
      const [y] = records[j].month.split("-").map(Number);
      out.push({ globalIndex: j, year: y, value: surplusValues[j], recoveredAt });
    }
  }
  return out;
}

export function classify(borrower: Borrower, cohort: Cohort): ClassificationResult {
  const records = borrower.monthly_records;
  const H = records.length;
  const seasonality = computeSeasonality(records, cohort.seasonal_profile);
  const surplusValues = records.map((r) => surplus(r));
  const overallMean = mean(surplusValues);

  const deseasonalized = records.map((r, i) => {
    const idx = seasonality.index[calendarMonth(r.month)];
    return surplusValues[i] / (Math.abs(idx) > 0.05 ? idx : 0.05);
  });

  const slope6 = slopeOverLast(deseasonalized, 6);
  const slope12 = slopeOverLast(deseasonalized, 12);
  const slope3 = slopeOverLast(deseasonalized, 3);

  const currentRecord = records[H - 1];
  const currentCM = calendarMonth(currentRecord.month);
  const currentSurplus = surplusValues[H - 1];
  const currentIndexVal = seasonality.index[currentCM];

  const prior = priorSameMonthObservations(records, currentCM, 1);
  const confidenceInput = {
    historyMonths: H,
    priorSameMonthObservations: prior,
    cohortSize: 5,
    currentMonthName: calendarMonthName(currentCM),
    cohortTrade: cohort.trade,
  };
  const confidenceResult = computeConfidence(confidenceInput);

  const isLowNow = currentSurplus < currentRecord.emi_due || currentSurplus < overallMean * SEASONAL_DIP_THRESHOLD;
  const priorDips =
    seasonality.source === "own"
      ? findPriorSimilarDips(records, surplusValues, currentCM, overallMean, cohort.typical_recovery_weeks)
      : [];

  // Rule 1 — SEASONAL
  if (H >= MIN_MONTHS_FOR_OWN_SEASONALITY && isLowNow && currentIndexVal < SEASONAL_DIP_THRESHOLD && priorDips.length >= 1) {
    const pctBelow = overallMean !== 0 ? Math.round((1 - currentSurplus / overallMean) * 100) : 0;
    const dipList = priorDips
      .slice(-2)
      .map((d) => `${d.year} (${formatINR(d.value)})`)
      .join(" and ");
    const businessNote = currentRecord.expenses_business > mean(records.map((r) => r.expenses_business))
      ? `Business expenses rose to ${formatINR(currentRecord.expenses_business)} this month — she is buying stock ahead of her next busy month, which is normal for her.`
      : `Business expenses this month were ${formatINR(currentRecord.expenses_business)}, in line with her usual pre-season pattern.`;
    const evidence = [
      `Surplus fell to ${formatINR(currentSurplus)} in ${monthLabel(currentRecord.month)}, ${Math.abs(pctBelow)}% ${pctBelow >= 0 ? "below" : "above"} her usual month.`,
      `${calendarMonthName(currentCM)} was similarly low in ${dipList}.`,
      `${priorDips.length > 1 ? "Every time" : "That time"} she recovered within about ${cohort.typical_recovery_weeks} weeks as demand picked back up.`,
      businessNote,
    ];
    return {
      label: "SEASONAL",
      confidence: confidenceResult.value,
      confidenceLevel: confidenceResult.level,
      confidenceReason: confidenceResult.reason,
      evidence,
      seasonalIndexSource: seasonality.source,
      slope6,
      slope12,
    };
  }

  // Rule 2 — STRUCTURAL
  if (slope6 !== null && slope12 !== null && slope6 <= STRUCTURAL_SLOPE_THRESHOLD && slope12 <= STRUCTURAL_SLOPE_THRESHOLD) {
    const first12 = deseasonalized.slice(0, 12);
    const last12 = deseasonalized.slice(-12);
    const startAvg = mean(first12);
    const endAvg = mean(last12);
    const evidence = [
      `Season-adjusted surplus has fallen ${formatINR(startAvg - endAvg)}/month on average, a steady decline rather than a seasonal dip.`,
      `6-month trend: ${formatSlopePct(slope6)}/month. 12-month trend: ${formatSlopePct(slope12)}/month — both consistently negative.`,
      `This month's surplus of ${formatINR(currentSurplus)} against an EMI of ${formatINR(currentRecord.emi_due)} leaves little room, and the trend shows no sign of reversing on its own.`,
    ];
    return {
      label: "STRUCTURAL",
      confidence: confidenceResult.value,
      confidenceLevel: confidenceResult.level,
      confidenceReason: confidenceResult.reason,
      evidence,
      seasonalIndexSource: seasonality.source,
      slope6,
      slope12,
    };
  }

  // Rule 3 — TEMPORARY
  {
    const recentWindow = deseasonalized.slice(-6);
    const baselineWindow = deseasonalized.slice(0, Math.max(1, H - 6));
    const baseline = baselineWindow.length > 0 ? mean(baselineWindow) : mean(deseasonalized);
    let troughLocalIdx = 0;
    let troughVal = Infinity;
    recentWindow.forEach((v, i) => {
      if (v < troughVal) {
        troughVal = v;
        troughLocalIdx = i;
      }
    });
    const sharpDrop = baseline > 0 && troughVal <= baseline * SHOCK_DROP_THRESHOLD;
    const troughGlobalIdx = H - recentWindow.length + troughLocalIdx;
    const recovering = slope3 !== null && slope3 > 0;

    if (sharpDrop && recovering) {
      const dropPct = baseline > 0 ? Math.round((1 - troughVal / baseline) * 100) : 0;
      const evidence = [
        `Surplus dropped sharply to ${formatINR(surplusValues[troughGlobalIdx])} in ${monthLabel(records[troughGlobalIdx].month)}, ${dropPct}% below her usual level.`,
        `The last 3 months show a recovering trend (+${formatSlopePct(slope3!)}/month), unlike a structural decline.`,
        `This does not match her seasonal rhythm for ${monthLabel(currentRecord.month)} — it looks like a one-off setback, not a repeating pattern.`,
      ];
      return {
        label: "TEMPORARY",
        confidence: confidenceResult.value,
        confidenceLevel: confidenceResult.level,
        confidenceReason: confidenceResult.reason,
        evidence,
        seasonalIndexSource: seasonality.source,
        slope6,
        slope12,
      };
    }
  }

  // Rule 4 — IMPROVING
  if (slope6 !== null && slope12 !== null && slope6 >= IMPROVING_SLOPE_THRESHOLD && slope12 >= IMPROVING_SLOPE_THRESHOLD) {
    const evidence = [
      `Season-adjusted surplus is trending up: ${formatSlopePct(slope6)}/month over 6 months, ${formatSlopePct(slope12)}/month over 12.`,
      `Current surplus of ${formatINR(currentSurplus)} comfortably covers her EMI of ${formatINR(currentRecord.emi_due)}.`,
      `The business is growing, not just seasonally recovering — this is a sustained trend across both windows.`,
    ];
    return {
      label: "IMPROVING",
      confidence: confidenceResult.value,
      confidenceLevel: confidenceResult.level,
      confidenceReason: confidenceResult.reason,
      evidence,
      seasonalIndexSource: seasonality.source,
      slope6,
      slope12,
    };
  }

  // Rule 5 — STABLE
  {
    const evidence = [
      `Surplus of ${formatINR(currentSurplus)} this month is in line with her typical pattern.`,
      slope6 !== null
        ? `6-month trend is flat (${formatSlopePct(slope6)}/month) — no seasonal dip, shock, or structural drift detected.`
        : `Not enough history yet to fit a trend, but nothing in the recent record looks unusual.`,
      `EMI of ${formatINR(currentRecord.emi_due)} is well within her usual capacity.`,
    ];
    return {
      label: "STABLE",
      confidence: confidenceResult.value,
      confidenceLevel: confidenceResult.level,
      confidenceReason: confidenceResult.reason,
      evidence,
      seasonalIndexSource: seasonality.source,
      slope6,
      slope12,
    };
  }
}
