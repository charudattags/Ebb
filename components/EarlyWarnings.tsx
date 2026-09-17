import type { EarlyWarnings } from "@/lib/engine/stress";
import { monthLabel } from "@/lib/engine/month";

export function EarlyWarningsPanel({ warnings }: { warnings: EarlyWarnings }) {
  const { distressPayment, marginCompression, paymentDrift } = warnings;
  const anyDetected = distressPayment.detected || marginCompression.detected || paymentDrift.detected;

  if (!anyDetected) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-panel p-5">
        <h3 className="text-sm font-medium text-ink-dim">Early warnings</h3>
        <p className="mt-2 text-sm text-ink-faint">None detected. Her payment record matches her actual capacity.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-panel p-5">
      <h3 className="text-sm font-medium text-ink-dim">Early warnings</h3>
      <div className="mt-3 space-y-4">
        {distressPayment.detected && (
          <div className="rounded-lg border border-class-structural/30 bg-class-structural/5 p-3">
            <p className="text-sm font-medium text-class-structural">
              Distress payments — {distressPayment.events.length} month{distressPayment.events.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-dim">
              {distressPayment.evidence.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-faint">
              Months: {distressPayment.events.map((e) => monthLabel(e.month)).join(", ")}
            </p>
          </div>
        )}
        {marginCompression.detected && (
          <div className="rounded-lg border border-class-temporary/30 bg-class-temporary/5 p-3">
            <p className="text-sm font-medium text-class-temporary">Margin compression</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-dim">
              {marginCompression.evidence.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {paymentDrift.detected && (
          <div className="rounded-lg border border-class-temporary/30 bg-class-temporary/5 p-3">
            <p className="text-sm font-medium text-class-temporary">Payment drift</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-dim">
              {paymentDrift.evidence.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
