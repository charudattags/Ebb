"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyRecord } from "@/lib/types";
import { monthShort, monthLabel, monthIndex } from "@/lib/engine/month";
import { formatINR, formatINRCompact } from "@/lib/format";

type ChartPoint = {
  month: string;
  label: string;
  income: number;
  expensesEssential: number;
  expensesBusiness: number;
  totalExpenses: number;
  surplusPos: number | null;
  surplusNeg: number | null;
  emiDue: number;
  stressed: boolean;
  surplusLastYear: number | null;
};

const WINDOW_MONTHS = 24;

export function CashFlowChart({ records }: { records: MonthlyRecord[] }) {
  const [compareLastYear, setCompareLastYear] = useState(false);

  const byMonthIndex = useMemo(() => {
    const m = new Map<number, MonthlyRecord>();
    records.forEach((r) => m.set(monthIndex(r.month), r));
    return m;
  }, [records]);

  const points: ChartPoint[] = useMemo(() => {
    const windowed = records.slice(-WINDOW_MONTHS);
    return windowed.map((r) => {
      const surplus = r.income - r.expenses_essential - r.expenses_business;
      const priorYear = byMonthIndex.get(monthIndex(r.month) - 12);
      const surplusLastYear = priorYear
        ? priorYear.income - priorYear.expenses_essential - priorYear.expenses_business
        : null;
      return {
        month: r.month,
        label: monthShort(r.month),
        income: r.income,
        expensesEssential: r.expenses_essential,
        expensesBusiness: r.expenses_business,
        totalExpenses: r.expenses_essential + r.expenses_business,
        surplusPos: surplus >= 0 ? surplus : 0,
        surplusNeg: surplus < 0 ? surplus : 0,
        emiDue: r.emi_due,
        stressed: surplus < r.emi_due,
        surplusLastYear,
      };
    });
  }, [records, byMonthIndex]);

  const hasPriorYearData = points.some((p) => p.surplusLastYear !== null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-dim">Cash flow — last {points.length} months</h3>
        <label className="flex items-center gap-2 text-xs text-ink-dim">
          <input
            type="checkbox"
            checked={compareLastYear}
            onChange={(e) => setCompareLastYear(e.target.checked)}
            disabled={!hasPriorYearData}
            className="accent-class-seasonal"
          />
          Compare to last year
          {!hasPriorYearData && <span className="text-ink-faint">(not enough history)</span>}
        </label>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#232938" />
          <XAxis dataKey="month" tickFormatter={(m: string) => monthShort(m)} stroke="#5c6478" fontSize={12} />
          <YAxis
            stroke="#5c6478"
            fontSize={12}
            tickFormatter={(v) => formatINRCompact(v)}
          />
          <Tooltip
            contentStyle={{ background: "#181d29", border: "1px solid #232938", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e6e9f0" }}
            labelFormatter={(m: string) => monthLabel(m)}
            formatter={(value: number, name: string) => [formatINR(value), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#9aa3b5" }} />

          {points.map((p, i) =>
            p.stressed ? (
              <ReferenceArea
                key={p.month}
                x1={p.month}
                x2={p.month}
                fill="#ff5c6c"
                fillOpacity={0.08}
                ifOverflow="extendDomain"
              />
            ) : null
          )}

          <Bar dataKey="emiDue" name="EMI due" fill="#5c6478" fillOpacity={0.25} barSize={14} />

          <Area
            type="monotone"
            dataKey="expensesEssential"
            name="Essential expenses"
            stackId="expenses"
            stroke="none"
            fill="#8b93a7"
            fillOpacity={0.35}
          />
          <Area
            type="monotone"
            dataKey="expensesBusiness"
            name="Business expenses"
            stackId="expenses"
            stroke="none"
            fill="#f5a623"
            fillOpacity={0.35}
          />

          <Area
            type="monotone"
            dataKey="surplusPos"
            name="Surplus"
            stroke="#3ecf8e"
            fill="#3ecf8e"
            fillOpacity={0.25}
          />
          <Area
            type="monotone"
            dataKey="surplusNeg"
            name="Shortfall"
            stroke="#ff5c6c"
            fill="#ff5c6c"
            fillOpacity={0.35}
          />

          <Line type="monotone" dataKey="income" name="Income" stroke="#3aa0ff" dot={false} strokeWidth={2} />

          {compareLastYear && (
            <Line
              type="monotone"
              dataKey="surplusLastYear"
              name="Surplus (last year)"
              stroke="#e6e9f0"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-ink-faint">
        Shaded green/red band is surplus (income minus essential and business expenses) — the story is in the red.
        Faint bars are the EMI due. Red-tinted columns are months where surplus fell short of the EMI.
      </p>
    </div>
  );
}
