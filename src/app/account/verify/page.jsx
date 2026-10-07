"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const ERROR_MESSAGES = {
  missing_token: "No verification token was provided.",
  invalid_token: "This verification link is invalid or has already been used.",
  expired_token: "This verification link has expired. Please sign up again.",
  server_error: "Something went wrong. Please try again or contact support.",
};

function VerifyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const error = searchParams.get("error");
  const status = token ? "verifying" : "error";

  useEffect(() => {
    if (!token) return;
    router.replace(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  }, [router, token]);

  const isError = status === "error" || !!error;
  const color = isError ? "#FF00CC" : "#00F5D4";
  const errorMessage = error ? (ERROR_MESSAGES[error] || "An unknown error occurred.") : null;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#091833; }
        .vp-page { min-height:100vh; background:#091833; display:flex; align-items:center; justify-content:center; padding:24px; font-family:var(--font-ui); position:relative; overflow:hidden; }
        .vp-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(0,245,212,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,212,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .vp-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.4),transparent); animation:scanline 6s linear infinite; pointer-events:none; z-index:100; }
        .vp-card { background:#0D1B2E; border-radius:12px; padding:48px 40px; max-width:480px; width:100%; text-align:center; position:relative; z-index:10; animation:fadeInUp 0.5s ease; box-shadow:0 40px 80px rgba(0,0,0,0.5); }
        .vp-spinner { width:48px; height:48px; border:3px solid rgba(0,245,212,0.2); border-top-color:#00F5D4; border-radius:50%; animation:spin 0.9s linear infinite; margin:0 auto 28px; }
        .vp-title { font-family:var(--font-display); font-size:22px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:16px; }
        .vp-msg { font-size:16px; color:rgba(180,200,220,0.7); line-height:1.7; margin-bottom:32px; }
        .vp-brand { font-family:var(--font-code); font-size:10px; color:rgba(0,245,212,0.3); letter-spacing:4px; }
        .vp-btn { display:inline-block; border:1px solid; border-radius:4px; font-family:var(--font-display); font-size:13px; font-weight:700; letter-spacing:3px; padding:14px 32px; text-decoration:none; margin-top:8px; }
      `}</style>

      <div className="vp-page">
        <div className="vp-grid" />
        <div className="vp-scanline" />

        <div className="vp-card" style={{ border: `1px solid ${color}40` }}>
          <div style={{ height: 3, background: color, margin: "-48px -40px 40px", borderRadius: "12px 12px 0 0" }} />

          {isError ? (
            <>
              <div style={{ fontSize: 52, marginBottom: 24 }}>❌</div>
              <h1 className="vp-title">VERIFICATION FAILED</h1>
              <p className="vp-msg">{errorMessage}</p>
              <a
                href="/account/signup"
                className="vp-btn"
                style={{ borderColor: "rgba(255,0,204,0.5)", color: "#FF00CC", background: "rgba(255,0,204,0.08)" }}
              >
                TRY AGAIN →
              </a>
            </>
          ) : (
            <>
              <div className="vp-spinner" />
              <h1 className="vp-title">VERIFYING EMAIL</h1>
              <p className="vp-msg">Please wait while we verify your email address...</p>
            </>
          )}

          <p className="vp-brand" style={{ marginTop: 32 }}>NOVACHRONO — TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
        </div>
      </div>
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyPageContent />
    </Suspense>
  );
}
