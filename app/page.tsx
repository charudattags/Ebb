"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useEbbStore } from "@/lib/store";
import { analyzeBorrower, FLAT_FALLBACK_COHORT } from "@/lib/engine";
import { stressRatio } from "@/lib/engine/stress";
import type { ClassificationLabel } from "@/lib/engine/condition";
import { classificationMeta } from "@/lib/classification-ui";
import { Sparkline } from "@/components/Sparkline";
import { playClick } from "@/lib/sound";
import type { Cohort } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  trade: string;
  region: string;
  label: ClassificationLabel;
  confidence: number;
  stress: number;
  isLateNaive: boolean;
  actionNeeded: string;
  surplusSeries: number[];
};

const LABEL_ORDER: ClassificationLabel[] = ["STRUCTURAL", "TEMPORARY", "SEASONAL", "IMPROVING", "STABLE"];

function actionFor(label: ClassificationLabel): string {
  switch (label) {
    case "STRUCTURAL":
      return "Review for restructuring";
    case "TEMPORARY":
      return "Monitor recovery";
    case "SEASONAL":
      return "None — expected dip";
    case "IMPROVING":
      return "None";
    default:
      return "None";
  }
}

export default function PortfolioPage() {
  const borrowers = useEbbStore((s) => s.borrowers);
  const cohorts = useEbbStore((s) => s.cohorts);
  const soundOn = useEbbStore((s) => s.soundOn);
  const [filter, setFilter] = useState<ClassificationLabel | "ALL">("ALL");
  const [sortByStress, setSortByStress] = useState(true);

  const cohortById = useMemo(() => new Map<string, Cohort>(cohorts.map((c) => [c.cohort_id, c])), [cohorts]);

  const rows: Row[] = useMemo(() => {
    return borrowers.map((b) => {
      const cohort = cohortById.get(b.cohort_id) ?? { ...FLAT_FALLBACK_COHORT, cohort_id: b.cohort_id, trade: b.trade };
      const analysis = analyzeBorrower(b, cohort);
      const last = b.monthly_records[b.monthly_records.length - 1];
      const isLateNaive = last.amount_paid < last.emi_due || last.days_late > 0;
      const surplusSeries = b.monthly_records.slice(-12).map((r) => r.income - r.expenses_essential - r.expenses_business);
      return {
        id: b.id,
        name: b.name,
        trade: b.trade,
        region: b.region,
        label: analysis.classification.label,
        confidence: analysis.classification.confidence,
        stress: stressRatio(last),
        isLateNaive,
        actionNeeded: actionFor(analysis.classification.label),
        surplusSeries,
      };
    });
  }, [borrowers, cohortById]);

  const fixedFlagged = rows.filter((r) => r.isLateNaive).length;
  const ebbFlagged = rows.filter((r) => r.label === "STRUCTURAL").length;
  const explained = fixedFlagged - ebbFlagged;

  const visibleRows = useMemo(() => {
    let r = filter === "ALL" ? rows : rows.filter((row) => row.label === filter);
    r = [...r].sort((a, b) => (sortByStress ? b.stress - a.stress : a.name.localeCompare(b.name)));
    return r;
  }, [rows, filter, sortByStress]);

  function click(fn: () => void) {
    if (soundOn) playClick();
    fn();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-bg-border bg-bg-panel p-6">
        <p className="text-sm text-ink-dim">The pitch, computed live from the active dataset:</p>
        <p className="mt-2 font-display text-xl leading-relaxed text-ink">
          A fixed schedule flags{" "}
          <span className="font-semibold text-class-structural">{fixedFlagged} of {rows.length}</span> borrowers as
          delinquent this month. Ebb flags{" "}
          <span className="font-semibold text-class-structural">{ebbFlagged}</span> — and explains the other{" "}
          <span className="font-semibold text-class-seasonal">{explained}</span> with evidence.
        </p>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => click(() => setFilter("ALL"))}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === "ALL" ? "border-ink bg-bg-raised text-ink" : "border-bg-border text-ink-dim hover:text-ink"
            }`}
          >
            All ({rows.length})
          </button>
          {LABEL_ORDER.map((label) => {
            const count = rows.filter((r) => r.label === label).length;
            const meta = classificationMeta(label);
            return (
              <button
                key={label}
                onClick={() => click(() => setFilter(label))}
                className={`rounded-full border px-3 py-1 text-xs transition ${meta.border} ${
                  filter === label ? meta.bg + " " + meta.text : "text-ink-dim hover:text-ink"
                }`}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>
        <button
          onClick={() => click(() => setSortByStress((v) => !v))}
          className="rounded-full border border-bg-border px-3 py-1 text-xs text-ink-dim transition hover:text-ink"
        >
          Sort: {sortByStress ? "Stress ratio ↓" : "Name A–Z"}
        </button>
      </section>

      <section className="overflow-hidden rounded-xl border border-bg-border">
        <table className="w-full text-left text-sm tabular">
          <thead className="bg-bg-raised text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3 font-medium">Borrower</th>
              <th className="px-4 py-3 font-medium">Trade</th>
              <th className="px-4 py-3 font-medium">Region</th>
              <th className="px-4 py-3 font-medium">12-month rhythm</th>
              <th className="px-4 py-3 font-medium">Classification</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Stress ratio</th>
              <th className="px-4 py-3 font-medium">Action needed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {visibleRows.map((row) => {
              const meta = classificationMeta(row.label);
              return (
                <tr key={row.id} className={`${meta.bg} transition hover:brightness-125`}>
                  <td className={`border-l-2 px-4 py-3 ${meta.border}`}>
                    <Link href={`/borrower/${row.id}`} className="font-medium text-ink hover:underline">
                      {row.name}
                    </Link>
                    {row.isLateNaive && <span className="ml-2 text-xs text-ink-faint">late this month</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{row.trade}</td>
                  <td className="px-4 py-3 text-ink-dim">{row.region}</td>
                  <td className="px-4 py-3">
                    <Sparkline values={row.surplusSeries} color={meta.color} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${meta.border} ${meta.bg} ${meta.text}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{Math.round(row.confidence * 100)}%</td>
                  <td className="px-4 py-3 text-ink-dim">
                    {row.stress.toFixed(2)}x
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{row.actionNeeded}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
