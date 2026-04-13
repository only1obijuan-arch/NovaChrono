import { useState } from "react";
import { Mail } from "lucide-react";

export function InviteVenueAdminModal({ venueName, onClose, onSubmit, isPending }) {
  const [email, setEmail] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email.trim()) onSubmit(email.trim());
  };

  return (
    <div className="om-modal-overlay">
      <div className="om-modal">
        <h2 className="om-modal-title">// INVITE VENUE ADMIN</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(180,200,220,0.6)", fontFamily: "monospace" }}>
          VENUE: <span style={{ color: "#F4F4F9", fontWeight: 700 }}>{venueName}</span>
        </p>
        <form onSubmit={handleSubmit}>
          <label className="om-modal-label">
            <Mail size={10} style={{ display: "inline", marginRight: 4 }} />
            EMAIL ADDRESS
          </label>
          <input
            type="email"
            className="om-modal-input"
            placeholder="admin@venue.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <div className="om-modal-btns">
            <button type="button" className="om-modal-cancel" onClick={onClose}>
              CANCEL
            </button>
            <button
              type="submit"
              className="om-modal-submit-blue"
              disabled={!email.trim() || isPending}
            >
              {isPending ? "SENDING..." : "SEND INVITE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
