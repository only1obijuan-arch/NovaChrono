"use client";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";

export default function SuperAdmin() {
  const { data: session } = useSession();
  return (
    <div style={{ minHeight: "100vh", background: "#091833", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, fontFamily: "monospace" }}>
      <h1 style={{ color: "#00F5D4", letterSpacing: 4, fontSize: 24 }}>SUPER ADMIN</h1>
      <p style={{ color: "rgba(180,200,220,0.5)", fontSize: 14 }}>
        Logged in as {session?.user?.name} — {session?.user?.role}
      </p>
      <button onClick={() => signOut({ callbackUrl: "/account/signin" })}
        style={{ background: "transparent", border: "1px solid rgba(255,80,80,0.4)", color: "rgba(255,80,80,0.6)", padding: "10px 24px", borderRadius: 4, cursor: "pointer", letterSpacing: 2, fontSize: 12 }}>
        SIGN OUT
      </button>
    </div>
  );
}