import { jwtVerify } from "jose";

// Verifies the mobile Bearer token and returns the decoded payload,
// or null if the token is missing / invalid.
export async function verifyMobileToken(request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload; // { id, email, name, role, venue_id, organization_id }
  } catch {
    return null;
  }
}
