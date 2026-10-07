"use client";
import { weekdayNumber } from "@/utils/weekday";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  Info,
  Settings,
  Clock,
  Plus,
  X,
  MapPin,
} from "lucide-react";

export default function CreateLeague() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!session,
  });

  const { data: venuesData } = useQuery({
    queryKey: ["super-admin-all-venues"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/all-venues");
      if (!res.ok) throw new Error("Failed to fetch venues");
      return res.json();
    },
    enabled:
      !!session &&
      session.user?.role === "super_admin" &&
      !adminProfile?.user?.venue_id,
  });

  const isSuperAdmin = session?.user?.role === "super_admin";
  const needsVenueSelect = isSuperAdmin && !adminProfile?.user?.venue_id;

  const [formData, setFormData] = useState({
    name: "",
    dayOfWeek: "Monday",
    seasonStartDate: "",
    matchFormat: "2x20",
    matchDuration: 40,
    fieldsCount: 1,
    timeSlots: ["18:30", "19:15", "20:00", "20:45", "21:30"],
    maxTeams: 10,
  });

  const [selectedVenueId, setSelectedVenueId] = useState("");

  const mutation = useMutation({
    mutationFn: async (data) => {
      const venueId = needsVenueSelect
        ? selectedVenueId
        : adminProfile?.user?.venue_id;
      if (!venueId)
        throw new Error(
          needsVenueSelect
            ? "Please select a venue"
            : "No venue assigned to your account",
        );
      const res = await fetch("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ action: "CREATE_LEAGUE", venueId, ...data, dayOfWeek: weekdayNumber(data.dayOfWeek) }),
      });
      if (!res.ok) throw new Error("Failed to create league");
      return res.json();
    },
    onSuccess: () => {
      toast.success("League created!");
      router.push("/admin");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };
  const handleTimeSlotChange = (index, value) => {
    const newSlots = [...formData.timeSlots];
    newSlots[index] = value;
    setFormData({ ...formData, timeSlots: newSlots });
  };
  const addTimeSlot = () =>
    setFormData({ ...formData, timeSlots: [...formData.timeSlots, ""] });
  const removeTimeSlot = (index) =>
    setFormData({
      ...formData,
      timeSlots: formData.timeSlots.filter((_, i) => i !== index),
    });

  if (status === "loading" || !session)
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
        <p
          style={{
            color: "rgba(180,200,220,0.5)",
            fontFamily: "monospace",
            letterSpacing: 3,
            fontSize: 12,
          }}
        >
          AUTHENTICATION REQUIRED
        </p>
        <a
          href="/account/signin"
          style={{
            color: "#FF00CC",
            fontFamily: "monospace",
            fontSize: 12,
            letterSpacing: 2,
          }}
        >
          SIGN IN →
        </a>
      </div>
    );

  return (
    <>
      <style>{`
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

        * { box-sizing:border-box; }
        .cl-page { min-height:100vh; background:#091833; font-family:var(--font-ui); position:relative; padding:40px 24px 80px; }
        .cl-grid { position:fixed; inset:0; background-image:linear-gradient(rgba(255,0,204,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,204,0.02) 1px,transparent 1px); background-size:60px 60px; pointer-events:none; }
        .cl-scanline { position:fixed; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,0,204,0.3),transparent); animation:scanline 7s linear infinite; pointer-events:none; z-index:100; }
        .cl-glow { position:fixed; top:-200px; right:-200px; width:600px; height:600px; background:radial-gradient(circle,rgba(255,0,204,0.04) 0%,transparent 70%); pointer-events:none; }

        .cl-inner { max-width:860px; margin:0 auto; position:relative; z-index:1; }
        .cl-back { display:inline-flex; align-items:center; gap:6px; color:rgba(255,0,204,0.5); font-family:var(--font-code); font-size:11px; letter-spacing:2px; text-decoration:none; margin-bottom:32px; transition:all 0.2s; }
        .cl-back:hover { color:#FF00CC; }

        .cl-card { background:rgba(11,20,40,0.95); border:1px solid rgba(255,0,204,0.15); border-radius:8px; overflow:hidden; animation:fadeInUp 0.4s ease; }
        .cl-card-header { padding:32px 40px; border-bottom:1px solid rgba(255,0,204,0.1); background:rgba(255,0,204,0.03); }
        .cl-card-title { font-family:var(--font-display); font-size:22px; font-weight:900; color:#F4F4F9; letter-spacing:3px; margin-bottom:8px; }
        .cl-card-sub { font-family:var(--font-code); font-size:10px; color:rgba(255,0,204,0.4); letter-spacing:3px; }

        .cl-form { padding:40px; display:flex; flex-direction:column; gap:40px; }

        .cl-section { display:flex; flex-direction:column; gap:20px; }
        .cl-section-header { display:flex; align-items:center; gap:12px; padding-bottom:14px; border-bottom:1px solid rgba(255,0,204,0.08); }
        .cl-section-icon { width:36px; height:36px; background:rgba(255,0,204,0.08); border:1px solid rgba(255,0,204,0.2); border-radius:4px; display:flex; align-items:center; justify-content:center; color:#FF00CC; flex-shrink:0; }
        .cl-section-title { font-family:var(--font-display); font-size:13px; font-weight:700; color:#F4F4F9; letter-spacing:2px; }

        .cl-venue-select { width:100%; height:48px; background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.25); border-radius:4px; padding:0 16px; color:#F4F4F9; font-family:var(--font-ui); font-size:16px; outline:none; cursor:pointer; transition:all 0.2s; }
        .cl-venue-select:focus { border-color:#00F5D4; box-shadow:0 0 12px rgba(0,245,212,0.12); }
        .cl-venue-select option { background:#0D1B2E; }
        .cl-venue-assigned { font-family:var(--font-code); font-size:10px; color:rgba(0,245,212,0.6); letter-spacing:2px; padding:12px 16px; background:rgba(0,245,212,0.05); border:1px solid rgba(0,245,212,0.2); border-radius:4px; }

        .cl-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .cl-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; }
        .cl-field { display:flex; flex-direction:column; gap:8px; }
        .cl-label { font-family:var(--font-code); font-size:10px; color:rgba(255,0,204,0.6); letter-spacing:3px; }
        .cl-input { height:48px; padding:0 16px; background:rgba(255,0,204,0.04); border:1px solid rgba(255,0,204,0.15); border-radius:4px; color:#F4F4F9; font-family:var(--font-ui); font-size:16px; outline:none; transition:all 0.2s; }
        .cl-input:focus { border-color:#FF00CC; box-shadow:0 0 12px rgba(255,0,204,0.12); }
        .cl-input::placeholder { color:rgba(180,200,220,0.2); }
        .cl-select { height:48px; padding:0 16px; background:rgba(255,0,204,0.04); border:1px solid rgba(255,0,204,0.15); border-radius:4px; color:#F4F4F9; font-family:var(--font-ui); font-size:16px; outline:none; cursor:pointer; transition:all 0.2s; }
        .cl-select:focus { border-color:#FF00CC; }
        .cl-select option { background:#0D1B2E; }
        .cl-input-disabled { height:48px; padding:0 16px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,0,204,0.06); border-radius:4px; display:flex; align-items:center; font-family:var(--font-code); font-size:10px; color:rgba(180,200,220,0.25); letter-spacing:2px; }

        .cl-slots-header { display:flex; align-items:center; justify-content:space-between; }
        .cl-add-slot { display:inline-flex; align-items:center; gap:6px; background:none; border:1px solid rgba(255,0,204,0.25); color:rgba(255,0,204,0.6); font-family:var(--font-code); font-size:10px; letter-spacing:2px; padding:6px 12px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
        .cl-add-slot:hover { border-color:#FF00CC; color:#FF00CC; background:rgba(255,0,204,0.06); }
        .cl-slots-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:10px; }
        .cl-slot-wrap { position:relative; }
        .cl-slot-input { width:100%; height:44px; padding:0 32px 0 12px; background:rgba(255,0,204,0.05); border:1px solid rgba(255,0,204,0.2); border-radius:4px; color:#FF00CC; font-family:var(--font-code); font-size:13px; letter-spacing:1px; outline:none; transition:all 0.2s; }
        .cl-slot-input:focus { border-color:#FF00CC; box-shadow:0 0 10px rgba(255,0,204,0.1); }
        .cl-slot-remove { position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; color:rgba(255,80,80,0.4); cursor:pointer; padding:2px; transition:color 0.2s; display:flex; align-items:center; }
        .cl-slot-remove:hover { color:rgba(255,80,80,0.9); }

        .cl-submit-wrap { padding-top:24px; border-top:1px solid rgba(255,0,204,0.1); }
        .cl-submit { width:100%; height:56px; background:linear-gradient(135deg,rgba(255,0,204,0.15),rgba(255,0,204,0.08)); border:1px solid rgba(255,0,204,0.4); border-radius:4px; color:#FF00CC; font-family:var(--font-display); font-size:14px; font-weight:700; letter-spacing:3px; cursor:pointer; transition:all 0.2s; }
        .cl-submit:hover:not(:disabled) { background:linear-gradient(135deg,rgba(255,0,204,0.25),rgba(255,0,204,0.12)); border-color:#FF00CC; box-shadow:0 0 30px rgba(255,0,204,0.2); transform:translateY(-1px); }
        .cl-submit:disabled { opacity:0.35; cursor:not-allowed; }

        @media (max-width:640px) {
          .cl-grid-2, .cl-grid-3 { grid-template-columns:1fr; }
          .cl-form { padding:24px; }
          .cl-card-header { padding:24px; }
        }
      `}</style>

      <div className="cl-page">
        <div className="cl-grid" />
        <div className="cl-scanline" />
        <div className="cl-glow" />

        <div className="cl-inner">
          <a href="/admin" className="cl-back">
            <ChevronLeft size={14} /> ADMIN DASHBOARD
          </a>

          <div className="cl-card">
            <div className="cl-card-header">
              <h1 className="cl-card-title">CREATE NEW LEAGUE</h1>
              <p className="cl-card-sub">CONFIGURE STRUCTURE & SCHEDULE</p>
            </div>

            <form onSubmit={handleSubmit} className="cl-form">
              <div className="cl-section">
                <div className="cl-section-header">
                  <div className="cl-section-icon">
                    <MapPin size={16} />
                  </div>
                  <span className="cl-section-title">VENUE ASSIGNMENT</span>
                </div>
                {needsVenueSelect ? (
                  <div className="cl-field">
                    <label
                      className="cl-label"
                      style={{ color: "rgba(0,245,212,0.6)" }}
                    >
                      SELECT VENUE
                    </label>
                    <select
                      required
                      className="cl-venue-select"
                      value={selectedVenueId}
                      onChange={(e) => setSelectedVenueId(e.target.value)}
                    >
                      <option value="">Choose a venue...</option>
                      {venuesData?.venues?.map((venue) => (
                        <option key={venue.id} value={venue.id}>
                          {venue.name}
                          {venue.location ? ` — ${venue.location}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="cl-field">
                    <label
                      className="cl-label"
                      style={{ color: "rgba(0,245,212,0.6)" }}
                    >
                      ASSIGNED VENUE
                    </label>
                    <div className="cl-venue-assigned">
                      {adminProfile?.user?.venue_name ||
                        adminProfile?.user?.venue_id ||
                        "LOADING..."}
                    </div>
                  </div>
                )}
              </div>

              <div className="cl-section">
                <div className="cl-section-header">
                  <div className="cl-section-icon">
                    <Info size={16} />
                  </div>
                  <span className="cl-section-title">LEAGUE DETAILS</span>
                </div>
                <div className="cl-grid-2">
                  <div className="cl-field">
                    <label className="cl-label">LEAGUE NAME</label>
                    <input
                      required
                      className="cl-input"
                      placeholder="e.g. Monday Night 5-a-side"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="cl-field">
                    <label className="cl-label">DAY OF WEEK</label>
                    <select
                      className="cl-select"
                      value={formData.dayOfWeek}
                      onChange={(e) =>
                        setFormData({ ...formData, dayOfWeek: e.target.value })
                      }
                    >
                      {[
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                      ].map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="cl-section">
                <div className="cl-section-header">
                  <div className="cl-section-icon">
                    <Clock size={16} />
                  </div>
                  <span className="cl-section-title">SEASON SCHEDULE</span>
                </div>
                <div className="cl-grid-2">
                  <div className="cl-field">
                    <label className="cl-label">START DATE</label>
                    <input
                      required
                      type="date"
                      className="cl-input"
                      value={formData.seasonStartDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          seasonStartDate: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="cl-field">
                    <label className="cl-label">END DATE</label>
                    <div className="cl-input-disabled">
                      AUTO-CALCULATED AFTER FIXTURES
                    </div>
                  </div>
                </div>
              </div>

              <div className="cl-section">
                <div className="cl-section-header">
                  <div className="cl-section-icon">
                    <Settings size={16} />
                  </div>
                  <span className="cl-section-title">
                    MATCH FORMAT & CAPACITY
                  </span>
                </div>
                <div className="cl-grid-3">
                  <div className="cl-field">
                    <label className="cl-label">FORMAT</label>
                    <input
                      className="cl-input"
                      placeholder="2x20"
                      value={formData.matchFormat}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          matchFormat: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="cl-field">
                    <label className="cl-label">FIELDS</label>
                    <input
                      type="number"
                      min="1"
                      className="cl-input"
                      value={formData.fieldsCount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          fieldsCount: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="cl-field">
                    <label className="cl-label">MAX TEAMS</label>
                    <input
                      type="number"
                      min="2"
                      className="cl-input"
                      value={formData.maxTeams}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxTeams: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="cl-section">
                <div className="cl-slots-header">
                  <div
                    className="cl-section-header"
                    style={{ border: "none", paddingBottom: 0, flex: 1 }}
                  >
                    <div className="cl-section-icon">
                      <Clock size={16} />
                    </div>
                    <span className="cl-section-title">TIME SLOTS</span>
                  </div>
                  <button
                    type="button"
                    className="cl-add-slot"
                    onClick={addTimeSlot}
                  >
                    <Plus size={12} /> ADD SLOT
                  </button>
                </div>
                <div className="cl-slots-grid">
                  {formData.timeSlots.map((slot, index) => (
                    <div key={index} className="cl-slot-wrap">
                      <input
                        required
                        type="time"
                        className="cl-slot-input"
                        value={slot}
                        onChange={(e) =>
                          handleTimeSlotChange(index, e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="cl-slot-remove"
                        onClick={() => removeTimeSlot(index)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cl-submit-wrap">
                <button
                  type="submit"
                  className="cl-submit"
                  disabled={
                    mutation.isPending || (needsVenueSelect && !selectedVenueId)
                  }
                >
                  {mutation.isPending
                    ? "CREATING LEAGUE..."
                    : "CREATE LEAGUE & GENERATE JOIN CODE →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
