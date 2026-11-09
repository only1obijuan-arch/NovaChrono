export const MAX_EXPO_PUSH_TOKEN_LENGTH = 256;

const EXPO_PUSH_TOKEN_RE = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export function isValidExpoPushToken(token) {
  return typeof token === "string"
    && token.length <= MAX_EXPO_PUSH_TOKEN_LENGTH
    && EXPO_PUSH_TOKEN_RE.test(token);
}
