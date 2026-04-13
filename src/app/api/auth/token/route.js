import { auth } from "@/auth";
import { SignJWT } from "jose";

// Called by the mobile WebView after login completes (callbackUrl=/api/auth/token).
// Reads the NextAuth cookie session (shared via iOS HTTPCookieStorage) and
// returns a signed JWT the app can store in SecureStore for Bearer auth.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const jwt = await new SignJWT({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    venue_id: session.user.venue_id,
    organization_id: session.user.organization_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  return Response.json({
    jwt,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      venue_id: session.user.venue_id,
      organization_id: session.user.organization_id,
    },
  });
}
