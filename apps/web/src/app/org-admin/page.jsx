"use client";
import { useState } from "react";
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
  Mail,
  X,
  Shield,
} from "lucide-react";

export default function OrgAdminDashboard() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [showInviteAdmin, setShowInviteAdmin] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [selectedVenueName, setSelectedVenueName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueLocation, setVenueLocation] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [inviteError, setInviteError] = useState(null);

  const { data: orgData, isLoading } = useQuery({
    queryKey: ["org-admin-data"],
    queryFn: async () => {
      const res = await fetch("/api/org-admin/profile");
      if (!res.ok) throw new Error("Failed to fetch org data");
      return res.json();
    },
    enabled: !!user,
  });

  const createVenueMutation = useMutation({
    mutationFn: async ({ name, location }) => {
      const res = await fetch("/api/org-admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, location }),
      });
      if (!res.ok) throw new Error("Failed to create venue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["org-admin-data"]);
      setShowAddVenue(false);
      setVenueName("");
      setVenueLocation("");
    },
  });

  const deleteVenueMutation = useMutation({
    mutationFn: async (venueId) => {
      const res = await fetch(`/api/org-admin/venues?id=${venueId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete venue");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(["org-admin-data"]),
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, venueId }) => {
      const res = await fetch("/api/org-admin/invite-venue-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, venueId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setInviteSuccess(data.message);
      setInviteEmail("");
      setInviteError(null);
    },
    onError: (err) => {
      setInviteError(err.message);
      setInviteSuccess(null);
    },
  });

  const openInviteModal = (venue) => {
    setSelectedVenueId(venue.id);
    setSelectedVenueName(venue.name);
    setInviteEmail("");
    setInviteSuccess(null);
    setInviteError(null);
    setShowInviteAdmin(true);
  };

  if (isLoading) {
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
              border: "3px solid #FF00CC",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p
            style={{
              color: "#FF00CC",
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
  }

  const { organization, venues = [], admins = [] } = orgData || {};

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

        * { box-sizing:border-box; }
        .oa-page { min-height:100vh; background:#091833; font-family:'Rajdhani',sans-serif; position:relative; overflow-x:hidden; }
        .oa-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(255,0,204,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,204,0.025) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .oa-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,0,204,0.3),transparent); animation:scanline 8s linear infinite; pointer-events:none; z-index:100; }
        .oa-inner { max-width:1200px; margin:0 auto; padding:32px 24px; position:relative; z-index:1; }

        .oa-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:32px; padding-bottom:16px; border-bottom:1px solid rgba(255,0,204,0.1); }
        .oa-nav-left { display:flex; align-items:center; gap:8px; }
        .oa-nav-brand { font-family:'Orbitron',monospace; font-size:16px; font-weight:900; color:#FF00CC; letter-spacing:3px; }
        .oa-nav-sub { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.4); letter-spacing:3px; }
        .oa-signout { display:inline-flex; align-items:center; gap:8px; color:rgba(255,80,80,0.7); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; text-decoration:none; padding:8px 12px; border:1px solid rgba(255,80,80,0.2); border-radius:4px; transition:all 0.2s; }
        .oa-signout:hover { color:rgba(255,80,80,1); border-color:rgba(255,80,80,0.5); }

        .oa-header { margin-bottom:40px; }
        .oa-eyebrow { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.5); letter-spacing:4px; margin-bottom:8px; }
        .oa-title { font-family:'Orbitron',monospace; font-size:28px; font-weight:900; color:#F4F4F9; letter-spacing:2px; margin-bottom:6px; }
        .oa-subtitle { font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.5); }

        .oa-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:40px; }
        .oa-stat { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.15); border-radius:8px; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; }
        .oa-stat-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.5); letter-spacing:3px; margin-bottom:8px; }
        .oa-stat-value { font-family:'Orbitron',monospace; font-size:32px; font-weight:900; color:#FF00CC; }

        .oa-section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .oa-section-title { font-family:'Orbitron',monospace; font-size:14px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
        .oa-add-btn { display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg,#FF00CC,#AA0088); color:#F4F4F9; font-family:'Orbitron',monospace; font-size:10px; font-weight:700; letter-spacing:2px; padding:10px 16px; border:none; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .oa-add-btn:hover { box-shadow:0 0 20px rgba(255,0,204,0.4); transform:translateY(-1px); }

        .oa-venues { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-bottom:40px; }
        .oa-venue-card { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.15); border-radius:8px; padding:24px; transition:all 0.3s; animation:fadeInUp 0.5s ease both; }
        .oa-venue-card:hover { border-color:rgba(255,0,204,0.4); transform:translateY(-2px); }
        .oa-venue-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
        .oa-venue-name { font-family:'Orbitron',monospace; font-size:15px; font-weight:700; color:#F4F4F9; margin-bottom:6px; letter-spacing:1px; }
        .oa-venue-location { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.4); letter-spacing:2px; display:flex; align-items:center; gap:6px; }
        .oa-venue-meta { display:flex; gap:16px; margin-bottom:16px; }
        .oa-venue-meta-item { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(0,245,212,0.5); display:flex; align-items:center; gap:6px; }
        .oa-delete-btn { background:none; border:1px solid rgba(255,0,204,0.2); color:rgba(255,0,204,0.5); padding:6px; border-radius:4px; cursor:pointer; transition:all 0.2s; }
        .oa-delete-btn:hover { border-color:#FF00CC; color:#FF00CC; }
        .oa-invite-btn { display:flex; align-items:center; justify-content:space-between; width:100%; background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.2); color:#00F5D4; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px 16px; border-radius:4px; cursor:pointer; transition:all 0.2s; margin-bottom:8px; }
        .oa-invite-btn:hover { background:rgba(0,245,212,0.1); border-color:#00F5D4; }
        .oa-manage-btn { display:flex; align-items:center; justify-content:space-between; width:100%; background:rgba(255,0,204,0.05); border:1px solid rgba(255,0,204,0.2); color:#FF00CC; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px 16px; border-radius:4px; text-decoration:none; transition:all 0.2s; }
        .oa-manage-btn:hover { background:rgba(255,0,204,0.1); border-color:#FF00CC; }

        .oa-empty { background:rgba(11,20,40,0.8); border:2px dashed rgba(255,0,204,0.15); border-radius:8px; padding:60px; text-align:center; }
        .oa-empty-title { font-family:'Orbitron',monospace; font-size:16px; color:#F4F4F9; margin-bottom:8px; }
        .oa-empty-sub { font-family:'Rajdhani',sans-serif; color:rgba(180,200,220,0.4); font-size:15px; margin-bottom:24px; }

        .oa-admins-table { background:rgba(11,20,40,0.8); border:1px solid rgba(255,0,204,0.15); border-radius:8px; overflow:hidden; }
        .oa-admins-table table { width:100%; border-collapse:collapse; }
        .oa-admins-table th { background:rgba(255,0,204,0.08); padding:14px 20px; font-family:'Share Tech Mono',monospace; font-size:9px; color:rgba(255,0,204,0.6); letter-spacing:3px; text-align:left; border-bottom:1px solid rgba(255,0,204,0.15); }
        .oa-admins-table td { padding:14px 20px; font-family:'Rajdhani',sans-serif; font-size:15px; color:rgba(180,200,220,0.8); border-bottom:1px solid rgba(255,0,204,0.06); }
        .oa-admins-table tr:last-child td { border-bottom:none; }
        .oa-role-badge { font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:2px; padding:3px 8px; border-radius:2px; }
        .oa-role-venue { background:rgba(255,0,204,0.1); color:#FF00CC; border:1px solid rgba(255,0,204,0.2); }
        .oa-role-org { background:rgba(0,245,212,0.1); color:#00F5D4; border:1px solid rgba(0,245,212,0.2); }

        .oa-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
        .oa-modal { background:#0D1B2E; border:1px solid rgba(255,0,204,0.3); border-radius:8px; padding:32px; max-width:440px; width:100%; }
        .oa-modal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
        .oa-modal-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }
        .oa-modal-close { background:none; border:none; color:rgba(255,0,204,0.5); cursor:pointer; }
        .oa-modal-close:hover { color:#FF00CC; }
        .oa-modal-label { font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,0,204,0.6); letter-spacing:3px; display:block; margin-bottom:8px; }
        .oa-modal-input { width:100%; height:48px; background:rgba(255,0,204,0.05); border:1px solid rgba(255,0,204,0.3); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:'Rajdhani',sans-serif; font-size:16px; outline:none; transition:all 0.2s; margin-bottom:20px; }
        .oa-modal-input:focus { border-color:#FF00CC; box-shadow:0 0 15px rgba(255,0,204,0.15); }
        .oa-modal-input::placeholder { color:rgba(180,200,220,0.3); }
        .oa-modal-btns { display:flex; gap:12px; }
        .oa-modal-cancel { flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(180,200,220,0.6); font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; padding:12px; border-radius:4px; cursor:pointer; }
        .oa-modal-submit { flex:1; background:linear-gradient(135deg,#FF00CC,#AA0088); color:#F4F4F9; font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:2px; padding:12px; border:none; border-radius:4px; cursor:pointer; }
        .oa-modal-submit:disabled { opacity:0.5; cursor:not-allowed; }
        .oa-modal-success { background:rgba(0,255,156,0.08); border:1px solid rgba(0,255,156,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:#00FF9C; letter-spacing:2px; margin-bottom:16px; }
        .oa-modal-error { background:rgba(255,50,50,0.08); border:1px solid rgba(255,50,50,0.3); border-radius:4px; padding:12px 16px; font-family:'Share Tech Mono',monospace; font-size:10px; color:rgba(255,100,100,0.9); letter-spacing:2px; margin-bottom:16px; }

        @media (max-width:768px) {
          .oa-stats { grid-template-columns:1fr; }
          .oa-venues { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="oa-page">
        <div className="oa-grid" />
        <div className="oa-scanline" />

        <div className="oa-inner">
          {/* Nav */}
          <nav className="oa-nav">
            <div className="oa-nav-left">
              <div>
                <p className="oa-nav-brand">NOVACHRONO</p>
                <p className="oa-nav-sub">// ORG ADMIN PORTAL</p>
              </div>
            </div>
            <a href="/account/logout" className="oa-signout">
              <LogOut size={14} /> SIGN OUT
            </a>
          </nav>

          {/* Header */}
          <div className="oa-header">
            <p className="oa-eyebrow">// ORGANISATION ADMIN</p>
            <h1 className="oa-title">
              {organization?.name || "YOUR ORGANISATION"}
            </h1>
            <p className="oa-subtitle">
              Manage venues and invite venue administrators
            </p>
          </div>

          {/* Stats */}
          <div className="oa-stats">
            <div className="oa-stat">
              <div>
                <p className="oa-stat-label">VENUES</p>
                <p className="oa-stat-value">{venues.length}</p>
              </div>
              <MapPin size={36} color="rgba(255,0,204,0.15)" />
            </div>
            <div className="oa-stat">
              <div>
                <p className="oa-stat-label">ADMINS</p>
                <p className="oa-stat-value">{admins.length}</p>
              </div>
              <Users size={36} color="rgba(255,0,204,0.15)" />
            </div>
            <div className="oa-stat">
              <div>
                <p className="oa-stat-label">ORGANISATION</p>
                <p
                  className="oa-stat-value"
                  style={{ fontSize: 16, paddingTop: 8 }}
                >
                  {organization?.name || "—"}
                </p>
              </div>
              <Building2 size={36} color="rgba(255,0,204,0.15)" />
            </div>
          </div>

          {/* Venues */}
          <div className="oa-section-header">
            <h2 className="oa-section-title">// VENUES</h2>
            <button
              className="oa-add-btn"
              onClick={() => setShowAddVenue(true)}
            >
              <Plus size={14} /> ADD VENUE
            </button>
          </div>

          {venues.length === 0 ? (
            <div className="oa-empty">
              <MapPin
                size={48}
                color="rgba(255,0,204,0.2)"
                style={{ margin: "0 auto 16px" }}
              />
              <h3 className="oa-empty-title">NO VENUES YET</h3>
              <p className="oa-empty-sub">
                Add your first venue to get started
              </p>
              <button
                className="oa-add-btn"
                onClick={() => setShowAddVenue(true)}
                style={{ margin: "0 auto" }}
              >
                <Plus size={14} /> ADD VENUE
              </button>
            </div>
          ) : (
            <div className="oa-venues">
              {venues.map((venue, i) => (
                <div
                  key={venue.id}
                  className="oa-venue-card"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="oa-venue-top">
                    <div>
                      <h3 className="oa-venue-name">{venue.name}</h3>
                      {venue.location && (
                        <p className="oa-venue-location">
                          <MapPin size={10} /> {venue.location}
                        </p>
                      )}
                    </div>
                    <button
                      className="oa-delete-btn"
                      onClick={() => {
                        if (confirm(`Delete "${venue.name}"?`))
                          deleteVenueMutation.mutate(venue.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="oa-venue-meta">
                    <span className="oa-venue-meta-item">
                      <Users size={11} /> {venue.admin_count || 0} ADMIN
                      {venue.admin_count !== 1 ? "S" : ""}
                    </span>
                    <span className="oa-venue-meta-item">
                      <Shield size={11} /> {venue.league_count || 0} LEAGUE
                      {venue.league_count !== 1 ? "S" : ""}
                    </span>
                  </div>

                  <button
                    className="oa-invite-btn"
                    onClick={() => openInviteModal(venue)}
                  >
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Mail size={13} /> INVITE VENUE ADMIN
                    </span>
                    <ChevronRight size={13} />
                  </button>

                  <a
                    href={`/admin?venueId=${venue.id}`}
                    className="oa-manage-btn"
                  >
                    MANAGE VENUE <ChevronRight size={14} />
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* Admins */}
          {admins.length > 0 && (
            <>
              <div className="oa-section-header" style={{ marginTop: 8 }}>
                <h2 className="oa-section-title">// VENUE ADMINS</h2>
              </div>
              <div className="oa-admins-table">
                <table>
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>EMAIL</th>
                      <th>ROLE</th>
                      <th>VENUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin.id}>
                        <td style={{ color: "#F4F4F9", fontWeight: 700 }}>
                          {admin.name || "—"}
                        </td>
                        <td>{admin.email}</td>
                        <td>
                          <span
                            className={`oa-role-badge ${
                              admin.role === "org_admin"
                                ? "oa-role-org"
                                : "oa-role-venue"
                            }`}
                          >
                            {admin.role?.toUpperCase()}
                          </span>
                        </td>
                        <td>{admin.venue_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Venue Modal */}
      {showAddVenue && (
        <div className="oa-modal-overlay">
          <div className="oa-modal">
            <div className="oa-modal-header">
              <h2 className="oa-modal-title">// ADD VENUE</h2>
              <button
                className="oa-modal-close"
                onClick={() => setShowAddVenue(false)}
              >
                <X size={20} />
              </button>
            </div>
            <label className="oa-modal-label">VENUE NAME</label>
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="e.g. Green Point Stadium"
              className="oa-modal-input"
              autoFocus
            />
            <label className="oa-modal-label">LOCATION (OPTIONAL)</label>
            <input
              type="text"
              value={venueLocation}
              onChange={(e) => setVenueLocation(e.target.value)}
              placeholder="e.g. Cape Town"
              className="oa-modal-input"
            />
            <div className="oa-modal-btns">
              <button
                className="oa-modal-cancel"
                onClick={() => setShowAddVenue(false)}
              >
                CANCEL
              </button>
              <button
                className="oa-modal-submit"
                onClick={() =>
                  createVenueMutation.mutate({
                    name: venueName,
                    location: venueLocation,
                  })
                }
                disabled={!venueName.trim() || createVenueMutation.isPending}
              >
                {createVenueMutation.isPending ? "CREATING..." : "CREATE VENUE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Venue Admin Modal */}
      {showInviteAdmin && (
        <div className="oa-modal-overlay">
          <div className="oa-modal">
            <div className="oa-modal-header">
              <h2 className="oa-modal-title">// INVITE VENUE ADMIN</h2>
              <button
                className="oa-modal-close"
                onClick={() => setShowInviteAdmin(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p
              style={{
                fontFamily: "'Rajdhani',sans-serif",
                fontSize: 14,
                color: "rgba(180,200,220,0.5)",
                marginBottom: 20,
              }}
            >
              Inviting admin for:{" "}
              <strong style={{ color: "#F4F4F9" }}>{selectedVenueName}</strong>
            </p>

            {inviteSuccess && (
              <div className="oa-modal-success">
                ✓ {inviteSuccess.toUpperCase()}
              </div>
            )}
            {inviteError && (
              <div className="oa-modal-error">
                // {inviteError.toUpperCase()}
              </div>
            )}

            <label className="oa-modal-label">EMAIL ADDRESS</label>
            <input
              required
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteSuccess(null);
                setInviteError(null);
              }}
              placeholder="admin@venue.com"
              className="oa-modal-input"
              autoFocus
            />
            <div className="oa-modal-btns">
              <button
                className="oa-modal-cancel"
                onClick={() => setShowInviteAdmin(false)}
              >
                CANCEL
              </button>
              <button
                className="oa-modal-submit"
                onClick={() =>
                  inviteMutation.mutate({
                    email: inviteEmail,
                    venueId: selectedVenueId,
                  })
                }
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
              >
                {inviteMutation.isPending ? "SENDING..." : "SEND INVITE →"}
              </button>
            </div>
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
