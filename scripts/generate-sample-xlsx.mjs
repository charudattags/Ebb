import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const borrowers = JSON.parse(readFileSync(join(__dirname, "..", "data", "borrowers.json"), "utf-8"));

// Deliberately human, not machine: header names differ from our internal
// schema (Borrower Id, EMI Amount, ...) and months are day-one dates, so the
// import flow's column mapping + month normalisation both get exercised.
const HEADERS = [
  "Borrower Id", "Full Name", "Occupation", "State", "Period",
  "Income", "Household Expenses", "Business Expenses", "Transactions",
  "EMI Amount", "Paid Amount", "Days Overdue",
];

const sample = borrowers.slice(0, 12);
const rows = [HEADERS];

for (const b of sample) {
  for (const r of b.monthly_records) {
    const [y, m] = r.month.split("-").map(Number);
    rows.push([
      b.id, b.name, b.trade, b.region,
      new Date(Date.UTC(y, m - 1, 1)),
      r.income, r.expenses_essential, r.expenses_business, r.txn_count,
      r.emi_due, r.amount_paid, r.days_late,
    ]);
  }
}

const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Borrowers");

const outDir = join(__dirname, "..", "public");
mkdirSync(outDir, { recursive: true });
XLSX.writeFile(wb, join(outDir, "sample-import.xlsx"));
console.log(`Wrote public/sample-import.xlsx (${sample.length} borrowers, ${rows.length - 1} rows)`);
