"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClassificationResult, ClassificationLabel } from "@/lib/engine/condition";
import { classificationMeta } from "@/lib/classification-ui";

const STEP_MS = 400;

const CONCLUSION: Record<ClassificationLabel, string> = {
  SEASONAL: "This is her rhythm, not a decline. I'd reshape the schedule rather than flag her.",
  STABLE: "Nothing here needs a different schedule — she's paying comfortably within her means.",
  IMPROVING: "Her capacity is growing faster than the loan assumed — worth easing the schedule, not tightening it.",
  TEMPORARY: "This reads as a one-off setback that's already turning around. I'd give her room to recover rather than flag her.",
  STRUCTURAL: "This isn't seasonal and it isn't recovering on its own. I'd flag this for restructuring.",
};

type NarrationItem = { text: string; months: string[]; kind: "evidence" | "opening" | "uncertainty" | "conclusion" };

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function RecommendationPanel({
  result,
  borrowerFirstName,
  historyMonths,
  onHighlightMonths,
}: {
  result: ClassificationResult;
  borrowerFirstName: string;
  historyMonths: number;
  onHighlightMonths: (months: string[]) => void;
}) {
  const meta = classificationMeta(result.label);
  const reducedMotion = usePrefersReducedMotion();

  const items = useMemo<NarrationItem[]>(() => {
    const list: NarrationItem[] = [
      {
        kind: "opening",
        text: `I looked at ${borrowerFirstName}'s last ${historyMonths} month${historyMonths === 1 ? "" : "s"} of cash flow.`,
        months: [],
      },
    ];
    result.evidence.forEach((line, i) => {
      list.push({ kind: "evidence", text: line, months: result.evidenceMonths[i] ?? [] });
    });
    if (result.confidenceLevel === "low") {
      list.push({ kind: "uncertainty", text: result.confidenceReason, months: [] });
    }
    list.push({ kind: "conclusion", text: CONCLUSION[result.label], months: [] });
    return list;
  }, [result, borrowerFirstName, historyMonths]);

  const [revealed, setRevealed] = useState(reducedMotion ? items.length : 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(items.length);
      return;
    }
    setRevealed(0);
    let i = 0;
    function step() {
      i += 1;
      setRevealed(i);
      if (i < items.length) {
        timerRef.current = setTimeout(step, STEP_MS);
      }
    }
    timerRef.current = setTimeout(step, STEP_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, reducedMotion]);

  useEffect(() => {
    const current = items[revealed - 1];
    onHighlightMonths(current?.months ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, items]);

  const done = revealed >= items.length;

  function skip() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRevealed(items.length);
  }

  return (
    <div className={`glass relative rounded-xl p-5 ${meta.border} border`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <span className={`font-display text-lg font-medium ${meta.text}`}>{meta.label}</span>
          <span className="text-xs text-ink-faint">· {Math.round(result.confidence * 100)}% confidence</span>
        </div>
        {!done && (
          <button
            onClick={skip}
            className="rounded-full border border-bg-border px-2.5 py-1 text-xs text-ink-dim transition hover:text-ink"
          >
            Skip
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-2.5">
        {items.slice(0, revealed).map((item, i) => (
          <li
            key={i}
            className={
              item.kind === "conclusion"
                ? `animate-fade-up mt-1 border-t border-white/5 pt-3 text-sm font-medium ${meta.text}`
                : item.kind === "uncertainty"
                  ? "animate-fade-up flex gap-2 text-sm italic text-ink-dim"
                  : item.kind === "opening"
                    ? "animate-fade-up text-sm text-ink-dim"
                    : "animate-fade-up flex gap-2 text-sm text-ink"
            }
          >
            {item.kind === "evidence" && <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />}
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
