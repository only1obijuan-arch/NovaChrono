import { Home, Users, Timer, LogOut } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import Link from "next/link";

export function Navigation({ userRole }) {
  return (
    <nav className="ad-nav">
      <div className="ad-nav-left">
        <Link href="/" className="ad-nav-link">
          <Home size={14} /> HOME
        </Link>
        {(userRole === "super_admin" || userRole === "venue_admin") && (
          <a href="/account/signin" className="ad-nav-link magenta">
            <Users size={14} /> CAPTAIN VIEW
          </a>
        )}
        {(userRole === "super_admin" || userRole === "venue_admin") && (
          <a href="/account/signin?callbackUrl=/referee" className="ad-nav-link orange">
            <Timer size={14} /> REFEREE VIEW
          </a>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <NotificationBell accentColor="#FF00CC" />
        <a href="/account/logout" className="ad-signout">
          <LogOut size={14} /> SIGN OUT
        </a>
      </div>
    </nav>
  );
}
