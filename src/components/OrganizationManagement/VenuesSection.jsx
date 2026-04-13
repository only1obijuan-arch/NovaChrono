import { Plus, MapPin } from "lucide-react";
import { VenueCard } from "./VenueCard";

export function VenuesSection({
  venuesData,
  venuesLoading,
  onAddVenue,
  onAssignVenue,
  onDeleteVenue,
  onInviteAdmin,
  currentUserVenueId,
  assignVenuePending,
}) {
  return (
    <div className="om-section">
      <div className="om-section-header">
        <span className="om-section-title">// VENUES</span>
        <button className="om-btn-primary" onClick={onAddVenue}>
          <Plus size={12} /> ADD VENUE
        </button>
      </div>

      {venuesLoading ? (
        <div className="om-venues">
          {[1, 2].map((i) => (
            <div key={i} className="om-skeleton" />
          ))}
        </div>
      ) : venuesData?.venues?.length === 0 ? (
        <div className="om-empty">
          <MapPin size={40} className="om-empty-icon" />
          <p className="om-empty-text">NO VENUES REGISTERED</p>
          <button className="om-btn-primary" onClick={onAddVenue}>
            <Plus size={12} /> ADD FIRST VENUE
          </button>
        </div>
      ) : (
        <div className="om-venues">
          {venuesData?.venues?.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              isAssigned={currentUserVenueId === venue.id}
              onAssign={() => onAssignVenue(venue.id)}
              onDelete={() => onDeleteVenue(venue.id, venue.name)}
              onInvite={() => onInviteAdmin(venue.id, venue.name)}
              assignPending={assignVenuePending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
