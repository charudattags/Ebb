// Checkpoint test required by the build spec: classify all 50 borrowers and
// compare against ground_truth (read from raw JSON here ONLY — the engine
// itself must never see this field). If accuracy drops below ~85%, the
// classifier's thresholds need tuning, not the data.
import { describe, it, expect } from "vitest";
import borrowersRaw from "../data/borrowers.json";
import cohortsRaw from "../data/cohorts.json";
import { classify } from "@/lib/engine/condition";
import type { Cohort, RawBorrower } from "@/lib/types";

const ARCHETYPE_TO_EXPECTED_LABEL: Record<string, string> = {
  structural: "STRUCTURAL",
  seasonal_in_dip: "SEASONAL",
  temporary_shock: "TEMPORARY",
  seasonal: "STABLE",
  flat: "STABLE",
  improving: "IMPROVING",
  thin_file: "STABLE",
};

describe("classifier accuracy against ground_truth", () => {
  const cohorts = cohortsRaw as Cohort[];
  const cohortById = new Map(cohorts.map((c) => [c.cohort_id, c]));
  const borrowers = borrowersRaw as RawBorrower[];

  it("hits at least 85% accuracy across all 50 borrowers", () => {
    const confusion: Record<string, Record<string, number>> = {};
    let correct = 0;
    const misses: string[] = [];

    for (const raw of borrowers) {
      const { ground_truth, ...borrower } = raw;
      const cohort = cohortById.get(borrower.cohort_id)!;
      const result = classify(borrower, cohort);
      const expected = ARCHETYPE_TO_EXPECTED_LABEL[ground_truth.archetype];

      confusion[expected] ??= {};
      confusion[expected][result.label] = (confusion[expected][result.label] ?? 0) + 1;

      if (result.label === expected) {
        correct++;
      } else {
        misses.push(`${borrower.id} (${ground_truth.archetype}): expected ${expected}, got ${result.label}`);
      }
    }

    const accuracy = correct / borrowers.length;

    // eslint-disable-next-line no-console
    console.log("\nConfusion matrix (rows = expected, cols = predicted):");
    // eslint-disable-next-line no-console
    console.table(confusion);
    // eslint-disable-next-line no-console
    console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${borrowers.length})`);
    if (misses.length > 0) {
      // eslint-disable-next-line no-console
      console.log("Misses:\n" + misses.join("\n"));
    }

    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });

  it("never lets a distressed structural borrower masquerade as merely seasonal", () => {
    for (const raw of borrowers) {
      if (raw.ground_truth.archetype !== "structural") continue;
      const { ground_truth: _gt, ...borrower } = raw;
      const cohort = cohortById.get(borrower.cohort_id)!;
      const result = classify(borrower, cohort);
      expect(result.label).not.toBe("SEASONAL");
    }
  });

  it("produces a non-empty, numeric evidence trail for every borrower", () => {
    for (const raw of borrowers) {
      const { ground_truth: _gt, ...borrower } = raw;
      const cohort = cohortById.get(borrower.cohort_id)!;
      const result = classify(borrower, cohort);
      expect(result.evidence.length).toBeGreaterThan(0);
      for (const line of result.evidence) {
        expect(typeof line).toBe("string");
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
});
