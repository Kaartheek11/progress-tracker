import { describe, expect, it } from "vitest";
import { createInitialState } from "../data/defaults";
import type { Goal } from "../types";
import { evaluateBadges, longestPlannerRun } from "./badges";

const goal = (id: string, plannedForDate: string, status = "completed"): Goal => ({
  id,
  userId: "local-user",
  title: `Goal ${id}`,
  category: "Personal",
  plannedForDate,
  status: status as Goal["status"],
  streakEligible: true,
  isLateGoal: false,
  createdAt: "2026-07-04T12:00:00.000Z",
  updatedAt: "2026-07-04T12:00:00.000Z",
  order: 0
});

describe("badges", () => {
  it("unlocks badges once when conditions are met", () => {
    const state = createInitialState();
    state.goals = [goal("1", "2026-07-05")];

    const firstPass = evaluateBadges(state);
    state.userBadges = firstPass;
    const secondPass = evaluateBadges(state);

    expect(firstPass.map((badge) => badge.badgeKey)).toContain("first-step");
    expect(secondPass).toEqual([]);
  });

  it("detects consecutive on-time planning days", () => {
    const state = createInitialState();
    state.goals = [
      goal("1", "2026-07-05"),
      goal("2", "2026-07-06"),
      goal("3", "2026-07-07")
    ];

    expect(longestPlannerRun(state)).toBe(3);
    expect(evaluateBadges(state).map((badge) => badge.badgeKey)).toContain(
      "planner"
    );
  });
});
