export function formatINR(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const v = Math.round(Math.abs(amount));
  return `${sign}₹${v.toLocaleString("en-IN")}`;
}

/** Lakh notation where it reads more naturally: ₹1.2L instead of ₹1,20,000. */
export function formatINRCompact(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const v = Math.abs(amount);
  if (v >= 100000) {
    return `${sign}₹${(v / 100000).toFixed(v >= 1000000 ? 1 : 2)}L`;
  }
  if (v >= 1000) {
    return `${sign}₹${(v / 1000).toFixed(1)}k`;
  }
  return formatINR(amount);
}

export function formatPercent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatSigned(v: number, digits = 0): string {
  const s = (v * 100).toFixed(digits);
  return v >= 0 ? `+${s}%` : `${s}%`;
}
