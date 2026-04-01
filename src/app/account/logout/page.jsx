"use client";
import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function Logout() {
  useEffect(() => {
    signOut({ callbackUrl: "/account/signin" });
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#091833",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 16,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 48, height: 48,
        border: "3px solid rgba(0,245,212,0.3)",
        borderTopColor: "#00F5D4",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <p style={{
        color: "rgba(0,245,212,0.5)",
        fontFamily: "monospace",
        letterSpacing: 4,
        fontSize: 12,
      }}>
        SIGNING OUT...
      </p>
    </div>
  );
}