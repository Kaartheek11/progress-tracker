export const DEFAULT_TIMEZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function getDateKey(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function getTomorrowDateKey(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  return addDaysToDateKey(getDateKey(date, timeZone), 1);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(
    next.getUTCDate()
  )}`;
}

export function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

export function formatFriendlyDate(dateKey: string, timeZone = DEFAULT_TIMEZONE) {
  const date = zonedTimeToUtc(dateKey, "12:00", timeZone);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone
  }).format(date);
}

export function getLocalTime(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function isCreatedBeforePlanningDeadline(
  plannedForDate: string,
  createdAt: string,
  planningDeadlineTime: string,
  timeZone: string
) {
  const deadlineDate = addDaysToDateKey(plannedForDate, -1);
  const deadline = zonedTimeToUtc(deadlineDate, planningDeadlineTime, timeZone);
  return new Date(createdAt).getTime() <= deadline.getTime();
}

export function zonedTimeToUtc(
  dateKey: string,
  time: string,
  timeZone = DEFAULT_TIMEZONE
) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(utcGuess);
  let offset = getTimeZoneOffsetMs(candidate, timeZone);
  candidate = new Date(utcGuess - offset);
  offset = getTimeZoneOffsetMs(candidate, timeZone);
  return new Date(utcGuess - offset);
}

export function dateKeyRangeEnding(dateKey: string, days: number) {
  return Array.from({ length: days }, (_, index) =>
    addDaysToDateKey(dateKey, index - days + 1)
  );
}

export function minutesUntilLocalTime(
  time: string,
  date = new Date(),
  timeZone = DEFAULT_TIMEZONE
) {
  const today = getDateKey(date, timeZone);
  const targetToday = zonedTimeToUtc(today, time, timeZone);
  const target =
    targetToday.getTime() > date.getTime()
      ? targetToday
      : zonedTimeToUtc(addDaysToDateKey(today, 1), time, timeZone);
  return Math.round((target.getTime() - date.getTime()) / 60000);
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, number>>(
    (acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = Number(part.value);
      }
      return acc;
    },
    {}
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
