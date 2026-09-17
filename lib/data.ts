import borrowersRaw from "@/data/borrowers.json";
import cohortsRaw from "@/data/cohorts.json";
import type { Borrower, Cohort, RawBorrower } from "@/lib/types";

// Strip ground_truth at the load boundary — nothing downstream of this
// module may read it. Tests that need it read the raw JSON file directly.
export function stripGroundTruth(raw: RawBorrower): Borrower {
  const { ground_truth: _groundTruth, ...rest } = raw;
  return rest;
}

export const DEMO_BORROWERS: Borrower[] = (borrowersRaw as RawBorrower[]).map(stripGroundTruth);
export const DEMO_COHORTS: Cohort[] = cohortsRaw as Cohort[];

const allBorrowers: Borrower[] = DEMO_BORROWERS;
const allCohorts: Cohort[] = DEMO_COHORTS;

const borrowerById = new Map(allBorrowers.map((b) => [b.id, b]));
const cohortById = new Map(allCohorts.map((c) => [c.cohort_id, c]));

export function getBorrowers(): Borrower[] {
  return allBorrowers;
}

export function getBorrower(id: string): Borrower | undefined {
  return borrowerById.get(id);
}

export function getCohorts(): Cohort[] {
  return allCohorts;
}

export function getCohort(cohortId: string): Cohort | undefined {
  return cohortById.get(cohortId);
}
