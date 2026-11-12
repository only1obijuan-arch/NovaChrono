export function hasBearerAuthorization(request) {
  return /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "");
}

// The host the client actually addressed. `request.url` cannot be used: Next
// derives it from the server's configured listener (for example localhost:PORT
// or an internal proxy port) unless it is told to trust the Host header, so it
// rejects genuine same-origin browser requests. Forwarded host first, then
// Host, mirroring Next's own Server Actions CSRF check.
function addressedHost(request) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host")?.trim();
  if (host) return host.toLowerCase();
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    return "";
  }
}

// Cookie-authenticated browser mutations must carry an Origin whose host is the
// host that was addressed. A bearer credential is not ambient, so it is exempt.
export function sameOriginOrBearer(request) {
  if (hasBearerAuthorization(request)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    return originHost !== "" && originHost === addressedHost(request);
  } catch {
    return false;
  }
}
