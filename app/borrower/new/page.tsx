"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEbbStore } from "@/lib/store";
import { analyzeBorrower, FLAT_FALLBACK_COHORT } from "@/lib/engine";
import { addMonths, monthIndex, monthLabel } from "@/lib/engine/month";
import { formatINR } from "@/lib/format";
import { classificationMeta } from "@/lib/classification-ui";
import type { Borrower, MonthlyRecord } from "@/lib/types";

const STEPS = ["Who", "Loan", "History", "Review"] as const;
type HistoryRow = { month: string; income: number; essential: number; business: number; txn: number };

const INPUT_CLS =
  "w-full rounded-lg border border-bg-border bg-bg-raised px-3 py-2 text-sm text-ink focus:border-class-seasonal focus:outline-none";
const CELL_CLS =
  "w-24 rounded-md border border-bg-border bg-bg px-2 py-1 text-ink focus:border-class-seasonal focus:outline-none";

function computeEmi(principal: number, aprPct: number, tenureMonths: number): number {
  if (tenureMonths <= 0) return 0;
  const r = aprPct / 1200;
  if (r === 0) return Math.round(principal / tenureMonths);
  const factor = Math.pow(1 + r, tenureMonths);
  return Math.round((principal * r * factor) / (factor - 1));
}

function todayMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function NewBorrowerPage() {
  const router = useRouter();
  const cohorts = useEbbStore((s) => s.cohorts);
  const addBorrower = useEbbStore((s) => s.addBorrower);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [cohortId, setCohortId] = useState(cohorts[0]?.cohort_id ?? "");
  const [region, setRegion] = useState("");

  const [principal, setPrincipal] = useState(30000);
  const [apr, setApr] = useState(22);
  const [tenureMonths, setTenureMonths] = useState(12);
  const [loanStart, setLoanStart] = useState(todayMonth());

  const [historyStart, setHistoryStart] = useState(addMonths(todayMonth(), -5));
  const [monthCount, setMonthCount] = useState(6);
  const [rows, setRows] = useState<HistoryRow[]>(() =>
    Array.from({ length: 6 }, (_, i) => ({ month: addMonths(addMonths(todayMonth(), -5), i), income: 0, essential: 0, business: 0, txn: 0 }))
  );

  const cohort = cohorts.find((c) => c.cohort_id === cohortId) ?? { ...FLAT_FALLBACK_COHORT, cohort_id: cohortId, trade: "Unknown" };
  const emi = useMemo(() => computeEmi(principal, apr, tenureMonths), [principal, apr, tenureMonths]);

  function regenerateRows(start: string, count: number) {
    setRows((prev) => {
      const byMonth = new Map(prev.map((r) => [r.month, r]));
      return Array.from({ length: count }, (_, i) => {
        const m = addMonths(start, i);
        return byMonth.get(m) ?? { month: m, income: 0, essential: 0, business: 0, txn: 0 };
      });
    });
  }

  function updateRow(i: number, field: keyof HistoryRow, value: number) {
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, [field]: value } : r)));
  }

  function handlePaste(startIdx: number, e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return; // let single-cell pastes behave normally
    e.preventDefault();
    const lines = text.trim().split(/\r?\n/);
    setRows((prev) => {
      const next = [...prev];
      lines.forEach((line, li) => {
        const ri = startIdx + li;
        if (ri >= next.length) return;
        const cells = line.split(/\t|,/).map((c) => Number(c.trim()) || 0);
        next[ri] = {
          ...next[ri],
          income: cells[0] ?? next[ri].income,
          essential: cells[1] ?? next[ri].essential,
          business: cells[2] ?? next[ri].business,
          txn: cells[3] ?? next[ri].txn,
        };
      });
      return next;
    });
  }

  const whoValid = name.trim().length > 0 && cohortId && region.trim().length > 0;
  const loanValid = principal > 0 && apr >= 0 && tenureMonths >= 1 && /^\d{4}-\d{2}$/.test(loanStart);
  const historyValid = rows.length >= 1;

  const draftBorrower: Borrower | null = useMemo(() => {
    if (!whoValid || !loanValid || !historyValid) return null;
    const monthly_records: MonthlyRecord[] = rows.map((r) => {
      const started = monthIndex(r.month) >= monthIndex(loanStart);
      return {
        month: r.month,
        income: r.income,
        expenses_essential: r.essential,
        expenses_business: r.business,
        txn_count: r.txn,
        emi_due: started ? emi : 0,
        amount_paid: started ? emi : 0,
        days_late: 0,
      };
    });
    const id = `NEW-${name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "BRWR"}-${String(Math.floor(Math.random() * 900) + 100)}`;
    return {
      id,
      name: name.trim(),
      trade: cohort.trade,
      region: region.trim(),
      cohort_id: cohort.cohort_id,
      principal,
      apr,
      tenure_months: tenureMonths,
      loan_start: loanStart,
      history_months: rows.length,
      emi,
      monthly_records,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whoValid, loanValid, historyValid, rows, name, cohort, region, principal, apr, tenureMonths, loanStart, emi]);

  const analysis = useMemo(() => (draftBorrower ? analyzeBorrower(draftBorrower, cohort) : null), [draftBorrower, cohort]);

  function save() {
    if (!draftBorrower) return;
    addBorrower(draftBorrower);
    router.push(`/borrower/${draftBorrower.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-faint hover:text-ink-dim">← Portfolio</Link>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Add a borrower</h1>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 ${
                i === step ? "border-class-seasonal bg-class-seasonal/15 text-class-seasonal" : i < step ? "border-class-improving/40 text-class-improving" : "border-bg-border text-ink-faint"
              }`}
            >
              {i + 1}. {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-ink-faint">—</span>}
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-bg-border bg-bg-panel p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLS} placeholder="Meena Devi" />
            </Field>
            <Field label="Trade">
              <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={INPUT_CLS}>
                {cohorts.map((c) => (
                  <option key={c.cohort_id} value={c.cohort_id}>{c.trade}</option>
                ))}
              </select>
            </Field>
            <Field label="Region">
              <input value={region} onChange={(e) => setRegion(e.target.value)} className={INPUT_CLS} placeholder="Kerala" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Loan amount (₹)">
              <input type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} className={INPUT_CLS} />
            </Field>
            <Field label="APR (%)">
              <input type="number" value={apr} onChange={(e) => setApr(Number(e.target.value))} className={INPUT_CLS} />
            </Field>
            <Field label="Tenure (months)">
              <input type="number" value={tenureMonths} onChange={(e) => setTenureMonths(Number(e.target.value))} className={INPUT_CLS} />
            </Field>
            <Field label="Loan start month">
              <input
                type="month"
                value={loanStart}
                onChange={(e) => setLoanStart(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <div className="rounded-lg border border-class-seasonal/30 bg-class-seasonal/10 px-4 py-3">
              <span className="text-xs text-ink-dim">Derived monthly EMI</span>
              <div className="font-display text-2xl font-semibold tabular text-class-seasonal">{formatINR(emi)}</div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="History starts">
                <input
                  type="month"
                  value={historyStart}
                  onChange={(e) => { setHistoryStart(e.target.value); regenerateRows(e.target.value, monthCount); }}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Number of months">
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={monthCount}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(36, Number(e.target.value) || 1));
                    setMonthCount(n);
                    regenerateRows(historyStart, n);
                  }}
                  className={`${INPUT_CLS} w-24`}
                />
              </Field>
            </div>
            <p className="text-xs text-ink-faint">
              Tip: copy a block from a spreadsheet (income, essential, business, transactions columns) and paste into
              the first income cell to fill the whole grid.
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-bg-border">
              <table className="w-full text-left text-xs tabular">
                <thead className="sticky top-0 bg-bg-raised text-ink-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium">Income</th>
                    <th className="px-3 py-2 font-medium">Essential</th>
                    <th className="px-3 py-2 font-medium">Business</th>
                    <th className="px-3 py-2 font-medium">Transactions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-border">
                  {rows.map((r, i) => (
                    <tr key={r.month}>
                      <td className="px-3 py-1.5 text-ink-dim">{monthLabel(r.month)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={r.income}
                          onPaste={(e) => handlePaste(i, e)}
                          onChange={(e) => updateRow(i, "income", Number(e.target.value))}
                          className={CELL_CLS}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" value={r.essential} onChange={(e) => updateRow(i, "essential", Number(e.target.value))} className={CELL_CLS} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" value={r.business} onChange={(e) => updateRow(i, "business", Number(e.target.value))} className={CELL_CLS} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" value={r.txn} onChange={(e) => updateRow(i, "txn", Number(e.target.value))} className={CELL_CLS} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 3 && draftBorrower && analysis && (
          <div className="space-y-4">
            <p className="text-sm text-ink-dim">
              Ebb has read {rows.length} month{rows.length === 1 ? "" : "s"} of history for {draftBorrower.name}. Here's
              what it found — before anything is saved.
            </p>
            {(() => {
              const meta = classificationMeta(analysis.classification.label);
              return (
                <div className={`rounded-xl border p-5 ${meta.border} ${meta.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-display text-lg font-medium ${meta.text}`}>{meta.label}</span>
                    <span className={`text-xl font-semibold tabular ${meta.text}`}>{Math.round(analysis.classification.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">{analysis.classification.confidenceReason}</p>
                  <ul className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                    {analysis.classification.evidence.map((line, i) => (
                      <li key={i} className="flex gap-2 text-sm text-ink">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  {rows.length < 13 && (
                    <p className="mt-3 text-xs italic text-ink-dim">
                      With only {rows.length} months on file, Ebb is honest about not knowing her rhythm yet —
                      confidence stays low until more months come in.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </section>

      <div className="flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg border border-bg-border px-4 py-2 text-sm text-ink-dim transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        {step < 3 ? (
          <button
            onClick={() => setStep((s) => Math.min(3, s + 1))}
            disabled={(step === 0 && !whoValid) || (step === 1 && !loanValid) || (step === 2 && !historyValid)}
            className="rounded-lg bg-class-seasonal/20 px-4 py-2 text-sm font-medium text-class-seasonal transition hover:bg-class-seasonal/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={save}
            className="rounded-lg bg-class-improving/20 px-4 py-2 text-sm font-medium text-class-improving transition hover:bg-class-improving/30"
          >
            Save & add to portfolio
          </button>
        )}
      </div>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-dim">{label}</span>
      {children}
    </label>
  );
}
