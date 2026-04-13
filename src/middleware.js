export const runtime = "nodejs";
import { auth } from "@/auth";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const roleRoutes = {
  "/super-admin": ["super_admin"],
  "/admin": ["venue_admin", "super_admin"],
  "/org-admin": ["org_admin", "super_admin"],
  "/referee": ["referee", "super_admin"],
  "/captain": ["captain", "super_admin"],
};

// API routes that do not require a session
const publicApiPrefixes = [
  "/api/auth",
  "/api/stats",
  "/api/matches",
];

async function verifyBearer(req) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return { user: payload };
  } catch {
    return null;
  }
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth ?? (await verifyBearer(req));

  // Protect non-public API routes
  if (pathname.startsWith("/api/")) {
    const isPublic = publicApiPrefixes.some((prefix) => pathname.startsWith(prefix));
    if (!isPublic && !session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Protect role-gated page routes
  const matchedPrefix = Object.keys(roleRoutes).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!matchedPrefix) return NextResponse.next();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/account/signin", req.url));
  }

  const allowedRoles = roleRoutes[matchedPrefix];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.redirect(new URL("/account/signin", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/super-admin/:path*",
    "/admin/:path*",
    "/org-admin/:path*",
    "/referee/:path*",
    "/captain/:path*",
    "/api/:path*",
  ],
};
