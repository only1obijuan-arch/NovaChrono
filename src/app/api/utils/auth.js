import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";
import { hasBearerAuthorization } from "@/app/api/utils/request-security";

export async function resolveCurrentUser(request) {
  // A supplied bearer token is authoritative for that request. Never fall
  // back to a browser cookie when an invalid bearer header is present, which
  // would turn a syntactic Authorization header into a CSRF bypass.
  if (hasBearerAuthorization(request)) {
    return verifyMobileToken(request);
  }

  const session = await auth();
  if (session?.user?.id) {
    const [user] = await sql`
      SELECT * FROM auth_users
      WHERE id = ${session.user.id} AND account_status = 'active'
    `;
    return user ?? null;
  }
  return null;
}

// Every privileged decision is based on the current database row, never a
// role or tenant copied into an older JWT.
export async function requireRole(request, ...roles) {
  const user = await resolveCurrentUser(request);
  return user && roles.includes(user.role) ? user : null;
}
