"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function CaptainTeamRedirect() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading" || !session?.user) return;

    fetch("/api/captain/team")
      .then((res) => res.json())
      .then((data) => {
        if (data?.team?.id) {
          router.push(`/captain/team/${data.team.id}`);
        } else {
          router.push("/captain/join");
        }
      })
      .catch(() => {
        router.push("/captain/join");
      });
  }, [session, status, router]);

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
