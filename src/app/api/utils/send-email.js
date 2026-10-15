const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [150, 400];

export class EmailDeliveryError extends Error {
  constructor(message, { code, status = null, retryable = false } = {}) {
    super(message);
    this.name = "EmailDeliveryError";
    this.code = code ?? "EMAIL_DELIVERY_FAILED";
    this.status = status;
    this.retryable = retryable;
  }
}

function normalizeRecipients(to) {
  const recipients = (Array.isArray(to) ? to : [to])
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (recipients.length === 0 || recipients.some((value) => !value.includes("@"))) {
    throw new EmailDeliveryError("A valid email recipient is required", {
      code: "INVALID_RECIPIENT",
    });
  }
  return recipients;
}

function validateIdempotencyKey(value) {
  if (value == null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new EmailDeliveryError("Invalid email idempotency key", {
      code: "INVALID_IDEMPOTENCY_KEY",
    });
  }
  return value;
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseProviderResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function sendEmail({
  to,
  from,
  subject,
  html,
  text,
  idempotencyKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailDeliveryError("Email delivery is not configured", {
      code: "EMAIL_NOT_CONFIGURED",
    });
  }

  const recipients = normalizeRecipients(to);
  const cleanSubject = typeof subject === "string" ? subject.trim() : "";
  if (!cleanSubject || cleanSubject.length > 500) {
    throw new EmailDeliveryError("A valid email subject is required", {
      code: "INVALID_SUBJECT",
    });
  }
  if (!(typeof html === "string" && html.length > 0)
      && !(typeof text === "string" && text.length > 0)) {
    throw new EmailDeliveryError("Email content is required", {
      code: "INVALID_CONTENT",
    });
  }

  const key = validateIdempotencyKey(idempotencyKey);
  const attempts = Math.max(1, Math.min(Number(maxAttempts) || 1, 3));
  const payload = {
    from: from || process.env.RESEND_FROM_EMAIL || "noreply@novachrono.app",
    to: recipients,
    subject: cleanSubject,
    html,
    text,
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await parseProviderResponse(response);

      if (response.ok && typeof data?.id === "string" && data.id.length > 0) {
        return { id: data.id };
      }

      const retryable = isRetryableStatus(response.status);
      if (retryable && attempt + 1 < attempts) {
        await delay(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1));
        continue;
      }

      throw new EmailDeliveryError("Email provider rejected the request", {
        code: "EMAIL_PROVIDER_ERROR",
        status: response.status,
        retryable,
      });
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      const timedOut = error?.name === "AbortError";
      if (attempt + 1 < attempts) {
        await delay(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1));
        continue;
      }
      throw new EmailDeliveryError(
        timedOut ? "Email provider timed out" : "Email provider is unavailable",
        {
          code: timedOut ? "EMAIL_TIMEOUT" : "EMAIL_NETWORK_ERROR",
          retryable: true,
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new EmailDeliveryError("Email delivery failed", {
    code: "EMAIL_DELIVERY_FAILED",
  });
}
