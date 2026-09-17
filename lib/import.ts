import type { Borrower, Cohort, MonthlyRecord } from "@/lib/types";

export type ImportWarning = { borrowerId?: string; message: string };
export type ImportError = { row?: number; message: string };

export type ImportResult = {
  borrowers: Borrower[];
  cohorts: Cohort[];
  errors: ImportError[];
  warnings: ImportWarning[];
};

export type ImportSummary = {
  borrowerCount: number;
  recordCount: number;
  earliestMonth: string | null;
  latestMonth: string | null;
  warningCount: number;
  errorCount: number;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function summarize(result: ImportResult): ImportSummary {
  const allMonths = result.borrowers.flatMap((b) => b.monthly_records.map((r) => r.month));
  const sorted = [...allMonths].sort();
  return {
    borrowerCount: result.borrowers.length,
    recordCount: allMonths.length,
    earliestMonth: sorted[0] ?? null,
    latestMonth: sorted[sorted.length - 1] ?? null,
    warningCount: result.warnings.length,
    errorCount: result.errors.length,
  };
}

// ---------- JSON import ----------

export function parseJSONDataset(text: string, knownCohorts: Cohort[]): ImportResult {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { borrowers: [], cohorts: knownCohorts, errors: [{ message: `Invalid JSON: ${(e as Error).message}` }], warnings: [] };
  }
  if (!Array.isArray(data)) {
    return { borrowers: [], cohorts: knownCohorts, errors: [{ message: "Expected a JSON array of borrowers." }], warnings: [] };
  }

  const cohortTradeIndex = new Map(knownCohorts.map((c) => [c.trade.toLowerCase(), c]));
  const cohortIdIndex = new Map(knownCohorts.map((c) => [c.cohort_id, c]));
  const extraCohorts: Cohort[] = [];
  const borrowers: Borrower[] = [];

  data.forEach((raw, i) => {
    const rowLabel = `Borrower #${i + 1}`;
    if (typeof raw !== "object" || raw === null) {
      errors.push({ row: i + 1, message: `${rowLabel}: not an object.` });
      return;
    }
    const obj = raw as Record<string, unknown>;
    const requiredFields = ["id", "name", "trade", "region", "cohort_id", "principal", "apr", "tenure_months", "loan_start", "monthly_records"];
    const missing = requiredFields.filter((f) => obj[f] === undefined || obj[f] === null);
    if (missing.length > 0) {
      errors.push({ row: i + 1, message: `${rowLabel} (${String(obj.id ?? obj.name ?? "?")}): missing field(s) ${missing.join(", ")}.` });
      return;
    }
    if (!Array.isArray(obj.monthly_records) || obj.monthly_records.length < 1) {
      errors.push({ row: i + 1, message: `${rowLabel} (${obj.id}): needs at least 1 monthly record.` });
      return;
    }

    const recordErrors: string[] = [];
    const monthly_records: MonthlyRecord[] = (obj.monthly_records as unknown[]).map((r, ri) => {
      const rec = r as Record<string, unknown>;
      const fields = ["month", "income", "expenses_essential", "expenses_business", "txn_count", "emi_due", "amount_paid", "days_late"];
      for (const f of fields) {
        if (rec[f] === undefined || rec[f] === null) recordErrors.push(`record ${ri + 1}: missing ${f}`);
      }
      if (typeof rec.month === "string" && !MONTH_RE.test(rec.month)) {
        recordErrors.push(`record ${ri + 1}: invalid month "${rec.month}" (expected YYYY-MM)`);
      }
      for (const f of ["income", "expenses_essential", "expenses_business", "txn_count", "emi_due", "amount_paid", "days_late"]) {
        if (rec[f] !== undefined && typeof Number(rec[f]) !== "number") recordErrors.push(`record ${ri + 1}: ${f} is not numeric`);
      }
      return {
        month: String(rec.month),
        income: Number(rec.income),
        expenses_essential: Number(rec.expenses_essential),
        expenses_business: Number(rec.expenses_business),
        txn_count: Number(rec.txn_count),
        emi_due: Number(rec.emi_due),
        amount_paid: Number(rec.amount_paid),
        days_late: Number(rec.days_late),
      };
    });

    if (recordErrors.length > 0) {
      errors.push({ row: i + 1, message: `${rowLabel} (${obj.id}): ${recordErrors.slice(0, 3).join("; ")}${recordErrors.length > 3 ? ` (+${recordErrors.length - 3} more)` : ""}` });
      return;
    }

    let cohortId = String(obj.cohort_id);
    if (!cohortIdIndex.has(cohortId)) {
      const byTrade = cohortTradeIndex.get(String(obj.trade).toLowerCase());
      if (byTrade) {
        cohortId = byTrade.cohort_id;
      } else {
        cohortId = `_flat_${cohortId || String(obj.trade).toLowerCase().replace(/\s+/g, "_")}`;
        if (!extraCohorts.some((c) => c.cohort_id === cohortId)) {
          extraCohorts.push({
            cohort_id: cohortId,
            trade: String(obj.trade),
            seasonal_profile: new Array(12).fill(1),
            typical_recovery_weeks: 4,
            note: "Unknown cohort — flat seasonal profile assumed, treated as low confidence.",
          });
        }
        warnings.push({ borrowerId: String(obj.id), message: `Unknown cohort_id "${obj.cohort_id}" for ${obj.id} — using a flat seasonal profile.` });
      }
    }

    const emi = Number(obj.emi) || modalEmi(monthly_records);
    monthly_records.sort((a, b) => a.month.localeCompare(b.month));

    borrowers.push({
      id: String(obj.id),
      name: String(obj.name),
      trade: String(obj.trade),
      region: String(obj.region),
      cohort_id: cohortId,
      principal: Number(obj.principal),
      apr: Number(obj.apr),
      tenure_months: Number(obj.tenure_months),
      loan_start: String(obj.loan_start),
      history_months: monthly_records.length,
      emi,
      monthly_records,
    });
  });

  return { borrowers, cohorts: [...knownCohorts, ...extraCohorts], errors, warnings };
}

// ---------- CSV import ----------

const CSV_COLUMNS = [
  "borrower_id", "name", "trade", "region", "month",
  "income", "expenses_essential", "expenses_business", "txn_count",
  "emi_due", "amount_paid", "days_late",
] as const;

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function modalEmi(records: { emi_due: number }[]): number {
  const counts = new Map<number, number>();
  for (const r of records) counts.set(r.emi_due, (counts.get(r.emi_due) ?? 0) + 1);
  let best = records[0]?.emi_due ?? 0;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

export function parseCSVDataset(text: string, knownCohorts: Cohort[]): ImportResult {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { borrowers: [], cohorts: knownCohorts, errors: [{ message: "CSV needs a header row plus at least one data row." }], warnings: [] };
  }

  const header = parseCSVLine(lines[0]).map((h) => h.trim());
  const missingCols = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length > 0) {
    return {
      borrowers: [],
      cohorts: knownCohorts,
      errors: [{ message: `Missing required column(s): ${missingCols.join(", ")}.` }],
      warnings: [],
    };
  }
  const colIndex = Object.fromEntries(CSV_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof CSV_COLUMNS)[number], number>;

  type RowGroup = {
    name: string; trade: string; region: string;
    records: MonthlyRecord[];
  };
  const groups = new Map<string, RowGroup>();

  for (let li = 1; li < lines.length; li++) {
    const rowNum = li + 1; // 1-indexed with header
    const cells = parseCSVLine(lines[li]);
    if (cells.length < CSV_COLUMNS.length) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: expected ${CSV_COLUMNS.length} columns, found ${cells.length}.` });
      continue;
    }
    const borrowerId = cells[colIndex.borrower_id];
    const month = cells[colIndex.month];
    if (!borrowerId) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: missing borrower_id.` });
      continue;
    }
    if (!MONTH_RE.test(month)) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: invalid month "${month}" (expected YYYY-MM).` });
      continue;
    }
    const numericFields = ["income", "expenses_essential", "expenses_business", "txn_count", "emi_due", "amount_paid", "days_late"] as const;
    const numbers: Record<string, number> = {};
    let numericError = false;
    for (const f of numericFields) {
      const raw = cells[colIndex[f]];
      const n = Number(raw);
      if (raw === "" || Number.isNaN(n)) {
        errors.push({ row: rowNum, message: `Row ${rowNum}: "${f}" is not a number ("${raw}").` });
        numericError = true;
      } else {
        numbers[f] = n;
      }
    }
    if (numericError) continue;

    if (!groups.has(borrowerId)) {
      groups.set(borrowerId, {
        name: cells[colIndex.name] || borrowerId,
        trade: cells[colIndex.trade] || "Unknown",
        region: cells[colIndex.region] || "Unknown",
        records: [],
      });
    }
    groups.get(borrowerId)!.records.push({
      month,
      income: numbers.income,
      expenses_essential: numbers.expenses_essential,
      expenses_business: numbers.expenses_business,
      txn_count: numbers.txn_count,
      emi_due: numbers.emi_due,
      amount_paid: numbers.amount_paid,
      days_late: numbers.days_late,
    });
  }

  if (errors.length > 0) {
    return { borrowers: [], cohorts: knownCohorts, errors, warnings };
  }

  const cohortTradeIndex = new Map(knownCohorts.map((c) => [c.trade.toLowerCase(), c]));
  const extraCohorts: Cohort[] = [];
  const borrowers: Borrower[] = [];
  const defaultApr = 22;

  for (const [borrowerId, group] of groups) {
    if (group.records.length < 1) {
      errors.push({ message: `Borrower ${borrowerId}: no valid records.` });
      continue;
    }
    group.records.sort((a, b) => a.month.localeCompare(b.month));
    const emi = modalEmi(group.records);
    const historyMonths = group.records.length;

    const match = cohortTradeIndex.get(group.trade.toLowerCase());
    let cohortId: string;
    if (match) {
      cohortId = match.cohort_id;
    } else {
      cohortId = `_flat_${group.trade.toLowerCase().replace(/\s+/g, "_") || "unknown"}`;
      if (!extraCohorts.some((c) => c.cohort_id === cohortId)) {
        extraCohorts.push({
          cohort_id: cohortId,
          trade: group.trade,
          seasonal_profile: new Array(12).fill(1),
          typical_recovery_weeks: 4,
          note: "Unknown trade — flat seasonal profile assumed, treated as low confidence.",
        });
      }
      warnings.push({ borrowerId, message: `Unknown trade "${group.trade}" for ${borrowerId} — using a flat seasonal profile.` });
    }

    // CSV rows don't carry loan terms — estimate them from the EMI so the
    // restructuring math has something sane to work with, and say so.
    const assumedTenure = historyMonths + 12;
    const r = defaultApr / 1200;
    const factor = Math.pow(1 + r, assumedTenure);
    const principal = Math.round((emi * (factor - 1)) / (r * factor));
    warnings.push({
      borrowerId,
      message: `${borrowerId}: principal/APR/tenure aren't in the CSV — estimated from the modal EMI (₹${emi.toLocaleString("en-IN")}) at ${defaultApr}% APR.`,
    });

    borrowers.push({
      id: borrowerId,
      name: group.name,
      trade: group.trade,
      region: group.region,
      cohort_id: cohortId,
      principal,
      apr: defaultApr,
      tenure_months: assumedTenure,
      loan_start: group.records[0].month,
      history_months: historyMonths,
      emi,
      monthly_records: group.records,
    });
  }

  return { borrowers, cohorts: [...knownCohorts, ...extraCohorts], errors, warnings };
}

export function detectFormat(filename: string, text: string): "json" | "csv" {
  if (filename.toLowerCase().endsWith(".json")) return "json";
  if (filename.toLowerCase().endsWith(".csv")) return "csv";
  return text.trim().startsWith("[") || text.trim().startsWith("{") ? "json" : "csv";
}
