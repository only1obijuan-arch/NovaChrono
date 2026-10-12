export const LEAGUE_TIME_ZONE = "Africa/Johannesburg";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function localDateString(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: LEAGUE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = (type) => parts.find((entry) => entry.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  return "";
}

export function isValidLocalDate(value) {
  const match = typeof value === "string" ? value.match(DATE_RE) : null;
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidLocalTime(value) {
  return typeof value === "string" && TIME_RE.test(value);
}

function dateAtSafeUtcNoon(value) {
  const date = localDateString(value);
  if (!isValidLocalDate(date)) return null;
  return new Date(`${date}T12:00:00.000Z`);
}

export function addDaysToLocalDate(value, days) {
  const date = dateAtSafeUtcNoon(value);
  if (!date || !Number.isInteger(days)) throw new Error("Invalid local date adjustment");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonthsToLocalDate(value, months) {
  const date = dateAtSafeUtcNoon(value);
  if (!date || !Number.isInteger(months)) throw new Error("Invalid local date adjustment");
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
}

export function localWeekdayNumber(value) {
  const date = dateAtSafeUtcNoon(value);
  return date ? date.getUTCDay() : null;
}

export function formatLocalFixtureDate(value, locale = "en-ZA") {
  const date = dateAtSafeUtcNoon(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
