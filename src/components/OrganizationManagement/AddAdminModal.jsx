import { useState } from "react";
import { Mail, Key } from "lucide-react";

export function AddAdminModal({ onClose, onSubmit, isPending, venues }) {
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminVenueId, setAdminVenueId] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (adminName.trim() && adminEmail.trim() && adminPassword.trim() && adminVenueId) {
      onSubmit({
        name: adminName.trim(),
        email: adminEmail.trim(),
        password: adminPassword.trim(),
        venueId: adminVenueId,
      });
    }
  };

  const handleClose = () => {
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    setAdminVenueId("");
    onClose();
  };

  return (
    <div className="om-modal-overlay">
      <div className="om-modal">
        <h2 className="om-modal-title">// CREATE ADMIN</h2>
        <form onSubmit={handleSubmit}>
          <label className="om-modal-label">FULL NAME</label>
          <input
            type="text"
            className="om-modal-input"
            placeholder="John Doe"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            autoFocus
          />
          <label className="om-modal-label">
            <Mail size={10} style={{ display: "inline", marginRight: 4 }} />
            EMAIL
          </label>
          <input
            type="email"
            className="om-modal-input"
            placeholder="admin@venue.com"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <label className="om-modal-label">
            <Key size={10} style={{ display: "inline", marginRight: 4 }} />
            PASSWORD
          </label>
          <input
            type="password"
            className="om-modal-input"
            placeholder="Create a secure password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
          <label className="om-modal-label">ASSIGN TO VENUE</label>
          <select
            className="om-modal-select"
            value={adminVenueId}
            onChange={(e) => setAdminVenueId(e.target.value)}
          >
            <option value="">Select venue...</option>
            {venues?.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
          <div className="om-modal-btns">
            <button type="button" className="om-modal-cancel" onClick={handleClose}>
              CANCEL
            </button>
            <button
              type="submit"
              className="om-modal-submit-blue"
              disabled={
                !adminName.trim() ||
                !adminEmail.trim() ||
                !adminPassword.trim() ||
                !adminVenueId ||
                isPending
              }
            >
              {isPending ? "CREATING..." : "CREATE ADMIN"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
