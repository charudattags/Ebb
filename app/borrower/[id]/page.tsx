"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useBorrower, useCohortFor } from "@/lib/store";
import { analyzeBorrower, FLAT_FALLBACK_COHORT } from "@/lib/engine";
import { CashFlowChart } from "@/components/CashFlowChart";
import { ClassificationCard } from "@/components/ClassificationCard";
import { EarlyWarningsPanel } from "@/components/EarlyWarnings";
import { formatINR, formatINRCompact } from "@/lib/format";
import { monthLabel } from "@/lib/engine/month";

export default function BorrowerDetailPage() {
  const params = useParams<{ id: string }>();
  const borrower = useBorrower(params.id);
  const cohort = useCohortFor(borrower);

  if (!borrower) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-panel p-8 text-center text-ink-dim">
        Borrower {params.id} not found in the active dataset.
        <div className="mt-3">
          <Link href="/" className="text-class-seasonal hover:underline">
            Back to portfolio
          </Link>
        </div>
      </div>
    );
  }

  const effectiveCohort = cohort ?? { ...FLAT_FALLBACK_COHORT, cohort_id: borrower.cohort_id, trade: borrower.trade };
  const analysis = analyzeBorrower(borrower, effectiveCohort);
  const last = borrower.monthly_records[borrower.monthly_records.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-ink-faint hover:text-ink-dim">
            ← Portfolio
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{borrower.name}</h1>
          <p className="text-sm text-ink-dim">
            {borrower.trade} · {borrower.region} · {borrower.history_months} months of history
          </p>
        </div>
        <div className="flex gap-3">
          <StatTile label="EMI due" value={formatINR(last.emi_due)} />
          <StatTile label="This month's surplus" value={formatINR(last.income - last.expenses_essential - last.expenses_business)} />
          <StatTile label="Principal" value={formatINRCompact(borrower.principal)} />
          <Link
            href={`/borrower/${borrower.id}/view`}
            className="flex items-center rounded-lg border border-bg-border px-4 py-2 text-sm text-ink-dim transition hover:border-ink-faint hover:text-ink"
          >
            What she'd see →
          </Link>
          <Link
            href={`/borrower/${borrower.id}/restructure`}
            className="flex items-center rounded-lg border border-class-seasonal/40 bg-class-seasonal/10 px-4 py-2 text-sm font-medium text-class-seasonal transition hover:bg-class-seasonal/20"
          >
            View restructure options →
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-bg-border bg-bg-panel p-5">
        <CashFlowChart records={borrower.monthly_records} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ClassificationCard result={analysis.classification} />
        <EarlyWarningsPanel warnings={analysis.earlyWarnings} />
      </div>

      <p className="text-xs text-ink-faint">
        Latest month: {monthLabel(last.month)}. Amount paid {formatINR(last.amount_paid)} against {formatINR(last.emi_due)} due
        {last.days_late > 0 ? `, ${last.days_late} days late.` : "."}
      </p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-raised px-4 py-2 text-right">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="text-lg font-semibold tabular text-ink">{value}</div>
    </div>
  );
}
