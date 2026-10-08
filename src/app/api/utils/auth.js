import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/app/api/utils/mobile-auth";

export async function resolveCurrentUser(request) {
  const session = await auth();
  if (session?.user?.id) {
    const [user] = await sql`SELECT * FROM auth_users WHERE id = ${session.user.id}`;
    return user ?? null;
  }

  return verifyMobileToken(request);
}

// Every privileged decision is based on the current database row, never a
// role or tenant copied into an older JWT.
export async function requireRole(request, ...roles) {
  const user = await resolveCurrentUser(request);
  return user && roles.includes(user.role) ? user : null;
}
