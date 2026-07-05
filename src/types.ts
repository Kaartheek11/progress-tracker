export type GoalStatus = "not_started" | "in_progress" | "completed";

export type GoalCategory =
  | "Health"
  | "Learning"
  | "Work"
  | "Personal"
  | "Fitness"
  | "Mindfulness"
  | "Custom";

export type ReminderKey = "planning" | "progress" | "review";

export type DailyStreakResult =
  | "success"
  | "failed"
  | "frozen"
  | "not_planned"
  | "pending";

export interface ReminderSettings {
  planning: boolean;
  progress: boolean;
  review: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  timezone: string;
  currentStreak: number;
  longestStreak: number;
  totalGoalsCompleted: number;
  streakThreshold: number;
  planningReminderTime: string;
  planningDeadlineTime: string;
  progressReminderTime: string;
  endOfDayReminderTime: string;
  autoUseStreakFreeze: boolean;
  streakFreezesAvailable: number;
  reminders: ReminderSettings;
  notificationsEnabled: boolean;
  hadBrokenStreak: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  category: GoalCategory;
  customCategory?: string;
  targetValue?: string;
  targetUnit?: string;
  notes?: string;
  plannedForDate: string;
  status: GoalStatus;
  streakEligible: boolean;
  isLateGoal: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  order: number;
}

export interface DailyLog {
  id: string;
  userId: string;
  date: string;
  eligibleGoalsCount: number;
  completedEligibleGoalsCount: number;
  totalGoalsCount: number;
  totalCompletedGoalsCount: number;
  completionRate: number;
  requiredGoalsForStreak: number;
  streakResult: DailyStreakResult;
  reflection?: string;
  badgesEarned: string[];
  freezeUsed: boolean;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  requirement: string;
  icon: string;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeKey: string;
  earnedAt: string;
}

export interface StreakFreezeEvent {
  id: string;
  userId: string;
  date: string;
  reason: string;
  usedAt: string;
}

export interface AppState {
  profile: UserProfile;
  goals: Goal[];
  dailyLogs: DailyLog[];
  userBadges: UserBadge[];
  freezeEvents: StreakFreezeEvent[];
  onboarded: boolean;
}

export interface DayStats {
  eligibleGoalsCount: number;
  completedEligibleGoalsCount: number;
  totalGoalsCount: number;
  totalCompletedGoalsCount: number;
  completionRate: number;
  requiredGoalsForStreak: number;
  streakResult: DailyStreakResult;
}

export interface ReviewOutcome {
  log: DailyLog;
  newlyEarnedBadges: UserBadge[];
  freezeUsed: boolean;
  previousStreak: number;
}
