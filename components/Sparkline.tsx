import { scaleLinear } from "d3-scale";
import { line as d3line, area as d3area, curveMonotoneX } from "d3-shape";

const W = 120;
const H = 32;

/** Small inline surplus-rhythm preview — the shape of the last N months at a glance. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg width={W} height={H} />;

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const y = scaleLinear().domain([min, max === min ? min + 1 : max]).range([H - 2, 2]);
  const x = scaleLinear().domain([0, values.length - 1]).range([0, W]);
  const zeroY = y(0);

  const linePath = d3line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)(values) ?? "";
  const areaPath = d3area<number>().x((_, i) => x(i)).y0(zeroY).y1((v) => y(v)).curve(curveMonotoneX)(values) ?? "";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path d={areaPath} fill={color} opacity={0.18} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke={color} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="2 2" />
    </svg>
  );
}
