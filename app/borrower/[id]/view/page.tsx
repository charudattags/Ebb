"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useBorrower, useCohortFor, useEbbStore } from "@/lib/store";
import { analyzeBorrower, FLAT_FALLBACK_COHORT } from "@/lib/engine";
import { formatINR } from "@/lib/format";
import { monthLabel } from "@/lib/engine/month";

export default function BorrowerViewPage() {
  const params = useParams<{ id: string }>();
  const borrower = useBorrower(params.id);
  const cohort = useCohortFor(borrower);
  const decision = useEbbStore((s) => (borrower ? s.decisions[borrower.id] : undefined));

  if (!borrower) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-panel p-8 text-center text-ink-dim">
        Borrower {params.id} not found.
      </div>
    );
  }

  const effectiveCohort = cohort ?? { ...FLAT_FALLBACK_COHORT, cohort_id: borrower.cohort_id, trade: borrower.trade };
  const analysis = analyzeBorrower(borrower, effectiveCohort);
  const optionKey = decision?.optionKey ?? analysis.recommended;
  const option = analysis.restructureOptions.find((o) => o.key === optionKey)!;

  const reducedIdx = option.schedule.findIndex((v, i) => v < option.originalSchedule[i] - 1);
  let increasedIdx = -1;
  let maxIncrease = 0;
  option.schedule.forEach((v, i) => {
    const diff = v - option.originalSchedule[i];
    if (diff > maxIncrease) {
      maxIncrease = diff;
      increasedIdx = i;
    }
  });

  const seasonalNote =
    analysis.classification.label === "SEASONAL"
      ? `We noticed your ${borrower.trade.toLowerCase()} business is quiet this time of year, same as last year.`
      : analysis.classification.label === "TEMPORARY"
        ? `We noticed you had a difficult month recently, and your business is already picking back up.`
        : null;

  const interestNote =
    option.extraInterest <= 1
      ? "Your total loan hasn't increased."
      : `This adds about ${formatINR(option.extraInterest)} in interest over the life of your loan.`;

  return (
    <div className="flex flex-col items-center gap-4">
      <Link href={`/borrower/${borrower.id}`} className="self-start text-xs text-ink-faint hover:text-ink-dim">
        ← Officer view
      </Link>

      <div className="w-full max-w-[380px] rounded-[2.5rem] border-8 border-bg-raised bg-black p-3 shadow-2xl">
        <div className="rounded-[1.75rem] bg-gradient-to-b from-bg-panel to-bg p-5 text-ink">
          <div className="mb-4 flex items-center justify-between text-xs text-ink-faint">
            <span>Ebb</span>
            <span>9:41</span>
          </div>
          <p className="text-sm text-ink-dim">Hi {borrower.name.split(" ")[0]},</p>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink">
            {reducedIdx >= 0 ? (
              <p>
                Your <span className="font-semibold">{monthLabel(option.months[reducedIdx])}</span> payment is{" "}
                <span className="font-semibold text-class-improving">{formatINR(option.schedule[reducedIdx])}</span> instead of{" "}
                {formatINR(option.originalSchedule[reducedIdx])}.
              </p>
            ) : (
              <p>Your payment schedule is on track — no changes needed this month.</p>
            )}
            {seasonalNote && <p>{seasonalNote}</p>}
            {increasedIdx >= 0 && (
              <p>
                You'll pay <span className="font-semibold">{formatINR(option.schedule[increasedIdx])}</span> in{" "}
                {monthLabel(option.months[increasedIdx])}, when business picks back up.
              </p>
            )}
            <p className="text-ink-dim">{interestNote}</p>
          </div>
          <div className="mt-6 rounded-xl bg-bg-raised p-3 text-xs text-ink-faint">
            Questions? Reply to this message or visit your local branch. Your loan officer approved this change.
          </div>
        </div>
      </div>

      <p className="max-w-md text-center text-xs text-ink-faint">
        This is what {borrower.name.split(" ")[0]} sees — plain language, no jargon, no numbers she didn't ask for.
      </p>
    </div>
  );
}
