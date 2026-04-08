import { auth } from "@/auth";
import { NextResponse } from "next/server";

const roleRoutes = {
  "/super-admin": ["super_admin"],
  "/admin": ["venue_admin", "super_admin"],
  "/org-admin": ["org_admin", "super_admin"],
  "/referee": ["referee", "super_admin"],
  "/captain": ["captain", "super_admin"],
};

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

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
  ],
};
