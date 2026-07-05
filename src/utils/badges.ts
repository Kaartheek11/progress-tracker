import type { AppState, BadgeDefinition, DayStats, UserBadge } from "../types";
import { addDaysToDateKey } from "./date";

export const BADGES: BadgeDefinition[] = [
  {
    key: "first-step",
    name: "First Step",
    description: "Complete your first goal.",
    requirement: "Complete 1 goal",
    icon: "flag"
  },
  {
    key: "three-day-spark",
    name: "3-Day Spark",
    description: "Reach a 3-day streak.",
    requirement: "Reach a 3-day streak",
    icon: "spark"
  },
  {
    key: "weekly-warrior",
    name: "Weekly Warrior",
    description: "Reach a 7-day streak.",
    requirement: "Reach a 7-day streak",
    icon: "shield"
  },
  {
    key: "consistency-champ",
    name: "Consistency Champ",
    description: "Complete 30 total goals.",
    requirement: "Complete 30 goals",
    icon: "medal"
  },
  {
    key: "goal-crusher",
    name: "Goal Crusher",
    description: "Complete 100 total goals.",
    requirement: "Complete 100 goals",
    icon: "trophy"
  },
  {
    key: "perfect-day",
    name: "Perfect Day",
    description: "Complete 100% of an eligible day's goals.",
    requirement: "Complete every eligible goal in a day",
    icon: "star"
  },
  {
    key: "comeback",
    name: "Comeback Badge",
    description: "Complete a successful day after breaking a streak.",
    requirement: "Succeed after a broken streak",
    icon: "refresh"
  },
  {
    key: "planner",
    name: "Planner Badge",
    description: "Plan tomorrow's goals before the deadline for 3 days in a row.",
    requirement: "Plan on time for 3 consecutive days",
    icon: "calendar"
  }
];

interface BadgeContext {
  date?: string;
  dayStats?: DayStats;
  wasComeback?: boolean;
}

export function evaluateBadges(
  state: AppState,
  context: BadgeContext = {}
): UserBadge[] {
  const existing = new Set(state.userBadges.map((badge) => badge.badgeKey));
  const now = new Date().toISOString();
  const totalCompleted = state.goals.filter(
    (goal) => goal.status === "completed"
  ).length;
  const earnedKeys = [
    totalCompleted >= 1 && "first-step",
    state.profile.currentStreak >= 3 && "three-day-spark",
    state.profile.currentStreak >= 7 && "weekly-warrior",
    totalCompleted >= 30 && "consistency-champ",
    totalCompleted >= 100 && "goal-crusher",
    isPerfectDay(state, context) && "perfect-day",
    context.wasComeback && "comeback",
    longestPlannerRun(state) >= 3 && "planner"
  ].filter(Boolean) as string[];

  return earnedKeys
    .filter((key) => !existing.has(key))
    .map((badgeKey) => ({
      id: cryptoId(),
      userId: state.profile.id,
      badgeKey,
      earnedAt: now
    }));
}

export function getBadgeProgress(state: AppState, badgeKey: string) {
  const totalCompleted = state.goals.filter(
    (goal) => goal.status === "completed"
  ).length;
  switch (badgeKey) {
    case "first-step":
      return progress(totalCompleted, 1);
    case "three-day-spark":
      return progress(state.profile.currentStreak, 3);
    case "weekly-warrior":
      return progress(state.profile.currentStreak, 7);
    case "consistency-champ":
      return progress(totalCompleted, 30);
    case "goal-crusher":
      return progress(totalCompleted, 100);
    case "planner":
      return progress(longestPlannerRun(state), 3);
    case "perfect-day": {
      const perfectLogs = state.dailyLogs.filter(
        (log) =>
          log.eligibleGoalsCount > 0 &&
          log.completedEligibleGoalsCount === log.eligibleGoalsCount
      );
      return progress(perfectLogs.length, 1);
    }
    case "comeback":
      return progress(state.profile.hadBrokenStreak ? 0 : state.userBadges.some((badge) => badge.badgeKey === "comeback") ? 1 : 0, 1);
    default:
      return progress(0, 1);
  }
}

export function longestPlannerRun(state: AppState) {
  const plannedDates = Array.from(
    new Set(
      state.goals
        .filter((goal) => goal.streakEligible)
        .map((goal) => goal.plannedForDate)
    )
  ).sort();

  let longest = 0;
  let current = 0;
  let previous: string | undefined;
  for (const date of plannedDates) {
    current = previous && addDaysToDateKey(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }

  return longest;
}

function isPerfectDay(state: AppState, context: BadgeContext) {
  if (
    context.dayStats?.eligibleGoalsCount &&
    context.dayStats.completedEligibleGoalsCount ===
      context.dayStats.eligibleGoalsCount
  ) {
    return true;
  }

  return state.dailyLogs.some(
    (log) =>
      log.eligibleGoalsCount > 0 &&
      log.completedEligibleGoalsCount === log.eligibleGoalsCount
  );
}

function progress(value: number, target: number) {
  const current = Math.min(value, target);
  return {
    current,
    target,
    percentage: target === 0 ? 100 : Math.round((current / target) * 100)
  };
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
