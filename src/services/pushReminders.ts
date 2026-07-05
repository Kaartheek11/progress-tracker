import type { Goal, UserProfile } from "../types";
import { getDateKey } from "../utils/date";

const publicKey = import.meta.env.VITE_PUSH_REMINDER_PUBLIC_KEY as
  | string
  | undefined;
const subscribeUrl = import.meta.env.VITE_PUSH_REMINDER_SUBSCRIBE_URL as
  | string
  | undefined;
const unsubscribeUrl = import.meta.env.VITE_PUSH_REMINDER_UNSUBSCRIBE_URL as
  | string
  | undefined;

export interface PushReminderResult {
  status: UserProfile["closedRemindersStatus"];
  subscriptionEndpoint?: string;
  message: string;
}

export function hasPushReminderConfig() {
  return Boolean(publicKey && subscribeUrl);
}

export function supportsClosedReminders() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerMomentumServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return undefined;
  }

  return navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    { scope: import.meta.env.BASE_URL }
  );
}

export async function enableClosedReminders(
  profile: UserProfile,
  goals: Goal[]
): Promise<PushReminderResult> {
  if (!supportsClosedReminders()) {
    return {
      status: "unsupported",
      message: "Closed-app reminders are not supported by this browser."
    };
  }

  if (!hasPushReminderConfig()) {
    return {
      status: "not_configured",
      message:
        "Closed-app reminders need a Web Push backend before they can run while Momentum is closed."
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      status: "permission_denied",
      message:
        "Notification permission was not granted. In-app reminders still work while Momentum is open."
    };
  }

  try {
    const registration = await registerMomentumServiceWorker();
    if (!registration) {
      return {
        status: "unsupported",
        message: "Service workers are not available in this browser."
      };
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!)
      }));

    await postSubscription(subscribeUrl!, {
      subscription,
      profile: toReminderProfile(profile),
      snapshot: buildReminderSnapshot(profile, goals),
      appUrl: new URL(import.meta.env.BASE_URL, window.location.origin).href
    });

    return {
      status: "subscribed",
      subscriptionEndpoint: subscription.endpoint,
      message: "Closed-app reminders are connected."
    };
  } catch (error) {
    return {
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to connect closed-app reminders."
    };
  }
}

export async function disableClosedReminders(): Promise<PushReminderResult> {
  if (!supportsClosedReminders()) {
    return {
      status: "unsupported",
      message: "Closed-app reminders are not supported by this browser."
    };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    if (unsubscribeUrl) {
      await postSubscription(unsubscribeUrl, { subscription });
    }
    await subscription.unsubscribe();
  }

  return {
    status: "idle",
    message: "Closed-app reminders are off."
  };
}

function toReminderProfile(profile: UserProfile) {
  return {
    userId: profile.id,
    timezone: profile.timezone,
    reminders: profile.reminders,
    planningReminderTime: profile.planningReminderTime,
    progressReminderTime: profile.progressReminderTime,
    endOfDayReminderTime: profile.endOfDayReminderTime
  };
}

function buildReminderSnapshot(profile: UserProfile, goals: Goal[]) {
  const today = getDateKey(new Date(), profile.timezone);

  return {
    today,
    todayGoalsCount: goals.filter((goal) => goal.plannedForDate === today).length
  };
}

async function postSubscription(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Reminder backend returned ${response.status}.`);
  }
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}
