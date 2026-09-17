import { describe, it, expect } from "vitest";
import { surplus, affordable, AFFORDABILITY_SAFETY_MARGIN } from "@/lib/engine/affordability";

describe("affordability", () => {
  it("computes surplus as income minus both expense categories", () => {
    const m = { income: 10000, expenses_essential: 3000, expenses_business: 2000 };
    expect(surplus(m)).toBe(5000);
  });

  it("applies the safety margin and floors at zero", () => {
    const m = { income: 10000, expenses_essential: 3000, expenses_business: 2000 };
    expect(affordable(m)).toBeCloseTo(5000 * AFFORDABILITY_SAFETY_MARGIN);

    const negative = { income: 1000, expenses_essential: 3000, expenses_business: 2000 };
    expect(affordable(negative)).toBe(0);
  });

  it("exposes the margin as a named constant, not a magic number", () => {
    expect(AFFORDABILITY_SAFETY_MARGIN).toBe(0.65);
  });
});
