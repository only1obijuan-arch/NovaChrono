// Keep the existing platform-wide exception explicit. Other administrators
// must match the venue established from the target's database relationships.
export function canAdministerVenue(user, venueId) {
  return user?.role === "super_admin" || (
    user?.role === "venue_admin" && user.venue_id != null &&
    user.venue_id === venueId
  );
}

export function canManageTeam(user, team) {
  return !!team && (canAdministerVenue(user, team.venue_id) || (
    user?.role === "captain" && team.captain_user_id === user.id
  ));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
