"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import useUser from "@/utils/useUser";
import {
  Building2,
  Plus,
  Users,
  MapPin,
  Trash2,
  ChevronRight,
  LogOut,
  Home,
  Info,
  X,
  Mail,
} from "lucide-react";

export default function SuperAdminDashboard() {
  const { data: user, loading: userLoading, refetch: refetchUser } = useUser();
  const queryClient = useQueryClient();
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteOrgId, setInviteOrgId] = useState(null);
  const [inviteOrgName, setInviteOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(null);

  useEffect(() => {
    if (!userLoading && user) {
      if (user?.role !== "super_admin") window.location.href = "/";
    }
  }, [user, userLoading]);

  const { data: orgsData, isLoading: orgsLoading } = useQuery({
    queryKey: ["super-admin-organizations"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/organizations");
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return res.json();
    },
    enabled: !!user,
  });

  const createOrgMutation = useMutation({
    mutationFn: async (name) => {
      const res = await fetch("/api/super-admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create organization");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["super-admin-organizations"]);
      setShowAddOrg(false);
      setNewOrgName("");
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId) => {
      const res = await fetch(`/api/super-admin/organizations?id=${orgId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete organization");
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries(["super-admin-organizations"]),
  });

  const unassignVenueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/super-admin/assign-venue", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unassign venue");
      return res.json();
    },
    onSuccess: () => refetchUser(),
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, organizationId }) => {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, organizationId, role: "org_admin" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setInviteSuccess(data.message);
      setInviteEmail("");
    },
    onError: (err) => {
      setInviteSuccess(null);
    },
  });

  const handleCreateOrg = (e) => {
    e.preventDefault();
    if (newOrgName.trim()) createOrgMutation.mutate(newOrgName.trim());
  };

  const handleInvite = (e) => {
    e.preventDefault();
    setInviteSuccess(null);
    inviteMutation.mutate({ email: inviteEmail, organizationId: inviteOrgId });
  };

  const openInviteModal = (org) => {
    setInviteOrgId(org.id);
    setInviteOrgName(org.name);
    setInviteEmail("");
    setInviteSuccess(null);
    setShowInvite(true);
  };

  if (userLoading)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#091833",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: "3px solid #00F5D4",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p
            style={{
              color: "#00F5D4",
              fontFamily: "monospace",
              letterSpacing: 4,
              fontSize: 12,
            }}
          >
            LOADING...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes pulse-cyan { 0%,100% { box-shadow: 0 0 10px #00F5D4, 0 0 20px #00F5D440; } 50% { box-shadow: 0 0 20px #00F5D4, 0 0 40px #00F5D480; } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

        .sa-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
        .sa-grid { position:fixed; inset:0; background-image: linear-gradient(rgba(0,245,212,0.03) 1px,transparent 1px), linear-gradient(90deg,rgba(0,245,212,0.03) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .sa-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.2),transparent); animation:scanline 8s linear infinite; pointer-events:none; z-index:100; }
        .sa-glow-tl { position:fixed; top:-200px; left:-200px; width:500px; height:500px; background:radial-gradient(circle,rgba(0,245,212,0.06) 0%,transparent 70%); pointer-events:none; }
        .sa-glow-br { position:fixed; bottom:-200px; right:-200px; width:500px; height:500px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        .sa-inner { max-width:1200px; margin:0 auto; padding:32px 24px; position:relative; z-index:1; }

        .sa-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:32px; padding-bottom:16px; border-bottom:1px solid rgba(0,245,212,0.1); }
        .sa-nav-left { display:flex; align-items:center; gap:16px; }
        .sa-nav-link { display:inline-flex; align-items:center; gap:8px; color:rgba(0,245,212,0.6); font-family:'Share Tech Mono',monospace; font-size:12px; letter-spacing:2px; text-decoration:none; padding:8px 12px; border:1px solid rgba(0,245,212,0.2); border-radius:4px; transition:all 0.2s; }
        .sa-nav-link:hover { color:#00F5D4; border-color:#00F5D4; background:rgba(0,245,212,0.05); }
        .sa-nav-divider { color:rgba(0,245,212,0.2); font-family:monospace; }
        .sa-signout { display:inline-flex; align-items:center; gap:8px; color:rgba(255,0,204,0.7); font-family:'Share Tech Mono',monospace; font-size:12px; letter-spacing:2px; text-decoration:none; padding:8px 12px; border:1px solid rgba(255,0,204,0.3); border-radius:4px; transition:all 0.2s; }
        .sa-signout:hover { color:#FF00CC; border-color:#FF00CC; background:rgba(255,0,204,0.05); }

        .sa-banner { background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.3); border-radius:8px; padding:16px 20px; margin-bottom:24px; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; animation:fadeInUp 0.5s ease; }
        .sa-banner-text { display:flex; gap:12px; align-items:flex-start; }
        .sa-banner p { font-family:'Rajdhani',sans-serif; }
        .sa-banner-title { color:#00F5D4; font-weight:700; font-size:15px; margin-bottom:4px; }
        .sa-banner-sub { color:rgba(0,245,212,0.6); font-size:14px; }
        .sa-banner-link { color:#00F5D4; font-weight:700; }
        .sa-banner-close { color:rgba(0,245,212,0.5); background:none; border:none; cursor:pointer; padding:4px; border-radius:4px; transition:all 0.2s; flex-shrink:0; }
        .sa-banner-close:hover { color:#00F5D4; background:rgba(0,245,212,0.1); }

        .sa-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; }
        .sa-title-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); letter-spacing:4px; margin-bottom:8px; }
        .sa-title { font-family:'Orbitron',monospace; font-size:28px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .sa-subtitle { font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.6); }
        .sa-add-btn { display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg,#00F5D4,#00CC9C); color:#091833; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px 20px; border:none; border-radius:4px; cursor:pointer; transition:all 0.2s; box-shadow:0 0 20px rgba(0,245,212,0.3); }
        .sa-add-btn:hover { transform:translateY(-2px); box-shadow:0 0 30px rgba(0,245,212,0.5); }

        .sa-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:40px; }
        .sa-stat { background:rgba(11,20,40,0.8); border:1px solid rgba(0,245,212,0.15); border-radius:8px; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; backdrop-filter:blur(10px); transition:all 0.3s; }
        .sa-stat:hover { border-color:rgba(0,245,212,0.4); background:rgba(0,245,212,0.03); }
        .sa-stat-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(0,245,212,0.5); letter-spacing:3px; margin-bottom:8px; }
        .sa-stat-value { font-family:'Orbitron',monospace; font-size:32px; font-weight:900; color:#00F5D4; }

        .sa-orgs { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
        .sa-org-card { background:rgba(11,20,40,0.8); border:1px solid rgba(0,245,212,0.15); border-radius:8px; padding:24px; backdrop-filter:blur(10px); transition:all 0.3s; position:relative; overflow:hidden; animation:fadeInUp 0.5s ease both; }
        .sa-org-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(0,245,212,0.3),transparent); opacity:0; transition:opacity 0.3s; }
        .sa-org-card:hover { border-color:rgba(0,245,212,0.4); transform:translateY(-2px); }
        .sa-org-card:hover::before { opacity:1; }
        .sa-org-top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; }
        .sa-org-name { font-family:'Orbitron',monospace; font-size:15px; font-weight:700; color:#F4F4F9; margin-bottom:8px; letter-spacing:1px; }
        .sa-org-meta { display:flex; gap:16px; }
        .sa-org-meta-item { display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:11px; color:rgba(0,245,212,0.6); }
        .sa-delete-btn { background:none; border:1px solid rgba(255,0,204,0.2); color:rgba(255,0,204,0.5); padding:6px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .sa-delete-btn:hover { border-color:#FF00CC; color:#FF00CC; background:rgba(255,0,204,0.05); }
        .sa-manage-btn { display:flex; align-items:center; justify-content:space-between; width:100%; background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.2); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px 16px; border-radius:4px; text-decoration:none; transition:all 0.2s; margin-top:12px; }
        .sa-manage-btn:hover { background:rgba(0,245,212,0.1); border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.2); }
        .sa-invite-btn { display:flex; align-items:center; justify-content:space-between; width:100%; background:rgba(255,0,204,0.05); border:1px solid rgba(255,0,204,0.2); color:#FF00CC; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px 16px; border-radius:4px; cursor:pointer; transition:all 0.2s; margin-top:8px; }
        .sa-invite-btn:hover { background:rgba(255,0,204,0.1); border-color:#FF00CC; box-shadow:0 0 15px rgba(255,0,204,0.2); }

        .sa-empty { background:rgba(11,20,40,0.8); border:2px dashed rgba(0,245,212,0.2); border-radius:8px; padding:80px 40px; text-align:center; }
        .sa-empty-title { font-family:'Orbitron',monospace; font-size:18px; color:#F4F4F9; margin-bottom:8px; }
        .sa-empty-sub { font-family:'Rajdhani',sans-serif; color:rgba(180,200,220,0.5); margin-bottom:32px; }

        .sa-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:50; padding:16px; }
        .sa-modal { background:#0D1B2E; border:1px solid rgba(0,245,212,0.3); border-radius:8px; padding:32px; max-width:440px; width:100%; box-shadow:0 0 60px rgba(0,245,212,0.1); }
        .sa-modal-title { font-family:'Orbitron',monospace; font-size:18px; font-weight:700; color:#F4F4F9; margin-bottom:24px; letter-spacing:2px; }
        .sa-modal-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
        .sa-modal-input { width:100%; height:48px; background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.3); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; margin-bottom:24px; }
        .sa-modal-input:focus { border-color:#00F5D4; box-shadow:0 0 15px rgba(0,245,212,0.2); }
        .sa-modal-input::placeholder { color:rgba(180,200,220,0.3); }
        .sa-modal-btns { display:flex; gap:12px; }
        .sa-modal-cancel { flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(180,200,220,0.7); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .sa-modal-cancel:hover { background:rgba(255,255,255,0.08); color:#F4F4F9; }
        .sa-modal-submit { flex:1; background:linear-gradient(135deg,#FF00CC,#AA0088); color:#F4F4F9; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px; border:none; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .sa-modal-submit:hover { box-shadow:0 0 20px rgba(255,0,204,0.4); }
        .sa-modal-submit:disabled { opacity:0.5; cursor:not-allowed; }
        .sa-modal-success { background:rgba(0,255,156,0.08); border:1px solid rgba(0,255,156,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:#00FF9C; letter-spacing:2px; margin-bottom:16px; }
        .sa-modal-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; margin-bottom:16px; }

        @media (max-width:768px) {
          .sa-stats { grid-template-columns:1fr; }
          .sa-orgs { grid-template-columns:1fr; }
          .sa-header { flex-direction:column; gap:16px; }
        }
      `}</style>

      <div className="sa-page">
        <div className="sa-grid" />
        <div className="sa-scanline" />
        <div className="sa-glow-tl" />
        <div className="sa-glow-br" />

        <div className="sa-inner">
          {/* Nav */}
          <nav className="sa-nav">
            <div className="sa-nav-left">
              <a href="/" className="sa-nav-link">
                <Home size={14} /> HOME
              </a>
              <span className="sa-nav-divider">|</span>
              <a href="/admin" className="sa-nav-link">
                <Users size={14} /> ADMIN VIEW
              </a>
            </div>
            <a href="/account/logout" className="sa-signout">
              <LogOut size={14} /> SIGN OUT
            </a>
          </nav>

          {/* Venue assignment banner */}
          {user?.venue_id && (
            <div className="sa-banner">
              <div className="sa-banner-text">
                <Info
                  size={18}
                  color="#00F5D4"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <p className="sa-banner-title">VENUE ASSIGNED</p>
                  <p className="sa-banner-sub">
                    Managing leagues via{" "}
                    <a href="/admin" className="sa-banner-link">
                      Admin View
                    </a>
                    . Click × to return to super admin mode.
                  </p>
                </div>
              </div>
              <button
                className="sa-banner-close"
                onClick={() => {
                  if (confirm("Unassign from current venue?"))
                    unassignVenueMutation.mutate();
                }}
              >
                <X size={18} />
              </button>
            </div>
          )}

          {/* Header */}
          <div className="sa-header">
            <div>
              <p className="sa-title-label">// SUPER ADMIN PORTAL</p>
              <h1 className="sa-title">NovaChrono</h1>
              <p className="sa-subtitle">
                Manage organizations, venues, and platform users
              </p>
            </div>
            <button className="sa-add-btn" onClick={() => setShowAddOrg(true)}>
              <Plus size={16} /> ADD ORGANIZATION
            </button>
          </div>

          {/* Stats */}
          <div className="sa-stats">
            <div className="sa-stat">
              <div>
                <p className="sa-stat-label">ORGANIZATIONS</p>
                <p className="sa-stat-value">
                  {orgsData?.organizations?.length || 0}
                </p>
              </div>
              <Building2 size={36} color="rgba(0,245,212,0.15)" />
            </div>
            <div className="sa-stat">
              <div>
                <p className="sa-stat-label">TOTAL VENUES</p>
                <p className="sa-stat-value">
                  {orgsData?.organizations?.reduce(
                    (sum, org) => sum + parseInt(org.venue_count || 0),
                    0,
                  ) || 0}
                </p>
              </div>
              <MapPin size={36} color="rgba(0,245,212,0.15)" />
            </div>
            <div className="sa-stat">
              <div>
                <p className="sa-stat-label">TOTAL ADMINS</p>
                <p className="sa-stat-value">
                  {orgsData?.organizations?.reduce(
                    (sum, org) => sum + parseInt(org.admin_count || 0),
                    0,
                  ) || 0}
                </p>
              </div>
              <Users size={36} color="rgba(0,245,212,0.15)" />
            </div>
          </div>

          {/* Orgs */}
          {orgsLoading ? (
            <div className="sa-orgs">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 180,
                    background: "rgba(11,20,40,0.8)",
                    borderRadius: 8,
                  }}
                />
              ))}
            </div>
          ) : orgsData?.organizations?.length === 0 ? (
            <div className="sa-empty">
              <Building2
                size={48}
                color="rgba(0,245,212,0.2)"
                style={{ margin: "0 auto 16px" }}
              />
              <h3 className="sa-empty-title">NO ORGANIZATIONS</h3>
              <p className="sa-empty-sub">
                Start by adding your first organization
              </p>
              <button
                className="sa-add-btn"
                onClick={() => setShowAddOrg(true)}
                style={{ margin: "0 auto" }}
              >
                <Plus size={16} /> ADD ORGANIZATION
              </button>
            </div>
          ) : (
            <div className="sa-orgs">
              {orgsData?.organizations?.map((org, i) => (
                <div
                  key={org.id}
                  className="sa-org-card"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="sa-org-top">
                    <div>
                      <h3 className="sa-org-name">{org.name}</h3>
                      <div className="sa-org-meta">
                        <span className="sa-org-meta-item">
                          <MapPin size={12} /> {org.venue_count}{" "}
                          {parseInt(org.venue_count) === 1 ? "VENUE" : "VENUES"}
                        </span>
                        <span className="sa-org-meta-item">
                          <Users size={12} /> {org.admin_count}{" "}
                          {parseInt(org.admin_count) === 1 ? "ADMIN" : "ADMINS"}
                        </span>
                      </div>
                    </div>
                    <button
                      className="sa-delete-btn"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${org.name}"? This will remove all venues and data.`,
                          )
                        )
                          deleteOrgMutation.mutate(org.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Invite button — NEW */}
                  <button
                    className="sa-invite-btn"
                    onClick={() => openInviteModal(org)}
                  >
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Mail size={14} /> INVITE ORG ADMIN
                    </span>
                    <ChevronRight size={14} />
                  </button>

                  <a
                    href={`/super-admin/organization/${org.id}`}
                    className="sa-manage-btn"
                  >
                    MANAGE ORGANIZATION <ChevronRight size={16} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Org Modal */}
      {showAddOrg && (
        <div className="sa-modal-overlay">
          <div className="sa-modal">
            <h2 className="sa-modal-title">// NEW ORGANIZATION</h2>
            <form onSubmit={handleCreateOrg}>
              <label className="sa-modal-label">ORGANIZATION NAME</label>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g. Soccer Zone, Ultimate Football"
                className="sa-modal-input"
                autoFocus
              />
              <div className="sa-modal-btns">
                <button
                  type="button"
                  className="sa-modal-cancel"
                  onClick={() => {
                    setShowAddOrg(false);
                    setNewOrgName("");
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="sa-modal-submit"
                  disabled={!newOrgName.trim() || createOrgMutation.isPending}
                >
                  {createOrgMutation.isPending ? "CREATING..." : "CREATE"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="sa-modal-overlay">
          <div
            className="sa-modal"
            style={{ borderColor: "rgba(255,0,204,0.3)" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h2 className="sa-modal-title" style={{ margin: 0 }}>
                // INVITE ORG ADMIN
              </h2>
              <button
                onClick={() => setShowInvite(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,0,204,0.5)",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>
            <p
              style={{
                fontFamily: "'Rajdhani',sans-serif",
                fontSize: 14,
                color: "rgba(180,200,220,0.5)",
                marginBottom: 24,
              }}
            >
              Inviting to:{" "}
              <strong style={{ color: "#F4F4F9" }}>{inviteOrgName}</strong>
            </p>

            {inviteSuccess && (
              <div className="sa-modal-success">
                ✓ {inviteSuccess.toUpperCase()}
              </div>
            )}
            {inviteMutation.isError && (
              <div className="sa-modal-error">
                // {inviteMutation.error?.message?.toUpperCase()}
              </div>
            )}

            <form onSubmit={handleInvite}>
              <label
                className="sa-modal-label"
                style={{ color: "rgba(255,0,204,0.6)" }}
              >
                EMAIL ADDRESS
              </label>
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteSuccess(null);
                }}
                placeholder="admin@organisation.com"
                className="sa-modal-input"
                style={{
                  borderColor: "rgba(255,0,204,0.3)",
                  background: "rgba(255,0,204,0.04)",
                }}
                autoFocus
              />
              <div className="sa-modal-btns">
                <button
                  type="button"
                  className="sa-modal-cancel"
                  onClick={() => setShowInvite(false)}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="sa-modal-submit"
                  disabled={!inviteEmail.trim() || inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? "SENDING..." : "SEND INVITE →"}
                </button>
              </div>
            </form>

            <p
              style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: 9,
                color: "rgba(180,200,220,0.2)",
                letterSpacing: 2,
                textAlign: "center",
                marginTop: 16,
              }}
            >
              // INVITE LINK EXPIRES IN 24 HOURS
            </p>
          </div>
        </div>
      )}
    </>
  );
}
