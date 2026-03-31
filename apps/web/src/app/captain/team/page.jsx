"use client";
import { useEffect } from "react";
import useUser from "@/utils/useUser";

export default function CaptainTeamRedirect() {
  const { data: user, loading } = useUser();

  useEffect(() => {
    if (loading || !user) return;

    // Fetch captain's team
    fetch(`/api/teams?captainUserId=${user.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.id) {
          // Has a team — go to team dashboard
          window.location.href = `/captain/team/${data.id}`;
        } else {
          // No team yet — go to join page
          window.location.href = "/captain/join";
        }
      })
      .catch(() => {
        window.location.href = "/captain/join";
      });
  }, [user, loading]);

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
          border: "3px solid #00FF9C",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p
        style={{
          color: "rgba(0,255,156,0.5)",
          fontFamily: "monospace",
          letterSpacing: 4,
          fontSize: 12,
        }}
      >
        LOADING YOUR TEAM...
      </p>
    </div>
  );
}
