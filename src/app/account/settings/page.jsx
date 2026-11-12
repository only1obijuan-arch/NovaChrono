"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export default function AccountSettingsPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/account/deletion")
      .then(async (response) => (response.ok ? response.json() : { available: false }))
      .then((result) => { if (mounted) setAvailable(Boolean(result.available)); })
      .catch(() => { if (mounted) setAvailable(false); });
    return () => { mounted = false; };
  }, []);

  async function requestDeletion(event) {
    event.preventDefault();
    if (confirmation !== "DELETE") {
      setError("Type DELETE to confirm the request.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");
      await signOut({ callbackUrl: "/account/signin?deletion=pending" });
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return (
    <main className="account-settings">
      <section className="settings-card">
        <p className="eyebrow">ACCOUNT LIFECYCLE</p>
        <h1>Delete account</h1>
        <p className="description">
          Confirming this request immediately signs you out and blocks web and
          mobile access. Sporting history may be retained under a generic label
          where it is necessary to preserve matches, teams, results and referee
          attribution. Player records are handled separately.
        </p>
        <div className="warning">
          Active team ownership, future referee fixtures or administrator
          responsibilities must be resolved before de-identification completes.
        </div>
        {available === false && (
          <p className="unavailable" role="status">
            Account deletion requests are not currently available. No account
            state has been changed.
          </p>
        )}
        {available === null && <p className="unavailable">Checking availability...</p>}
        {available === true && <form onSubmit={requestDeletion}>
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
          <input
            id="delete-confirmation"
            type="text"
            autoComplete="off"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy || confirmation !== "DELETE"}>
            {busy ? "SUBMITTING..." : "REQUEST ACCOUNT DELETION"}
          </button>
        </form>}
      </section>
      <style jsx>{`
        .account-settings { min-height:100vh; background:#091833; color:#f4f4f9; display:grid; place-items:center; padding:24px; }
        .settings-card { width:min(100%,560px); background:#0d1b2e; border:1px solid rgba(255,80,80,.28); border-radius:10px; padding:32px; box-shadow:0 30px 70px rgba(0,0,0,.35); }
        .eyebrow,label,button { font-family:monospace; letter-spacing:2px; }
        .eyebrow { color:rgba(255,100,100,.75); font-size:10px; }
        h1 { margin:8px 0 12px; font-size:28px; }
        .description { color:rgba(210,220,235,.72); line-height:1.65; }
        .warning { margin:20px 0; padding:14px; background:rgba(255,180,0,.07); border:1px solid rgba(255,180,0,.25); color:rgba(255,220,150,.85); line-height:1.5; }
        form { display:grid; gap:10px; }
        label { margin-top:10px; font-size:10px; color:rgba(210,220,235,.65); }
        input { width:100%; height:46px; border-radius:5px; border:1px solid rgba(255,255,255,.14); background:#09162a; color:#fff; padding:0 14px; font-size:16px; }
        input:focus { outline:2px solid rgba(255,90,90,.5); outline-offset:1px; }
        button { margin-top:14px; min-height:50px; border-radius:5px; border:1px solid rgba(255,80,80,.55); background:rgba(255,50,50,.1); color:#ff7777; font-weight:700; cursor:pointer; }
        button:disabled { opacity:.4; cursor:not-allowed; }
        .error { color:#ff8b8b; font-size:13px; }
        .unavailable { color:rgba(210,220,235,.75); border:1px solid rgba(255,255,255,.12); padding:14px; border-radius:5px; }
      `}</style>
    </main>
  );
}
