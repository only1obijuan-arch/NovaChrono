import { Plus } from "lucide-react";

export function DashboardHeader({ venueName, userName, userEmail }) {
  return (
    <div className="ad-header">
      <div>
        <p className="ad-title-label">VENUE ADMIN PORTAL</p>
        <h1 className="ad-title">{venueName || "Loading..."}</h1>
        <p className="ad-subtitle">{userName || userEmail}</p>
      </div>
      <a href="/admin/create-league" className="ad-create-btn">
        <Plus size={16} /> CREATE LEAGUE
      </a>
    </div>
  );
}
