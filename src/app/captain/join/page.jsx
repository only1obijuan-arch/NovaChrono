"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Suspense } from "react";

function JoinRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      router.replace(`/account/signup?code=${encodeURIComponent(code)}`);
    } else {
      router.replace("/account/signup");
    }
  }, [router, searchParams]);

  return null;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinRedirect />
    </Suspense>
  );
}
