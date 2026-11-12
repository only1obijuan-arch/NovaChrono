import { isIP } from "node:net";

// NovaChrono's accepted production deployment runs on Vercel. Vercel injects
// and overwrites these headers at its trusted edge. Outside that environment,
// forwarding headers are not trusted by default; callers share the conservative
// "unknown" rate-limit bucket instead of choosing their own identity.
export function getTrustedClientIp(request) {
  if (process.env.VERCEL !== "1") return "unknown";

  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim();

  return candidate && isIP(candidate) ? candidate : "unknown";
}
