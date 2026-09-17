import { describe, it, expect } from "vitest";
import { computeConfidence } from "@/lib/engine/confidence";

describe("confidence", () => {
  it("forces low confidence under 13 months regardless of other inputs", () => {
    const result = computeConfidence({
      historyMonths: 6,
      priorSameMonthObservations: 0,
      cohortSize: 5,
      currentMonthName: "September",
      cohortTrade: "Flower seller",
    });
    expect(result.level).toBe("low");
    expect(result.value).toBeLessThanOrEqual(0.4);
    expect(result.reason).toMatch(/low confidence/i);
    expect(result.reason).toMatch(/cohort pattern/i);
  });

  it("returns high confidence with long history and multiple prior same-months", () => {
    const result = computeConfidence({
      historyMonths: 30,
      priorSameMonthObservations: 2,
      cohortSize: 5,
      currentMonthName: "September",
      cohortTrade: "Flower seller",
    });
    expect(result.level).toBe("high");
    expect(result.value).toBeGreaterThanOrEqual(0.8);
  });

  it("returns medium confidence for intermediate history", () => {
    const result = computeConfidence({
      historyMonths: 15,
      priorSameMonthObservations: 1,
      cohortSize: 5,
      currentMonthName: "September",
      cohortTrade: "Flower seller",
    });
    expect(result.level).toBe("medium");
    expect(result.value).toBeGreaterThanOrEqual(0.5);
    expect(result.value).toBeLessThan(0.8);
  });
});
