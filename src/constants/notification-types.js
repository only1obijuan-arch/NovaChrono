export const NOTIFICATION_TYPES = Object.freeze({
  MATCH_REMINDER: "match_reminder",
  AVAILABILITY_CONFIRMED: "availability_confirmed",
  AVAILABILITY_DECLINED: "availability_declined",
  UNCONFIRMED_ALERT: "unconfirmed_alert",
  ADMIN_MESSAGE: "admin_message",
  WEATHER_WARNING: "weather_warning",
  MATCH_POSTPONED: "match_postponed",
  ROUND_POSTPONED: "round_postponed",
});

export const NOTIFICATION_TYPE_VALUES = Object.freeze(
  Object.values(NOTIFICATION_TYPES),
);

export function isNotificationType(value) {
  return NOTIFICATION_TYPE_VALUES.includes(value);
}
