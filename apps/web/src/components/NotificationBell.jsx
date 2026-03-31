"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

export function NotificationBell({ accentColor = "#00F5D4" }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      return res.json();
    },
    refetchInterval: 30000, // refresh every 30 seconds
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries(["notifications"]),
  });

  const markOneMutation = useMutation({
    mutationFn: async (notificationId) => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries(["notifications"]),
  });

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function getTypeStyle(type) {
    switch (type) {
      case "availability_confirmed":
        return {
          border: `rgba(0,255,156,0.3)`,
          bg: `rgba(0,255,156,0.05)`,
          dot: "#00FF9C",
        };
      case "availability_declined":
        return {
          border: `rgba(255,0,204,0.3)`,
          bg: `rgba(255,0,204,0.05)`,
          dot: "#FF00CC",
        };
      case "unconfirmed_alert":
        return {
          border: `rgba(255,215,0,0.3)`,
          bg: `rgba(255,215,0,0.05)`,
          dot: "#FFD700",
        };
      default:
        return {
          border: `rgba(0,245,212,0.2)`,
          bg: `rgba(0,245,212,0.03)`,
          dot: accentColor,
        };
    }
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "relative",
          background: "none",
          border: `1px solid rgba(255,255,255,0.1)`,
          borderRadius: 4,
          padding: "7px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          color: unreadCount > 0 ? accentColor : "rgba(180,200,220,0.5)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = accentColor;
          e.currentTarget.style.background = `rgba(255,255,255,0.05)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          e.currentTarget.style.background = "none";
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 18,
              height: 18,
              background: "#E24B4A",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: 10,
              color: "white",
              fontWeight: 700,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            background: "#0D1B2E",
            border: `1px solid rgba(0,245,212,0.2)`,
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            zIndex: 300,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(0,245,212,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: "'Orbitron',monospace",
                fontSize: 12,
                fontWeight: 700,
                color: "#F4F4F9",
                letterSpacing: 2,
              }}
            >
              // NOTIFICATIONS
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                style={{
                  background: "none",
                  border: "none",
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: 9,
                  color: `rgba(0,245,212,0.5)`,
                  letterSpacing: 2,
                  cursor: "pointer",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#00F5D4")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(0,245,212,0.5)")
                }
              >
                MARK ALL READ
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "40px 24px",
                  textAlign: "center",
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: 10,
                  color: "rgba(0,245,212,0.2)",
                  letterSpacing: 3,
                }}
              >
                NO NOTIFICATIONS
              </div>
            ) : (
              notifications.map((notif) => {
                const style = getTypeStyle(notif.type);
                return (
                  <div
                    key={notif.id}
                    onClick={() =>
                      !notif.read && markOneMutation.mutate(notif.id)
                    }
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(0,245,212,0.06)",
                      display: "flex",
                      gap: 12,
                      background: notif.read ? "transparent" : style.bg,
                      cursor: notif.read ? "default" : "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!notif.read)
                        e.currentTarget.style.background = `rgba(0,245,212,0.06)`;
                    }}
                    onMouseLeave={(e) => {
                      if (!notif.read)
                        e.currentTarget.style.background = style.bg;
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: notif.read
                          ? "rgba(180,200,220,0.2)"
                          : style.dot,
                        marginTop: 5,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: "0 0 3px",
                          fontFamily: "'Rajdhani',sans-serif",
                          fontSize: 14,
                          fontWeight: 700,
                          color: notif.read
                            ? "rgba(180,200,220,0.5)"
                            : "#F4F4F9",
                        }}
                      >
                        {notif.title}
                      </p>
                      <p
                        style={{
                          margin: "0 0 4px",
                          fontFamily: "'Rajdhani',sans-serif",
                          fontSize: 13,
                          color: "rgba(180,200,220,0.5)",
                          lineHeight: 1.4,
                        }}
                      >
                        {notif.message}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontFamily: "'Share Tech Mono',monospace",
                          fontSize: 9,
                          color: "rgba(180,200,220,0.25)",
                          letterSpacing: 1,
                        }}
                      >
                        {timeAgo(notif.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
