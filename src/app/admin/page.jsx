"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { printCredentials } from "@/utils/printCredentials";
import { AdminDashboardStyles } from "@/components/AdminDashboard/AdminDashboardStyles";
import { LoadingState } from "@/components/AdminDashboard/LoadingState";
import { Navigation } from "@/components/AdminDashboard/Navigation";
import { DashboardHeader } from "@/components/AdminDashboard/DashboardHeader";
import { LeaguesSection } from "@/components/AdminDashboard/LeaguesSection";
import { RefereesSection } from "@/components/AdminDashboard/RefereesSection";
import { GenerateRefereeModal } from "@/components/AdminDashboard/GenerateRefereeModal";
import { CredentialsModal } from "@/components/AdminDashboard/CredentialsModal";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showRefModal, setShowRefModal] = useState(false);
  const [showCredentials, setShowCredentials] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [fieldInput, setFieldInput] = useState("");
  const [copied, setCopied] = useState(false);

  // Weather alert state
  const [showAlertModal, setShowAlertModal] = useState(null); // "warning" | "postponed" | null
  const [alertLeagueId, setAlertLeagueId] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertSent, setAlertSent] = useState(null);

  useEffect(() => {
    if (status !== "loading" && session) {
      if (
        session.user?.role !== "venue_admin" &&
        session.user?.role !== "super_admin"
      ) {
        router.replace("/");
      }
    }
  }, [session, status, router]);

  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!session,
  });

  const venueId = adminProfile?.user?.venue_id;

  const { data: leagues = [], isLoading: leaguesLoading } = useQuery({
    queryKey: ["leagues", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const res = await fetch(`/api/leagues?venueId=${venueId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!venueId,
  });

  const { data: refsData, isLoading: refsLoading } = useQuery({
    queryKey: ["referees", venueId],
    queryFn: async () => {
      if (!venueId) return { referees: [] };
      const res = await fetch(`/api/admin/referees?venueId=${venueId}`);
      return res.json();
    },
    enabled: !!venueId,
  });

  const referees = refsData?.referees || [];

  const venueLat = adminProfile?.user?.venue_lat ?? "-26.1076";
  const venueLon = adminProfile?.user?.venue_lng ?? "28.0567";

  const { data: weather, isLoading: weatherLoading } = useQuery({
    queryKey: ["weather", venueLat, venueLon],
    queryFn: async () => {
      const res = await fetch(`/api/weather?lat=${venueLat}&lon=${venueLon}`);
      if (!res.ok) throw new Error("Failed to fetch weather");
      return res.json();
    },
    refetchInterval: 10 * 60 * 1000,
    enabled: !!adminProfile,
  });

  const createRefMutation = useMutation({
    mutationFn: async ({ venueId: vId, fieldNumber, name }) => {
      const res = await fetch("/api/admin/referees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: vId, fieldNumber: parseInt(fieldNumber), name }),
      });
      if (!res.ok) throw new Error("Failed to create referee");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referees", venueId] });
    },
  });

  const deleteRefMutation = useMutation({
    mutationFn: async (refId) => {
      const res = await fetch(`/api/admin/referees?id=${refId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referees", venueId] });
    },
  });

  const sendAlertMutation = useMutation({
    mutationFn: async ({ league_id, alert_type, message }) => {
      const res = await fetch("/api/weather/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id, alert_type, message }),
      });
      if (!res.ok) throw new Error("Failed to send alert");
      return res.json();
    },
    onSuccess: (data) => {
      setAlertSent(data);
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  const handleCreateReferee = async () => {
    try {
      const result = await createRefMutation.mutateAsync({
        venueId,
        fieldNumber: fieldInput,
        name: nameInput.trim(),
      });
      setShowRefModal(false);
      setNameInput("");
      setFieldInput("");
      setShowCredentials(result.referee);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCopyCredentials = () => {
    if (!showCredentials) return;
    const text = `NovaChrono Referee Login\nVenue: ${showCredentials.venueName}\nField: ${showCredentials.fieldNumber}\nEmail: ${showCredentials.email}\nPassword: ${showCredentials.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    printCredentials(showCredentials);
  };

  const openAlertModal = (type) => {
    setShowAlertModal(type);
    setAlertLeagueId(leagues[0]?.id || "");
    setAlertSent(null);
    const defaultMsg =
      type === "warning"
        ? "There is a risk of lightning in the area. Please be aware and be prepared for possible match interruptions. Stay alert and follow referee instructions."
        : "Due to adverse weather conditions, tonight's matches have been postponed. Updated fixtures will be sent shortly. We apologise for any inconvenience.";
    setAlertMessage(defaultMsg);
  };

  const handleSendAlert = () => {
    if (!alertLeagueId) return;
    sendAlertMutation.mutate({
      league_id: alertLeagueId,
      alert_type: showAlertModal,
      message: alertMessage,
    });
  };

  if (status === "loading" || !session) {
    return <LoadingState />;
  }

  const userRole = session.user?.role;
  const activeLeagues = leagues.filter((l) => l.status === "active");

  const weatherIconUrl = weather?.icon
    ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png`
    : null;

  return (
    <>
      <AdminDashboardStyles />
      <style>{`
        .wx-section { margin-bottom: 40px; }
        .wx-card { background: rgba(11,20,40,0.8); border: 1px solid rgba(0,245,212,0.2); border-radius: 8px; padding: 24px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .wx-card.lightning { border-color: rgba(255,200,0,0.4); background: rgba(255,200,0,0.04); }
        .wx-card.severe { border-color: rgba(255,0,204,0.5); background: rgba(255,0,204,0.04); }
        .wx-icon-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 80px; }
        .wx-icon { width: 64px; height: 64px; }
        .wx-temp { font-family: 'Orbitron', monospace; font-size: 28px; font-weight: 900; color: #00F5D4; }
        .wx-stats { display: flex; gap: 20px; flex-wrap: wrap; }
        .wx-stat { display: flex; flex-direction: column; gap: 4px; }
        .wx-stat-label { font-family: 'Share Tech Mono', monospace; font-size: 9px; color: rgba(0,245,212,0.5); letter-spacing: 3px; }
        .wx-stat-value { font-family: 'Orbitron', monospace; font-size: 16px; font-weight: 700; color: #F4F4F9; }
        .wx-desc { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: rgba(180,200,220,0.5); letter-spacing: 1px; text-transform: capitalize; }
        .wx-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 4px; font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 2px; }
        .wx-badge.lightning { background: rgba(255,200,0,0.1); border: 1px solid rgba(255,200,0,0.4); color: #FFD700; }
        .wx-badge.severe { background: rgba(255,0,204,0.1); border: 1px solid rgba(255,0,204,0.4); color: #FF00CC; }
        .wx-badge.clear { background: rgba(0,255,156,0.08); border: 1px solid rgba(0,255,156,0.3); color: #00FF9C; }
        .wx-actions { display: flex; gap: 10px; margin-left: auto; flex-wrap: wrap; }
        .wx-btn-warn { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,200,0,0.08); border: 1px solid rgba(255,200,0,0.35); color: #FFD700; font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; padding: 10px 16px; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
        .wx-btn-warn:hover { background: rgba(255,200,0,0.14); box-shadow: 0 0 15px rgba(255,200,0,0.2); }
        .wx-btn-post { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,0,204,0.08); border: 1px solid rgba(255,0,204,0.35); color: #FF00CC; font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; padding: 10px 16px; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
        .wx-btn-post:hover { background: rgba(255,0,204,0.14); box-shadow: 0 0 15px rgba(255,0,204,0.2); }
        .wx-loading { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: rgba(0,245,212,0.4); letter-spacing: 2px; padding: 24px; }
        .wx-modal-select { width: 100%; height: 48px; background: rgba(0,245,212,0.05); border: 1px solid rgba(0,245,212,0.2); border-radius: 4px; padding: 0 16px; color: #F4F4F9; font-family: 'Share Tech Mono', monospace; font-size: 12px; outline: none; margin-bottom: 16px; }
        .wx-modal-select option { background: #0D1B2E; }
        .wx-modal-textarea { width: 100%; background: rgba(0,245,212,0.05); border: 1px solid rgba(0,245,212,0.2); border-radius: 4px; padding: 12px 16px; color: #F4F4F9; font-family: 'Share Tech Mono', monospace; font-size: 12px; outline: none; resize: vertical; min-height: 100px; margin-bottom: 20px; line-height: 1.5; }
        .wx-modal-textarea:focus { border-color: #00F5D4; }
        .wx-success { background: rgba(0,255,156,0.06); border: 1px solid rgba(0,255,156,0.3); border-radius: 6px; padding: 16px; margin-bottom: 16px; font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #00FF9C; letter-spacing: 1px; }
      `}</style>

      <div className="ad-page">
        <div className="ad-grid" />
        <div className="ad-scanline" />
        <div className="ad-glow-tl" />
        <div className="ad-glow-br" />

        <div className="ad-inner">
          <Navigation userRole={userRole} />

          <DashboardHeader
            venueName={adminProfile?.user?.venue_name}
            userName={adminProfile?.user?.name}
            userEmail={session.user?.email}
          />

          {/* Weather Widget */}
          <div className="wx-section">
            <div className="ad-section-title">
              WEATHER CONDITIONS
              {adminProfile?.user?.venue_name && (
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: "rgba(0,245,212,0.5)", letterSpacing: 2, fontWeight: 400, marginLeft: 12 }}>
                  {adminProfile.user.venue_name.toUpperCase()}
                </span>
              )}
              <div className="ad-section-line" />
            </div>

            {weatherLoading ? (
              <div className="wx-loading">FETCHING WEATHER DATA...</div>
            ) : weather ? (
              <div className={`wx-card${weather.severe ? " severe" : weather.lightning_risk ? " lightning" : ""}`}>
                <div className="wx-icon-wrap">
                  {weatherIconUrl && (
                    <Image
                      src={weatherIconUrl}
                      alt={weather.description}
                      className="wx-icon"
                      width={50}
                      height={50}
                      unoptimized
                    />
                  )}
                  <span className="wx-temp">{weather.temp}°C</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="wx-desc">{weather.description}</span>
                  <div className="wx-stats">
                    <div className="wx-stat">
                      <span className="wx-stat-label">WIND</span>
                      <span className="wx-stat-value">{weather.wind_speed} m/s</span>
                    </div>
                    <div className="wx-stat">
                      <span className="wx-stat-label">HUMIDITY</span>
                      <span className="wx-stat-value">{weather.humidity}%</span>
                    </div>
                    <div className="wx-stat">
                      <span className="wx-stat-label">CONDITIONS</span>
                      <span className="wx-stat-value" style={{ fontSize: 13 }}>{weather.condition}</span>
                    </div>
                  </div>
                  {weather.severe ? (
                    <span className="wx-badge severe">⚡ SEVERE — STOP PLAY</span>
                  ) : weather.lightning_risk ? (
                    <span className="wx-badge lightning">⚡ LIGHTNING RISK</span>
                  ) : (
                    <span className="wx-badge clear">✓ CONDITIONS CLEAR</span>
                  )}
                </div>

                <div className="wx-actions">
                  <button className="wx-btn-warn" onClick={() => openAlertModal("warning")}>
                    ⚠️ SEND WEATHER WARNING
                  </button>
                  <button className="wx-btn-post" onClick={() => openAlertModal("postponed")}>
                    🚫 SEND POSTPONEMENT ALERT
                  </button>
                </div>
              </div>
            ) : (
              <div className="wx-loading">WEATHER DATA UNAVAILABLE</div>
            )}
          </div>

          <LeaguesSection leagues={leagues} isLoading={leaguesLoading} />

          <RefereesSection
            referees={referees}
            isLoading={refsLoading}
            onAddReferee={() => setShowRefModal(true)}
            onDeleteReferee={(refId) => deleteRefMutation.mutate(refId)}
            onShowCredentials={async (fieldNumber) => {
              try {
                const result = await createRefMutation.mutateAsync({
                  venueId,
                  fieldNumber,
                });
                setShowCredentials(result.referee);
              } catch (err) {
                alert(err.message);
              }
            }}
          />
        </div>
      </div>

      {showRefModal && (
        <GenerateRefereeModal
          nameInput={nameInput}
          setNameInput={setNameInput}
          fieldInput={fieldInput}
          setFieldInput={setFieldInput}
          onClose={() => {
            setShowRefModal(false);
            setNameInput("");
            setFieldInput("");
          }}
          onSubmit={handleCreateReferee}
          isSubmitting={createRefMutation.isPending}
        />
      )}

      {showCredentials && (
        <CredentialsModal
          credentials={showCredentials}
          onClose={() => setShowCredentials(null)}
          onCopy={handleCopyCredentials}
          onPrint={handlePrint}
          copied={copied}
        />
      )}

      {/* Weather Alert Modal */}
      {showAlertModal && (
        <div className="ad-modal-overlay" onClick={() => { setShowAlertModal(null); setAlertSent(null); }}>
          <div className="ad-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <p className="ad-modal-title">
              {showAlertModal === "warning" ? "⚠️ SEND WEATHER WARNING" : "🚫 SEND POSTPONEMENT ALERT"}
            </p>
            <p className="ad-modal-sub">
              {showAlertModal === "warning"
                ? "NOTIFY CAPTAINS OF WEATHER RISK"
                : "NOTIFY CAPTAINS OF POSTPONEMENT"}
            </p>

            {alertSent ? (
              <>
                <div className="wx-success">
                  ✓ ALERT SENT — {alertSent.sent} of {alertSent.total} captains notified via app + email
                </div>
                <button
                  className="ad-modal-submit"
                  style={{ width: "100%" }}
                  onClick={() => { setShowAlertModal(null); setAlertSent(null); }}
                >
                  DONE
                </button>
              </>
            ) : (
              <>
                <label className="ad-modal-label">SELECT LEAGUE</label>
                <select
                  className="wx-modal-select"
                  value={alertLeagueId}
                  onChange={(e) => setAlertLeagueId(e.target.value)}
                >
                  {leagues.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>

                <label className="ad-modal-label">MESSAGE</label>
                <textarea
                  className="wx-modal-textarea"
                  value={alertMessage}
                  onChange={(e) => setAlertMessage(e.target.value)}
                />

                <div className="ad-modal-btns">
                  <button
                    className="ad-modal-cancel"
                    onClick={() => { setShowAlertModal(null); setAlertSent(null); }}
                  >
                    CANCEL
                  </button>
                  <button
                    className="ad-modal-submit"
                    onClick={handleSendAlert}
                    disabled={!alertLeagueId || !alertMessage || sendAlertMutation.isPending}
                    style={
                      showAlertModal === "postponed"
                        ? { background: "rgba(255,0,204,0.1)", borderColor: "rgba(255,0,204,0.4)", color: "#FF00CC" }
                        : {}
                    }
                  >
                    {sendAlertMutation.isPending ? "SENDING..." : "SEND TO ALL CAPTAINS"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
