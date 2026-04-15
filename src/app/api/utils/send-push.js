/**
 * Sends push notifications via the Expo Push API.
 * No SDK required — plain HTTP to https://exp.host/--/api/v2/push/send
 *
 * @param {Array<{ token: string, title: string, body: string, data?: object }>} messages
 * @returns {Promise<void>}
 */
export async function sendPushNotifications(messages) {
  if (!messages || messages.length === 0) return;

  // Filter out null/undefined tokens
  const valid = messages.filter(
    (m) => m.token && m.token.startsWith("ExponentPushToken")
  );
  if (valid.length === 0) return;

  const payload = valid.map((m) => ({
    to: m.token,
    title: m.title,
    body: m.body,
    data: m.data || {},
    sound: "default",
    priority: "high",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Expo push error:", text);
    }
  } catch (err) {
    console.error("Failed to send push notifications:", err);
  }
}

/**
 * Convenience wrapper for a single push notification.
 */
export async function sendPush(token, title, body, data = {}) {
  return sendPushNotifications([{ token, title, body, data }]);
}
