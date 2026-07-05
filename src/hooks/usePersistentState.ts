import { useEffect, useMemo, useState } from "react";
import type { AppState } from "../types";
import { createInitialState } from "../data/defaults";

const STORAGE_KEY = "momentum.state.v1";

export function usePersistentState() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to save app data."
      );
    }
  }, [state]);

  const helpers = useMemo(
    () => ({
      reset() {
        localStorage.removeItem(STORAGE_KEY);
        setState(createInitialState());
      },
      exportJson() {
        return JSON.stringify(state, null, 2);
      }
    }),
    [state]
  );

  return { state, setState, loadError, helpers };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState();
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const fallback = createInitialState();
    return {
      ...fallback,
      ...parsed,
      profile: { ...fallback.profile, ...parsed.profile },
      goals: parsed.goals || [],
      dailyLogs: parsed.dailyLogs || [],
      userBadges: parsed.userBadges || [],
      freezeEvents: parsed.freezeEvents || [],
      onboarded: Boolean(parsed.onboarded)
    };
  } catch {
    return createInitialState();
  }
}
