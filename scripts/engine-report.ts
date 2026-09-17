// Debug/proof tool: classify every bundled borrower and print label, confidence
// and evidence without touching the UI. `npm run engine:report`.
import borrowersRaw from "../data/borrowers.json";
import cohortsRaw from "../data/cohorts.json";
import { classify } from "../lib/engine/condition";
import { detectDistressPayments } from "../lib/engine/stress";
import type { Cohort, RawBorrower } from "../lib/types";

const cohorts = cohortsRaw as Cohort[];
const cohortById = new Map(cohorts.map((c) => [c.cohort_id, c]));
const borrowers = borrowersRaw as RawBorrower[];

const labelCounts: Record<string, number> = {};
let fixedFlagged = 0;
let ebbFlagged = 0;
let distressMonths = 0;

for (const raw of borrowers) {
  const { ground_truth: _gt, ...borrower } = raw;
  const cohort = cohortById.get(borrower.cohort_id);
  if (!cohort) {
    console.error(`No cohort for ${borrower.id} (${borrower.cohort_id})`);
    continue;
  }
  const result = classify(borrower, cohort);
  const last = borrower.monthly_records[borrower.monthly_records.length - 1];
  const isLateNaive = last.amount_paid < last.emi_due || last.days_late > 0;
  const distress = detectDistressPayments(borrower.monthly_records);

  labelCounts[result.label] = (labelCounts[result.label] ?? 0) + 1;
  if (isLateNaive) fixedFlagged++;
  if (result.label === "STRUCTURAL") ebbFlagged++;
  distressMonths += distress.events.length;

  console.log(`\n${borrower.id} — ${borrower.name} (${borrower.trade}, ${borrower.region})`);
  console.log(
    `  ${result.label}, ${Math.round(result.confidence * 100)}% [${result.confidenceLevel}, source=${result.seasonalIndexSource}]${
      isLateNaive ? "  [naive-late]" : ""
    }`
  );
  console.log(`  ${result.confidenceReason}`);
  for (const line of result.evidence) console.log(`    ${line}`);
  if (distress.detected) console.log(`  ⚠ ${distress.events.length} distress-payment month(s)`);
}

console.log("\n" + "=".repeat(60));
console.log("Label counts:", labelCounts);
console.log(
  `Headline: a fixed schedule flags ${fixedFlagged} of ${borrowers.length}; Ebb flags ${ebbFlagged} and explains ${
    fixedFlagged - ebbFlagged
  }.`
);
console.log(`Total distress-payment months across portfolio: ${distressMonths}`);
