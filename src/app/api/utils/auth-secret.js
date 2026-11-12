const MINIMUM_AUTH_SECRET_LENGTH = 32;

export function getAuthSecretKey() {
  const value = process.env.AUTH_SECRET;
  if (typeof value !== "string" || value.length < MINIMUM_AUTH_SECRET_LENGTH) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters");
  }
  return new TextEncoder().encode(value);
}
