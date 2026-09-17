"use client";

import { useMemo, useState } from "react";
import { useEbbStore } from "@/lib/store";
import { surplus } from "@/lib/engine/affordability";
import { monthLabel } from "@/lib/engine/month";
import { formatINR } from "@/lib/format";
import { borrowersToCSV, downloadCSV } from "@/lib/export-csv";

export default function BorrowerDataPage() {
  const borrowers = useEbbStore((s) => s.borrowers);
  const datasetLabel = useEbbStore((s) => s.datasetLabel);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return borrowers;
    return borrowers.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.trade.toLowerCase().includes(q) ||
        b.region.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
    );
  }, [borrowers, query]);

  const totalRecords = useMemo(() => borrowers.reduce((sum, b) => sum + b.monthly_records.length, 0), [borrowers]);

  const selected = borrowers.find((b) => b.id === selectedId) ?? null;

  function handleDownload() {
    const csv = borrowersToCSV(borrowers);
    downloadCSV("borrower-data.csv", csv);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Borrower data</h1>
          <p className="mt-1 text-sm text-ink-dim">
            {datasetLabel} — {borrowers.length} borrowers, {totalRecords.toLocaleString("en-IN")} monthly records. The
            raw input the engine works from, nothing derived.
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="rounded-lg border border-bg-border bg-bg-panel px-4 py-2 text-sm text-ink-dim transition hover:border-ink-faint hover:text-ink"
        >
          Download as CSV
        </button>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, trade, region, or ID…"
        className="w-full max-w-md rounded-lg border border-bg-border bg-bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-class-seasonal focus:outline-none"
      />

      <section className="overflow-hidden rounded-xl border border-bg-border">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm tabular">
            <thead className="sticky top-0 bg-bg-raised text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Trade</th>
                <th className="px-4 py-3 font-medium">Region</th>
                <th className="px-4 py-3 font-medium">Principal</th>
                <th className="px-4 py-3 font-medium">APR</th>
                <th className="px-4 py-3 font-medium">Tenure</th>
                <th className="px-4 py-3 font-medium">History</th>
                <th className="px-4 py-3 font-medium">EMI</th>
                <th className="px-4 py-3 font-medium">Loan start</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {filtered.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className={`cursor-pointer transition ${
                    b.id === selectedId ? "bg-class-seasonal/10" : "bg-bg-panel hover:bg-bg-raised"
                  }`}
                >
                  <td className="px-4 py-2 text-ink-faint">{b.id}</td>
                  <td className="px-4 py-2 font-medium text-ink">{b.name}</td>
                  <td className="px-4 py-2 text-ink-dim">{b.trade}</td>
                  <td className="px-4 py-2 text-ink-dim">{b.region}</td>
                  <td className="px-4 py-2 text-ink-dim">{formatINR(b.principal)}</td>
                  <td className="px-4 py-2 text-ink-dim">{b.apr}%</td>
                  <td className="px-4 py-2 text-ink-dim">{b.tenure_months} mo</td>
                  <td className="px-4 py-2 text-ink-dim">{b.history_months} mo</td>
                  <td className="px-4 py-2 text-ink-dim">{formatINR(b.emi)}</td>
                  <td className="px-4 py-2 text-ink-dim">{b.loan_start}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-ink-faint">
                    No borrowers match "{query}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-bg-border bg-bg-panel p-5">
        {!selected ? (
          <p className="text-sm text-ink-faint">Click a borrower above to see their full monthly record.</p>
        ) : (
          <>
            <h3 className="text-sm font-medium text-ink-dim">
              Monthly records — <span className="text-ink">{selected.name}</span> ({selected.id})
            </h3>
            <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-bg-border">
              <table className="w-full text-left text-sm tabular">
                <thead className="sticky top-0 bg-bg-raised text-xs uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-4 py-2 font-medium">Month</th>
                    <th className="px-4 py-2 font-medium">Income</th>
                    <th className="px-4 py-2 font-medium">Essential</th>
                    <th className="px-4 py-2 font-medium">Business</th>
                    <th className="px-4 py-2 font-medium">Surplus</th>
                    <th className="px-4 py-2 font-medium">Txns</th>
                    <th className="px-4 py-2 font-medium">EMI due</th>
                    <th className="px-4 py-2 font-medium">Paid</th>
                    <th className="px-4 py-2 font-medium">Days late</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-border">
                  {selected.monthly_records.map((r) => {
                    const s = surplus(r);
                    const short = r.amount_paid < r.emi_due;
                    return (
                      <tr key={r.month} className="bg-bg-panel">
                        <td className="px-4 py-2 text-ink">{monthLabel(r.month)}</td>
                        <td className="px-4 py-2 text-ink-dim">{formatINR(r.income)}</td>
                        <td className="px-4 py-2 text-ink-dim">{formatINR(r.expenses_essential)}</td>
                        <td className="px-4 py-2 text-ink-dim">{formatINR(r.expenses_business)}</td>
                        <td className={`px-4 py-2 ${s < 0 ? "text-class-structural" : "text-class-improving"}`}>
                          {formatINR(s)}
                        </td>
                        <td className="px-4 py-2 text-ink-dim">{r.txn_count}</td>
                        <td className="px-4 py-2 text-ink-dim">{formatINR(r.emi_due)}</td>
                        <td className={`px-4 py-2 ${short ? "text-class-temporary" : "text-ink-dim"}`}>
                          {formatINR(r.amount_paid)}
                        </td>
                        <td className={`px-4 py-2 ${r.days_late > 0 ? "text-class-temporary" : "text-ink-dim"}`}>
                          {r.days_late}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
