import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  getDateKey,
  isCreatedBeforePlanningDeadline,
  zonedTimeToUtc
} from "./date";

describe("date utilities", () => {
  it("adds calendar days without UTC off-by-one drift", () => {
    expect(addDaysToDateKey("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("formats date keys in the selected timezone", () => {
    const instant = new Date("2026-07-05T05:30:00.000Z");
    expect(getDateKey(instant, "America/Denver")).toBe("2026-07-04");
    expect(getDateKey(instant, "UTC")).toBe("2026-07-05");
  });

  it("applies the planning deadline on the day before the planned date", () => {
    const deadline = zonedTimeToUtc(
      "2026-07-04",
      "23:59",
      "America/Denver"
    );

    expect(
      isCreatedBeforePlanningDeadline(
        "2026-07-05",
        new Date(deadline.getTime() - 1000).toISOString(),
        "23:59",
        "America/Denver"
      )
    ).toBe(true);
    expect(
      isCreatedBeforePlanningDeadline(
        "2026-07-05",
        new Date(deadline.getTime() + 1000).toISOString(),
        "23:59",
        "America/Denver"
      )
    ).toBe(false);
  });
});
