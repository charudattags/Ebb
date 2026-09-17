import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const borrowers = JSON.parse(readFileSync(join(__dirname, "..", "data", "borrowers.json"), "utf-8"));

const COLUMNS = [
  "borrower_id", "name", "trade", "region", "month",
  "income", "expenses_essential", "expenses_business", "txn_count",
  "emi_due", "amount_paid", "days_late",
];

const sample = borrowers.slice(0, 10);
const rows = [COLUMNS.join(",")];

for (const b of sample) {
  for (const r of b.monthly_records) {
    rows.push(
      [b.id, b.name, b.trade, b.region, r.month, r.income, r.expenses_essential, r.expenses_business, r.txn_count, r.emi_due, r.amount_paid, r.days_late].join(",")
    );
  }
}

const outDir = join(__dirname, "..", "public");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sample-import.csv"), rows.join("\n") + "\n");
console.log(`Wrote public/sample-import.csv (${sample.length} borrowers, ${rows.length - 1} rows)`);
