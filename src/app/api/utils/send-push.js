import { sql } from "@/app/api/utils/db";
import { isValidExpoPushToken } from "@/app/api/utils/push-token";

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const PUSH_TIMEOUT_MS = 10_000;

async function clearStoredToken(token) {
  if (typeof token !== "string" || token.length > 256) return false;
  try {
    await sql`
      UPDATE auth_users
      SET push_token = NULL
      WHERE push_token = ${token}
    `;
    return true;
  } catch (error) {
    console.error("Push token cleanup failed", { code: error?.code || "UNKNOWN" });
    return false;
  }
}

function providerFailure(message, retryable = true) {
  return {
    status: "provider_error",
    accepted: false,
    retryable,
    message,
  };
}

/**
 * Sends a batch to Expo and returns one sanitized result per input message.
 * Invalid and permanently rejected tokens are cleared from auth_users.
 */
export async function sendPushNotifications(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const results = new Array(messages.length);
  const valid = [];

  for (const [index, message] of messages.entries()) {
    if (!isValidExpoPushToken(message?.token)) {
      results[index] = {
        status: "invalid_token",
        accepted: false,
        retryable: false,
        message: "The stored push token is invalid",
      };
      results[index].tokenCleared = await clearStoredToken(message?.token);
      continue;
    }
    valid.push({ index, message });
  }

  if (valid.length === 0) return results;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);

  try {
    const response = await fetch(EXPO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(valid.map(({ message }) => ({
        to: message.token,
        title: message.title,
        body: message.body,
        data: message.data || {},
        sound: "default",
        priority: "high",
      }))),
      signal: controller.signal,
    });

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      for (const { index } of valid) {
        results[index] = providerFailure("The push provider rejected the request", retryable);
      }
      return results;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const tickets = Array.isArray(payload?.data) ? payload.data : [];

    for (const [position, { index, message }] of valid.entries()) {
      const ticket = tickets[position];
      if (ticket?.status === "ok") {
        results[index] = {
          status: "accepted",
          accepted: true,
          retryable: false,
          ticketId: typeof ticket.id === "string" ? ticket.id : null,
        };
        continue;
      }

      if (ticket?.details?.error === "DeviceNotRegistered") {
        const tokenCleared = await clearStoredToken(message.token);
        results[index] = {
          status: "invalid_token",
          accepted: false,
          retryable: false,
          message: "The device is no longer registered",
          tokenCleared,
        };
        continue;
      }

      results[index] = providerFailure(
        "The push provider did not accept the notification",
        ticket?.details?.error === "MessageRateExceeded",
      );
    }
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "The push provider timed out"
      : "The push provider is unavailable";
    for (const { index } of valid) {
      results[index] = providerFailure(message, true);
    }
  } finally {
    clearTimeout(timeout);
  }

  return results;
}

export async function sendPush(token, title, body, data = {}) {
  const [result] = await sendPushNotifications([{ token, title, body, data }]);
  return result;
}
