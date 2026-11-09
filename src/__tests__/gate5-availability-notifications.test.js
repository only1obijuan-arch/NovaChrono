import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitStatements } from "../../scripts/migrate.js";
import {
  isNotificationType,
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_TYPES,
} from "@/constants/notification-types";
import {
  isValidExpoPushToken,
  MAX_EXPO_PUSH_TOKEN_LENGTH,
} from "@/app/api/utils/push-token";
import { matchReminderEmail } from "@/emails/matchReminderEmail";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migration = read("migrations/0010_gate5_availability_notifications.sql");
const availability = read("src/app/api/auth/confirm-availability/handler.js");
const reminders = read("src/app/api/utils/match-reminders.js");
const cron = read("src/app/api/cron/match-reminders/handler.js");
const manual = read("src/app/api/send-match-reminder/handler.js");
const pushSender = read("src/app/api/utils/send-push.js");
const pushRoute = read("src/app/api/push-token/route.js");
const pushStore = read("src/app/api/utils/push-token-store.js");
const notificationsRoute = read("src/app/api/notifications/route.js");
const mobilePush = read("mobile/src/utils/usePushNotifications.js");
const mobileApi = read("mobile/src/utils/api.js");

describe("Gate 5 forward migration contracts", () => {
  it("is parseable and bounds DDL lock acquisition", () => {
    expect(splitStatements(migration).length).toBeGreaterThan(5);
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it("adds only the domain-specific expiry, claim, read, and dedupe state", () => {
    for (const field of ["expires_at", "delivery_claim_id", "delivery_claimed_at", "read_at", "dedupe_key"]) {
      expect(migration).toContain(field);
    }
    expect(migration).not.toMatch(/outbox|event_bus|subscription/i);
  });

  it("fails closed on incompatible availability, notification, and push state", () => {
    for (const marker of [
      "unsupported notification type exists",
      "duplicate push token ownership exists",
      "unsupported availability response exists",
      "inconsistent availability response state exists",
      "malformed availability token exists",
      "duplicate availability token exists",
      "duplicate availability match/team identity exists",
      "invalid match time slot",
    ]) expect(migration).toContain(marker);
  });

  it("enforces the response, notification, token, claim, and uniqueness invariants", () => {
    for (const object of [
      "availability_responses_response_supported",
      "availability_responses_state_consistent",
      "availability_responses_token_format",
      "availability_responses_claim_consistent",
      "notifications_type_supported",
      "availability_responses_token_unique",
      "notifications_dedupe_key_unique",
      "auth_users_push_token_unique",
    ]) expect(migration).toContain(object);
  });
});

describe("Gate 5 availability mutation boundaries", () => {
  it("keeps GET preview-only", () => {
    const getBody = availability.slice(
      availability.indexOf("export async function GET"),
      availability.indexOf("async function consumeAvailability"),
    );
    expect(getBody).toContain("findPreview");
    expect(getBody).toContain("buildPreviewPage");
    expect(getBody).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/);
    expect(getBody).not.toMatch(/sendEmail|sendPush/);
  });

  it("requires POST, a match lock, a one-time guard, and current lifecycle truth", () => {
    expect(availability).toContain("export async function POST");
    expect(availability).toContain("FOR UPDATE OF m");
    expect(availability).toContain("WHERE token = ${token} AND match_id = ${match.id}");
    expect(availability).toContain("AND responded_at IS NULL");
    expect(availability).toContain("AND response IS NULL");
    expect(availability).toContain('match.match_status !== "scheduled"');
    expect(availability).toContain('match.league_status !== "active"');
    expect(availability).toContain('team.status !== "active"');
    expect(availability).toContain("[match.home_team_id, match.away_team_id].includes(team.id)");
    expect(availability).toContain("expiresAt.getTime() !== matchStartsAt.getTime()");
  });

  it("commits response and in-app notices before external admin email", () => {
    expect(availability.indexOf("return {\n      availabilityId")).toBeLessThan(
      availability.indexOf("await sendEmail({"),
    );
    expect(availability).toContain("availability-response/${availability.id}/${admin.id}");
    expect(availability).toContain("Your response is safely recorded");
  });

  it("renders an explicit escaped confirmation form with anti-cache headers", () => {
    for (const header of ["Cache-Control", "no-store", "Referrer-Policy", "X-Robots-Tag"]) {
      expect(availability).toContain(header);
    }
    expect(availability).toContain('<form method="post"');
    expect(availability).toContain('name="token"');
    expect(availability).toContain("escapeHtml(record.team_name)");
    expect(availability).toContain("Nothing changes until you press");
  });
});

describe("Gate 5 reminder truthfulness contracts", () => {
  it("uses one shared service for cron and manual sends", () => {
    expect(cron).toContain("sendReminderForTeam");
    expect(manual).toContain("sendReminderForTeam");
    expect(cron).not.toContain("sendEmail");
    expect(manual).not.toContain("sendEmail");
    expect(manual).not.toContain("<!DOCTYPE html>");
  });

  it("locks the match, validates current teams, and uses Johannesburg schedule truth", () => {
    expect(reminders).toContain("FOR UPDATE OF m");
    expect(reminders).toContain("Africa/Johannesburg");
    expect(reminders).toContain("nova_planned_date(m.match_date)");
    expect(reminders).toContain('match.status !== "scheduled"');
    expect(reminders).toContain('match.league_status !== "active"');
    expect(reminders).toContain('teams.some((team) => team.status !== "active")');
    expect(reminders).toContain('side === "home"');
  });

  it("claims before I/O and advances metadata only after required email success", () => {
    expect(reminders).toContain("delivery_claimed_at = CURRENT_TIMESTAMP");
    const emailAt = reminders.indexOf("await sendEmail({");
    const finalizeAt = reminders.indexOf("const finalized = await finalizeClaim(claim)");
    expect(emailAt).toBeGreaterThan(0);
    expect(finalizeAt).toBeGreaterThan(emailAt);
    expect(reminders).toContain("reminder_count = reminder_count + 1");
    expect(reminders).toContain("last_reminder_at = clock_timestamp()");
    expect(reminders).not.toContain("last_reminder_at = CURRENT_TIMESTAMP");
    expect(reminders).toContain("await releaseClaim(claim.availabilityId, claim.claimId)");
    expect(reminders).toContain("match-reminder/${claim.claimId}");
    expect(reminders).toContain("WHERE id = ${claim.matchId}\n      FOR UPDATE");
    expect(reminders).toContain('status: "provider_error"');
  });

  it("bounds automatic work, rejects unknown cron types, and deduplicates midday alerts", () => {
    expect(reminders).toContain("MAX_AUTOMATIC_CANDIDATES");
    expect(cron).toContain("Unsupported cron type");
    expect(cron).toContain("CRON_SECRET");
    expect(reminders).toContain("unconfirmed/${match.id}/${match.match_local_date}/${admin.id}");
    expect(reminders).toContain("ON CONFLICT (dedupe_key)");
  });
});

describe("Gate 5 notification and push governance", () => {
  it("uses the exact audited notification vocabulary", () => {
    expect(NOTIFICATION_TYPE_VALUES).toEqual([
      "match_reminder",
      "availability_confirmed",
      "availability_declined",
      "unconfirmed_alert",
      "admin_message",
      "weather_warning",
      "match_postponed",
      "round_postponed",
    ]);
    expect(isNotificationType(NOTIFICATION_TYPES.ADMIN_MESSAGE)).toBe(true);
    expect(isNotificationType("unknown")).toBe(false);
    for (const type of NOTIFICATION_TYPE_VALUES) expect(migration).toContain(`'${type}'`);
  });

  it("accepts both current Expo formats and rejects malformed or oversized tokens", () => {
    expect(isValidExpoPushToken("ExponentPushToken[abc_DEF-123]")).toBe(true);
    expect(isValidExpoPushToken("ExpoPushToken[abc_DEF-123]")).toBe(true);
    expect(isValidExpoPushToken("ExponentPushTokenabc")).toBe(false);
    expect(isValidExpoPushToken("ExpoPushToken[]")).toBe(false);
    expect(isValidExpoPushToken(`ExpoPushToken[${"a".repeat(MAX_EXPO_PUSH_TOKEN_LENGTH)}]`)).toBe(false);
  });

  it("reassigns ownership atomically and cleans up on explicit mobile logout", () => {
    expect(pushStore).toContain("ORDER BY id");
    expect(pushStore).toContain("FOR UPDATE");
    expect(pushStore).toContain("SET push_token = NULL");
    expect(pushStore).toContain('error?.code === "23505"');
    expect(pushRoute).toContain('registration.status === "conflict"');
    expect(mobileApi).toContain('/api/push-token`');
    expect(mobileApi).toContain('method: "DELETE"');
  });

  it("maps provider outcomes and only clears definitive invalid tokens", () => {
    expect(pushSender).toContain('status: "accepted"');
    expect(pushSender).toContain('status: "invalid_token"');
    expect(pushSender).toContain('status: "provider_error"');
    expect(pushSender).toContain("DeviceNotRegistered");
    expect(pushSender).toContain("clearStoredToken(message.token)");
    expect(pushSender).toContain("response.status === 429 || response.status >= 500");
  });

  it("preserves read_at and scopes truthful updates to the current user", () => {
    expect(notificationsRoute).toContain("read_at = COALESCE(read_at, CURRENT_TIMESTAMP)");
    expect(notificationsRoute).toContain("AND read = FALSE");
    expect(notificationsRoute).toContain("AND user_id = ${session.user.id}");
    expect(notificationsRoute).toContain("Notification not found");
  });

  it("keeps mobile permission refusal and registration errors non-fatal", () => {
    expect(mobilePush).toContain('finalStatus !== "granted"');
    expect(mobilePush).toContain("Constants.easConfig?.projectId");
    expect(mobilePush).toContain("Constants.expoConfig?.extra?.eas?.projectId");
    expect(mobilePush).toContain("Push token registration failed");
  });
});

describe("Gate 5 reminder email escaping", () => {
  it("escapes every user-controlled match value and URL", () => {
    const html = matchReminderEmail({
      captainName: '<img src=x onerror="captain">',
      teamName: "<script>team</script>",
      opponentName: "<b>opponent</b>",
      matchDate: "<i>date</i>",
      timeSlot: '18:30\" onclick="time',
      fieldNumber: "<svg/onload=field>",
      urgencyColor: "#00F5D4",
      urgencyLabel: "<u>urgent</u>",
      confirmUrl: 'https://example.test/?x=\" onclick=\"yes',
      declineUrl: "https://example.test/?x=<no>",
    });
    expect(html).not.toContain("<script>team</script>");
    expect(html).not.toContain("<b>opponent</b>");
    expect(html).not.toContain('onerror="captain"');
    expect(html).not.toContain('onclick="time');
    expect(html).not.toContain("<svg/onload=field>");
    expect(html).toContain("&lt;script&gt;team&lt;/script&gt;");
  });
});
