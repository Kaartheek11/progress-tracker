import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Award,
  BarChart3,
  Bell,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock,
  Download,
  Edit3,
  Flame,
  Flag,
  Home,
  Info,
  Medal,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
  X
} from "lucide-react";
import { BADGES, evaluateBadges, getBadgeProgress } from "./utils/badges";
import {
  addDaysToDateKey,
  dateKeyRangeEnding,
  formatFriendlyDate,
  getDateKey,
  getLocalTime,
  getTomorrowDateKey,
  isCreatedBeforePlanningDeadline,
  minutesUntilLocalTime
} from "./utils/date";
import { calculateDayStats, goalsNeededForStreak, reviewDay } from "./utils/streak";
import { categories, commonGoals } from "./data/defaults";
import { usePersistentState } from "./hooks/usePersistentState";
import type {
  AppState,
  BadgeDefinition,
  DailyLog,
  Goal,
  GoalCategory,
  GoalStatus,
  ReminderKey,
  UserProfile
} from "./types";

type Page =
  | "dashboard"
  | "today"
  | "plan"
  | "progress"
  | "badges"
  | "coach"
  | "settings";

interface GoalFormValues {
  title: string;
  category: GoalCategory;
  targetValue: string;
  notes: string;
}

interface Toast {
  id: string;
  tone: "success" | "info" | "warning";
  message: string;
}

const pages: Array<{
  key: Page;
  label: string;
  icon: typeof Home;
}> = [
  { key: "dashboard", label: "Home", icon: Home },
  { key: "today", label: "Today", icon: CheckCircle2 },
  { key: "plan", label: "Plan", icon: CalendarDays },
  { key: "progress", label: "Progress", icon: BarChart3 },
  { key: "badges", label: "Badges", icon: Award },
  { key: "coach", label: "Coach", icon: Brain },
  { key: "settings", label: "Settings", icon: Settings }
];

const badgeIcons: Record<string, typeof Flag> = {
  flag: Flag,
  spark: Sparkles,
  shield: Shield,
  medal: Medal,
  trophy: Trophy,
  star: Star,
  refresh: RefreshCw,
  calendar: CalendarDays
};

export default function App() {
  const { state, setState, loadError, helpers } = usePersistentState();
  const [page, setPage] = useState<Page>("dashboard");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const today = getDateKey(new Date(), state.profile.timezone);
  const tomorrow = getTomorrowDateKey(new Date(), state.profile.timezone);

  const sortedGoals = useMemo(() => sortGoals(state.goals), [state.goals]);
  const todayGoals = sortedGoals.filter((goal) => goal.plannedForDate === today);
  const tomorrowGoals = sortedGoals.filter(
    (goal) => goal.plannedForDate === tomorrow
  );
  const todayStats = calculateDayStats(
    todayGoals,
    state.profile.streakThreshold
  );
  const summary = useMemo(
    () => buildSummary(state, today),
    [state, today]
  );
  const nextAction = getNextAction(todayStats, tomorrowGoals.length, state.dailyLogs, today);

  const pushToast = (message: string, tone: Toast["tone"] = "info") => {
    const id = cryptoId();
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  };

  useReminderEngine(state, pushToast);

  const commitState = (
    updater: (current: AppState) => AppState,
    toastMessage?: string
  ) => {
    setState((current) => {
      const next = updater(current);
      const newlyEarned = evaluateBadges(next);
      if (toastMessage) {
        queueMicrotask(() => pushToast(toastMessage, "success"));
      }
      if (newlyEarned.length > 0) {
        queueMicrotask(() =>
          pushToast(
            `Badge earned: ${newlyEarned
              .map((badge) => badgeName(badge.badgeKey))
              .join(", ")}`,
            "success"
          )
        );
      }
      return {
        ...next,
        userBadges: [...next.userBadges, ...newlyEarned]
      };
    });
  };

  const addGoal = (
    values: GoalFormValues,
    plannedForDate: string,
    forceLate = false
  ) => {
    const cleanTitle = values.title.trim();
    if (!cleanTitle) {
      pushToast("Add a goal title first.", "warning");
      return;
    }

    commitState((current) => {
      const now = new Date().toISOString();
      const streakEligible =
        !forceLate &&
        isCreatedBeforePlanningDeadline(
          plannedForDate,
          now,
          current.profile.planningDeadlineTime,
          current.profile.timezone
        );
      const goal: Goal = {
        id: cryptoId(),
        userId: current.profile.id,
        title: cleanTitle,
        category: values.category,
        targetValue: values.targetValue.trim() || undefined,
        notes: values.notes.trim() || undefined,
        plannedForDate,
        status: "not_started",
        streakEligible,
        isLateGoal: !streakEligible,
        createdAt: now,
        updatedAt: now,
        order:
          current.goals.filter((existing) => existing.plannedForDate === plannedForDate)
            .length + 1
      };
      return {
        ...current,
        goals: [...current.goals, goal]
      };
    }, forceLate ? "Late goal added." : "Goal added.");
  };

  const updateGoal = (goalId: string, patch: Partial<Goal>) => {
    commitState((current) => {
      const now = new Date().toISOString();
      const goals = current.goals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }
        const status = patch.status || goal.status;
        return {
          ...goal,
          ...patch,
          streakEligible: goal.streakEligible,
          isLateGoal: goal.isLateGoal,
          plannedForDate: goal.plannedForDate,
          status,
          completedAt:
            status === "completed"
              ? patch.completedAt || goal.completedAt || now
              : undefined,
          updatedAt: now
        };
      });
      return withCompletedTotal(current, goals);
    }, "Goal updated.");
  };

  const updateGoalStatus = (goalId: string, status: GoalStatus) => {
    updateGoal(goalId, {
      status,
      completedAt: status === "completed" ? new Date().toISOString() : undefined
    });
  };

  const deleteGoal = (goalId: string) => {
    commitState((current) => {
      const goals = current.goals.filter((goal) => goal.id !== goalId);
      return withCompletedTotal(current, goals);
    }, "Goal removed.");
  };

  const moveGoal = (goalId: string, direction: -1 | 1) => {
    setState((current) => {
      const goal = current.goals.find((item) => item.id === goalId);
      if (!goal) {
        return current;
      }
      const sameDay = sortGoals(
        current.goals.filter((item) => item.plannedForDate === goal.plannedForDate)
      );
      const index = sameDay.findIndex((item) => item.id === goalId);
      const swap = sameDay[index + direction];
      if (!swap) {
        return current;
      }
      const goals = current.goals.map((item) => {
        if (item.id === goal.id) {
          return { ...item, order: swap.order, updatedAt: new Date().toISOString() };
        }
        if (item.id === swap.id) {
          return { ...item, order: goal.order, updatedAt: new Date().toISOString() };
        }
        return item;
      });
      return { ...current, goals };
    });
  };

  const duplicateLatestGoals = () => {
    const sourceDate = addDaysToDateKey(tomorrow, -1);
    const sourceGoals = sortGoals(
      state.goals.filter((goal) => goal.plannedForDate === sourceDate)
    );
    if (sourceGoals.length === 0) {
      pushToast("No recent goals to duplicate yet.", "warning");
      return;
    }

    commitState((current) => {
      const now = new Date().toISOString();
      const streakEligible = isCreatedBeforePlanningDeadline(
        tomorrow,
        now,
        current.profile.planningDeadlineTime,
        current.profile.timezone
      );
      const copies = sourceGoals.map((goal, index) => ({
        ...goal,
        id: cryptoId(),
        plannedForDate: tomorrow,
        status: "not_started" as GoalStatus,
        streakEligible,
        isLateGoal: !streakEligible,
        createdAt: now,
        updatedAt: now,
        completedAt: undefined,
        order:
          current.goals.filter((existing) => existing.plannedForDate === tomorrow)
            .length +
          index +
          1
      }));
      return {
        ...current,
        goals: [...current.goals, ...copies]
      };
    }, "Goals duplicated for tomorrow.");
  };

  const submitReview = (reflection: string, useFreeze: boolean) => {
    setState((current) => {
      const { state: next, outcome } = reviewDay(current, today, reflection, useFreeze);
      queueMicrotask(() => {
        if (outcome.log.streakResult === "success") {
          pushToast("Review saved. Your streak continues.", "success");
        } else if (outcome.log.streakResult === "frozen") {
          pushToast("Freeze used. Your streak is protected today.", "info");
        } else if (outcome.log.streakResult === "not_planned") {
          pushToast("Today was marked not planned.", "info");
        } else {
          pushToast("Review saved. Tomorrow is a clean start.", "info");
        }
        if (outcome.newlyEarnedBadges.length > 0) {
          pushToast(
            `Badge earned: ${outcome.newlyEarnedBadges
              .map((badge) => badgeName(badge.badgeKey))
              .join(", ")}`,
            "success"
          );
        }
      });
      return next;
    });
  };

  const saveProfile = (patch: Partial<UserProfile>, toast = "Settings saved.") => {
    setState((current) => ({
      ...current,
      profile: {
        ...current.profile,
        ...patch,
        updatedAt: new Date().toISOString()
      },
      onboarded: true
    }));
    pushToast(toast, "success");
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      saveProfile({ notificationsEnabled: false }, "Browser notifications are not available here.");
      return;
    }
    const permission = await Notification.requestPermission();
    saveProfile(
      { notificationsEnabled: permission === "granted" },
      permission === "granted"
        ? "Notifications enabled."
        : "Notifications are off; in-app reminders still work."
    );
  };

  if (!state.onboarded) {
    return (
      <Onboarding
        profile={state.profile}
        saveProfile={(patch) => saveProfile(patch, "Momentum is ready.")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-shore text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <Sidebar currentPage={page} onNavigate={setPage} />
        <main className="flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pl-8 lg:pr-8">
          {loadError ? (
            <Notice tone="warning" title="Storage needs attention">
              {loadError}
            </Notice>
          ) : null}

          {page === "dashboard" ? (
            <DashboardPage
              state={state}
              today={today}
              tomorrow={tomorrow}
              todayGoals={todayGoals}
              tomorrowGoals={tomorrowGoals}
              todayStats={todayStats}
              summary={summary}
              nextAction={nextAction}
              onNavigate={setPage}
              updateGoalStatus={updateGoalStatus}
            />
          ) : null}

          {page === "today" ? (
            <TodayPage
              state={state}
              today={today}
              goals={todayGoals}
              stats={todayStats}
              addLateGoal={(values) => addGoal(values, today, true)}
              updateGoal={updateGoal}
              updateGoalStatus={updateGoalStatus}
              deleteGoal={deleteGoal}
              moveGoal={moveGoal}
              submitReview={submitReview}
              onPlanTomorrow={() => setPage("plan")}
            />
          ) : null}

          {page === "plan" ? (
            <PlanTomorrowPage
              state={state}
              tomorrow={tomorrow}
              goals={tomorrowGoals}
              addGoal={(values) => addGoal(values, tomorrow)}
              duplicateLatestGoals={duplicateLatestGoals}
              updateGoal={updateGoal}
              deleteGoal={deleteGoal}
              moveGoal={moveGoal}
            />
          ) : null}

          {page === "progress" ? (
            <ProgressPage
              state={state}
              today={today}
              summary={summary}
            />
          ) : null}

          {page === "badges" ? <BadgesPage state={state} /> : null}

          {page === "coach" ? (
            <CoachPage
              state={state}
              todayGoals={todayGoals}
              tomorrowGoals={tomorrowGoals}
            />
          ) : null}

          {page === "settings" ? (
            <SettingsPage
              state={state}
              saveProfile={saveProfile}
              requestNotifications={requestNotifications}
              exportJson={helpers.exportJson}
              reset={helpers.reset}
            />
          ) : null}
        </main>
      </div>
      <MobileNav currentPage={page} onNavigate={setPage} />
      <ToastRegion toasts={toasts} />
    </div>
  );
}

function Onboarding({
  profile,
  saveProfile
}: {
  profile: UserProfile;
  saveProfile: (patch: Partial<UserProfile>) => void;
}) {
  const [draft, setDraft] = useState(profile);
  return (
    <main className="min-h-screen bg-shore px-4 py-6 text-ink">
      <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-pine/15 bg-white px-3 py-1 text-sm font-medium text-pine">
            <Sparkles size={16} />
            Momentum
          </div>
          <div className="space-y-3">
            <h1 className="max-w-2xl text-4xl font-bold tracking-normal text-ink sm:text-5xl">
              Plan tomorrow before it becomes today.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-700">
              Plan tomorrow's goals before your planning deadline. Complete at
              least {Math.round(draft.streakThreshold * 100)}% of eligible goals
              tomorrow to continue your streak.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <RuleTile icon={CalendarDays} title="Plan ahead" text="Tomorrow's goals are set the day before." />
            <RuleTile icon={Shield} title="Late is honest" text="Late goals are trackable, not streak-eligible." />
            <RuleTile icon={Flame} title="Earn streaks" text="Reviews update streaks, freezes, and badges." />
          </div>
        </div>

        <form
          className="rounded-lg border border-black/10 bg-white p-5 shadow-soft"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile(draft);
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Preferences</h2>
              <p className="mt-1 text-sm text-slate-600">
                Reminders are optional; Momentum works without notification access.
              </p>
            </div>
            <Clock className="text-pine" />
          </div>
          <div className="space-y-4">
            <TextInput
              label="Name"
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <TextInput
              label="Timezone"
              value={draft.timezone}
              onChange={(timezone) => setDraft({ ...draft, timezone })}
            />
            <div className="grid grid-cols-2 gap-3">
              <TimeInput
                label="Planning reminder"
                value={draft.planningReminderTime}
                onChange={(planningReminderTime) =>
                  setDraft({ ...draft, planningReminderTime })
                }
              />
              <TimeInput
                label="Planning deadline"
                value={draft.planningDeadlineTime}
                onChange={(planningDeadlineTime) =>
                  setDraft({ ...draft, planningDeadlineTime })
                }
              />
              <TimeInput
                label="Progress reminder"
                value={draft.progressReminderTime}
                onChange={(progressReminderTime) =>
                  setDraft({ ...draft, progressReminderTime })
                }
              />
              <TimeInput
                label="Review reminder"
                value={draft.endOfDayReminderTime}
                onChange={(endOfDayReminderTime) =>
                  setDraft({ ...draft, endOfDayReminderTime })
                }
              />
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Streak threshold
              </span>
              <div className="mt-2 flex items-center gap-3">
                <input
                  className="w-full accent-pine"
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={Math.round(draft.streakThreshold * 100)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      streakThreshold: Number(event.target.value) / 100
                    })
                  }
                />
                <span className="min-w-12 text-right font-semibold text-pine">
                  {Math.round(draft.streakThreshold * 100)}%
                </span>
              </div>
            </label>
          </div>
          <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-pine px-4 py-3 font-semibold text-white transition hover:bg-pine/90">
            <Check size={18} />
            Start tracking
          </button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({
  currentPage,
  onNavigate
}: {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-black/10 px-4 py-5 lg:block">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-pine text-white">
          <Flame size={20} />
        </div>
        <div>
          <p className="font-bold">Momentum</p>
          <p className="text-xs text-slate-600">Progress tracker</p>
        </div>
      </div>
      <nav className="space-y-1">
        {pages.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={currentPage === item.key}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </aside>
  );
}

function MobileNav({
  currentPage,
  onNavigate
}: {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}) {
  const visible = pages.filter((page) =>
    ["dashboard", "today", "plan", "progress", "settings"].includes(page.key)
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {visible.map((item) => (
          <button
            key={item.key}
            aria-label={item.label}
            className={classNames(
              "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition",
              currentPage === item.key
                ? "bg-mint text-pine"
                : "text-slate-600 hover:bg-slate-100"
            )}
            onClick={() => onNavigate(item.key)}
          >
            <item.icon size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
  onNavigate
}: {
  item: (typeof pages)[number];
  active: boolean;
  onNavigate: (page: Page) => void;
}) {
  return (
    <button
      className={classNames(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
        active ? "bg-pine text-white" : "text-slate-700 hover:bg-white"
      )}
      onClick={() => onNavigate(item.key)}
    >
      <item.icon size={18} />
      {item.label}
    </button>
  );
}

function DashboardPage({
  state,
  today,
  tomorrow,
  todayGoals,
  tomorrowGoals,
  todayStats,
  summary,
  nextAction,
  onNavigate,
  updateGoalStatus
}: {
  state: AppState;
  today: string;
  tomorrow: string;
  todayGoals: Goal[];
  tomorrowGoals: Goal[];
  todayStats: ReturnType<typeof calculateDayStats>;
  summary: Summary;
  nextAction: { label: string; page: Page; tone: string };
  onNavigate: (page: Page) => void;
  updateGoalStatus: (goalId: string, status: GoalStatus) => void;
}) {
  const earnedBadges = state.userBadges.slice(-3);
  return (
    <div className="space-y-5">
      <Header
        eyebrow={formatFriendlyDate(today, state.profile.timezone)}
        title={`Good ${dayPart()}, ${state.profile.name}`}
        text="Momentum keeps streaks honest by separating on-time goals from late additions."
        action={
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-coral px-4 py-2.5 font-semibold text-white transition hover:bg-coral/90"
            onClick={() => onNavigate(nextAction.page)}
          >
            {nextAction.label}
            <ChevronRight size={18} />
          </button>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Flame}
          label="Current streak"
          value={`${state.profile.currentStreak} days`}
          detail={`Longest ${state.profile.longestStreak}`}
          accent="pine"
        />
        <MetricCard
          icon={Target}
          label="Today"
          value={`${Math.round(todayStats.completionRate * 100)}%`}
          detail={`${todayStats.completedEligibleGoalsCount}/${todayStats.eligibleGoalsCount} eligible complete`}
          accent="coral"
        />
        <MetricCard
          icon={Shield}
          label="Freeze bank"
          value={`${state.profile.streakFreezesAvailable}`}
          detail={state.profile.autoUseStreakFreeze ? "Auto-use on" : "Manual use"}
          accent="plum"
        />
        <MetricCard
          icon={Award}
          label="Badges"
          value={`${state.userBadges.length}/${BADGES.length}`}
          detail={`${state.profile.totalGoalsCompleted} goals completed`}
          accent="ambered"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel>
          <PanelTitle
            icon={ClipboardCheck}
            title="Today's goals"
            detail={
              todayStats.eligibleGoalsCount > 0
                ? `Complete ${todayStats.requiredGoalsForStreak} of ${todayStats.eligibleGoalsCount} eligible goals to keep your streak.`
                : "No eligible goals were planned for today."
            }
          />
          <CompactGoalList
            goals={todayGoals}
            empty="No goals planned for today."
            updateGoalStatus={updateGoalStatus}
          />
        </Panel>

        <Panel>
          <PanelTitle
            icon={CalendarDays}
            title="Tomorrow"
            detail={`${formatFriendlyDate(tomorrow, state.profile.timezone)} plan`}
          />
          {tomorrowGoals.length > 0 ? (
            <div className="space-y-2">
              {tomorrowGoals.slice(0, 4).map((goal) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2"
                  key={goal.id}
                >
                  <div>
                    <p className="font-medium">{goal.title}</p>
                    <p className="text-xs text-slate-600">{goal.category}</p>
                  </div>
                  <EligibilityPill goal={goal} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Moon}
              title="No goals planned for tomorrow"
              text="Plan before your deadline to make tomorrow count toward your streak."
              actionLabel="Plan tomorrow"
              onAction={() => onNavigate("plan")}
            />
          )}
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelTitle icon={BarChart3} title="Weekly progress" detail={summary.week.motivation} />
          <ProgressBars days={summary.week.days} />
        </Panel>
        <Panel>
          <PanelTitle icon={Award} title="Recent badges" detail="Earned automatically" />
          {earnedBadges.length > 0 ? (
            <div className="space-y-2">
              {earnedBadges.map((badge) => (
                <BadgeRow key={badge.id} badgeKey={badge.badgeKey} earnedAt={badge.earnedAt} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Award}
              title="No badges earned yet"
              text="Complete your first goal to unlock First Step."
            />
          )}
        </Panel>
        <Panel>
          <PanelTitle icon={Bell} title="Reminders" detail="Local and notification-aware" />
          <div className="space-y-3 text-sm">
            <ReminderLine
              label="Planning"
              enabled={state.profile.reminders.planning}
              value={state.profile.planningReminderTime}
              suffix={`in ${minutesUntilLocalTime(
                state.profile.planningReminderTime,
                new Date(),
                state.profile.timezone
              )} min`}
            />
            <ReminderLine
              label="Progress"
              enabled={state.profile.reminders.progress}
              value={state.profile.progressReminderTime}
            />
            <ReminderLine
              label="Review"
              enabled={state.profile.reminders.review}
              value={state.profile.endOfDayReminderTime}
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function TodayPage({
  state,
  today,
  goals,
  stats,
  addLateGoal,
  updateGoal,
  updateGoalStatus,
  deleteGoal,
  moveGoal,
  submitReview,
  onPlanTomorrow
}: {
  state: AppState;
  today: string;
  goals: Goal[];
  stats: ReturnType<typeof calculateDayStats>;
  addLateGoal: (values: GoalFormValues) => void;
  updateGoal: (goalId: string, patch: Partial<Goal>) => void;
  updateGoalStatus: (goalId: string, status: GoalStatus) => void;
  deleteGoal: (goalId: string) => void;
  moveGoal: (goalId: string, direction: -1 | 1) => void;
  submitReview: (reflection: string, useFreeze: boolean) => void;
  onPlanTomorrow: () => void;
}) {
  const reviewed = state.dailyLogs.find((log) => log.date === today);
  return (
    <div className="space-y-5">
      <Header
        eyebrow={formatFriendlyDate(today, state.profile.timezone)}
        title="Today's goals"
        text="Late goals are welcome here, but only goals planned on time count toward streak calculations."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Target}
          label="Progress"
          value={`${Math.round(stats.completionRate * 100)}%`}
          detail={`${stats.completedEligibleGoalsCount} of ${stats.eligibleGoalsCount} eligible`}
          accent="coral"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Completed"
          value={`${stats.totalCompletedGoalsCount}/${stats.totalGoalsCount}`}
          detail="All today's goals"
          accent="pine"
        />
        <MetricCard
          icon={Flame}
          label="Needed"
          value={`${goalsNeededForStreak(stats)}`}
          detail={
            stats.eligibleGoalsCount
              ? `Need ${stats.requiredGoalsForStreak} eligible completions`
              : "No eligible goals today"
          }
          accent="ambered"
        />
        <MetricCard
          icon={Shield}
          label="Freezes"
          value={`${state.profile.streakFreezesAvailable}`}
          detail={state.profile.autoUseStreakFreeze ? "Auto-protect enabled" : "Ask before use"}
          accent="plum"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <PanelTitle
            icon={ClipboardCheck}
            title="Goal checklist"
            detail={
              stats.eligibleGoalsCount
                ? `Complete ${stats.requiredGoalsForStreak} of ${stats.eligibleGoalsCount} eligible goals to keep your streak.`
                : "Today has no streak-eligible goals."
            }
          />
          <GoalList
            goals={goals}
            updateGoal={updateGoal}
            updateGoalStatus={updateGoalStatus}
            deleteGoal={deleteGoal}
            moveGoal={moveGoal}
            empty={
              <EmptyState
                icon={CalendarDays}
                title="No goals planned for today"
                text="You can still add a late goal, or plan tomorrow now."
                actionLabel="Plan tomorrow"
                onAction={onPlanTomorrow}
              />
            }
          />
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelTitle
              icon={Plus}
              title="Add a late goal"
              detail="Track it today; it will not count toward streak eligibility."
            />
            <GoalQuickForm submitLabel="Add late goal" onSubmit={addLateGoal} compact />
          </Panel>
          <ReviewPanel
            state={state}
            stats={stats}
            reviewed={reviewed}
            submitReview={submitReview}
            onPlanTomorrow={onPlanTomorrow}
          />
        </div>
      </section>
    </div>
  );
}

function PlanTomorrowPage({
  state,
  tomorrow,
  goals,
  addGoal,
  duplicateLatestGoals,
  updateGoal,
  deleteGoal,
  moveGoal
}: {
  state: AppState;
  tomorrow: string;
  goals: Goal[];
  addGoal: (values: GoalFormValues) => void;
  duplicateLatestGoals: () => void;
  updateGoal: (goalId: string, patch: Partial<Goal>) => void;
  deleteGoal: (goalId: string) => void;
  moveGoal: (goalId: string, direction: -1 | 1) => void;
}) {
  const deadlineMinutes = minutesUntilLocalTime(
    state.profile.planningDeadlineTime,
    new Date(),
    state.profile.timezone
  );
  return (
    <div className="space-y-5">
      <Header
        eyebrow={formatFriendlyDate(tomorrow, state.profile.timezone)}
        title="Plan tomorrow"
        text="These goals will become active tomorrow. Set goals before your planning deadline to make them count toward your streak."
      />

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Panel>
            <PanelTitle
              icon={Plus}
              title="Quick add"
              detail={`Planning deadline ${state.profile.planningDeadlineTime}, about ${deadlineMinutes} min away.`}
            />
            <GoalQuickForm submitLabel="Add for tomorrow" onSubmit={addGoal} />
          </Panel>

          <Panel>
            <PanelTitle icon={Sparkles} title="Common goals" detail="Tap a suggestion to add it." />
            <div className="grid gap-2 sm:grid-cols-2">
              {commonGoals.map((goal) => (
                <button
                  key={goal.title}
                  className="rounded-lg border border-black/10 bg-white px-3 py-3 text-left transition hover:border-pine hover:bg-mint"
                  onClick={() =>
                    addGoal({
                      title: goal.title,
                      category: goal.category,
                      targetValue: "",
                      notes: ""
                    })
                  }
                >
                  <p className="font-medium">{goal.title}</p>
                  <p className="text-xs text-slate-600">{goal.category}</p>
                </button>
              ))}
            </div>
            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-pine/30 bg-white px-4 py-2.5 font-semibold text-pine transition hover:bg-mint"
              onClick={duplicateLatestGoals}
            >
              <RefreshCw size={18} />
              Duplicate latest goals
            </button>
          </Panel>
        </div>

        <Panel>
          <PanelTitle
            icon={CalendarDays}
            title="Tomorrow's plan"
            detail={`${goals.length} goals planned`}
          />
          <GoalList
            goals={goals}
            updateGoal={updateGoal}
            updateGoalStatus={() => undefined}
            deleteGoal={deleteGoal}
            moveGoal={moveGoal}
            planningMode
            empty={
              <EmptyState
                icon={Moon}
                title="No goals planned for tomorrow"
                text="Add one small goal to make tomorrow easier to start."
              />
            }
          />
        </Panel>
      </section>
    </div>
  );
}

function ProgressPage({
  state,
  today,
  summary
}: {
  state: AppState;
  today: string;
  summary: Summary;
}) {
  return (
    <div className="space-y-5">
      <Header
        eyebrow={formatFriendlyDate(today, state.profile.timezone)}
        title="Progress"
        text="Weekly and monthly summaries include eligible streak progress plus late goals for general completion context."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          icon={CheckCircle2}
          label="Week completed"
          value={`${summary.week.completed}`}
          detail={`${summary.week.planned} goals planned`}
          accent="pine"
        />
        <MetricCard
          icon={BarChart3}
          label="Week rate"
          value={`${summary.week.rate}%`}
          detail={`Best day ${summary.week.bestDay || "none yet"}`}
          accent="coral"
        />
        <MetricCard
          icon={Flame}
          label="Current streak"
          value={`${state.profile.currentStreak}`}
          detail={`Longest ${state.profile.longestStreak}`}
          accent="ambered"
        />
        <MetricCard
          icon={Award}
          label="Badges earned"
          value={`${summary.week.badgesEarned}`}
          detail={`${summary.week.missedDays} missed or not planned`}
          accent="plum"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Panel>
          <PanelTitle icon={BarChart3} title="Last 7 days" detail={summary.week.motivation} />
          <ProgressBars days={summary.week.days} large />
        </Panel>
        <Panel>
          <PanelTitle icon={CalendarDays} title="Month snapshot" detail="Local calendar month" />
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Completed" value={summary.month.completed.toString()} />
            <MiniStat label="Average rate" value={`${summary.month.averageRate}%`} />
            <MiniStat label="Best streak" value={summary.month.bestStreak.toString()} />
            <MiniStat label="Top category" value={summary.month.topCategory} />
          </div>
        </Panel>
      </section>

      <Panel>
        <PanelTitle icon={ClipboardCheck} title="Review history" detail="Completed day reviews" />
        {state.dailyLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-black/10 text-slate-600">
                <tr>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Eligible</th>
                  <th className="py-2 pr-3 font-medium">Completed</th>
                  <th className="py-2 pr-3 font-medium">Rate</th>
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 pr-3 font-medium">Reflection</th>
                </tr>
              </thead>
              <tbody>
                {state.dailyLogs
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((log) => (
                    <tr className="border-b border-black/5" key={log.id}>
                      <td className="py-3 pr-3 font-medium">{log.date}</td>
                      <td className="py-3 pr-3">{log.eligibleGoalsCount}</td>
                      <td className="py-3 pr-3">{log.completedEligibleGoalsCount}</td>
                      <td className="py-3 pr-3">{Math.round(log.completionRate * 100)}%</td>
                      <td className="py-3 pr-3">
                        <ResultPill result={log.streakResult} />
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{log.reflection || "No note"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title="No progress history yet"
            text="Review your day to start building summaries."
          />
        )}
      </Panel>
    </div>
  );
}

function BadgesPage({ state }: { state: AppState }) {
  const earned = new Map(state.userBadges.map((badge) => [badge.badgeKey, badge]));
  return (
    <div className="space-y-5">
      <Header
        eyebrow={`${state.userBadges.length} of ${BADGES.length} earned`}
        title="Badges"
        text="Achievements unlock automatically and only once."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {BADGES.map((badge) => (
          <BadgeCard
            key={badge.key}
            badge={badge}
            earnedAt={earned.get(badge.key)?.earnedAt}
            progress={getBadgeProgress(state, badge.key)}
          />
        ))}
      </section>
    </div>
  );
}

function CoachPage({
  state,
  todayGoals,
  tomorrowGoals
}: {
  state: AppState;
  todayGoals: Goal[];
  tomorrowGoals: Goal[];
}) {
  const [response, setResponse] = useState(
    "Choose a prompt and Momentum will generate a local coaching note from your current data."
  );
  const prompts = [
    {
      label: "Suggest 3 realistic goals for tomorrow",
      run: () =>
        `Try a balanced set: one body goal, one focus goal, and one small reset. Based on your ${state.profile.currentStreak}-day streak, keep each goal specific enough to finish in one sitting.`
    },
    {
      label: "I only have 45 minutes tomorrow",
      run: () =>
        "Pick one 25-minute priority, one 10-minute maintenance task, and one 10-minute recovery habit. Make all three streak-eligible only if they are realistic before your deadline."
    },
    {
      label: "Summarize my week",
      run: () => {
        const completed = state.goals.filter((goal) => goal.status === "completed").length;
        return `You have completed ${completed} goals overall, earned ${state.userBadges.length} badges, and currently have ${todayGoals.length} goals active today. The next useful move is ${tomorrowGoals.length ? "finishing today's checklist" : "planning tomorrow before the deadline"}.`;
      }
    },
    {
      label: "Help me recover after missing my streak",
      run: () =>
        "Start with a short plan you can trust: two eligible goals and one optional late goal. A broken streak is information, not a verdict. Make tomorrow easy to begin."
    }
  ];

  return (
    <div className="space-y-5">
      <Header
        eyebrow="Local coach"
        title="Coach"
        text="The coach can suggest goals and summaries, while the app keeps ownership of storage, streak rules, and badge calculations."
      />
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <PanelTitle icon={Brain} title="Prompts" detail="No API key required" />
          <div className="space-y-2">
            {prompts.map((prompt) => (
              <button
                key={prompt.label}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-3 text-left font-medium transition hover:border-pine hover:bg-mint"
                onClick={() => setResponse(prompt.run())}
              >
                {prompt.label}
                <ChevronRight size={18} className="shrink-0 text-pine" />
              </button>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelTitle icon={Sparkles} title="Coaching note" detail="Generated from local app state" />
          <div className="rounded-lg border border-pine/15 bg-mint/50 p-5 text-lg leading-8 text-slate-800">
            {response}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function SettingsPage({
  state,
  saveProfile,
  requestNotifications,
  exportJson,
  reset
}: {
  state: AppState;
  saveProfile: (patch: Partial<UserProfile>, toast?: string) => void;
  requestNotifications: () => void;
  exportJson: () => string;
  reset: () => void;
}) {
  const [draft, setDraft] = useState(state.profile);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setDraft(state.profile);
  }, [state.profile]);

  const updateReminder = (key: ReminderKey, value: boolean) => {
    setDraft({
      ...draft,
      reminders: {
        ...draft.reminders,
        [key]: value
      }
    });
  };

  return (
    <div className="space-y-5">
      <Header
        eyebrow="Preferences"
        title="Settings"
        text="Tune reminders, streak rules, freezes, notifications, and local data."
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Panel>
          <PanelTitle icon={Settings} title="Profile and streak rules" detail="Saved locally" />
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveProfile(draft);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Name"
                value={draft.name}
                onChange={(name) => setDraft({ ...draft, name })}
              />
              <TextInput
                label="Timezone"
                value={draft.timezone}
                onChange={(timezone) => setDraft({ ...draft, timezone })}
              />
              <TimeInput
                label="Planning reminder"
                value={draft.planningReminderTime}
                onChange={(planningReminderTime) =>
                  setDraft({ ...draft, planningReminderTime })
                }
              />
              <TimeInput
                label="Planning deadline"
                value={draft.planningDeadlineTime}
                onChange={(planningDeadlineTime) =>
                  setDraft({ ...draft, planningDeadlineTime })
                }
              />
              <TimeInput
                label="Progress reminder"
                value={draft.progressReminderTime}
                onChange={(progressReminderTime) =>
                  setDraft({ ...draft, progressReminderTime })
                }
              />
              <TimeInput
                label="Review reminder"
                value={draft.endOfDayReminderTime}
                onChange={(endOfDayReminderTime) =>
                  setDraft({ ...draft, endOfDayReminderTime })
                }
              />
            </div>

            <label className="block rounded-lg border border-black/10 bg-white p-4">
              <span className="text-sm font-medium text-slate-700">
                Streak threshold: {Math.round(draft.streakThreshold * 100)}%
              </span>
              <input
                className="mt-3 w-full accent-pine"
                type="range"
                min="50"
                max="100"
                step="5"
                value={Math.round(draft.streakThreshold * 100)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    streakThreshold: Number(event.target.value) / 100
                  })
                }
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                checked={draft.autoUseStreakFreeze}
                label="Automatic freeze usage"
                onChange={(autoUseStreakFreeze) =>
                  setDraft({ ...draft, autoUseStreakFreeze })
                }
              />
              <label className="block rounded-lg border border-black/10 bg-white p-4">
                <span className="text-sm font-medium text-slate-700">
                  Freezes available
                </span>
                <input
                  className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-pine"
                  min="0"
                  type="number"
                  value={draft.streakFreezesAvailable}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      streakFreezesAvailable: Number(event.target.value)
                    })
                  }
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Toggle
                checked={draft.reminders.planning}
                label="Planning reminder"
                onChange={(value) => updateReminder("planning", value)}
              />
              <Toggle
                checked={draft.reminders.progress}
                label="Progress reminder"
                onChange={(value) => updateReminder("progress", value)}
              />
              <Toggle
                checked={draft.reminders.review}
                label="Review reminder"
                onChange={(value) => updateReminder("review", value)}
              />
            </div>

            <button className="inline-flex items-center gap-2 rounded-lg bg-pine px-4 py-2.5 font-semibold text-white transition hover:bg-pine/90">
              <Save size={18} />
              Save settings
            </button>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelTitle icon={Bell} title="Notifications" detail="Optional browser permission" />
            <p className="text-sm leading-6 text-slate-600">
              Status: {state.profile.notificationsEnabled ? "enabled" : "not enabled"}.
              In-app reminders still appear while Momentum is open.
            </p>
            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-pine/30 bg-white px-4 py-2.5 font-semibold text-pine transition hover:bg-mint"
              onClick={requestNotifications}
            >
              <Bell size={18} />
              Request notification access
            </button>
          </Panel>

          <Panel>
            <PanelTitle icon={Download} title="Local data" detail="Export or reset" />
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-100"
                onClick={() => setExportOpen((open) => !open)}
              >
                <Download size={18} />
                Export JSON
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-coral/30 bg-white px-4 py-2.5 font-semibold text-coral transition hover:bg-coral/10"
                onClick={reset}
              >
                <RotateCcw size={18} />
                Reset app
              </button>
            </div>
            {exportOpen ? (
              <textarea
                className="mt-4 h-48 w-full rounded-lg border border-black/10 bg-slate-950 p-3 font-mono text-xs text-slate-100"
                readOnly
                value={exportJson()}
              />
            ) : null}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function GoalQuickForm({
  onSubmit,
  submitLabel,
  compact = false
}: {
  onSubmit: (values: GoalFormValues) => void;
  submitLabel: string;
  compact?: boolean;
}) {
  const [values, setValues] = useState<GoalFormValues>({
    title: "",
    category: "Personal",
    targetValue: "",
    notes: ""
  });

  const submit = () => {
    onSubmit(values);
    setValues({ title: "", category: values.category, targetValue: "", notes: "" });
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TextInput
        label="Goal title"
        value={values.title}
        onChange={(title) => setValues({ ...values, title })}
        placeholder="e.g. Walk for 20 minutes"
      />
      <div className={classNames("grid gap-3", compact ? "" : "sm:grid-cols-2")}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 outline-none transition focus:border-pine focus:ring-2 focus:ring-mint"
            value={values.category}
            onChange={(event) =>
              setValues({ ...values, category: event.target.value as GoalCategory })
            }
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <TextInput
          label="Optional target"
          value={values.targetValue}
          onChange={(targetValue) => setValues({ ...values, targetValue })}
          placeholder="30 minutes, 10 pages"
        />
      </div>
      {!compact ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            className="mt-1 min-h-20 w-full rounded-lg border border-black/10 px-3 py-2 outline-none transition focus:border-pine focus:ring-2 focus:ring-mint"
            value={values.notes}
            onChange={(event) => setValues({ ...values, notes: event.target.value })}
            placeholder="Optional context"
          />
        </label>
      ) : null}
      <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-pine px-4 py-2.5 font-semibold text-white transition hover:bg-pine/90">
        <Plus size={18} />
        {submitLabel}
      </button>
    </form>
  );
}

function GoalList({
  goals,
  updateGoal,
  updateGoalStatus,
  deleteGoal,
  moveGoal,
  planningMode = false,
  empty
}: {
  goals: Goal[];
  updateGoal: (goalId: string, patch: Partial<Goal>) => void;
  updateGoalStatus: (goalId: string, status: GoalStatus) => void;
  deleteGoal: (goalId: string) => void;
  moveGoal: (goalId: string, direction: -1 | 1) => void;
  planningMode?: boolean;
  empty: JSX.Element;
}) {
  if (goals.length === 0) {
    return empty;
  }
  return (
    <div className="space-y-3">
      {goals.map((goal, index) => (
        <GoalItem
          key={goal.id}
          goal={goal}
          isFirst={index === 0}
          isLast={index === goals.length - 1}
          updateGoal={updateGoal}
          updateGoalStatus={updateGoalStatus}
          deleteGoal={deleteGoal}
          moveGoal={moveGoal}
          planningMode={planningMode}
        />
      ))}
    </div>
  );
}

function GoalItem({
  goal,
  isFirst,
  isLast,
  updateGoal,
  updateGoalStatus,
  deleteGoal,
  moveGoal,
  planningMode
}: {
  goal: Goal;
  isFirst: boolean;
  isLast: boolean;
  updateGoal: (goalId: string, patch: Partial<Goal>) => void;
  updateGoalStatus: (goalId: string, status: GoalStatus) => void;
  deleteGoal: (goalId: string) => void;
  moveGoal: (goalId: string, direction: -1 | 1) => void;
  planningMode: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal);

  useEffect(() => {
    setDraft(goal);
  }, [goal]);

  return (
    <article className="rounded-lg border border-black/10 bg-white p-3">
      <div className="flex items-start gap-3">
        {!planningMode ? (
          <StatusButton goal={goal} updateGoalStatus={updateGoalStatus} />
        ) : (
          <div className="mt-1 grid h-8 w-8 place-items-center rounded-lg bg-mint text-pine">
            <CalendarDays size={18} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-semibold">{goal.title}</h3>
            <EligibilityPill goal={goal} />
            {goal.status === "in_progress" ? (
              <span className="rounded-full bg-ambered/20 px-2 py-1 text-xs font-semibold text-amber-800">
                In progress
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {goal.category}
            {goal.targetValue ? ` · ${goal.targetValue}` : ""}
          </p>
          {goal.notes ? <p className="mt-2 text-sm text-slate-700">{goal.notes}</p> : null}
          {goal.streakEligible ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-pine">
              <Info size={14} />
              This goal was planned on time and counts toward today's streak.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label="Move up"
            disabled={isFirst}
            icon={ArrowUp}
            onClick={() => moveGoal(goal.id, -1)}
          />
          <IconButton
            label="Move down"
            disabled={isLast}
            icon={ArrowDown}
            onClick={() => moveGoal(goal.id, 1)}
          />
          <IconButton
            label="Edit"
            icon={editing ? X : Edit3}
            onClick={() => setEditing((open) => !open)}
          />
          <IconButton
            label="Delete"
            icon={Trash2}
            danger
            onClick={() => deleteGoal(goal.id)}
          />
        </div>
      </div>

      {!planningMode ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-11">
          <SmallAction
            active={goal.status === "not_started"}
            label="Not started"
            onClick={() => updateGoalStatus(goal.id, "not_started")}
          />
          <SmallAction
            active={goal.status === "in_progress"}
            label="In progress"
            onClick={() => updateGoalStatus(goal.id, "in_progress")}
          />
          <SmallAction
            active={goal.status === "completed"}
            label="Completed"
            onClick={() => updateGoalStatus(goal.id, "completed")}
          />
        </div>
      ) : null}

      {editing ? (
        <form
          className="mt-4 grid gap-3 border-t border-black/10 pt-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            updateGoal(goal.id, {
              title: draft.title.trim() || goal.title,
              category: draft.category,
              targetValue: draft.targetValue,
              notes: draft.notes
            });
            setEditing(false);
          }}
        >
          <TextInput
            label="Title"
            value={draft.title}
            onChange={(title) => setDraft({ ...draft, title })}
          />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 outline-none transition focus:border-pine focus:ring-2 focus:ring-mint"
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as GoalCategory })
              }
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <TextInput
            label="Target"
            value={draft.targetValue || ""}
            onChange={(targetValue) => setDraft({ ...draft, targetValue })}
          />
          <TextInput
            label="Notes"
            value={draft.notes || ""}
            onChange={(notes) => setDraft({ ...draft, notes })}
          />
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-pine px-4 py-2.5 font-semibold text-white sm:col-span-2">
            <Save size={18} />
            Save goal
          </button>
        </form>
      ) : null}
    </article>
  );
}

function StatusButton({
  goal,
  updateGoalStatus
}: {
  goal: Goal;
  updateGoalStatus: (goalId: string, status: GoalStatus) => void;
}) {
  const completed = goal.status === "completed";
  return (
    <button
      aria-label={completed ? "Mark incomplete" : "Mark complete"}
      className={classNames(
        "mt-1 grid h-9 w-9 place-items-center rounded-lg border transition",
        completed
          ? "border-pine bg-pine text-white"
          : "border-black/10 bg-white text-slate-500 hover:border-pine hover:text-pine"
      )}
      onClick={() =>
        updateGoalStatus(goal.id, completed ? "not_started" : "completed")
      }
    >
      {completed ? <Check size={20} /> : <Circle size={20} />}
    </button>
  );
}

function CompactGoalList({
  goals,
  empty,
  updateGoalStatus
}: {
  goals: Goal[];
  empty: string;
  updateGoalStatus: (goalId: string, status: GoalStatus) => void;
}) {
  if (goals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 bg-white/60 p-5 text-sm text-slate-600">
        {empty}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {goals.slice(0, 6).map((goal) => (
        <div
          className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2"
          key={goal.id}
        >
          <button
            aria-label={goal.status === "completed" ? "Mark incomplete" : "Mark complete"}
            className={classNames(
              "grid h-8 w-8 place-items-center rounded-lg",
              goal.status === "completed"
                ? "bg-pine text-white"
                : "bg-slate-100 text-slate-500"
            )}
            onClick={() =>
              updateGoalStatus(
                goal.id,
                goal.status === "completed" ? "not_started" : "completed"
              )
            }
          >
            {goal.status === "completed" ? <Check size={17} /> : <Circle size={17} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{goal.title}</p>
            <p className="text-xs text-slate-600">{goal.category}</p>
          </div>
          <EligibilityPill goal={goal} />
        </div>
      ))}
    </div>
  );
}

function ReviewPanel({
  state,
  stats,
  reviewed,
  submitReview,
  onPlanTomorrow
}: {
  state: AppState;
  stats: ReturnType<typeof calculateDayStats>;
  reviewed?: DailyLog;
  submitReview: (reflection: string, useFreeze: boolean) => void;
  onPlanTomorrow: () => void;
}) {
  const [reflection, setReflection] = useState(reviewed?.reflection || "");
  const failed = stats.streakResult === "failed";
  const canUseFreeze =
    failed &&
    state.profile.streakFreezesAvailable > 0 &&
    !state.profile.autoUseStreakFreeze;
  const [useFreeze, setUseFreeze] = useState(canUseFreeze);

  useEffect(() => {
    setUseFreeze(canUseFreeze);
  }, [canUseFreeze]);

  return (
    <Panel>
      <PanelTitle
        icon={Moon}
        title="End-of-day review"
        detail="Confirm completions and update streaks."
      />
      <div className="space-y-3 text-sm">
        <ReviewLine label="Completed eligible goals" value={`${stats.completedEligibleGoalsCount}/${stats.eligibleGoalsCount}`} />
        <ReviewLine label="Completion percentage" value={`${Math.round(stats.completionRate * 100)}%`} />
        <ReviewLine
          label="Streak outcome"
          value={
            stats.eligibleGoalsCount === 0
              ? "Not planned"
              : stats.streakResult === "success"
                ? "Continues"
                : "At risk"
          }
        />
      </div>
      {failed && state.profile.autoUseStreakFreeze && state.profile.streakFreezesAvailable > 0 ? (
        <Notice tone="info" title="Freeze ready">
          Freeze used. Your streak is protected, but it does not increase today.
        </Notice>
      ) : null}
      {canUseFreeze ? (
        <Toggle
          checked={useFreeze}
          label="Use one freeze if this review fails"
          onChange={setUseFreeze}
        />
      ) : null}
      <label className="mt-4 block">
        <span className="text-sm font-medium text-slate-700">Reflection</span>
        <textarea
          className="mt-1 min-h-24 w-full rounded-lg border border-black/10 px-3 py-2 outline-none transition focus:border-pine focus:ring-2 focus:ring-mint"
          value={reflection}
          onChange={(event) => setReflection(event.target.value)}
          placeholder="What helped? What should change tomorrow?"
        />
      </label>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-pine px-4 py-2.5 font-semibold text-white transition hover:bg-pine/90"
          onClick={() => submitReview(reflection, useFreeze)}
        >
          <CheckCircle2 size={18} />
          {reviewed ? "Update review" : "Complete review"}
        </button>
        <button
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-pine/30 bg-white px-4 py-2.5 font-semibold text-pine transition hover:bg-mint"
          onClick={onPlanTomorrow}
        >
          <CalendarDays size={18} />
          Plan tomorrow
        </button>
      </div>
      {reviewed ? (
        <p className="mt-3 text-xs text-slate-600">
          Last reviewed {new Date(reviewed.reviewedAt).toLocaleString()}.
        </p>
      ) : null}
    </Panel>
  );
}

function BadgeCard({
  badge,
  earnedAt,
  progress
}: {
  badge: BadgeDefinition;
  earnedAt?: string;
  progress: { current: number; target: number; percentage: number };
}) {
  const Icon = badgeIcons[badge.icon] || Award;
  const earned = Boolean(earnedAt);
  return (
    <article
      className={classNames(
        "rounded-lg border p-4 shadow-sm",
        earned
          ? "border-pine/25 bg-white"
          : "border-black/10 bg-white/70 text-slate-600"
      )}
    >
      <div
        className={classNames(
          "mb-4 grid h-12 w-12 place-items-center rounded-lg",
          earned ? "bg-mint text-pine" : "bg-slate-100 text-slate-500"
        )}
      >
        <Icon size={24} />
      </div>
      <h3 className="font-semibold text-ink">{badge.name}</h3>
      <p className="mt-1 min-h-12 text-sm leading-6">{badge.description}</p>
      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={classNames("h-full rounded-full", earned ? "bg-pine" : "bg-ambered")}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium">
          {earned
            ? `Earned ${new Date(earnedAt!).toLocaleDateString()}`
            : `${progress.current}/${progress.target} · ${badge.requirement}`}
        </p>
      </div>
    </article>
  );
}

function BadgeRow({ badgeKey, earnedAt }: { badgeKey: string; earnedAt: string }) {
  const badge = BADGES.find((item) => item.key === badgeKey);
  if (!badge) {
    return null;
  }
  const Icon = badgeIcons[badge.icon] || Award;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-mint text-pine">
        <Icon size={18} />
      </div>
      <div>
        <p className="font-medium">{badge.name}</p>
        <p className="text-xs text-slate-600">
          Earned {new Date(earnedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent
}: {
  icon: typeof Home;
  label: string;
  value: string;
  detail: string;
  accent: "pine" | "coral" | "plum" | "ambered";
}) {
  const colors = {
    pine: "bg-mint text-pine",
    coral: "bg-coral/12 text-coral",
    plum: "bg-plum/12 text-plum",
    ambered: "bg-ambered/20 text-amber-800"
  };
  return (
    <article className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
          <p className="mt-1 text-sm text-slate-600">{detail}</p>
        </div>
        <div className={classNames("grid h-10 w-10 place-items-center rounded-lg", colors[accent])}>
          <Icon size={20} />
        </div>
      </div>
    </article>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white/75 p-4 shadow-sm">
      {children}
    </section>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  detail
}: {
  icon: typeof Home;
  title: string;
  detail?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mint text-pine">
        <Icon size={18} />
      </div>
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        {detail ? <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p> : null}
      </div>
    </div>
  );
}

function Header({
  eyebrow,
  title,
  text,
  action
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-normal text-pine">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-ink">{title}</h1>
        <p className="mt-2 leading-7 text-slate-600">{text}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
  actionLabel,
  onAction
}: {
  icon: typeof Home;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 bg-white/65 p-5 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-mint text-pine">
        <Icon size={22} />
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-600">{text}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-pine px-4 py-2.5 font-semibold text-white transition hover:bg-pine/90"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function EligibilityPill({ goal }: { goal: Goal }) {
  return (
    <span
      className={classNames(
        "inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-semibold",
        goal.streakEligible
          ? "bg-mint text-pine"
          : "bg-coral/12 text-coral"
      )}
    >
      {goal.streakEligible ? "Eligible" : "Late goal"}
    </span>
  );
}

function ResultPill({ result }: { result: DailyLog["streakResult"] }) {
  const styles = {
    success: "bg-mint text-pine",
    failed: "bg-coral/12 text-coral",
    frozen: "bg-plum/12 text-plum",
    not_planned: "bg-slate-100 text-slate-600",
    pending: "bg-ambered/20 text-amber-800"
  };
  return (
    <span className={classNames("rounded-full px-2 py-1 text-xs font-semibold", styles[result])}>
      {result.replace("_", " ")}
    </span>
  );
}

function ReminderLine({
  label,
  enabled,
  value,
  suffix
}: {
  label: string;
  enabled: boolean;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-slate-600">{enabled ? "Enabled" : "Off"}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold">{value}</p>
        {suffix ? <p className="text-xs text-slate-500">{suffix}</p> : null}
      </div>
    </div>
  );
}

function ProgressBars({
  days,
  large = false
}: {
  days: Summary["week"]["days"];
  large?: boolean;
}) {
  return (
    <div className={classNames("grid gap-2", large ? "sm:grid-cols-7" : "")}>
      {days.map((day) => (
        <div
          key={day.date}
          className={classNames(
            "rounded-lg border border-black/10 bg-white p-3",
            large ? "" : "grid grid-cols-[70px_1fr_48px] items-center gap-3"
          )}
        >
          <p className="text-xs font-semibold text-slate-600">
            {large ? day.label.slice(0, 3) : day.label}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 sm:mt-0">
            <div
              className={classNames(
                "h-full rounded-full",
                day.rate >= 80 ? "bg-pine" : day.rate > 0 ? "bg-ambered" : "bg-slate-200"
              )}
              style={{ width: `${day.rate}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-semibold sm:mt-0">{day.rate}%</p>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 break-words text-xl font-bold">{value}</p>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Notice({
  tone,
  title,
  children
}: {
  tone: "info" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={classNames(
        "my-3 rounded-lg border p-3 text-sm",
        tone === "info"
          ? "border-pine/20 bg-mint/60 text-pine"
          : "border-ambered/40 bg-ambered/15 text-amber-900"
      )}
    >
      <p className="font-semibold">{title}</p>
      <div className="mt-1 leading-6">{children}</div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2.5 outline-none transition focus:border-pine focus:ring-2 focus:ring-mint"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TimeInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2.5 outline-none transition focus:border-pine focus:ring-2 focus:ring-mint"
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Toggle({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-4">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="h-5 w-5 accent-pine"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  danger = false
}: {
  label: string;
  icon: typeof Home;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      className={classNames(
        "grid h-8 w-8 place-items-center rounded-lg border border-black/10 bg-white transition",
        danger ? "text-coral hover:bg-coral/10" : "text-slate-600 hover:bg-slate-100",
        disabled ? "cursor-not-allowed opacity-35" : ""
      )}
      onClick={onClick}
    >
      <Icon size={16} />
    </button>
  );
}

function SmallAction({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={classNames(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active ? "bg-pine text-white" : "bg-slate-100 text-slate-600 hover:bg-mint hover:text-pine"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function RuleTile({
  icon: Icon,
  title,
  text
}: {
  icon: typeof Home;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <Icon className="text-pine" size={22} />
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function ToastRegion({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed right-4 top-4 z-50 w-[calc(100vw-2rem)] max-w-sm space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={classNames(
            "rounded-lg border bg-white px-4 py-3 shadow-soft",
            toast.tone === "success"
              ? "border-pine/25"
              : toast.tone === "warning"
                ? "border-ambered/40"
                : "border-black/10"
          )}
        >
          <p className="text-sm font-semibold">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}

interface Summary {
  week: {
    completed: number;
    planned: number;
    rate: number;
    bestDay: string;
    currentStreak: number;
    longestStreak: number;
    badgesEarned: number;
    missedDays: number;
    motivation: string;
    days: Array<{ date: string; label: string; rate: number }>;
  };
  month: {
    completed: number;
    averageRate: number;
    bestStreak: number;
    badgesEarned: number;
    topCategory: string;
  };
}

function buildSummary(state: AppState, today: string): Summary {
  const weekDates = dateKeyRangeEnding(today, 7);
  const weekDayStats = weekDates.map((date) => {
    const goals = state.goals.filter((goal) => goal.plannedForDate === date);
    const stats = calculateDayStats(goals, state.profile.streakThreshold);
    const log = state.dailyLogs.find((item) => item.date === date);
    return {
      date,
      label: formatFriendlyDate(date, state.profile.timezone),
      stats,
      log
    };
  });
  const completed = weekDayStats.reduce(
    (sum, day) => sum + day.stats.totalCompletedGoalsCount,
    0
  );
  const planned = weekDayStats.reduce((sum, day) => sum + day.stats.totalGoalsCount, 0);
  const rates = weekDayStats.filter((day) => day.stats.eligibleGoalsCount > 0);
  const rate =
    rates.length === 0
      ? 0
      : Math.round(
          (rates.reduce((sum, day) => sum + day.stats.completionRate, 0) /
            rates.length) *
            100
        );
  const best = rates
    .slice()
    .sort((a, b) => b.stats.completionRate - a.stats.completionRate)[0];
  const missedDays = weekDayStats.filter(
    (day) =>
      day.date <= today &&
      (day.stats.streakResult === "failed" || day.stats.streakResult === "not_planned")
  ).length;
  const monthPrefix = today.slice(0, 7);
  const monthGoals = state.goals.filter((goal) =>
    goal.plannedForDate.startsWith(monthPrefix)
  );
  const categoryCounts = monthGoals
    .filter((goal) => goal.status === "completed")
    .reduce<Record<string, number>>((acc, goal) => {
      acc[goal.category] = (acc[goal.category] || 0) + 1;
      return acc;
    }, {});
  const topCategory =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None yet";
  const monthLogs = state.dailyLogs.filter((log) => log.date.startsWith(monthPrefix));
  const averageRate =
    monthLogs.length === 0
      ? 0
      : Math.round(
          (monthLogs.reduce((sum, log) => sum + log.completionRate, 0) /
            monthLogs.length) *
            100
        );

  return {
    week: {
      completed,
      planned,
      rate,
      bestDay: best ? best.label : "",
      currentStreak: state.profile.currentStreak,
      longestStreak: state.profile.longestStreak,
      badgesEarned: state.userBadges.filter((badge) =>
        weekDates.includes(getDateKey(new Date(badge.earnedAt), state.profile.timezone))
      ).length,
      missedDays,
      motivation:
        completed === 0
          ? "Start with one small goal today."
          : rate >= 80
            ? "Strong week. Keep tomorrow's plan light and clear."
            : "A smaller plan may protect your next streak.",
      days: weekDayStats.map((day) => ({
        date: day.date,
        label: day.label,
        rate: Math.round(day.stats.completionRate * 100)
      }))
    },
    month: {
      completed: monthGoals.filter((goal) => goal.status === "completed").length,
      averageRate,
      bestStreak: state.profile.longestStreak,
      badgesEarned: state.userBadges.filter((badge) =>
        getDateKey(new Date(badge.earnedAt), state.profile.timezone).startsWith(
          monthPrefix
        )
      ).length,
      topCategory
    }
  };
}

function getNextAction(
  stats: ReturnType<typeof calculateDayStats>,
  tomorrowGoalCount: number,
  logs: DailyLog[],
  today: string
) {
  const reviewed = logs.some((log) => log.date === today);
  if (tomorrowGoalCount === 0) {
    return { label: "Plan tomorrow", page: "plan" as Page, tone: "plan" };
  }
  if (stats.eligibleGoalsCount === 0) {
    return { label: "Start fresh today", page: "today" as Page, tone: "today" };
  }
  if (goalsNeededForStreak(stats) > 0) {
    return { label: "Keep streak alive", page: "today" as Page, tone: "today" };
  }
  if (!reviewed) {
    return { label: "Review your day", page: "today" as Page, tone: "review" };
  }
  return { label: "Finish today's goals", page: "today" as Page, tone: "today" };
}

function useReminderEngine(state: AppState, pushToast: (message: string) => void) {
  useEffect(() => {
    const check = () => {
      const profile = state.profile;
      const now = new Date();
      const currentTime = getLocalTime(now, profile.timezone);
      const today = getDateKey(now, profile.timezone);
      const reminders: Array<{
        key: ReminderKey;
        enabled: boolean;
        time: string;
        message: string;
      }> = [
        {
          key: "planning",
          enabled: profile.reminders.planning,
          time: profile.planningReminderTime,
          message: "Don't forget to set tomorrow's goals."
        },
        {
          key: "progress",
          enabled: profile.reminders.progress,
          time: profile.progressReminderTime,
          message: `You have ${
            state.goals.filter((goal) => goal.plannedForDate === today).length
          } goals planned for today. Keep your streak alive.`
        },
        {
          key: "review",
          enabled: profile.reminders.review,
          time: profile.endOfDayReminderTime,
          message: "Review your day and protect your streak."
        }
      ];

      reminders.forEach((reminder) => {
        const sessionKey = `momentum-reminder-${reminder.key}-${today}`;
        if (
          reminder.enabled &&
          reminder.time === currentTime &&
          sessionStorage.getItem(sessionKey) !== "sent"
        ) {
          sessionStorage.setItem(sessionKey, "sent");
          if (
            profile.notificationsEnabled &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Momentum", { body: reminder.message });
          } else {
            pushToast(reminder.message);
          }
        }
      });
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [state, pushToast]);
}

function withCompletedTotal(state: AppState, goals: Goal[]): AppState {
  return {
    ...state,
    goals,
    profile: {
      ...state.profile,
      totalGoalsCompleted: goals.filter((goal) => goal.status === "completed").length,
      updatedAt: new Date().toISOString()
    }
  };
}

function sortGoals(goals: Goal[]) {
  return goals.slice().sort((a, b) => {
    if (a.plannedForDate !== b.plannedForDate) {
      return a.plannedForDate.localeCompare(b.plannedForDate);
    }
    return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
  });
}

function badgeName(key: string) {
  return BADGES.find((badge) => badge.key === key)?.name || key;
}

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function dayPart() {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "morning";
  }
  if (hour < 17) {
    return "afternoon";
  }
  return "evening";
}
