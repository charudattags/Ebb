import { describe, it, expect } from "vitest";
import { monthIndex, addMonths, calendarMonth, monthsBetween, indexToMonth } from "@/lib/engine/month";

describe("month helpers", () => {
  it("computes a monotonic absolute index", () => {
    expect(monthIndex("2026-01")).toBeLessThan(monthIndex("2026-02"));
    expect(monthIndex("2025-12")).toBeLessThan(monthIndex("2026-01"));
  });

  it("round-trips index <-> month", () => {
    expect(indexToMonth(monthIndex("2026-09"))).toBe("2026-09");
  });

  it("adds months across year boundaries", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("extracts calendar month 0-indexed", () => {
    expect(calendarMonth("2026-01")).toBe(0);
    expect(calendarMonth("2026-09")).toBe(8);
    expect(calendarMonth("2026-12")).toBe(11);
  });

  it("computes months between two dates", () => {
    expect(monthsBetween("2026-01", "2026-09")).toBe(8);
  });
});
