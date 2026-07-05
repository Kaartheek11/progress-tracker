interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_JWK: string;
  VAPID_SUBJECT: string;
  REMINDER_ADMIN_SECRET?: string;
}

interface SubscribePayload {
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  profile?: {
    userId?: string;
    timezone?: string;
    reminders?: {
      planning?: boolean;
      progress?: boolean;
      review?: boolean;
    };
    planningReminderTime?: string;
    progressReminderTime?: string;
    endOfDayReminderTime?: string;
  };
  snapshot?: {
    todayGoalsCount?: number;
  };
  appUrl?: string;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
  timezone: string;
  planning_enabled: number;
  progress_enabled: number;
  review_enabled: number;
  planning_time: string;
  progress_time: string;
  review_time: string;
  app_url: string;
  today_goals_count: number;
  last_planning_sent_key: string | null;
  last_progress_sent_key: string | null;
  last_review_sent_key: string | null;
}

type ReminderType = "planning" | "progress" | "review";

const jsonHeaders = {
  "Content-Type": "application/json"
};

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true }, env);
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      return subscribe(request, env);
    }

    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      return unsubscribe(request, env);
    }

    if (url.pathname === "/run-due-reminders" && request.method === "POST") {
      return runDueReminders(request, env);
    }

    return json({ error: "Not found" }, env, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendDueReminders(env, new Date()));
  }
};

async function subscribe(request: Request, env: Env) {
  const payload = await request.json<SubscribePayload>().catch(() => undefined);
  const parsed = parseSubscribePayload(payload);

  if (!parsed.ok) {
    return json({ error: parsed.error }, env, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (
      endpoint,
      p256dh,
      auth,
      user_id,
      timezone,
      planning_enabled,
      progress_enabled,
      review_enabled,
      planning_time,
      progress_time,
      review_time,
      app_url,
      today_goals_count,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_id = excluded.user_id,
      timezone = excluded.timezone,
      planning_enabled = excluded.planning_enabled,
      progress_enabled = excluded.progress_enabled,
      review_enabled = excluded.review_enabled,
      planning_time = excluded.planning_time,
      progress_time = excluded.progress_time,
      review_time = excluded.review_time,
      app_url = excluded.app_url,
      today_goals_count = excluded.today_goals_count,
      updated_at = excluded.updated_at`
  )
    .bind(
      parsed.data.endpoint,
      parsed.data.p256dh,
      parsed.data.auth,
      parsed.data.userId,
      parsed.data.timezone,
      parsed.data.planningEnabled ? 1 : 0,
      parsed.data.progressEnabled ? 1 : 0,
      parsed.data.reviewEnabled ? 1 : 0,
      parsed.data.planningTime,
      parsed.data.progressTime,
      parsed.data.reviewTime,
      parsed.data.appUrl,
      parsed.data.todayGoalsCount,
      now,
      now
    )
    .run();

  return json({ ok: true }, env);
}

async function unsubscribe(request: Request, env: Env) {
  const payload = await request.json<SubscribePayload>().catch(() => undefined);
  const endpoint = payload?.subscription?.endpoint;
  if (!endpoint) {
    return json({ error: "Missing subscription endpoint." }, env, 400);
  }

  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .run();

  return json({ ok: true }, env);
}

async function runDueReminders(request: Request, env: Env) {
  const secret = request.headers.get("X-Reminder-Secret");
  if (!env.REMINDER_ADMIN_SECRET || secret !== env.REMINDER_ADMIN_SECRET) {
    return json({ error: "Unauthorized" }, env, 401);
  }

  const result = await sendDueReminders(env, new Date());
  return json(result, env);
}

async function sendDueReminders(env: Env, now: Date) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM push_subscriptions LIMIT 500"
  ).all<SubscriptionRow>();
  let attempted = 0;
  let sent = 0;
  let removed = 0;

  for (const row of results) {
    const dueTypes = getDueReminderTypes(row, now);
    for (const type of dueTypes) {
      attempted += 1;
      const response = await sendWebPush(row.endpoint, env);

      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
          .bind(row.endpoint)
          .run();
        removed += 1;
        continue;
      }

      if (response.ok) {
        await markSent(env, row, type, localDateKey(now, row.timezone));
        sent += 1;
      }
    }
  }

  return {
    ok: true,
    checked: results.length,
    attempted,
    sent,
    removed
  };
}

function getDueReminderTypes(row: SubscriptionRow, now: Date): ReminderType[] {
  const due: ReminderType[] = [];
  const dateKey = localDateKey(now, row.timezone);

  if (
    row.planning_enabled &&
    isTimeDueThisWindow(now, row.timezone, row.planning_time) &&
    row.last_planning_sent_key !== dateKey
  ) {
    due.push("planning");
  }

  if (
    row.progress_enabled &&
    isTimeDueThisWindow(now, row.timezone, row.progress_time) &&
    row.last_progress_sent_key !== dateKey
  ) {
    due.push("progress");
  }

  if (
    row.review_enabled &&
    isTimeDueThisWindow(now, row.timezone, row.review_time) &&
    row.last_review_sent_key !== dateKey
  ) {
    due.push("review");
  }

  return due;
}

async function sendWebPush(endpoint: string, env: Env) {
  const jwt = await createVapidJwt(endpoint, env);
  return fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "300",
      Urgency: "normal",
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`
    }
  });
}

async function createVapidJwt(endpoint: string, env: Env) {
  const header = base64UrlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64UrlJson({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT
  });
  const input = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey,
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256"
    },
    privateKey,
    new TextEncoder().encode(input)
  );

  return `${input}.${base64Url(signature)}`;
}

async function markSent(
  env: Env,
  row: SubscriptionRow,
  type: ReminderType,
  dateKey: string
) {
  const column = {
    planning: "last_planning_sent_key",
    progress: "last_progress_sent_key",
    review: "last_review_sent_key"
  }[type];

  await env.DB.prepare(
    `UPDATE push_subscriptions SET ${column} = ?, updated_at = ? WHERE endpoint = ?`
  )
    .bind(dateKey, new Date().toISOString(), row.endpoint)
    .run();
}

function parseSubscribePayload(payload: SubscribePayload | undefined):
  | {
      ok: true;
      data: {
        endpoint: string;
        p256dh: string;
        auth: string;
        userId: string;
        timezone: string;
        planningEnabled: boolean;
        progressEnabled: boolean;
        reviewEnabled: boolean;
        planningTime: string;
        progressTime: string;
        reviewTime: string;
        appUrl: string;
        todayGoalsCount: number;
      };
    }
  | { ok: false; error: string } {
  const endpoint = payload?.subscription?.endpoint;
  const p256dh = payload?.subscription?.keys?.p256dh;
  const auth = payload?.subscription?.keys?.auth;
  const profile = payload?.profile;

  if (!endpoint || !p256dh || !auth || !profile) {
    return { ok: false, error: "Missing subscription or profile." };
  }

  return {
    ok: true,
    data: {
      endpoint,
      p256dh,
      auth,
      userId: profile.userId || "local-user",
      timezone: profile.timezone || "UTC",
      planningEnabled: profile.reminders?.planning !== false,
      progressEnabled: profile.reminders?.progress !== false,
      reviewEnabled: profile.reminders?.review !== false,
      planningTime: normalizeTime(profile.planningReminderTime, "20:30"),
      progressTime: normalizeTime(profile.progressReminderTime, "09:00"),
      reviewTime: normalizeTime(profile.endOfDayReminderTime, "20:45"),
      appUrl: payload.appUrl || "https://kaartheek11.github.io/progress-tracker/",
      todayGoalsCount: Number(payload.snapshot?.todayGoalsCount || 0)
    }
  };
}

function normalizeTime(value: string | undefined, fallback: string) {
  return /^\d{2}:\d{2}$/.test(value || "") ? value! : fallback;
}

function isTimeDueThisWindow(now: Date, timeZone: string, reminderTime: string) {
  const localMinutes = localMinutesOfDay(now, timeZone);
  const reminderMinutes = parseTimeToMinutes(reminderTime);
  const diff = (localMinutes - reminderMinutes + 1440) % 1440;
  return diff >= 0 && diff < 5;
}

function localDateKey(now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function localMinutesOfDay(now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  return parts.hour * 60 + parts.minute;
}

function zonedParts(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const values = formatter.formatToParts(now).reduce<Record<string, number>>(
    (acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = Number(part.value);
      }
      return acc;
    },
    {}
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute
  };
}

function safeTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function base64UrlJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(data: unknown, env: Env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...jsonHeaders,
      ...corsHeaders(env)
    }
  });
}

function corsHeaders(env: Env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Reminder-Secret",
    "Access-Control-Max-Age": "86400"
  };
}
