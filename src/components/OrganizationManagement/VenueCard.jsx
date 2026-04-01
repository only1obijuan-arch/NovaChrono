import { UserCheck, Trash2 } from "lucide-react";

export function VenueCard({ venue, isAssigned, onAssign, onDelete, assignPending }) {
  return (
    <div className="om-venue-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <p className="om-venue-name">{venue.name}</p>
          {venue.location && <p className="om-venue-location">{venue.location}</p>}
          <div className="om-venue-meta">
            <span className="om-venue-meta-item">{venue.league_count} LEAGUES</span>
            <span className="om-venue-meta-item">{venue.admin_count} ADMINS</span>
          </div>
          {isAssigned && (
            <div className="om-assigned-badge">
              <UserCheck size={10} /> ASSIGNED
            </div>
          )}
        </div>
        <div className="om-venue-actions">
          <button
            className="om-icon-btn assign"
            title="Assign to this venue"
            onClick={onAssign}
            disabled={assignPending || isAssigned}
          >
            <UserCheck size={15} />
          </button>
          <button className="om-icon-btn delete" onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
