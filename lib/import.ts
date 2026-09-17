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

// ---------- Tabular import (.xlsx, .xls, .csv) via SheetJS, with column mapping ----------

export const EXPECTED_FIELDS = [
  { key: "borrower_id", label: "Borrower ID", required: true },
  { key: "name", label: "Name", required: true },
  { key: "trade", label: "Trade", required: true },
  { key: "region", label: "Region", required: true },
  { key: "month", label: "Month", required: true },
  { key: "income", label: "Income", required: true },
  { key: "expenses_essential", label: "Essential expenses", required: true },
  { key: "expenses_business", label: "Business expenses", required: true },
  { key: "txn_count", label: "Transaction count", required: true },
  { key: "emi_due", label: "EMI due", required: true },
  { key: "amount_paid", label: "Amount paid", required: true },
  { key: "days_late", label: "Days late", required: true },
] as const;

export type ExpectedFieldKey = (typeof EXPECTED_FIELDS)[number]["key"];
/** Maps an expected field to the index of the detected header column that holds it. */
export type ColumnMapping = Partial<Record<ExpectedFieldKey, number>>;

export type ParsedSheet = { fileName: string; headers: string[]; rows: unknown[][] };

const SYNONYMS: Record<ExpectedFieldKey, string[]> = {
  borrower_id: ["borrower_id", "borrowerid", "id", "customer_id", "client_id", "borrower", "borrowerno"],
  name: ["name", "borrower_name", "customer_name", "client_name", "fullname"],
  trade: ["trade", "occupation", "business", "sector", "profession"],
  region: ["region", "state", "location", "district", "area"],
  month: ["month", "period", "date", "ym", "yyyymm", "monthyear"],
  income: ["income", "revenue", "sales", "grossincome"],
  expenses_essential: ["expenses_essential", "essentialexpenses", "householdexpenses", "essential", "livingexpenses"],
  expenses_business: ["expenses_business", "businessexpenses", "stockexpenses", "business", "inventoryspend"],
  txn_count: ["txn_count", "transactions", "transactioncount", "numtransactions", "txncount"],
  emi_due: ["emi_due", "emi", "installmentdue", "due", "emiamount"],
  amount_paid: ["amount_paid", "paid", "payment", "amountpaid", "paidamount"],
  days_late: ["days_late", "latedays", "dayslate", "delay", "daysoverdue"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Best-guess header→field mapping so most real spreadsheets need zero manual remapping. */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of EXPECTED_FIELDS) {
    const syns = SYNONYMS[field.key].map(normalizeHeader);
    let bestIdx = -1;
    for (let i = 0; i < normalized.length; i++) {
      if (used.has(i)) continue;
      if (syns.includes(normalized[i])) { bestIdx = i; break; }
    }
    if (bestIdx === -1) {
      for (let i = 0; i < normalized.length; i++) {
        if (used.has(i)) continue;
        if (syns.some((s) => normalized[i].includes(s) || s.includes(normalized[i]))) { bestIdx = i; break; }
      }
    }
    if (bestIdx !== -1) {
      mapping[field.key] = bestIdx;
      used.add(bestIdx);
    }
  }
  return mapping;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MM_YYYY_RE = /^(0?[1-9]|1[0-2])[\/\-](\d{4})$/;
const YYYY_SLASH_MM_RE = /^(\d{4})[\/\-](0?[1-9]|1[0-2])$/;

/** Accepts YYYY-MM, MM/YYYY, YYYY/MM, an Excel date serial, or a JS Date. */
export function normalizeMonthValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(EXCEL_EPOCH_UTC + value * 86400000);
    if (!Number.isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return null;
  }
  const s = String(value ?? "").trim();
  if (MONTH_RE.test(s)) return s;
  const mmYyyy = s.match(MM_YYYY_RE);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, "0")}`;
  const yyyyMm = s.match(YYYY_SLASH_MM_RE);
  if (yyyyMm) return `${yyyyMm[1]}-${yyyyMm[2].padStart(2, "0")}`;
  return null;
}

function modalEmi(records: { emi_due: number }[]): number {
  const counts = new Map<number, number>();
  for (const r of records) counts.set(r.emi_due, (counts.get(r.emi_due) ?? 0) + 1);
  let best = records[0]?.emi_due ?? 0;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

type RowGroup = { name: string; trade: string; region: string; records: MonthlyRecord[] };

/** Shared tail: cohort-matching, EMI/loan-term estimation, and Borrower assembly. */
function finalizeGroups(groups: Map<string, RowGroup>, knownCohorts: Cohort[], warnings: ImportWarning[]): { borrowers: Borrower[]; cohorts: Cohort[] } {
  const cohortTradeIndex = new Map(knownCohorts.map((c) => [c.trade.toLowerCase(), c]));
  const extraCohorts: Cohort[] = [];
  const borrowers: Borrower[] = [];
  const defaultApr = 22;

  for (const [borrowerId, group] of groups) {
    if (group.records.length < 1) continue;
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

    // Spreadsheet rows don't carry loan terms — estimate them from the EMI so
    // the restructuring math has something sane to work with, and say so.
    const assumedTenure = historyMonths + 12;
    const r = defaultApr / 1200;
    const factor = Math.pow(1 + r, assumedTenure);
    const principal = Math.round((emi * (factor - 1)) / (r * factor));
    warnings.push({
      borrowerId,
      message: `${borrowerId}: principal/APR/tenure aren't in the file — estimated from the modal EMI (₹${emi.toLocaleString("en-IN")}) at ${defaultApr}% APR.`,
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

  return { borrowers, cohorts: [...knownCohorts, ...extraCohorts] };
}

/** Parses .xlsx/.xls/.csv into raw header + data rows. Runs entirely client-side via SheetJS. */
export async function parseSheetFile(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false, defval: "" });
  const headers = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  return { fileName: file.name, headers, rows: rows.slice(1) };
}

/** Validates a mapping against required fields, without touching row data yet. */
export function validateMapping(mapping: ColumnMapping): string[] {
  return EXPECTED_FIELDS.filter((f) => mapping[f.key] === undefined).map((f) => f.label);
}

/** Row-by-row validation + grouping, using a confirmed header→field mapping. Never throws; collects errors instead. */
export function buildDatasetFromRows(sheet: ParsedSheet, mapping: ColumnMapping, knownCohorts: Cohort[]): ImportResult {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];

  const missing = validateMapping(mapping);
  if (missing.length > 0) {
    return { borrowers: [], cohorts: knownCohorts, errors: [{ message: `Missing mapping for required column(s): ${missing.join(", ")}.` }], warnings: [] };
  }

  const numericFields = ["income", "expenses_essential", "expenses_business", "txn_count", "emi_due", "amount_paid", "days_late"] as const;
  const groups = new Map<string, RowGroup>();

  sheet.rows.forEach((cells, i) => {
    const rowNum = i + 2; // 1-indexed, plus the header row
    const get = (key: ExpectedFieldKey) => cells[mapping[key]!];

    const borrowerId = String(get("borrower_id") ?? "").trim();
    if (!borrowerId) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: missing borrower_id.` });
      return;
    }
    const month = normalizeMonthValue(get("month"));
    if (!month) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: unrecognised month "${get("month")}" (expected YYYY-MM, MM/YYYY, or a date).` });
      return;
    }

    const numbers: Record<string, number> = {};
    let numericError = false;
    for (const f of numericFields) {
      const raw = get(f);
      const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, "").trim());
      if (raw === undefined || raw === "" || Number.isNaN(n)) {
        errors.push({ row: rowNum, message: `Row ${rowNum}: "${f}" is not a number ("${raw}").` });
        numericError = true;
      } else {
        numbers[f] = n;
      }
    }
    if (numericError) return;

    if (!groups.has(borrowerId)) {
      groups.set(borrowerId, {
        name: String(get("name") ?? "").trim() || borrowerId,
        trade: String(get("trade") ?? "").trim() || "Unknown",
        region: String(get("region") ?? "").trim() || "Unknown",
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
  });

  if (errors.length > 0) {
    return { borrowers: [], cohorts: knownCohorts, errors, warnings };
  }

  const { borrowers, cohorts } = finalizeGroups(groups, knownCohorts, warnings);
  return { borrowers, cohorts, errors, warnings };
}

export function detectFormat(filename: string): "json" | "sheet" {
  return filename.toLowerCase().endsWith(".json") ? "json" : "sheet";
}
