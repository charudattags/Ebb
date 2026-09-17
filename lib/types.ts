// Raw data shapes (as they appear in /data/*.json).

export type MonthlyRecord = {
  month: string; // "YYYY-MM"
  income: number;
  expenses_essential: number;
  expenses_business: number;
  txn_count: number;
  emi_due: number;
  amount_paid: number;
  days_late: number;
};

export type GroundTruth = {
  archetype:
    | "seasonal"
    | "seasonal_in_dip"
    | "temporary_shock"
    | "structural"
    | "flat"
    | "improving"
    | "thin_file";
  margin_compression: boolean;
  shock_window: [number, number] | null;
};

export type RawBorrower = {
  id: string;
  name: string;
  trade: string;
  region: string;
  cohort_id: string;
  principal: number;
  apr: number;
  tenure_months: number;
  loan_start: string;
  history_months: number;
  emi: number;
  monthly_records: MonthlyRecord[];
  /** Testing only — the engine must never read this. Optional because
   * imported (real) datasets never carry it. */
  ground_truth?: GroundTruth;
};

export type Cohort = {
  cohort_id: string;
  trade: string;
  seasonal_profile: number[]; // 12 multipliers, Jan..Dec, mean 1.0
  typical_recovery_weeks: number;
  note: string;
};

// UI-facing borrower type — the engine and every screen consume only this.
// It deliberately has no `ground_truth`: the classifier must never see it.
export type Borrower = Omit<RawBorrower, "ground_truth">;
