"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const ADMIN_ROLES = new Set(["venue_admin", "org_admin", "super_admin"]);

async function fetchLifecycleRequests(endpoint) {
  const response = await fetch(endpoint);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load lifecycle requests");
  return result.requests || [];
}

export default function LifecycleAdminPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const endpoint = role === "org_admin"
    ? "/api/org-admin/account-lifecycle"
    : "/api/admin/account-lifecycle";
  const [requests, setRequests] = useState([]);
  const [reason, setReason] = useState("");
  const [successors, setSuccessors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const authorised = useMemo(() => ADMIN_ROLES.has(role), [role]);

  useEffect(() => {
    if (!authorised) return undefined;
    let active = true;
    fetchLifecycleRequests(endpoint)
      .then((items) => { if (active) setRequests(items); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [authorised, endpoint]);

  async function mutate(payload) {
    if (reason.trim().length < 10) {
      setMessage("Enter an audit reason of at least 10 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Lifecycle action failed");
      setMessage("Lifecycle action completed and audited.");
      setRequests(await fetchLifecycleRequests(endpoint));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <main className="lifecycle-page">Loading...</main>;
  if (!authorised) {
    return <main className="lifecycle-page"><section className="panel">Administrator access required.</section></main>;
  }

  return (
    <main className="lifecycle-page">
      <section className="panel">
        <nav><Link href="/account/settings">ACCOUNT SETTINGS</Link></nav>
        <p className="eyebrow">CONTROLLED ACCOUNT LIFECYCLE</p>
        <h1>Pending deletion requests</h1>
        <p className="help">
          Resolve only responsibilities inside your authorised scope. Successor IDs
          must identify active users. Leave a successor blank only for explicit
          administrator custody or referee unassignment. External identity checks
          are operational evidence and are not replaced by this screen.
        </p>
        <label htmlFor="reason">Audit reason</label>
        <textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        {message && <p className="message" role="status">{message}</p>}

        {requests.length === 0 && <p className="empty">No pending requests are visible in your scope.</p>}
        {requests.map((request) => (
          <article key={request.id} className="request-card">
            <h2>{request.name} <span>{request.role}</span></h2>
            <p className="request-id">{request.id}</p>
            {request.blockers.map((blocker) => (
              <div key={blocker.type} className="blocker">
                <strong>{blocker.type.replaceAll("_", " ")}</strong>
                {blocker.records.map((record) => {
                  const recordId = record.id;
                  const successorKey = `${request.id}:${blocker.type}:${recordId}`;
                  const isTeam = blocker.type === "active_teams";
                  const action = isTeam ? "resolve_team" : "resolve_fixture";
                  return (
                    <div key={recordId} className="record">
                      <code>{record.name || recordId}</code>
                      <input
                        aria-label={`Successor for ${recordId}`}
                        placeholder="Successor UUID (optional)"
                        value={successors[successorKey] || ""}
                        onChange={(event) => setSuccessors((current) => ({
                          ...current,
                          [successorKey]: event.target.value.trim(),
                        }))}
                      />
                      <button disabled={busy} onClick={() => mutate({
                        action,
                        userId: request.id,
                        ...(isTeam ? { teamId: recordId } : { matchId: recordId }),
                        successorUserId: successors[successorKey] || null,
                      })}>
                        {isTeam ? "RESOLVE TEAM" : "RESOLVE FIXTURE"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {role === "super_admin" && (
              <div className="super-actions">
                <button disabled={busy} onClick={() => mutate({ action: "cancel", userId: request.id })}>
                  ASSISTED WITHDRAWAL
                </button>
                <button disabled={busy || request.blockers.length > 0} onClick={() => mutate({ action: "complete", userId: request.id })}>
                  COMPLETE DE-IDENTIFICATION
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
      <style jsx>{`
        .lifecycle-page{min-height:100vh;background:#091833;color:#f4f4f9;padding:32px;font-family:Arial,sans-serif}.panel{max-width:900px;margin:auto;background:#0d1b2e;border:1px solid rgba(0,245,212,.2);border-radius:10px;padding:30px}nav{margin-bottom:24px}nav a,.eyebrow,label,button{font-family:monospace;letter-spacing:2px}.eyebrow{color:#00f5d4;font-size:10px}h1{margin:8px 0 12px}.help,.empty{color:rgba(210,220,235,.7);line-height:1.5}label{display:block;font-size:10px;margin:20px 0 8px}textarea,input{width:100%;background:#09162a;border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:5px;padding:12px}textarea{min-height:80px}.message{color:#ffd27a}.request-card{margin-top:22px;padding:20px;border:1px solid rgba(255,255,255,.12);border-radius:7px}h2 span{font:10px monospace;color:#00f5d4}.request-id{font:11px monospace;color:rgba(210,220,235,.5)}.blocker{margin-top:15px;padding:14px;background:rgba(255,180,0,.05)}.record{display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:center;margin-top:10px}.super-actions{display:flex;gap:10px;margin-top:18px}button{border:1px solid rgba(0,245,212,.35);background:rgba(0,245,212,.08);color:#00f5d4;border-radius:4px;padding:11px;cursor:pointer}button:disabled{opacity:.4;cursor:not-allowed}@media(max-width:700px){.record{grid-template-columns:1fr}.super-actions{flex-direction:column}}
      `}</style>
    </main>
  );
}
