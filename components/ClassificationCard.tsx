import type { ClassificationResult } from "@/lib/engine/condition";
import { classificationMeta } from "@/lib/classification-ui";

export function ClassificationCard({ result }: { result: ClassificationResult }) {
  const meta = classificationMeta(result.label);
  return (
    <div className={`rounded-xl border p-5 ${meta.border} ${meta.bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-lg font-semibold ${meta.text}`}>{meta.label}</span>
          <p className="text-sm text-ink-dim">{meta.description}</p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-semibold tabular ${meta.text}`}>{Math.round(result.confidence * 100)}%</div>
          <div className="text-xs uppercase tracking-wide text-ink-faint">{result.confidenceLevel} confidence</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-faint">{result.confidenceReason}</p>
      {result.seasonalIndexSource === "cohort" && (
        <p className="mt-1 text-xs text-ink-faint">
          Using the cohort's seasonal pattern — not enough of her own history yet to build a personal one.
        </p>
      )}
      <ul className="mt-4 space-y-2 border-t border-white/5 pt-4">
        {result.evidence.map((line, i) => (
          <li key={i} className="flex gap-2 text-sm text-ink">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
