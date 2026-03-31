"use client";
import { useEffect } from "react";
import useUser from "@/utils/useUser";

export default function RedirectPage() {
  const { data: user, loading: userLoading } = useUser();

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      window.location.href = "/account/signin";
      return;
    }

    const role = user.role;

    if (role === "super_admin") {
      window.location.href = "/super-admin";
    } else if (role === "venue_admin" || role === "org_admin") {
      window.location.href = "/admin";
    } else if (role === "referee") {
      window.location.href = "/referee";
    } else if (role === "captain") {
      // Captain — go to their team page if they have one, otherwise join
      window.location.href = "/captain/team";
    } else {
      // Unknown role — back to signin
      console.warn("Unknown role:", role);
      window.location.href = "/account/signin";
    }
  }, [user, userLoading]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#091833",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 48,
          height: 48,
          border: "3px solid #00F5D4",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p
        style={{
          color: "rgba(0,245,212,0.5)",
          fontFamily: "monospace",
          letterSpacing: 4,
          fontSize: 12,
        }}
      >
        REDIRECTING...
      </p>
    </div>
  );
}
