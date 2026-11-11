import { Plus, Users } from "lucide-react";

export function AdminsSection({ usersData, hasVenues, onAddAdmin }) {
  return (
    <div className="om-section">
      <div className="om-section-header">
        <span className="om-section-title">ADMINISTRATORS</span>
        <button className="om-btn-blue" onClick={onAddAdmin} disabled={!hasVenues}>
          <Plus size={12} /> ADD ADMIN
        </button>
      </div>

      {!usersData?.users?.length ? (
        <div className="om-empty">
          <Users size={40} className="om-empty-icon" />
          <p className="om-empty-text">NO ADMINISTRATORS YET</p>
          {hasVenues && (
            <button className="om-btn-blue" onClick={onAddAdmin}>
              <Plus size={12} /> ADD FIRST ADMIN
            </button>
          )}
        </div>
      ) : (
        <div className="om-table-wrap">
          <table className="om-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>VENUE</th>
                <th style={{ textAlign: "right" }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {usersData.users.map((admin) => (
                <tr key={admin.id}>
                  <td className="name">{admin.name}</td>
                  <td>{admin.email}</td>
                  <td>{admin.venue_name || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {admin.account_status?.replaceAll("_", " ") || "active"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
