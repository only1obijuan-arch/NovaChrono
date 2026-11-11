export function hasBearerAuthorization(request) {
  return /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "");
}

export function sameOriginOrBearer(request) {
  if (hasBearerAuthorization(request)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
