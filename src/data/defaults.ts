import type { AppState, GoalCategory, UserProfile } from "../types";
import { DEFAULT_TIMEZONE } from "../utils/date";

export const categories: GoalCategory[] = [
  "Health",
  "Learning",
  "Work",
  "Personal",
  "Fitness",
  "Mindfulness",
  "Custom"
];

export const commonGoals = [
  { title: "Walk for 20 minutes", category: "Fitness" as GoalCategory },
  { title: "Read 10 pages", category: "Learning" as GoalCategory },
  { title: "Plan tomorrow before bed", category: "Personal" as GoalCategory },
  { title: "Drink enough water", category: "Health" as GoalCategory },
  { title: "Focus block without distractions", category: "Work" as GoalCategory },
  { title: "Five-minute reflection", category: "Mindfulness" as GoalCategory }
];

export function createDefaultProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    id: "local-user",
    name: "You",
    timezone: DEFAULT_TIMEZONE,
    currentStreak: 0,
    longestStreak: 0,
    totalGoalsCompleted: 0,
    streakThreshold: 0.8,
    planningReminderTime: "20:30",
    planningDeadlineTime: "23:59",
    progressReminderTime: "09:00",
    endOfDayReminderTime: "20:45",
    autoUseStreakFreeze: true,
    streakFreezesAvailable: 1,
    reminders: {
      planning: true,
      progress: true,
      review: true
    },
    notificationsEnabled: false,
    hadBrokenStreak: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createInitialState(): AppState {
  return {
    profile: createDefaultProfile(),
    goals: [],
    dailyLogs: [],
    userBadges: [],
    freezeEvents: [],
    onboarded: false
  };
}
