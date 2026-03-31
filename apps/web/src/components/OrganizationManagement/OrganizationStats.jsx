import { MapPin, Users } from "lucide-react";

export function OrganizationStats({ venuesCount, adminsCount }) {
  return (
    <div className="om-stats">
      <div className="om-stat">
        <div>
          <p className="om-stat-label">VENUES</p>
          <p className="om-stat-value">{venuesCount || 0}</p>
        </div>
        <MapPin size={48} className="om-stat-icon" />
      </div>
      <div className="om-stat">
        <div>
          <p className="om-stat-label">ADMINISTRATORS</p>
          <p className="om-stat-value">{adminsCount || 0}</p>
        </div>
        <Users size={48} className="om-stat-icon" />
      </div>
    </div>
  );
}
