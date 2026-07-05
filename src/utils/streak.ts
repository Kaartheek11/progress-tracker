import type { AppState, DailyLog, DayStats, Goal, ReviewOutcome } from "../types";
import { evaluateBadges } from "./badges";

export function calculateDayStats(
  goals: Goal[],
  streakThreshold: number
): DayStats {
  const eligible = goals.filter((goal) => goal.streakEligible);
  const completedEligible = eligible.filter((goal) => goal.status === "completed");
  const completedTotal = goals.filter((goal) => goal.status === "completed");
  const completionRate =
    eligible.length === 0 ? 0 : completedEligible.length / eligible.length;
  const requiredGoalsForStreak =
    eligible.length === 0 ? 0 : Math.ceil(eligible.length * streakThreshold);

  return {
    eligibleGoalsCount: eligible.length,
    completedEligibleGoalsCount: completedEligible.length,
    totalGoalsCount: goals.length,
    totalCompletedGoalsCount: completedTotal.length,
    completionRate,
    requiredGoalsForStreak,
    streakResult:
      eligible.length === 0
        ? "not_planned"
        : completedEligible.length >= requiredGoalsForStreak
          ? "success"
          : "failed"
  };
}

export function goalsNeededForStreak(stats: DayStats) {
  if (stats.eligibleGoalsCount === 0) {
    return 0;
  }
  return Math.max(
    stats.requiredGoalsForStreak - stats.completedEligibleGoalsCount,
    0
  );
}

export function reviewDay(
  state: AppState,
  date: string,
  reflection = "",
  useFreezeOverride = false
): { state: AppState; outcome: ReviewOutcome } {
  const now = new Date().toISOString();
  const goalsForDate = state.goals.filter((goal) => goal.plannedForDate === date);
  const stats = calculateDayStats(goalsForDate, state.profile.streakThreshold);
  const previousStreak = state.profile.currentStreak;
  const shouldUseFreeze =
    stats.streakResult === "failed" &&
    state.profile.streakFreezesAvailable > 0 &&
    (state.profile.autoUseStreakFreeze || useFreezeOverride);
  const finalResult = shouldUseFreeze ? "frozen" : stats.streakResult;
  const currentStreak =
    finalResult === "success"
      ? state.profile.currentStreak + 1
      : finalResult === "failed"
        ? 0
        : state.profile.currentStreak;
  const longestStreak = Math.max(state.profile.longestStreak, currentStreak);
  const freezeEvent = shouldUseFreeze
    ? {
        id: cryptoId(),
        userId: state.profile.id,
        date,
        reason: "Missed streak threshold",
        usedAt: now
      }
    : undefined;
  const hadBrokenStreakBefore = state.profile.hadBrokenStreak;

  const profile = {
    ...state.profile,
    currentStreak,
    longestStreak,
    streakFreezesAvailable: shouldUseFreeze
      ? state.profile.streakFreezesAvailable - 1
      : state.profile.streakFreezesAvailable,
    totalGoalsCompleted: state.goals.filter((goal) => goal.status === "completed")
      .length,
    hadBrokenStreak:
      finalResult === "failed" ? true : state.profile.hadBrokenStreak,
    updatedAt: now
  };

  const log: DailyLog = {
    id:
      state.dailyLogs.find((existing) => existing.date === date)?.id || cryptoId(),
    userId: state.profile.id,
    date,
    eligibleGoalsCount: stats.eligibleGoalsCount,
    completedEligibleGoalsCount: stats.completedEligibleGoalsCount,
    totalGoalsCount: stats.totalGoalsCount,
    totalCompletedGoalsCount: stats.totalCompletedGoalsCount,
    completionRate: stats.completionRate,
    requiredGoalsForStreak: stats.requiredGoalsForStreak,
    streakResult: finalResult,
    reflection,
    badgesEarned: [],
    freezeUsed: shouldUseFreeze,
    reviewedAt: now,
    createdAt:
      state.dailyLogs.find((existing) => existing.date === date)?.createdAt || now,
    updatedAt: now
  };

  const nextStateBeforeBadges: AppState = {
    ...state,
    profile,
    dailyLogs: [
      ...state.dailyLogs.filter((existing) => existing.date !== date),
      log
    ],
    freezeEvents: freezeEvent
      ? [...state.freezeEvents, freezeEvent]
      : state.freezeEvents
  };
  const newlyEarnedBadges = evaluateBadges(nextStateBeforeBadges, {
    date,
    dayStats: stats,
    wasComeback: finalResult === "success" && hadBrokenStreakBefore
  });
  const updatedLog = {
    ...log,
    badgesEarned: newlyEarnedBadges.map((badge) => badge.badgeKey)
  };
  const nextState: AppState = {
    ...nextStateBeforeBadges,
    profile:
      newlyEarnedBadges.some((badge) => badge.badgeKey === "comeback")
        ? { ...nextStateBeforeBadges.profile, hadBrokenStreak: false }
        : nextStateBeforeBadges.profile,
    dailyLogs: [
      ...nextStateBeforeBadges.dailyLogs.filter((existing) => existing.date !== date),
      updatedLog
    ],
    userBadges: [...nextStateBeforeBadges.userBadges, ...newlyEarnedBadges]
  };

  return {
    state: nextState,
    outcome: {
      log: updatedLog,
      newlyEarnedBadges,
      freezeUsed: shouldUseFreeze,
      previousStreak
    }
  };
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
