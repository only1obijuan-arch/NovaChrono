import { isValidLocalDate, isValidLocalTime } from "@/utils/scheduling";

export const ACTIVE_SCHEDULE_STATUSES = ["scheduled", "live"];

// DATE and TIMESTAMPTZ deployments must interpret Nova's date-only inputs the
// same way. UTC preserves the accepted production representation (midnight
// UTC) while nova_planned_date remains the compatibility read boundary.
export async function setCanonicalScheduleTimeZone(txSql) {
  await txSql`SET LOCAL TIME ZONE 'UTC'`;
}

export function scheduleValidationError({ matchDate, timeSlot, fieldNumber }, league) {
  if (!isValidLocalDate(matchDate)) return "matchDate must be a real YYYY-MM-DD local date";
  if (!isValidLocalTime(timeSlot)) return "timeSlot must be a valid 24-hour HH:MM time";
  if (!Number.isInteger(fieldNumber) || fieldNumber < 1 || fieldNumber > league.fields_count) {
    return `fieldNumber must be between 1 and ${league.fields_count}`;
  }
  const configured = Array.isArray(league.time_slots) ? league.time_slots : [];
  if (!configured.includes(timeSlot)) return "timeSlot is not configured for this league";
  return null;
}

export function fixtureScheduleKey({ venueId, fieldNumber, matchDate, timeSlot }) {
  return `fixture|${venueId}|${fieldNumber}|${matchDate}|${timeSlot}`;
}

export function refereeScheduleKey({ refereeId, matchDate, timeSlot }) {
  return `referee|${refereeId}|${matchDate}|${timeSlot}`;
}

export async function lockFixtureSchedule(txSql, schedule) {
  const key = fixtureScheduleKey(schedule);
  await txSql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function findFixtureConflict(txSql, schedule, excludeMatchId = null) {
  const [conflict] = await txSql`
    SELECT m.id
    FROM matches m
    JOIN leagues l ON l.id = m.league_id
    WHERE l.venue_id = ${schedule.venueId}
      AND m.field_number = ${schedule.fieldNumber}
      AND nova_planned_date(m.match_date) = ${schedule.matchDate}::date
      AND m.time_slot = ${schedule.timeSlot}
      AND m.status IN ('scheduled', 'live')
      AND (${excludeMatchId}::uuid IS NULL OR m.id <> ${excludeMatchId}::uuid)
    LIMIT 1
  `;
  return conflict ?? null;
}

export async function lockRefereeSchedule(txSql, schedule) {
  const key = refereeScheduleKey(schedule);
  await txSql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function findRefereeConflict(txSql, schedule, excludeMatchId = null) {
  const [conflict] = await txSql`
    SELECT id
    FROM matches
    WHERE referee_id = ${schedule.refereeId}
      AND nova_planned_date(match_date) = ${schedule.matchDate}::date
      AND time_slot = ${schedule.timeSlot}
      AND status IN ('scheduled', 'live')
      AND (${excludeMatchId}::uuid IS NULL OR id <> ${excludeMatchId}::uuid)
    LIMIT 1
  `;
  return conflict ?? null;
}
