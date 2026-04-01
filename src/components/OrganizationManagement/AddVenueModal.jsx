import { useState } from "react";

export function AddVenueModal({ onClose, onSubmit, isPending }) {
  const [venueName, setVenueName] = useState("");
  const [venueLocation, setVenueLocation] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (venueName.trim()) {
      onSubmit({ name: venueName.trim(), location: venueLocation.trim() || null });
      setVenueName("");
      setVenueLocation("");
    }
  };

  const handleClose = () => {
    setVenueName("");
    setVenueLocation("");
    onClose();
  };

  return (
    <div className="om-modal-overlay">
      <div className="om-modal">
        <h2 className="om-modal-title">// ADD VENUE</h2>
        <form onSubmit={handleSubmit}>
          <label className="om-modal-label">VENUE NAME</label>
          <input
            type="text"
            className="om-modal-input"
            placeholder="e.g. Coalition FC – Pretoria"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            autoFocus
          />
          <label className="om-modal-label">LOCATION (OPTIONAL)</label>
          <input
            type="text"
            className="om-modal-input"
            placeholder="e.g. Pretoria, Gauteng"
            value={venueLocation}
            onChange={(e) => setVenueLocation(e.target.value)}
          />
          <div className="om-modal-btns">
            <button type="button" className="om-modal-cancel" onClick={handleClose}>
              CANCEL
            </button>
            <button
              type="submit"
              className="om-modal-submit"
              disabled={!venueName.trim() || isPending}
            >
              {isPending ? "CREATING..." : "CREATE VENUE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
