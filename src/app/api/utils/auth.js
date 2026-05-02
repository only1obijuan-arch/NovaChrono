import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";

// Returns the live DB user record if the caller holds a valid session with one
// of the given roles, or null otherwise. Checks the web (Next-Auth cookie)
// session first, then falls back to the mobile Bearer token so both clients
// are covered without duplicating this logic in every handler.
export async function requireRole(request, ...roles) {
  const session = await auth();
  if (session?.user?.id) {
    const [user] = await sql`SELECT * FROM auth_users WHERE id = ${session.user.id}`;
    if (user && roles.includes(user.role)) return user;
    return null;
  }

  const mobileUser = await verifyMobileToken(request);
  if (mobileUser && roles.includes(mobileUser.role)) return mobileUser;

  return null;
}
