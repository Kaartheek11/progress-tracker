import { describe, expect, it } from "vitest";
import type { Goal } from "../types";
import { calculateDayStats, reviewDay } from "./streak";
import { createInitialState } from "../data/defaults";

const baseGoal = (overrides: Partial<Goal>): Goal => ({
  id: overrides.id || Math.random().toString(36),
  userId: "local-user",
  title: "Goal",
  category: "Work",
  plannedForDate: "2026-07-05",
  status: "not_started",
  streakEligible: true,
  isLateGoal: false,
  createdAt: "2026-07-04T12:00:00.000Z",
  updatedAt: "2026-07-04T12:00:00.000Z",
  order: 0,
  ...overrides
});

describe("streak calculation", () => {
  it("requires ceil eligible goals times threshold", () => {
    const goals = [
      baseGoal({ status: "completed" }),
      baseGoal({ status: "completed" }),
      baseGoal({ status: "completed" }),
      baseGoal({})
    ];

    const stats = calculateDayStats(goals, 0.8);

    expect(stats.requiredGoalsForStreak).toBe(4);
    expect(stats.streakResult).toBe("failed");
  });

  it("ignores late goals for streak eligibility", () => {
    const goals = [
      baseGoal({ status: "completed" }),
      baseGoal({ streakEligible: false, isLateGoal: true, status: "completed" })
    ];

    const stats = calculateDayStats(goals, 0.8);

    expect(stats.eligibleGoalsCount).toBe(1);
    expect(stats.totalCompletedGoalsCount).toBe(2);
    expect(stats.streakResult).toBe("success");
  });

  it("uses a freeze without increasing the streak", () => {
    const state = createInitialState();
    state.profile.currentStreak = 5;
    state.profile.streakFreezesAvailable = 1;
    state.goals = [
      baseGoal({ id: "1", status: "completed" }),
      baseGoal({ id: "2", status: "not_started" })
    ];

    const { state: nextState, outcome } = reviewDay(
      state,
      "2026-07-05",
      "",
      true
    );

    expect(outcome.freezeUsed).toBe(true);
    expect(nextState.profile.currentStreak).toBe(5);
    expect(nextState.profile.streakFreezesAvailable).toBe(0);
  });
});
