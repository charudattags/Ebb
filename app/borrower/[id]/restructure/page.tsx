"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useBorrower, useCohortFor, useEbbStore } from "@/lib/store";
import { analyzeBorrower, FLAT_FALLBACK_COHORT } from "@/lib/engine";
import type { RestructureOptionKey } from "@/lib/engine/restructure";
import { formatINR } from "@/lib/format";
import { monthShort } from "@/lib/engine/month";

const OPTION_ORDER: RestructureOptionKey[] = ["BUFFER_ABSORB", "SEASONAL_WEIGHT", "SHORT_PAUSE", "EXTEND_TENURE"];

export default function RestructurePage() {
  const params = useParams<{ id: string }>();
  const borrower = useBorrower(params.id);
  const cohort = useCohortFor(borrower);
  const decisions = useEbbStore((s) => s.decisions);
  const setDecision = useEbbStore((s) => s.setDecision);
  const [selected, setSelected] = useState<RestructureOptionKey | null>(null);
  const [note, setNote] = useState("");

  if (!borrower) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-panel p-8 text-center text-ink-dim">
        Borrower {params.id} not found.
        <div className="mt-3">
          <Link href="/" className="text-class-seasonal hover:underline">Back to portfolio</Link>
        </div>
      </div>
    );
  }

  const effectiveCohort = cohort ?? { ...FLAT_FALLBACK_COHORT, cohort_id: borrower.cohort_id, trade: borrower.trade };
  const analysis = analyzeBorrower(borrower, effectiveCohort);
  const scoreByKey = new Map(analysis.scores.map((s) => [s.key, s]));
  const optionByKey = new Map(analysis.restructureOptions.map((o) => [o.key, o]));
  const existingDecision = decisions[borrower.id];
  const activeKey = selected ?? existingDecision?.optionKey ?? analysis.recommended;
  const activeOption = optionByKey.get(activeKey)!;

  function record(status: "approved" | "overridden" | "requested_more_data") {
    setDecision(borrower!.id, {
      status,
      optionKey: activeKey,
      note,
      decidedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/borrower/${borrower.id}`} className="text-xs text-ink-faint hover:text-ink-dim">
          ← {borrower.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Restructure options</h1>
        <p className="text-sm text-ink-dim">
          Recommended: <span className="font-medium text-class-seasonal">{optionByKey.get(analysis.recommended)?.label}</span> — Ebb
          recommends, an officer decides.
        </p>
      </div>

      {existingDecision && (
        <div className="rounded-lg border border-class-improving/40 bg-class-improving/10 px-4 py-3 text-sm text-class-improving">
          Recorded: <span className="font-medium">{existingDecision.status.replace(/_/g, " ")}</span> —{" "}
          {optionByKey.get(existingDecision.optionKey!)?.label}
          {existingDecision.note && <span className="text-ink-dim"> · "{existingDecision.note}"</span>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {OPTION_ORDER.map((key) => {
          const option = optionByKey.get(key)!;
          const score = scoreByKey.get(key)!;
          const isRecommended = key === analysis.recommended;
          const isActive = key === activeKey;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`flex flex-col rounded-xl border p-4 text-left transition ${
                isActive
                  ? "border-class-seasonal bg-class-seasonal/10"
                  : "border-bg-border bg-bg-panel hover:border-ink-faint"
              } ${!option.viable ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{option.label}</span>
                {isRecommended && (
                  <span className="rounded-full bg-class-seasonal/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-class-seasonal">
                    Recommended
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-dim">{option.mechanic}</p>
              {!option.viable && option.viabilityNote && (
                <p className="mt-2 text-xs text-class-structural">{option.viabilityNote}</p>
              )}
              <dl className="mt-3 space-y-1 text-xs">
                <Metric label="Extra interest" value={formatINR(option.extraInterest)} warn={option.extraInterest > 0} />
                <Metric label="Peak stress ratio" value={`${score.borrower.peakStressRatio.toFixed(2)}x`} warn={score.borrower.peakStressRatio > 1} />
                <Metric label="Months over affordable" value={String(score.borrower.monthsOverAffordable)} warn={score.borrower.monthsOverAffordable > 0} />
                <Metric label="Completion likelihood" value={`${Math.round(score.borrower.completionProbability * 100)}%`} />
                <Metric label="Expected recovery" value={`${Math.round(score.lender.expectedRecoveryPct * 100)}%`} />
                <Metric label="Tenure change" value={score.lender.tenureChangeMonths === 0 ? "None" : `+${score.lender.tenureChangeMonths} mo`} warn={score.lender.tenureChangeMonths > 0} />
                <Metric label="Collections touches avoided" value={String(score.lender.collectionsTouchesAvoided)} />
              </dl>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-bg-border bg-bg-panel p-5">
        <h3 className="text-sm font-medium text-ink-dim">
          Payment schedule preview — {optionByKey.get(activeKey)?.label}
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm tabular">
            <thead className="text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="py-1 pr-4 font-medium">Month</th>
                {activeOption.months.map((m) => (
                  <th key={m} className="py-1 pr-4 font-medium">{monthShort(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-ink-faint">
                <td className="py-1 pr-4">Original EMI</td>
                {activeOption.originalSchedule.map((v, i) => (
                  <td key={i} className="py-1 pr-4">{formatINR(v)}</td>
                ))}
              </tr>
              <tr className="text-ink">
                <td className="py-1 pr-4 font-medium">New payment</td>
                {activeOption.schedule.map((v, i) => (
                  <td
                    key={i}
                    className={`py-1 pr-4 font-medium ${v < activeOption.originalSchedule[i] ? "text-class-improving" : v > activeOption.originalSchedule[i] ? "text-class-temporary" : ""}`}
                  >
                    {formatINR(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-bg-border bg-bg-panel p-5">
        <h3 className="text-sm font-medium text-ink-dim">Officer decision</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note — required context if overriding the recommendation."
          className="mt-3 w-full rounded-lg border border-bg-border bg-bg-raised p-3 text-sm text-ink placeholder:text-ink-faint focus:border-class-seasonal focus:outline-none"
          rows={3}
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={() => record("approved")}
            className="rounded-lg bg-class-improving/20 px-4 py-2 text-sm font-medium text-class-improving transition hover:bg-class-improving/30"
          >
            Approve {optionByKey.get(activeKey)?.label}
          </button>
          <button
            onClick={() => record("overridden")}
            className="rounded-lg bg-class-temporary/20 px-4 py-2 text-sm font-medium text-class-temporary transition hover:bg-class-temporary/30"
          >
            Override with this option
          </button>
          <button
            onClick={() => record("requested_more_data")}
            className="rounded-lg border border-bg-border px-4 py-2 text-sm text-ink-dim transition hover:text-ink"
          >
            Request more data
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Ebb recommends; a human decides. This choice is recorded for the file, not silently applied.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-faint">{label}</dt>
      <dd className={warn ? "text-class-temporary" : "text-ink-dim"}>{value}</dd>
    </div>
  );
}
