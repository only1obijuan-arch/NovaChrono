"use client";
import { withJoinCode } from "@/utils/join-navigation";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

function RedirectContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      router.replace(withJoinCode("/account/signin", code));
      return;
    }

    const role = session?.user?.role;

    if (role === "super_admin") {
      router.replace("/super-admin");
    } else if (role === "org_admin") {
      router.replace("/org-admin");
    } else if (role === "venue_admin") {
      router.replace("/admin");
    } else if (role === "referee") {
      router.replace("/referee");
    } else if (role === "captain") {
      router.replace(withJoinCode("/captain/team", code));
    } else {
      // No role or unknown role — back to signin
      router.replace(withJoinCode("/account/signin", code));
    }
  }, [session, status, router, code]);

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
        REDIRECTING...
      </p>
    </div>
  );
}
export default function RedirectPage() {
  return <Suspense fallback={null}><RedirectContent /></Suspense>;
}
