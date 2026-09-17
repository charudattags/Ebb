// The single source of truth for "YYYY-MM" month arithmetic. Every engine
// module goes through these instead of parsing month strings itself.

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Absolute month index (year*12 + month0), monotonic and comparable. */
export function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function indexToMonth(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Calendar month, 0 = Jan .. 11 = Dec. */
export function calendarMonth(ym: string): number {
  return monthIndex(ym) % 12;
}

export function addMonths(ym: string, delta: number): string {
  return indexToMonth(monthIndex(ym) + delta);
}

export function monthsBetween(a: string, b: string): number {
  return monthIndex(b) - monthIndex(a);
}

export function monthLabel(ym: string): string {
  const [y] = ym.split("-").map(Number);
  return `${MONTH_NAMES[calendarMonth(ym)]} ${y}`;
}

export function monthShort(ym: string): string {
  return MONTH_NAMES[calendarMonth(ym)];
}

export function calendarMonthName(cm: number): string {
  return MONTH_NAMES[((cm % 12) + 12) % 12];
}
