"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear, scalePoint } from "d3-scale";
import { line as d3line, area as d3area, curveMonotoneX } from "d3-shape";
import { max as d3max, min as d3min } from "d3-array";
import type { MonthlyRecord } from "@/lib/types";
import type { BufferMonth } from "@/lib/engine/buffer";
import { monthShort, monthLabel, monthIndex } from "@/lib/engine/month";
import { formatINR, formatINRCompact } from "@/lib/format";
import { useEbbStore } from "@/lib/store";
import { playChartReveal } from "@/lib/sound";

const WIDTH = 960;
const HEIGHT = 420;
const MARGIN = { top: 18, right: 16, bottom: 28, left: 52 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const WINDOW = 12;
const REVEAL_MS = 1200;

type Point = {
  month: string;
  idx: number;
  income: number;
  essential: number;
  business: number;
  surplus: number;
  emiDue: number;
  stressed: boolean;
  ghost1: number | null; // surplus, 1 year prior
  ghost2: number | null; // surplus, 2 years prior
  bufferBalance: number | null;
};

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

/** Drives a single 0→1 progress value over ~1.2s, once, honouring reduced motion. */
function useRevealProgress(key: string): number {
  const reducedMotion = usePrefersReducedMotion();
  const [progress, setProgress] = useState(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REVEAL_MS);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reducedMotion]);

  return progress;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Remaps global progress [0,1] into a sub-phase's own [0,1] progress. */
function phase(progress: number, from: number, to: number): number {
  return clamp01((progress - from) / (to - from));
}

export function CashFlowChart({
  records,
  bufferMonths,
  highlightMonths,
}: {
  records: MonthlyRecord[];
  bufferMonths?: BufferMonth[];
  highlightMonths?: string[];
}) {
  const [compareYears, setCompareYears] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const byMonthIndex = useMemo(() => {
    const m = new Map<number, MonthlyRecord>();
    records.forEach((r) => m.set(monthIndex(r.month), r));
    return m;
  }, [records]);

  const bufferByMonth = useMemo(() => {
    const m = new Map<string, number>();
    (bufferMonths ?? []).forEach((b) => m.set(b.month, b.loanBufferBalance + b.savingsBalance));
    return m;
  }, [bufferMonths]);

  const points: Point[] = useMemo(() => {
    const windowed = records.slice(-WINDOW);
    return windowed.map((r, i) => {
      const surplus = r.income - r.expenses_essential - r.expenses_business;
      const g1 = byMonthIndex.get(monthIndex(r.month) - 12);
      const g2 = byMonthIndex.get(monthIndex(r.month) - 24);
      return {
        month: r.month,
        idx: i,
        income: r.income,
        essential: r.expenses_essential,
        business: r.expenses_business,
        surplus,
        emiDue: r.emi_due,
        stressed: surplus < r.emi_due,
        ghost1: g1 ? g1.income - g1.expenses_essential - g1.expenses_business : null,
        ghost2: g2 ? g2.income - g2.expenses_essential - g2.expenses_business : null,
        bufferBalance: bufferByMonth.get(r.month) ?? null,
      };
    });
  }, [records, byMonthIndex, bufferByMonth]);

  const hasGhost1 = points.some((p) => p.ghost1 !== null);
  const hasGhost2 = points.some((p) => p.ghost2 !== null);
  const highlightSet = useMemo(() => new Set(highlightMonths ?? []), [highlightMonths]);

  const x = useMemo(
    () =>
      scalePoint<number>()
        .domain(points.map((p) => p.idx))
        .range([0, PLOT_W])
        .padding(0.5),
    [points]
  );

  const yMax = d3max(points, (p) => Math.max(p.income, p.essential + p.business, p.surplus, p.ghost1 ?? -Infinity, p.ghost2 ?? -Infinity, p.bufferBalance ?? -Infinity)) ?? 1000;
  const yMin = Math.min(0, d3min(points, (p) => Math.min(p.surplus, p.ghost1 ?? Infinity, p.ghost2 ?? Infinity)) ?? 0);
  const y = useMemo(
    () =>
      scaleLinear()
        .domain([yMin, yMax * 1.08])
        .range([PLOT_H, 0])
        .nice(),
    [yMin, yMax]
  );

  const zeroY = y(0);
  const bandwidth = points.length > 1 ? PLOT_W / points.length : PLOT_W;

  const lineIncome = useMemo(
    () =>
      d3line<Point>()
        .x((p) => x(p.idx) ?? 0)
        .y((p) => y(p.income))
        .curve(curveMonotoneX)(points) ?? "",
    [points, x, y]
  );
  const lineExpenseTop = useMemo(
    () =>
      d3line<Point>()
        .x((p) => x(p.idx) ?? 0)
        .y((p) => y(p.essential + p.business))
        .curve(curveMonotoneX)(points) ?? "",
    [points, x, y]
  );
  const areaSurplusPos = useMemo(
    () =>
      d3area<Point>()
        .x((p) => x(p.idx) ?? 0)
        .y0(() => zeroY)
        .y1((p) => y(Math.max(0, p.surplus)))
        .curve(curveMonotoneX)(points) ?? "",
    [points, x, y, zeroY]
  );
  const areaSurplusNeg = useMemo(
    () =>
      d3area<Point>()
        .x((p) => x(p.idx) ?? 0)
        .y0(() => zeroY)
        .y1((p) => y(Math.min(0, p.surplus)))
        .curve(curveMonotoneX)(points) ?? "",
    [points, x, y, zeroY]
  );
  const lineGhost1 = useMemo(
    () =>
      hasGhost1
        ? d3line<Point>()
            .defined((p) => p.ghost1 !== null)
            .x((p) => x(p.idx) ?? 0)
            .y((p) => y(p.ghost1 ?? 0))
            .curve(curveMonotoneX)(points) ?? ""
        : "",
    [points, x, y, hasGhost1]
  );
  const lineGhost2 = useMemo(
    () =>
      hasGhost2
        ? d3line<Point>()
            .defined((p) => p.ghost2 !== null)
            .x((p) => x(p.idx) ?? 0)
            .y((p) => y(p.ghost2 ?? 0))
            .curve(curveMonotoneX)(points) ?? ""
        : "",
    [points, x, y, hasGhost2]
  );
  const lineBuffer = useMemo(
    () =>
      d3line<Point>()
        .defined((p) => p.bufferBalance !== null)
        .x((p) => x(p.idx) ?? 0)
        .y((p) => y(p.bufferBalance ?? 0))
        .curve(curveMonotoneX)(points) ?? "",
    [points, x, y]
  );

  const revealKey = points.map((p) => p.month).join("|");
  const progress = useRevealProgress(revealKey);
  const soundOn = useEbbStore((s) => s.soundOn);
  const playedRevealSound = useRef(false);
  useEffect(() => {
    playedRevealSound.current = false;
  }, [revealKey]);
  useEffect(() => {
    if (progress >= 1 && !playedRevealSound.current) {
      playedRevealSound.current = true;
      if (soundOn) playChartReveal();
    }
  }, [progress, soundOn]);

  // Reveal choreography: expenses draw first, income overlaps in just after,
  // the surplus band fills once both lines are down, deficit sinks in last.
  const expenseReveal = phase(progress, 0, 0.55);
  const incomeReveal = phase(progress, 0.15, 0.7);
  const surplusReveal = phase(progress, 0.55, 0.9);
  const deficitReveal = phase(progress, 0.75, 1);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reducedMotion || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: py * -6, ry: px * 6 });
  }
  function handlePointerLeave() {
    setTilt({ rx: 0, ry: 0 });
    setHoverIdx(null);
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-sm text-ink-dim">Cash flow — last {points.length} months</h3>
        <button
          onClick={() => setCompareYears((v) => !v)}
          disabled={!hasGhost1}
          aria-pressed={compareYears && hasGhost1}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            compareYears && hasGhost1
              ? "border-class-seasonal/50 bg-class-seasonal/15 text-class-seasonal"
              : "border-bg-border text-ink-dim hover:text-ink"
          } ${!hasGhost1 ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {hasGhost1 ? "Ghost prior years" : "Not enough history to overlay years"}
        </button>
      </div>

      <div
        ref={wrapRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="relative"
        style={{
          aspectRatio: `${WIDTH} / ${HEIGHT}`,
          transform: `perspective(1200px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: "transform 200ms ease-out",
          transformStyle: "preserve-3d",
        }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full overflow-visible">
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* y gridlines */}
            {y.ticks(5).map((t) => (
              <g key={t}>
                <line x1={0} x2={PLOT_W} y1={y(t)} y2={y(t)} stroke="#1c3c35" strokeWidth={1} />
                <text x={-10} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#5f7d75">
                  {formatINRCompact(t)}
                </text>
              </g>
            ))}

            {/* Layer 1: EMI bars, faint */}
            <g opacity={0.5}>
              {points.map((p) => (
                <rect
                  key={`emi-${p.month}`}
                  x={(x(p.idx) ?? 0) - bandwidth * 0.18}
                  y={y(Math.max(0, p.emiDue))}
                  width={bandwidth * 0.36}
                  height={Math.max(0, PLOT_H - y(p.emiDue))}
                  fill="#5f7d75"
                  opacity={0.25}
                />
              ))}
            </g>

            {/* Layer 2: stress bands */}
            <g>
              {points.map((p) =>
                p.stressed ? (
                  <rect
                    key={`stress-${p.month}`}
                    x={(x(p.idx) ?? 0) - bandwidth / 2}
                    y={0}
                    width={bandwidth}
                    height={PLOT_H}
                    fill="#e2604c"
                    opacity={highlightSet.has(p.month) ? 0.16 : 0.06}
                  />
                ) : null
              )}
            </g>

            {/* Layer 3: expense line (stacked essential+business), drawn first */}
            <g clipPath="url(#reveal-expense)">
              <path d={lineExpenseTop} fill="none" stroke="#e0a53a" strokeWidth={2} opacity={0.85} />
            </g>
            <clipPath id="reveal-expense">
              <rect x={0} y={0} width={PLOT_W * expenseReveal} height={PLOT_H} />
            </clipPath>

            {/* Layer 4: income line */}
            <g clipPath="url(#reveal-income)">
              <path d={lineIncome} fill="none" stroke="#3fb2a0" strokeWidth={2.5} />
            </g>
            <clipPath id="reveal-income">
              <rect x={0} y={0} width={PLOT_W * incomeReveal} height={PLOT_H} />
            </clipPath>

            {/* Layer 5: surplus band, warm above / cool below zero */}
            <g clipPath="url(#reveal-surplus)" opacity={0.32}>
              <path d={areaSurplusPos} fill="#e3aa5f" />
            </g>
            <clipPath id="reveal-surplus">
              <rect x={0} y={0} width={PLOT_W * surplusReveal} height={PLOT_H} />
            </clipPath>
            <g
              opacity={0.4 * deficitReveal}
              style={{ transform: `translateY(${(1 - deficitReveal) * 10}px)`, transition: reducedMotion ? "none" : undefined }}
            >
              <path d={areaSurplusNeg} fill="#4d7480" />
            </g>
            <line x1={0} x2={PLOT_W} y1={zeroY} y2={zeroY} stroke="#5f7d75" strokeWidth={1} strokeDasharray="2 3" />

            {/* Layer 6: buffer balance */}
            {bufferMonths && bufferMonths.length > 0 && (
              <path d={lineBuffer} fill="none" stroke="#9fb8b0" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />
            )}

            {/* Layer 7: ghosted prior years */}
            {compareYears && hasGhost1 && (
              <path d={lineGhost1} fill="none" stroke="#eef4f0" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.45} />
            )}
            {compareYears && hasGhost2 && (
              <path d={lineGhost2} fill="none" stroke="#eef4f0" strokeWidth={1.2} strokeDasharray="2 4" opacity={0.28} />
            )}

            {/* Highlight pulses for narrated months */}
            {points.map((p) =>
              highlightSet.has(p.month) ? (
                <circle
                  key={`hl-${p.month}`}
                  cx={x(p.idx) ?? 0}
                  cy={y(p.surplus)}
                  r={6}
                  fill="none"
                  stroke="#e2604c"
                  strokeWidth={2}
                  className="animate-pulse-highlight"
                />
              ) : null
            )}

            {/* hover targets + x labels */}
            {points.map((p) => (
              <g key={`hover-${p.month}`}>
                <rect
                  x={(x(p.idx) ?? 0) - bandwidth / 2}
                  y={0}
                  width={bandwidth}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(p.idx)}
                />
                <text x={x(p.idx) ?? 0} y={PLOT_H + 18} textAnchor="middle" fontSize={11} fill="#5f7d75">
                  {monthShort(p.month)}
                </text>
                {hoverIdx === p.idx && (
                  <line x1={x(p.idx) ?? 0} x2={x(p.idx) ?? 0} y1={0} y2={PLOT_H} stroke="#9fb8b0" strokeWidth={1} strokeDasharray="2 3" />
                )}
              </g>
            ))}
          </g>
        </svg>

        {hovered && (
          <div
            className="glass pointer-events-none absolute z-10 min-w-[180px] rounded-lg px-3 py-2 text-xs text-ink shadow-lg"
            style={{
              left: `${(((x(hovered.idx) ?? 0) + MARGIN.left) / WIDTH) * 100}%`,
              top: `${(MARGIN.top / HEIGHT) * 100}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="font-display font-medium">{monthLabel(hovered.month)}</div>
            <dl className="mt-1 space-y-0.5 tabular">
              <Row label="Income" value={formatINR(hovered.income)} />
              <Row label="Essential" value={formatINR(hovered.essential)} />
              <Row label="Business" value={formatINR(hovered.business)} />
              <Row label="Surplus" value={formatINR(hovered.surplus)} />
              <Row label="EMI due" value={formatINR(hovered.emiDue)} />
            </dl>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Warm band above the line is surplus; cool band below is a shortfall. Faint coral columns are months where
        surplus fell short of the EMI. Dotted ghosts are the same 12 months one and two years prior.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
