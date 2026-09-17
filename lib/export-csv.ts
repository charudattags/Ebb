import type { Borrower } from "@/lib/types";

const COLUMNS = [
  "borrower_id", "name", "trade", "region", "month",
  "income", "expenses_essential", "expenses_business", "txn_count",
  "emi_due", "amount_paid", "days_late",
] as const;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function borrowersToCSV(borrowers: Borrower[]): string {
  const rows = [COLUMNS.join(",")];
  for (const b of borrowers) {
    for (const r of b.monthly_records) {
      rows.push(
        [
          b.id, b.name, b.trade, b.region, r.month,
          r.income, r.expenses_essential, r.expenses_business, r.txn_count,
          r.emi_due, r.amount_paid, r.days_late,
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }
  return rows.join("\n") + "\n";
}

export function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
