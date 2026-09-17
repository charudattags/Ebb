import { create } from "zustand";
import type { Borrower, Cohort } from "@/lib/types";
import { DEMO_BORROWERS, DEMO_COHORTS } from "@/lib/data";
import type { RestructureOptionKey } from "@/lib/engine/restructure";

export type OfficerDecision = {
  status: "approved" | "overridden" | "requested_more_data";
  optionKey?: RestructureOptionKey;
  note: string;
  decidedAt: string; // ISO timestamp
};

export type ImportWarning = { borrowerId?: string; message: string };

type EbbState = {
  borrowers: Borrower[];
  cohorts: Cohort[];
  datasetLabel: string;
  importWarnings: ImportWarning[];
  decisions: Record<string, OfficerDecision>;

  loadDataset: (borrowers: Borrower[], cohorts: Cohort[], label: string, warnings?: ImportWarning[]) => void;
  resetToDemo: () => void;
  setDecision: (borrowerId: string, decision: OfficerDecision) => void;
  clearDecision: (borrowerId: string) => void;
};

export const useEbbStore = create<EbbState>((set) => ({
  borrowers: DEMO_BORROWERS,
  cohorts: DEMO_COHORTS,
  datasetLabel: "Demo data (50 borrowers)",
  importWarnings: [],
  decisions: {},

  loadDataset: (borrowers, cohorts, label, warnings = []) =>
    set({ borrowers, cohorts, datasetLabel: label, importWarnings: warnings, decisions: {} }),

  resetToDemo: () =>
    set({
      borrowers: DEMO_BORROWERS,
      cohorts: DEMO_COHORTS,
      datasetLabel: "Demo data (50 borrowers)",
      importWarnings: [],
      decisions: {},
    }),

  setDecision: (borrowerId, decision) =>
    set((state) => ({ decisions: { ...state.decisions, [borrowerId]: decision } })),

  clearDecision: (borrowerId) =>
    set((state) => {
      const next = { ...state.decisions };
      delete next[borrowerId];
      return { decisions: next };
    }),
}));

export function useBorrower(id: string): Borrower | undefined {
  return useEbbStore((s) => s.borrowers.find((b) => b.id === id));
}

export function useCohortFor(borrower: Borrower | undefined): Cohort | undefined {
  return useEbbStore((s) => (borrower ? s.cohorts.find((c) => c.cohort_id === borrower.cohort_id) : undefined));
}
